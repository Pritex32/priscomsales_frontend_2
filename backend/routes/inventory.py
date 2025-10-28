from fastapi import APIRouter, Depends, HTTPException, Query, Body
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any, Literal, Tuple
from pydantic import BaseModel, Field
import math
import itertools

from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase
from backend.core.permission_check import require_permission

router = APIRouter(prefix="/inventory", tags=["inventory"])


# =========================
# Helpers
# =========================
def _today() -> date:
    return datetime.utcnow().date()


def _enforce_free_plan_limit(user_id: int):
    """
    Match Streamlit gating:
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


def _assert_md_or_today(selected: date, role: str):
    """
    Employees can only post for today; MD can select any day.
    """
    if (role or "").lower() != "md":
        if selected != _today():
            raise HTTPException(status_code=403, detail="Only MD can update past or future dates")


def _get_user_access_code(user_id: int) -> Optional[str]:
    try:
        row = supabase.table("users").select("access_code").eq("user_id", user_id).single().execute().data or {}
        return row.get("access_code")
    except Exception:
        return None


def _resolve_item(current_user: Dict[str, Any], item_id: Optional[int], item_name: Optional[str]) -> Dict[str, Any]:
    user_id = current_user.get("id") or current_user.get("user_id")
    if item_id is not None:
        resp = supabase.table("inventory_master_log").select("*").eq("user_id", user_id).eq("item_id", item_id).limit(1).execute()
        data = resp.data or []
        if not data:
            raise HTTPException(status_code=404, detail=f"Item with item_id={item_id} not found")
        return data[0]
    if item_name:
        resp = supabase.table("inventory_master_log").select("*").eq("user_id", user_id).eq("item_name", item_name).limit(1).execute()
        data = resp.data or []
        if not data:
            raise HTTPException(status_code=404, detail=f"Item '{item_name}' not found")
        return data[0]
    raise HTTPException(status_code=400, detail="Provide item_id or item_name")


def _previous_closing_for(user_id: int, item_id: int, selected: date) -> int:
    """
    Find previous day's closing_balance for an item before 'selected' date.
    """
    try:
        prev = (
            supabase.table("inventory_master_log")
            .select("closing_balance")
            .eq("user_id", user_id)
            .eq("item_id", item_id)
            .lt("log_date", selected.isoformat())
            .order("log_date", desc=True)
            .limit(1)
            .execute()
        )
        rows = prev.data or []
        if not rows:
            return 0
        return int(rows[0].get("closing_balance") or 0)
    except Exception:
        return 0


def _get_existing_same_day(user_id: int, item_id: int, selected: date) -> Optional[Dict[str, Any]]:
    try:
        ex = (
            supabase.table("inventory_master_log")
            .select("*")
            .eq("user_id", user_id)
            .eq("item_id", item_id)
            .eq("log_date", selected.isoformat())
            .limit(1)
            .execute()
        )
        return (ex.data or [None])[0]
    except Exception:
        return None


def _upsert_inventory_daily(user_id: int, item_row: Dict[str, Any], selected: date, delta_in: int, delta_out: int, delta_return: int) -> Tuple[bool, Dict[str, Any]]:
    """
    Merge with same-day log or insert new; compute open_balance from previous closing when necessary.
    Returns (success, resulting_row_like).
    """
    item_id = int(item_row.get("item_id") or 0)
    item_name = item_row.get("item_name")
    existing = _get_existing_same_day(user_id, item_id, selected)

    if existing:
        open_balance = int(existing.get("open_balance", 0) or 0)
        supplied_quantity = int(existing.get("supplied_quantity", 0) or 0) + int(delta_in or 0)
        stock_out = int(existing.get("stock_out", 0) or 0) + int(delta_out or 0)
        return_quantity = int(existing.get("return_quantity", 0) or 0) + int(delta_return or 0)
    else:
        open_balance = _previous_closing_for(user_id, item_id, selected)
        supplied_quantity = int(delta_in or 0)
        stock_out = int(delta_out or 0)
        return_quantity = int(delta_return or 0)

    total_available = open_balance + supplied_quantity + return_quantity
    if total_available <= 0 and stock_out > 0:
        # out of stock guard (match Streamlit warning behavior)
        stock_out = 0

    closing_balance = total_available - stock_out

    # Get additional fields from item_row like in Streamlit
    price = item_row.get("price", 0)
    warehouse_name = item_row.get("warehouse_name", "")
    reorder_level = item_row.get("reorder_level", 0)

    row_for_db = {
        "user_id": user_id,
        "item_id": item_id,
        "item_name": item_name,
        "open_balance": int(open_balance),
        "supplied_quantity": int(supplied_quantity),
        "stock_out": int(stock_out),
        "return_quantity": int(return_quantity),
        "price": float(price or 0),
        "warehouse_name": warehouse_name,
        "reorder_level": int(reorder_level or 0),
        "log_date": selected.isoformat(),
        "last_updated": selected.isoformat(),
    }
    if existing:
        supabase.table("inventory_master_log").update(row_for_db).eq("user_id", user_id).eq("item_id", item_id).eq("log_date", selected.isoformat()).execute()
    else:
        supabase.table("inventory_master_log").insert(row_for_db).execute()

    row_for_return = dict(row_for_db)
    row_for_return["closing_balance"] = int(closing_balance)
    return True, row_for_return


def _move_sales_to_history(user_id: int, selected: date) -> int:
    """
    Upsert sales_master_log rows for selected date to sales_master_history and delete them from log.
    """
    moved = 0
    srows = supabase.table("sales_master_log").select("*").eq("user_id", user_id).eq("sale_date", selected.isoformat()).execute().data or []
    if not srows:
        return 0
    # Upsert each row; on_conflict sale_id,user_id
    for r in srows:
        supabase.table("sales_master_history").upsert(r, on_conflict=["sale_id", "user_id"]).execute()
        supabase.table("sales_master_log").delete().eq("user_id", user_id).eq("sale_id", r.get("sale_id")).execute()
        moved += 1
    return moved


def _move_purchases_to_history(user_id: int, selected: date) -> int:
    """
    Upsert goods_bought rows for selected date to goods_bought_history and delete them from log.
    """
    moved = 0
    prows = supabase.table("goods_bought").select("*").eq("user_id", user_id).eq("purchase_date", selected.isoformat()).execute().data or []
    if not prows:
        return 0
    for r in prows:
        # remove any transient fields if needed (Streamlit removed total_price sometimes)
        sanitized = dict(r)
        sanitized.pop("total_price", None)
        supabase.table("goods_bought_history").upsert(sanitized, on_conflict=["purchase_id", "user_id"]).execute()
        supabase.table("goods_bought").delete().eq("user_id", user_id).eq("purchase_id", r.get("purchase_id")).execute()
        moved += 1
    return moved


# =========================
# Models
# =========================
class InventoryLogCreate(BaseModel):
    item_name: str
    log_date: date
    open_balance: int = 0
    supplied_quantity: int = 0
    stock_out: int = 0
    return_quantity: int = 0
    price: float = 0
    warehouse_name: Optional[str] = None
    reorder_level: int = 0


class InventoryFilter(BaseModel):
    start_date: date
    end_date: date
    item_name: Optional[str] = None
    keyword: Optional[str] = None


class UpdateBalancesRequest(BaseModel):
    selected_date: date
    move_to_history: bool = True  # if true, move same-day sales/purchases to *_history after updating


class ReturnItemRequest(BaseModel):
    item_id: Optional[int] = None
    item_name: Optional[str] = None
    return_quantity: int = Field(..., gt=0)
    selected_date: date
    access_code: str


class ManualAdjustmentRequest(BaseModel):
    supplied_quantity: Optional[int] = None
    stock_out: Optional[int] = None
    return_quantity: Optional[int] = None
    log_date: Optional[date] = None
    notes: Optional[str] = None


# =========================
# Core listing and CRUD (kept and expanded)
# =========================
@router.get("/", response_model=None)
async def get_inventory(
    skip: int = 0,
    limit: int = 20,
    warehouse_name: Optional[str] = None,
    low_stock: Optional[bool] = None,
    current_user=Depends(get_protected_user),
):
    response = (
        supabase.table("inventory_master_log")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .order("log_date", desc=True)
        .range(skip, skip + max(limit, 1) - 1)
        .execute()
    )
    inventory = response.data or []
    if warehouse_name:
        inventory = [i for i in inventory if i.get("warehouse_name") == warehouse_name]
    if low_stock:
        inventory = [i for i in inventory if (i.get("closing_balance") or 0) <= (i.get("reorder_level") or 0)]
    return inventory


@router.get("/items-map")
async def items_map(warehouse_name: Optional[str] = None, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    q = supabase.table("inventory_master_log").select("item_id,item_name,price,warehouse_name").eq("user_id", user_id)
    if warehouse_name:
        q = q.eq("warehouse_name", warehouse_name)
    resp = q.execute()
    items = resp.data or []
    # map unique item_name -> last seen (id, price)
    out: Dict[str, Dict[str, Any]] = {}
    for it in items:
        nm = it.get("item_name")
        if nm is None:
            continue
        out[nm] = {"item_id": it.get("item_id"), "price": (it.get("price", 0) or 0)}
    return out


@router.post("/", response_model=dict)
async def create_inventory_log(payload: InventoryLogCreate, current_user=Depends(get_protected_user)):
    data = {
        "user_id": current_user.get("id", current_user.get("user_id")),
        "item_name": payload.item_name,
        "open_balance": int(payload.open_balance or 0),
        "supplied_quantity": int(payload.supplied_quantity or 0),
        "stock_out": int(payload.stock_out or 0),
        "return_quantity": int(payload.return_quantity or 0),
        "log_date": payload.log_date.isoformat(),
        "price": float(payload.price or 0.0),
        "warehouse_name": payload.warehouse_name,
        "reorder_level": int(payload.reorder_level or 0),
        "last_updated": payload.log_date.isoformat(),
    }
    response = supabase.table("inventory_master_log").insert(data).execute()
    row = response.data[0] if response.data else None
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create inventory log")
    return {"id": row.get("id") or row.get("item_id")}


@router.put("/{log_id}", response_model=dict, dependencies=[Depends(require_permission("inventory.edit_button.access"))])
async def update_inventory_log(
    log_id: int,
    item_name: Optional[str] = None,
    open_balance: Optional[int] = None,
    supplied_quantity: Optional[int] = None,
    stock_out: Optional[int] = None,
    return_quantity: Optional[int] = None,
    log_date: Optional[date] = None,
    price: Optional[float] = None,
    warehouse_name: Optional[str] = None,
    reorder_level: Optional[int] = None,
    current_user=Depends(get_protected_user),
):
    response = supabase.table("inventory_master_log").select("*").eq("id", log_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    log = response.data[0] if response.data else None
    if not log:
        raise HTTPException(status_code=404, detail="Inventory log not found")

    update_data: Dict[str, Any] = {}
    if item_name is not None:
        update_data["item_name"] = item_name
    if open_balance is not None:
        update_data["open_balance"] = int(open_balance)
    if supplied_quantity is not None:
        update_data["supplied_quantity"] = int(supplied_quantity)
    if stock_out is not None:
        update_data["stock_out"] = int(stock_out)
    if return_quantity is not None:
        update_data["return_quantity"] = int(return_quantity)
    if log_date is not None:
        update_data["log_date"] = log_date.isoformat()
        update_data["last_updated"] = log_date.isoformat()
    if price is not None:
        update_data["price"] = float(price)
    if warehouse_name is not None:
        update_data["warehouse_name"] = warehouse_name
    if reorder_level is not None:
        update_data["reorder_level"] = int(reorder_level)

    supabase.table("inventory_master_log").update(update_data).eq("id", log_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"msg": "Inventory log updated successfully", "log_id": log_id}


@router.delete("/{log_id}", dependencies=[Depends(require_permission("inventory.delete_button.access"))])
async def delete_inventory_log(log_id: int, current_user=Depends(get_protected_user)):
    response = supabase.table("inventory_master_log").select("*").eq("id", log_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Inventory log not found")
    supabase.table("inventory_master_log").delete().eq("id", log_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"msg": "Inventory log deleted successfully"}


@router.patch("/update/{item_id}", response_model=dict)
async def manual_inventory_adjustment(
    item_id: int,
    payload: ManualAdjustmentRequest,
    current_user=Depends(get_protected_user),
):
    """
    Manual inventory adjustment: update supplied_quantity, stock_out, return_quantity.
    Only MD or users with valid access code can perform this action.
    PostgreSQL trigger will auto-recalculate closing_balance.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    role = (current_user.get("role") or "").lower()

    # Enforce access: only MD can perform manual adjustments
    if role != "md":
        # Check if user has valid access_code
        stored_access = _get_user_access_code(user_id) or ""
        if not stored_access:
            raise HTTPException(status_code=403, detail="Manual adjustments require MD role or valid access code")
    
    # Get the current log_date or use today
    selected_date = payload.log_date or _today()
    
    # Find the inventory item
    existing = _get_existing_same_day(user_id, item_id, selected_date)
    
    if not existing:
        # If no log exists for this date, get the item details
        inv_resp = supabase.table("inventory_master_log").select("*").eq("user_id", user_id).eq("item_id", item_id).order("log_date", desc=True).limit(1).execute()
        if not inv_resp.data:
            raise HTTPException(status_code=404, detail=f"Item with item_id={item_id} not found")
        
        inv_item = inv_resp.data[0]
        # Create new entry for the selected date with previous closing as opening
        open_balance = _previous_closing_for(user_id, item_id, selected_date)
        
        insert_data = {
            "user_id": user_id,
            "item_id": item_id,
            "item_name": inv_item.get("item_name"),
            "open_balance": int(open_balance),
            "supplied_quantity": int(payload.supplied_quantity or 0),
            "stock_out": int(payload.stock_out or 0),
            "return_quantity": int(payload.return_quantity or 0),
            "log_date": selected_date.isoformat(),
            "last_updated": datetime.utcnow().isoformat(),
            "price": float(inv_item.get("price") or 0),
            "warehouse_name": inv_item.get("warehouse_name", ""),
            "reorder_level": int(inv_item.get("reorder_level") or 0),
        }
        
        response = supabase.table("inventory_master_log").insert(insert_data).execute()
        updated_row = response.data[0] if response.data else None
        
        if not updated_row:
            raise HTTPException(status_code=500, detail="Failed to create inventory log")
        
        return {
            "msg": "Manual adjustment recorded",
            "item_id": item_id,
            "updated_row": updated_row,
            "notes": payload.notes,
        }
    
    # Update existing log - only update provided fields
    update_data: Dict[str, Any] = {"last_updated": datetime.utcnow().isoformat()}
    
    if payload.supplied_quantity is not None:
        update_data["supplied_quantity"] = int(payload.supplied_quantity)
    if payload.stock_out is not None:
        update_data["stock_out"] = int(payload.stock_out)
    if payload.return_quantity is not None:
        update_data["return_quantity"] = int(payload.return_quantity)
    
    # Update the record
    supabase.table("inventory_master_log").update(update_data).eq("user_id", user_id).eq("item_id", item_id).eq("log_date", selected_date.isoformat()).execute()
    
    # Fetch updated row
    updated = supabase.table("inventory_master_log").select("*").eq("user_id", user_id).eq("item_id", item_id).eq("log_date", selected_date.isoformat()).single().execute()
    
    return {
        "msg": "Manual adjustment recorded",
        "item_id": item_id,
        "updated_row": updated.data,
        "notes": payload.notes,
    }


@router.get("/low-stock")
async def get_low_stock(current_user=Depends(get_protected_user)):
    response = supabase.table("inventory_master_log").select("*").eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    low_stock_items = [i for i in (response.data or []) if (i.get("closing_balance") or 0) <= (i.get("reorder_level") or 0)]
    return [
        {
            "item_name": i.get("item_name"),
            "closing_balance": int(i.get("closing_balance") or 0),
            "reorder_level": int(i.get("reorder_level") or 0),
        }
        for i in low_stock_items
    ]


# =========================
# Daily processing (balances + move to history), Return item
# =========================
@router.post("/update-balances")
async def update_inventory_balances(payload: UpdateBalancesRequest, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    role = (current_user.get("role") or "").lower()

    _enforce_free_plan_limit(user_id)
    _assert_md_or_today(payload.selected_date, role)

    # Fetch today's sales and restocks
    srows = supabase.table("sales_master_log").select("*").eq("user_id", user_id).eq("sale_date", payload.selected_date.isoformat()).execute().data or []
    prows = supabase.table("goods_bought").select("*").eq("user_id", user_id).eq("purchase_date", payload.selected_date.isoformat()).execute().data or []

    if not srows and not prows:
        return {"msg": "No sales or purchases to update today.", "updated_items": 0, "moved_sales": 0, "moved_purchases": 0}

    # Build per-item deltas with duplicate guards (reflect Streamlit checks)
    deltas: Dict[Tuple[Optional[int], str], Dict[str, int]] = {}

    # Purchases => supplied_quantity
    for r in prows:
        # skip if already recorded by purchase_id in inventory logs for this user/date
        purchase_id = r.get("purchase_id")
        if purchase_id:
            chk = supabase.table("inventory_master_log").select("purchase_id").eq("user_id", user_id).eq("purchase_id", purchase_id).execute().data or []
            if chk:
                continue
        item_id = r.get("item_id")
        item_name = r.get("item_name") or ""
        key = (item_id, item_name)
        d = deltas.setdefault(key, {"in": 0, "out": 0, "ret": 0})
        d["in"] += int(r.get("supplied_quantity") or 0)

    # Sales => stock_out and maybe return_quantity
    for r in srows:
        sale_id = r.get("sale_id")
        if sale_id:
            chk = supabase.table("inventory_master_log").select("sale_id").eq("user_id", user_id).eq("sale_id", sale_id).execute().data or []
            if chk:
                continue
        item_id = r.get("item_id")
        item_name = r.get("item_name") or ""
        key = (item_id, item_name)
        d = deltas.setdefault(key, {"in": 0, "out": 0, "ret": 0})
        d["out"] += int(r.get("quantity") or 0)
        d["ret"] += int(r.get("return_quantity") or 0)

    updated = 0
    for (item_id, item_name), dv in deltas.items():
        # resolve inventory row (by id first else name)
        if item_id:
            inv = _resolve_item(current_user, item_id=item_id, item_name=None)
        else:
            inv = _resolve_item(current_user, item_id=None, item_name=item_name)
            item_id = inv.get("item_id")

        ok, _row = _upsert_inventory_daily(user_id, inv, payload.selected_date, dv["in"], dv["out"], dv["ret"])
        if ok:
            updated += 1

    moved_sales = _move_sales_to_history(user_id, payload.selected_date) if payload.move_to_history else 0
    moved_purchases = _move_purchases_to_history(user_id, payload.selected_date) if payload.move_to_history else 0

    return {
        "msg": "Inventory log updated",
        "updated_items": updated,
        "moved_sales": moved_sales,
        "moved_purchases": moved_purchases,
    }


@router.post("/move-to-history")
async def move_to_history(selected_date: date = Body(...), current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    role = (current_user.get("role") or "").lower()
    _assert_md_or_today(selected_date, role)

    moved_sales = _move_sales_to_history(user_id, selected_date)
    moved_purchases = _move_purchases_to_history(user_id, selected_date)
    return {"msg": "Moved to history", "moved_sales": moved_sales, "moved_purchases": moved_purchases}


@router.post("/return-item")
async def return_item_to_inventory(payload: ReturnItemRequest, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    role = (current_user.get("role") or "").lower()

    _enforce_free_plan_limit(user_id)
    _assert_md_or_today(payload.selected_date, role)

    # Validate access code (Streamlit gated this action)
    stored = _get_user_access_code(user_id) or ""
    if not payload.access_code or payload.access_code != stored:
        raise HTTPException(status_code=403, detail="Invalid access code")

    inv = _resolve_item(current_user, item_id=payload.item_id, item_name=payload.item_name)
    item_id = int(inv.get("item_id") or 0)
    same_day = _get_existing_same_day(user_id, item_id, payload.selected_date)
    if same_day:
        new_return_qty = int(same_day.get("return_quantity") or 0) + int(payload.return_quantity)
        supabase.table("inventory_master_log").update(
            {
                "return_quantity": int(new_return_qty),
                "last_updated": payload.selected_date.isoformat(),
            }
        ).eq("user_id", user_id).eq("item_id", item_id).eq("log_date", payload.selected_date.isoformat()).execute()
        return {"msg": "Return recorded", "item_id": item_id, "return_quantity": new_return_qty}
    else:
        insert_payload = {
            "user_id": user_id,
            "item_id": item_id,
            "item_name": inv.get("item_name"),
            "return_quantity": int(payload.return_quantity),
            "log_date": payload.selected_date.isoformat(),
            "last_updated": payload.selected_date.isoformat(),
            "price": float(inv.get("price") or 0),
            "warehouse_name": inv.get("warehouse_name", ""),
            "reorder_level": int(inv.get("reorder_level") or 0),
        }
        supabase.table("inventory_master_log").insert(insert_payload).execute()
        return {"msg": "Return recorded", "item_id": item_id, "return_quantity": int(payload.return_quantity)}


# =========================
# Daily logs, Filter, Reports, Delete inventory item
# =========================
@router.get("/daily-logs")
async def daily_logs(selected_date: date = Query(...), current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("inventory_master_log").select("*").eq("user_id", user_id).eq("log_date", selected_date.isoformat()).execute()
    return resp.data or []


@router.get("/filter")
async def filter_inventory(
    start_date: date,
    end_date: date,
    item_name: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int = 1,
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = (
        supabase.table("inventory_master_log")
        .select("*")
        .eq("user_id", user_id)
        .gte("log_date", start_date.isoformat())
        .lte("log_date", end_date.isoformat())
        .order("log_date", desc=True)
        .execute()
    )
    rows = resp.data or []

    def match(r: Dict[str, Any]) -> bool:
        if item_name and (r.get("item_name") != item_name):
            return False
        if keyword:
            s = str(keyword).lower()
            nm = str(r.get("item_name", "")).lower()
            if s not in nm:
                return False
        return True

    filtered = [r for r in rows if match(r)]
    page_size = 20
    start_idx = max(0, (int(page or 1) - 1) * page_size)
    end_idx = start_idx + page_size
    return filtered[start_idx:end_idx]


@router.get("/reports/summary")
async def summary_report(
    period: Literal["Weekly", "Monthly", "Yearly"],
    start_date: date,
    end_date: date,
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = (
        supabase.table("inventory_master_log")
        .select("log_date,item_name,open_balance,supplied_quantity,return_quantity,stock_out")
        .eq("user_id", user_id)
        .gte("log_date", start_date.isoformat())
        .lte("log_date", end_date.isoformat())
        .execute()
    )
    rows = resp.data or []

    def bucket(d: date) -> str:
        if isinstance(d, str):
            d = date.fromisoformat(d)
        if period == "Weekly":
            # ISO week start (Monday)
            iso = d.isocalendar()
            # Represent as YYYY-Www
            return f"{iso.year}-W{iso.week:02d}"
        if period == "Monthly":
            return f"{d.year}-{d.month:02d}"
        return f"{d.year}"  # Yearly

    agg: Dict[Tuple[str, str], Dict[str, int]] = {}
    for r in rows:
        d = r.get("log_date")
        if isinstance(d, str):
            try:
                d2 = date.fromisoformat(d)
            except Exception:
                continue
        else:
            d2 = d
        b = bucket(d2)
        item = r.get("item_name") or ""
        key = (b, item)
        a = agg.setdefault(key, {"total_open_stock": 0, "total_stock_in": 0, "total_returned": 0, "total_stock_out": 0})
        a["total_open_stock"] += int(r.get("open_balance") or 0)
        a["total_stock_in"] += int(r.get("supplied_quantity") or 0)
        a["total_returned"] += int(r.get("return_quantity") or 0)
        a["total_stock_out"] += int(r.get("stock_out") or 0)

    out: List[Dict[str, Any]] = []
    for (b, item), v in agg.items():
        total_closing = v["total_open_stock"] + v["total_returned"] + v["total_stock_in"] - v["total_stock_out"]
        out.append(
            {
                "period": b,
                "item_name": item,
                "total_open_stock": v["total_open_stock"],
                "total_stock_in": v["total_stock_in"],
                "total_returned": v["total_returned"],
                "total_stock_out": v["total_stock_out"],
                "total_closing_stock": total_closing,
            }
        )
    # sort by period then item_name
    out.sort(key=lambda x: (x["period"], x["item_name"] or ""))
    return out


@router.get("/items/unique")
async def get_unique_inventory_items(current_user=Depends(get_protected_user)):
    """
    Get unique items (deduplicated by item_id) for delete selection dropdown.
    Returns only one row per item_id instead of multiple rows across dates.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("inventory_master_log").select("item_id,item_name,warehouse_name").eq("user_id", user_id).order("item_id", desc=False).execute()
    
    # Deduplicate by item_id, keep first occurrence
    seen = set()
    unique_items = []
    for item in (resp.data or []):
        item_id = item.get("item_id")
        if item_id not in seen:
            seen.add(item_id)
            unique_items.append(item)
    
    return unique_items


@router.delete("/item/{item_id}")
async def delete_inventory_item(item_id: int, current_user=Depends(get_protected_user)):
    # MD only
    role = (current_user.get("role") or "").lower()
    if role != "md":
        raise HTTPException(status_code=403, detail="Only MD can delete inventory items")
    user_id = current_user.get("id") or current_user.get("user_id")

    # Confirm item exists
    inv = supabase.table("inventory_master_log").select("*").eq("user_id", user_id).eq("item_id", item_id).limit(1).execute().data
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    # Cascade delete in related tables (as in Streamlit)
    tables = ["sales_master_history", "sales_master_log", "goods_bought_history", "goods_bought"]
    for t in tables:
        supabase.table(t).delete().eq("item_id", item_id).eq("user_id", user_id).execute()

    # Delete all inventory rows for this item_id (across dates)
    supabase.table("inventory_master_log").delete().eq("item_id", item_id).eq("user_id", user_id).execute()
    return {"msg": "Item and linked records deleted"}


