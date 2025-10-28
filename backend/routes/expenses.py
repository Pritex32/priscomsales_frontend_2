from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body, Query
from datetime import datetime, date
from typing import List, Optional, Literal, Dict, Any
# BytesIO removed - using raw bytes instead
import base64
import os
import uuid

from pydantic import BaseModel

from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase

router = APIRouter(prefix="/expenses", tags=["expenses"])


# =========================
# Models
# =========================
class UploadInvoiceBase64(BaseModel):
    data_base64: str
    filename: Optional[str] = None  # e.g., "invoice.jpg"
    content_type: Optional[str] = None  # e.g., "image/jpeg"


class CreateExpenseRequest(BaseModel):
    vendor_name: str
    total_amount: float
    expense_date: date
    payment_status: Literal["paid", "credit", "partial"] = "paid"
    payment_method: Literal["cash", "card", "transfer"] = "cash"
    due_date: Optional[date] = None
    invoice_number: Optional[str] = None
    notes: Optional[str] = None
    invoice_file_url: Optional[str] = None
    amount_paid: Optional[float] = None  # used when partial
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None


class PaymentAddRequest(BaseModel):
    expense_id: int
    amount: float
    payment_method: Literal["cash", "card", "transfer"] = "cash"
    notes: Optional[str] = None
    payment_date: Optional[date] = None


# =========================
# Helpers
# =========================
import tempfile
from fastapi import UploadFile
from typing import Optional

from typing import Optional

async def _upload_to_storage(
    user_id: int,
    uploaded_file: UploadFile,
    bucket: str,
    folder: str,
    desired_name_no_ext: Optional[str] = None
) -> str:
    try:
        # --- Build file name ---
        ext = os.path.splitext(uploaded_file.filename or "file.bin")[1] or ".bin"
        base_name = (
            desired_name_no_ext.strip().replace(" ", "_")
            if desired_name_no_ext
            else (os.path.splitext(uploaded_file.filename or "file")[0] if uploaded_file.filename else "upload")
        )
        unique = uuid.uuid4().hex[:8]
        filename = f"{base_name}_{unique}{ext}"
        path = f"{folder}/{user_id}/{filename}"

        # --- Read file bytes from UploadFile ---
        content = await uploaded_file.read()

        # --- Save to a temporary file path ---
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name  # actual path string

        # --- Upload using the file path ---
        result = supabase.storage.from_(bucket).upload(
            path,
            tmp_path,  # pass file path, NOT BytesIO
            {"content-type": uploaded_file.content_type or "application/octet-stream"}
        )

        # --- Remove the temporary file ---
        os.remove(tmp_path)

        if hasattr(result, "error") and result.error:
            raise Exception(f"Storage upload failed: {result.error}")

        # --- Get public URL ---
        public_url_result = supabase.storage.from_(bucket).get_public_url(path)
        return public_url_result

    except Exception as e:
        print(f"Storage upload error: {e}")
        raise

def _upload_bytes_to_storage(
    user_id: int,
    data: bytes,
    content_type: str,
    desired_name_no_ext: Optional[str] = None,
    ext: Optional[str] = None,
    bucket: str = "salesinvoices",
    folder: str = "salesinvoices"
) -> str:
    try:
        base_name = (desired_name_no_ext or f"expense_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}").strip().replace(" ", "_")
        unique = uuid.uuid4().hex[:8]
        ext2 = ext if ext and ext.startswith(".") else (f".{ext}" if ext else ".bin")
        filename = f"{base_name}_{unique}{ext2}"
        path = f"{folder}/{user_id}/{filename}"

        # ✅ Use temp file approach to avoid BytesIO issues
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        result = supabase.storage.from_(bucket).upload(
            path,
            tmp_path,  # Use file path instead of raw bytes
            {"content-type": content_type or "application/octet-stream"}
        )

        # Remove temp file
        os.remove(tmp_path)

        if hasattr(result, 'error') and result.error:
            raise Exception(f"Storage upload failed: {result.error}")

        public_url_result = supabase.storage.from_(bucket).get_public_url(path)
        return public_url_result

    except Exception as e:
        error_msg = str(e)
        print(f"Storage upload error: {error_msg}")
        # More specific error messages
        if "Network" in error_msg or "Connection" in error_msg:
            raise Exception("Unable to connect to Supabase. Check your internet connection and Supabase URL.")
        elif "404" in error_msg:
            raise Exception("Supabase project not found. Check your SUPABASE_URL configuration.")
        elif "401" in error_msg or "403" in error_msg:
            raise Exception("Supabase authentication failed. Check your SUPABASE_KEY configuration.")
        else:
            raise Exception(f"Upload failed: {error_msg}")


def _recalc_paid_and_balance(payment_status: str, total_amount: float, amount_paid: Optional[float]) -> Dict[str, float]:
    if payment_status == "paid":
        return {"amount_paid": float(total_amount), "amount_balance": 0.0}
    elif payment_status == "credit":
        return {"amount_paid": 0.0, "amount_balance": float(total_amount)}
    else:  # partial
        ap = float(amount_paid or 0.0)
        if ap <= 0 or ap > total_amount:
            raise HTTPException(status_code=400, detail="Invalid amount_paid for partial payment")
        return {"amount_paid": ap, "amount_balance": float(total_amount - ap)}


def _update_expense_payment_fields(user_id: int, expense_id: int, new_paid: float, total_amount: float) -> str:
    """
    Update expense payment fields based on new_paid against total_amount.
    Returns new status.
    """
    if new_paid >= total_amount:
        new_status = "paid"
        amount_paid = total_amount
        amount_balance = 0.0
    elif new_paid > 0:
        new_status = "partial"
        amount_paid = new_paid
        amount_balance = total_amount - new_paid
    else:
        # If there was existing status credit/partial and new_paid == 0; keep credit
        new_status = "credit"
        amount_paid = 0.0
        amount_balance = total_amount

    supabase.table("expenses_master").update({
        "payment_status": new_status,
        "amount_paid": float(amount_paid),
        "amount_balance": float(amount_balance),
    }).eq("expense_id", expense_id).eq("user_id", user_id).execute()
    return new_status


# =========================
# Listing
# =========================
@router.get("/", response_model=None)
async def get_expenses(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=1000), current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    
    # Get total count
    count_resp = supabase.table("expenses_master").select("expense_id", count="exact").eq("user_id", user_id).execute()
    total = count_resp.count if hasattr(count_resp, 'count') else 0
    
    # Get paginated data
    resp = supabase.table("expenses_master").select("*").eq("user_id", user_id).order("expense_date", desc=True).range(skip, skip + limit - 1).execute()
    data = resp.data or []
    
    return {
        "data": data,
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": (skip + limit) < total
    }


@router.get("/pending", response_model=None)
async def get_pending_expenses(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=1000), current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    
    # Get total count of pending expenses
    count_resp = supabase.table("expenses_master").select("expense_id", count="exact").eq("user_id", user_id).in_("payment_status", ["partial", "credit"]).execute()
    total = count_resp.count if hasattr(count_resp, 'count') else 0
    
    # Get paginated data
    resp = supabase.table("expenses_master").select("*").eq("user_id", user_id).in_("payment_status", ["partial", "credit"]).order("expense_date", desc=True).range(skip, skip + limit - 1).execute()
    data = resp.data or []
    
    return {
        "data": data,
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": (skip + limit) < total
    }


@router.get("/range", response_model=None)
async def get_expenses_in_range(start_date: date, end_date: date, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("expenses_master").select("*").eq("user_id", user_id).execute()
    rows = resp.data or []
    out = []
    for r in rows:
        try:
            d = date.fromisoformat(r.get("expense_date"))
        except Exception:
            continue
        if d >= start_date and d <= end_date:
            out.append(r)
    return out


# =========================
# Invoice uploads
# =========================
@router.post("/upload-invoice")
async def upload_invoice(desired_name: Optional[str] = Form(None), invoice_file: UploadFile = File(...), current_user=Depends(get_protected_user)):
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        
        # Check file size (10 MB max)
        content = await invoice_file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 10MB.")
        
        # Reset file pointer for upload
        await invoice_file.seek(0)
        
        # Check if file already exists (basic check by filename)
        if invoice_file.filename:
            existing_check = supabase.table("expenses_master").select("invoice_file_url").eq("user_id", user_id).like("invoice_file_url", f"%{invoice_file.filename.split('.')[0]}%").execute()
            if existing_check.data:
                # File with similar name might exist, but continue anyway
                pass
        
        url = await _upload_to_storage(user_id, invoice_file, bucket="salesinvoices", folder="salesinvoices", desired_name_no_ext=desired_name)
        return {"invoice_file_url": url, "message": "File uploaded successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {str(e)}")  # For debugging
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload-invoice-base64")
async def upload_invoice_base64(body: UploadInvoiceBase64, current_user=Depends(get_protected_user)):
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        
        # Decode base64 data
        raw = body.data_base64
        if "," in raw and raw.strip().startswith("data:"):
            raw = raw.split(",", 1)[1]
        data = base64.b64decode(raw)
        
        # Check file size (10 MB max)
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 10MB.")
        
        content_type = body.content_type or "application/octet-stream"
        ext = None
        if body.filename and "." in body.filename:
            ext = "." + body.filename.split(".")[-1]
        elif content_type.startswith("image/"):
            ext = "." + content_type.split("/", 1)[1]

        name_no_ext = (body.filename.split(".")[0] if body.filename else "expense_camera")
        url = _upload_bytes_to_storage(user_id, data, content_type, desired_name_no_ext=name_no_ext, ext=ext or ".bin")
        return {"invoice_file_url": url, "message": "File uploaded successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Base64 upload error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid base64 data: {str(e)}")


# =========================
# Create expense
# =========================
@router.post("/", response_model=dict)
async def create_expense(
    vendor_name: str = Form(...),
    total_amount: float = Form(...),
    expense_date: date = Form(...),
    payment_status: str = Form("paid"),
    payment_method: str = Form("cash"),
    due_date: Optional[date] = Form(None),
    invoice_number: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    amount_paid: Optional[float] = Form(None),
    invoice_file: UploadFile = File(None),
    current_user=Depends(get_protected_user),
):
    # Temporarily disabled validation for troubleshooting
    # if payment_status in ("paid", "credit", "partial"):
    #     if not invoice_number and not invoice_file:
    #         raise HTTPException(status_code=400, detail="Provide invoice_number or upload the invoice file for paid/credit/partial expenses")

    invoice_file_url = None
    if invoice_file:
        try:
            filename = f"expense_invoice_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            invoice_file_url = await _upload_to_storage(current_user.get("id", current_user.get("user_id")), invoice_file, bucket="salesinvoices", folder="salesinvoices", desired_name_no_ext=filename)
        except Exception as e:
            # If upload fails but we have invoice_number, continue
            if not invoice_number:
                raise HTTPException(status_code=400, detail=f"File upload failed: {str(e)}. Please provide invoice_number as alternative.")

    # Calculate amounts based on status
    if payment_status == "partial":
        calc = _recalc_paid_and_balance(payment_status, float(total_amount), amount_paid)
    else:
        calc = _recalc_paid_and_balance(payment_status, float(total_amount), None)

    expense_data = {
        "user_id": current_user.get("id", current_user.get("user_id")),
        "employee_id": current_user.get("id", current_user.get("user_id")) if current_user.get("role") == "md" else None,
        "employee_name": current_user.get("username", ""),
        "expense_date": expense_date.isoformat(),
        "vendor_name": vendor_name,
        "total_amount": float(total_amount),
        "payment_method": payment_method,
        "payment_status": payment_status,
        "due_date": due_date.isoformat() if due_date else None,
        "invoice_number": invoice_number,
        "invoice_file_url": invoice_file_url,
        "notes": notes,
        "amount_paid": calc["amount_paid"],
        "amount_balance": calc["amount_balance"],
    }
    resp = supabase.table("expenses_master").insert(expense_data).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to insert expense")
    row = resp.data[0]
    return {"expense_id": row["expense_id"], "total_amount": float(total_amount)}


@router.post("/json", response_model=dict)
async def create_expense_json(payload: CreateExpenseRequest, current_user=Depends(get_protected_user)):
    if payload.payment_status in ("paid", "credit", "partial"):
        if not payload.invoice_number and not payload.invoice_file_url:
            raise HTTPException(status_code=400, detail="Provide invoice_number or invoice_file_url for paid/credit/partial expenses")

    if payload.payment_status == "partial":
        calc = _recalc_paid_and_balance(payload.payment_status, float(payload.total_amount), payload.amount_paid)
    else:
        calc = _recalc_paid_and_balance(payload.payment_status, float(payload.total_amount), None)

    row = {
        "user_id": current_user.get("id", current_user.get("user_id")),
        "employee_id": payload.employee_id or (current_user.get("id", current_user.get("user_id")) if current_user.get("role") == "md" else None),
        "employee_name": payload.employee_name or current_user.get("username", ""),
        "expense_date": payload.expense_date.isoformat(),
        "vendor_name": payload.vendor_name,
        "total_amount": float(payload.total_amount),
        "payment_method": payload.payment_method,
        "payment_status": payload.payment_status,
        "due_date": payload.due_date.isoformat() if payload.due_date else None,
        "invoice_number": payload.invoice_number,
        "invoice_file_url": payload.invoice_file_url,
        "notes": payload.notes,
        "amount_paid": calc["amount_paid"],
        "amount_balance": calc["amount_balance"],
    }
    ins = supabase.table("expenses_master").insert(row).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to insert expense")
    out = ins.data[0]
    return {"expense_id": out["expense_id"], "total_amount": float(payload.total_amount)}


# =========================
# Update expense
# =========================
@router.put("/{expense_id}", response_model=dict)
async def update_expense(
    expense_id: int,
    vendor_name: Optional[str] = Form(None),
    total_amount: Optional[float] = Form(None),
    expense_date: Optional[date] = Form(None),
    payment_status: Optional[str] = Form(None),
    payment_method: Optional[str] = Form(None),
    due_date: Optional[date] = Form(None),
    invoice_number: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    amount_paid: Optional[float] = Form(None),
    invoice_file: UploadFile = File(None),
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("expenses_master").select("*").eq("expense_id", expense_id).eq("user_id", user_id).execute()
    row = resp.data[0] if resp.data else None
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")

    update_data: Dict[str, Any] = {}
    if vendor_name is not None:
        update_data["vendor_name"] = vendor_name
    if total_amount is not None:
        update_data["total_amount"] = float(total_amount)
    if expense_date is not None:
        update_data["expense_date"] = expense_date.isoformat()
    if payment_status is not None:
        update_data["payment_status"] = payment_status
    if payment_method is not None:
        update_data["payment_method"] = payment_method
    if due_date is not None:
        update_data["due_date"] = due_date.isoformat()
    if invoice_number is not None:
        update_data["invoice_number"] = invoice_number
    if notes is not None:
        update_data["notes"] = notes

    if invoice_file:
        filename = f"expense_invoice_update_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        url = await _upload_to_storage(user_id, invoice_file, bucket="salesinvoices", folder="salesinvoices", desired_name_no_ext=filename)
        update_data["invoice_file_url"] = url

    # Recalculate paid/balance if total or status or amount_paid changed
    new_total = float(update_data.get("total_amount", row.get("total_amount") or 0.0))
    new_status = update_data.get("payment_status", row.get("payment_status") or "credit")
    current_paid = float(row.get("amount_paid") or 0.0)

    if amount_paid is not None:
        # Override current paid if explicitly set
        current_paid = float(amount_paid)

    if payment_status is not None or total_amount is not None or amount_paid is not None:
        # When updating status and amounts, validate conditions
        if new_status == "paid":
            update_data["amount_paid"] = new_total
            update_data["amount_balance"] = 0.0
        elif new_status == "credit":
            update_data["amount_paid"] = 0.0
            update_data["amount_balance"] = new_total
        else:  # partial
            if current_paid <= 0 or current_paid > new_total:
                raise HTTPException(status_code=400, detail="Invalid amount_paid for partial payment")
            update_data["amount_paid"] = current_paid
            update_data["amount_balance"] = new_total - current_paid

    supabase.table("expenses_master").update(update_data).eq("expense_id", expense_id).eq("user_id", user_id).execute()
    return {"msg": "Expense updated successfully", "expense_id": expense_id}


# =========================
# Add a payment to an expense (partial/credit handling)
# =========================
@router.post("/payments", response_model=dict)
async def add_payment(payload: PaymentAddRequest, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")

    # Fetch expense
    resp = supabase.table("expenses_master").select("total_amount, amount_paid").eq("expense_id", payload.expense_id).eq("user_id", user_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Expense not found")
    total_amount = float(resp.data.get("total_amount") or 0.0)
    existing_paid = float(resp.data.get("amount_paid") or 0.0)

    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    new_paid = existing_paid + float(payload.amount)
    # Insert payment row referencing expense
    pay_row = {
        "user_id": user_id,
        "expense_id": payload.expense_id,
        "amount": float(payload.amount),
        "payment_method": payload.payment_method,
        "notes": payload.notes or "",
        "payment_date": (payload.payment_date or date.today()).isoformat(),
    }
    supabase.table("payments").insert(pay_row).execute()

    # Update expense payment fields
    new_status = _update_expense_payment_fields(user_id, payload.expense_id, new_paid, total_amount)
    return {"msg": "Payment recorded", "new_status": new_status, "expense_id": payload.expense_id}


# =========================
# Delete expense (and related payments)
# =========================
@router.delete("/{expense_id}")
async def delete_expense(expense_id: int, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("expenses_master").select("*").eq("expense_id", expense_id).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    # Delete related payments
    supabase.table("payments").delete().eq("expense_id", expense_id).eq("user_id", user_id).execute()
    supabase.table("expenses_master").delete().eq("expense_id", expense_id).eq("user_id", user_id).execute()
    return {"msg": "Expense deleted successfully"}

