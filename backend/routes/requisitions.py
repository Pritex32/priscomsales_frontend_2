from fastapi import APIRouter, Depends, HTTPException, Form, Body, Query
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, date
from pydantic import BaseModel, Field
from io import BytesIO
import pandas as pd
import base64
import os
import httpx

from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase


router = APIRouter(prefix="/requisitions", tags=["requisitions"])


# =========================
# Helpers
# =========================
def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _get_officer_emails(user_id: int) -> List[str]:
    try:
        resp = supabase.table("inventory_officer").select("officer_email").eq("user_id", user_id).execute()
        emails = []
        for r in (resp.data or []):
            e = r.get("officer_email")
            if e:
                emails.append(e)
        return emails
    except Exception:
        return []


async def _send_brevo_email_multi(to_emails: List[str], subject: str, html: str):
    """
    Send transactional email via Brevo (Sendinblue) HTTP API.
    """
    api_key = os.getenv("BREVO_API_KEY", "")
    if not api_key or not to_emails:
        return

    BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "api-key": api_key,
        "accept": "application/json",
        "content-type": "application/json",
    }
    sender_email = os.getenv("BREVO_SENDER_EMAIL", "priscomac@priscomsales.online")
    sender_name = os.getenv("BREVO_SENDER_NAME", "PriscomSales")

    payload = {
        "sender": {"email": sender_email, "name": sender_name},
        "to": [{"email": e} for e in to_emails],
        "subject": subject,
        "htmlContent": html,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            await client.post(BREVO_API_URL, headers=headers, json=payload)
        except Exception:
            # Don't break core flow if email fails
            pass


def _enforce_free_plan_limit(user_id: int):
    """
    Replicates Streamlit gating:
      - If plan == 'free' or not active, block when either of sales tables exceeds 10 rows.
    """
    try:
        sub = (
            supabase.table("subscription")
            .select("plan,is_active,expires_at")
            .eq("user_id", user_id)
            .order("expires_at", desc=True)
            .limit(1)
            .execute()
        )
        data = sub.data or []
        plan = (data[0].get("plan") if data else "free") or "free"
        is_active = bool(data[0].get("is_active") if data else False)
    except Exception:
        plan, is_active = "free", False

    if plan == "free" or not is_active:
        c1 = supabase.table("sales_master_log").select("sale_id", count="exact").eq("user_id", user_id).execute()
        n1 = int(getattr(c1, "count", None) or 0)
        c2 = supabase.table("sales_master_history").select("sale_id", count="exact").eq("user_id", user_id).execute()
        n2 = int(getattr(c2, "count", None) or 0)
        if n1 > 10 or n2 > 10:
            raise HTTPException(
                status_code=402,
                detail="Free plan limit reached (max 10 entries in sales or purchases). Please upgrade to continue.",
            )


def _validate_inventory_item(user_id: int, warehouse_name: str, item_name: str) -> Dict[str, Any]:
    resp = (
        supabase.table("inventory_master_log")
        .select("item_id,item_name,price,warehouse_name")
        .eq("user_id", user_id)
        .eq("warehouse_name", warehouse_name)
        .eq("item_name", item_name)
        .limit(1)
        .execute()
    )
    d = resp.data or []
    if not d:
        raise HTTPException(
            status_code=400,
            detail=f"Item '{item_name}' not found in warehouse '{warehouse_name}'.",
        )
    return d[0]


# =========================
# Models
# =========================
class RequisitionItem(BaseModel):
    item: str = Field(..., description="Item name as stored in inventory_master_log")
    quantity: int = Field(..., gt=0)


class BatchRequisitionRequest(BaseModel):
    warehouse_name: str
    reason: str
    items: List[RequisitionItem]
    signature_base64: Optional[str] = None
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None


# =========================
# Core CRUD
# =========================
@router.get("/", response_model=None)
async def get_requisitions(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    current_user=Depends(get_protected_user),
):
    query = supabase.table("requisitions").select("*").eq("user_id", current_user.get("id", current_user.get("user_id")))
    if status:
        query = query.eq("status", status)
    resp = query.range(skip, max(skip, skip + limit - 1)).execute()
    return resp.data or []


@router.post("/", response_model=dict)
async def create_requisition(
    warehouse_name: str = Form(...),
    item: str = Form(...),
    quantity: int = Form(...),
    reason: str = Form(...),
    signature: Optional[str] = Form(None),  # Base64 PNG from canvas
    current_user=Depends(get_protected_user),
):
    """
    Single-item creation (form-encoded). Maintained for backward compatibility with existing clients.
    Streamlit UI normally submits multiple items — see /requisitions/batch.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    _enforce_free_plan_limit(user_id)

    if not warehouse_name:
        raise HTTPException(status_code=400, detail="warehouse_name is required")
    if not item:
        raise HTTPException(status_code=400, detail="item is required")
    if quantity is None or int(quantity) <= 0:
        raise HTTPException(status_code=400, detail="quantity must be greater than zero")
    if not reason:
        raise HTTPException(status_code=400, detail="reason is required")

    # Validate item exists in inventory for the given warehouse
    _validate_inventory_item(user_id, warehouse_name, item)

    row = {
        "user_id": user_id,
        "employee_id": current_user.get("id", current_user.get("user_id")) if (current_user.get("role") or "").lower() == "md" else None,
        "employee_name": current_user.get("username"),
        "warehouse_name": warehouse_name,
        "item": item,
        "quantity": int(quantity),
        "reason": reason,
        "status": "Pending",
        "signature": signature,
        "submitted_at": _now_iso(),
    }
    ins = supabase.table("requisitions").insert(row).execute()
    row_ins = ins.data[0] if ins.data else None
    if not row_ins:
        raise HTTPException(status_code=500, detail="Failed to create requisition")

    # Notifications
    emails = _get_officer_emails(user_id)
    email_sent = False
    if emails:
        subject = "New Requisition Submitted"
        html = f"""
            <h3>New Requisition Submitted</h3>
            <p><b>Employee:</b> {row['employee_name'] or ''}</p>
            <p><b>Warehouse:</b> {warehouse_name}</p>
            <p><b>Reason:</b> {reason}</p>
            <p><b>Items:</b><br/>- {item} (Qty: {quantity})</p>
            <p>Submitted at: {row['submitted_at']}</p>
        """
        await _send_brevo_email_multi(emails, subject, html)
        email_sent = True

    return {
        "requisition_id": row_ins.get("requisition_id"), 
        "status": row_ins.get("status"),
        "email_sent": email_sent,
        "officer_email_configured": len(emails) > 0
    }


@router.post("/batch", response_model=dict)
async def create_requisitions_batch(
    payload: BatchRequisitionRequest = Body(...),
    current_user=Depends(get_protected_user),
):
    """
    Multi-item creation with JSON payload mirroring the Streamlit page behavior.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    _enforce_free_plan_limit(user_id)

    if not payload.items:
        raise HTTPException(status_code=400, detail="No items provided")

    # Validate items against inventory for the selected warehouse
    validated_items: List[Dict[str, Any]] = []
    for it in payload.items:
        inv = _validate_inventory_item(user_id, payload.warehouse_name, it.item)
        if (it.quantity or 0) <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid quantity for item '{it.item}'")
        validated_items.append({"item": inv["item_name"], "quantity": int(it.quantity)})

    submitted_at = _now_iso()
    entries: List[Dict[str, Any]] = []
    for it in validated_items:
        entries.append(
            {
                "user_id": user_id,
                "employee_id": payload.employee_id
                if payload.employee_id is not None
                else (current_user.get("id", current_user.get("user_id")) if (current_user.get("role") or "").lower() == "md" else None),
                "employee_name": payload.employee_name or current_user.get("username"),
                "warehouse_name": payload.warehouse_name,
                "item": it["item"],
                "quantity": it["quantity"],
                "reason": payload.reason,
                "status": "Pending",
                "signature": payload.signature_base64,
                "submitted_at": submitted_at,
            }
        )

    ins = supabase.table("requisitions").insert(entries).execute()
    data = ins.data or []
    if not data:
        raise HTTPException(status_code=500, detail="Failed to submit requisitions")

    # Email notifications to inventory officers
    emails = _get_officer_emails(user_id)
    email_sent = False
    if emails:
        lines = "".join([f"<li>{e['item']} (Qty: {e['quantity']})</li>" for e in entries])
        subject = "New Requisition Submitted"
        html = f"""
            <h3>New Requisition Submitted</h3>
            <p><b>Employee:</b> {entries[0]['employee_name'] or ''}</p>
            <p><b>Warehouse:</b> {payload.warehouse_name}</p>
            <p><b>Reason:</b> {payload.reason}</p>
            <p><b>Items:</b><ul>{lines}</ul></p>
            <p>Submitted at: {submitted_at}</p>
        """
        await _send_brevo_email_multi(emails, subject, html)
        email_sent = True

    return {
        "msg": "Requisitions submitted successfully",
        "requisition_ids": [r.get("requisition_id") for r in data],
        "count": len(data),
        "email_sent": email_sent,
        "officer_email_configured": len(emails) > 0
    }


@router.put("/{requisition_id}", response_model=dict)
async def update_requisition(
    requisition_id: int,
    status: Optional[str] = Form(None),  # e.g., "Approved", "Rejected"
    notes: Optional[str] = Form(None),
    current_user=Depends(get_protected_user),
):
    # Fetch existing
    resp = (
        supabase.table("requisitions")
        .select("*")
        .eq("requisition_id", requisition_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    existing = resp.data[0] if resp.data else None
    if not existing:
        raise HTTPException(status_code=404, detail="Requisition not found")

    update_data: Dict[str, Any] = {}
    if status:
        update_data["status"] = status
    if notes:
        prev_reason = existing.get("reason") or ""
        new_reason = f"{prev_reason}\nAdmin notes: {notes}" if prev_reason else f"Admin notes: {notes}"
        update_data["reason"] = new_reason

    if not update_data:
        return {"msg": "No changes", "requisition_id": requisition_id}

    upd = (
        supabase.table("requisitions")
        .update(update_data)
        .eq("requisition_id", requisition_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .execute()
    )
    updated = upd.data[0] if upd.data else {**existing, **update_data}
    return {"msg": "Requisition updated successfully", "requisition_id": updated.get("requisition_id")}


@router.delete("/{requisition_id}")
async def delete_requisition(
    requisition_id: int,
    current_user=Depends(get_protected_user),
):
    # Only MD can delete requisitions
    if (current_user.get("role") or "").lower() != "md":
        raise HTTPException(status_code=403, detail="Only MD can delete requisitions")
    
    exists = (
        supabase.table("requisitions")
        .select("requisition_id")
        .eq("requisition_id", requisition_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    if not exists.data:
        raise HTTPException(status_code=404, detail="Requisition not found")

    supabase.table("requisitions").delete().eq("requisition_id", requisition_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"msg": "Requisition deleted successfully"}


# =========================
# Warehouses, Inventory, Employees
# (mirrors Streamlit helper utilities)
# =========================
@router.get("/warehouses")
async def get_warehouses_for_requisitions(
    role: str = Query(..., description="User role, e.g. 'md' or 'employee'"),
    employee_id: Optional[int] = Query(None),
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    r = (role or "").lower()
    if r == "md":
        resp = (
            supabase.table("inventory_master_log")
            .select("warehouse_name")
            .eq("user_id", user_id)
            .neq("warehouse_name", None)
            .execute()
        )
        data = resp.data or []
        return sorted(list({w["warehouse_name"] for w in data if w.get("warehouse_name")}))
    elif r == "employee" and employee_id:
        resp = (
            supabase.table("warehouse_access")
            .select("warehouse_name")
            .eq("user_id", user_id)
            .eq("employee_id", employee_id)
            .execute()
        )
        data = resp.data or []
        return sorted(list({w["warehouse_name"] for w in data if w.get("warehouse_name")}))
    return []


@router.get("/inventory-items")
async def get_inventory_items_for_warehouse(
    warehouse_name: str = Query(...),
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    if not warehouse_name:
        return {}
    resp = (
        supabase.table("inventory_master_log")
        .select("item_id, item_name, price, warehouse_name")
        .eq("user_id", user_id)
        .eq("warehouse_name", warehouse_name)
        .execute()
    )
    items = resp.data or []
    return {
        it["item_name"]: {"item_id": it["item_id"], "price": (it.get("price", 0) or 0)}
        for it in items
        if it.get("item_name") is not None
    }


@router.get("/employees")
async def get_employees(current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("employees").select("employee_id,name").eq("user_id", user_id).execute()
    return resp.data or []


# =========================
# MD-Only Actions
# =========================
@router.post("/{requisition_id}/approve")
async def approve_requisition(
    requisition_id: int,
    current_user=Depends(get_protected_user),
):
    """Approve a requisition (MD only)"""
    if (current_user.get("role") or "").lower() != "md":
        raise HTTPException(status_code=403, detail="Only MD can approve requisitions")
    
    resp = (
        supabase.table("requisitions")
        .select("*")
        .eq("requisition_id", requisition_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    upd = (
        supabase.table("requisitions")
        .update({"status": "Approved"})
        .eq("requisition_id", requisition_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .execute()
    )
    return {"msg": "Requisition approved successfully", "requisition_id": requisition_id}


@router.post("/{requisition_id}/reject")
async def reject_requisition(
    requisition_id: int,
    current_user=Depends(get_protected_user),
):
    """Reject a requisition (MD only)"""
    if (current_user.get("role") or "").lower() != "md":
        raise HTTPException(status_code=403, detail="Only MD can reject requisitions")
    
    resp = (
        supabase.table("requisitions")
        .select("*")
        .eq("requisition_id", requisition_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    upd = (
        supabase.table("requisitions")
        .update({"status": "Rejected"})
        .eq("requisition_id", requisition_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .execute()
    )
    return {"msg": "Requisition rejected successfully", "requisition_id": requisition_id}


@router.put("/{requisition_id}/remark")
async def update_remark(
    requisition_id: int,
    remark: str = Body(..., embed=True),
    current_user=Depends(get_protected_user),
):
    """Update remark on a requisition (MD only)"""
    if (current_user.get("role") or "").lower() != "md":
        raise HTTPException(status_code=403, detail="Only MD can update remarks")
    
    resp = (
        supabase.table("requisitions")
        .select("*")
        .eq("requisition_id", requisition_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    upd = (
        supabase.table("requisitions")
        .update({"remark": remark})
        .eq("requisition_id", requisition_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .execute()
    )
    return {"msg": "Remark updated successfully", "requisition_id": requisition_id}


# =========================
# Filtering and Export (CSV/Excel)
# =========================
@router.get("/filter")
async def filter_requisitions(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    items: Optional[str] = Query(None, description="Comma-separated item names to include"),
    q: Optional[str] = Query(None, description="Keyword to search in employee_name, reason, status, item"),
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = (
        supabase.table("requisitions")
        .select("*")
        .eq("user_id", user_id)
        .order("submitted_at", desc=True)
        .execute()
    )
    df = pd.DataFrame(resp.data or [])

    if df.empty:
        return []

    # normalize dates
    if "submitted_at" in df.columns:
        df["submitted_at"] = pd.to_datetime(df["submitted_at"], errors="coerce")

    # date range
    if start_date:
        df = df[df["submitted_at"].dt.date >= start_date]
    if end_date:
        df = df[df["submitted_at"].dt.date <= end_date]

    # items filter
    if items:
        wanted = {s.strip() for s in items.split(",") if s.strip()}
        if wanted:
            df = df[df["item"].astype(str).isin(list(wanted))]

    # keyword filter
    if q:
        ql = str(q).lower()
        mask = (
            df["employee_name"].astype(str).str.lower().str.contains(ql, na=False)
            | df["reason"].astype(str).str.lower().str.contains(ql, na=False)
            | df["status"].astype(str).str.lower().str.contains(ql, na=False)
            | df["item"].astype(str).str.lower().str.contains(ql, na=False)
        )
        df = df[mask]

    return df.to_dict(orient="records")


@router.get("/export")
async def export_requisitions(
    format: Literal["csv", "excel"] = Query("csv"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    items: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    current_user=Depends(get_protected_user),
):
    """
    Export requisitions with same filter set as /filter.
    Returns base64 content suitable for direct download on frontend.
    """
    # Reuse the filter logic
    rows = await filter_requisitions(start_date, end_date, items, q, current_user)  # type: ignore
    df = pd.DataFrame(rows or [])

    if format == "excel":
        try:
            buf = BytesIO()
            # Let pandas choose available engine (openpyxl/xlsxwriter)
            df.to_excel(buf, index=False)
            buf.seek(0)
            b64 = base64.b64encode(buf.read()).decode("utf-8")
            filename = "requisitions.xlsx"
            return {
                "filename": filename,
                "content_base64": b64,
                "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }
        except Exception:
            # Fallback to CSV if excel export fails
            format = "csv"

    # CSV path
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    b64 = base64.b64encode(csv_bytes).decode("utf-8")
    return {
        "filename": "requisitions.csv",
        "content_base64": b64,
        "content_type": "text/csv",
    }

