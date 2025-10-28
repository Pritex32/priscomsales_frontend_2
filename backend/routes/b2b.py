from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Literal
from datetime import date, datetime
from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase

router = APIRouter(prefix="/b2b", tags=["B2B Inventory"])

# =========================
# Request Models
# =========================

class WarehouseTransferRequest(BaseModel):
    """Warehouse to Warehouse Transfer"""
    transfer_type: Literal["warehouse_transfer"] = "warehouse_transfer"
    source_warehouse: str
    destination_warehouse: str
    item_id: int
    item_name: str
    item_name_to: Optional[str] = None  # Destination item name (if different)
    quantity: int = Field(..., gt=0)
    issued_by: str
    received_by: str
    notes: Optional[str] = None
    movement_date: date

    @validator('destination_warehouse')
    def validate_different_warehouses(cls, v, values):
        if 'source_warehouse' in values and v == values['source_warehouse']:
            raise ValueError('Source and destination warehouses must be different')
        return v


class CustomerSaleRequest(BaseModel):
    """Warehouse to Customer Sale"""
    transfer_type: Literal["customer_sale"] = "customer_sale"
    source_warehouse: str
    item_id: int
    item_name: str
    quantity: int = Field(..., gt=0)
    issued_by: str
    customer_name: Optional[str] = None  # Store in notes
    notes: Optional[str] = None
    movement_date: date


class StockoutRequest(BaseModel):
    """Stockout / Write-off"""
    transfer_type: Literal["stockout"] = "stockout"
    source_warehouse: str
    item_id: int
    item_name: str
    quantity: int = Field(..., gt=0)
    issued_by: str
    notes: str = Field(..., min_length=5)  # REQUIRED: reason for write-off
    movement_date: date


# =========================
# Helper Functions
# =========================

def _check_subscription_limit(user_id: int):
    """Enforce Free plan limit"""
    try:
        resp = (
            supabase.table("subscription")
            .select("*")
            .eq("user_id", user_id)
            .order("expires_at", desc=True)
            .limit(1)
            .execute()
        )
        sub = resp.data[0] if resp.data else None
        plan = (sub.get("plan") if sub else "free") or "free"
        is_active = (sub.get("is_active") if sub else False) or False
        if plan == "free" or not is_active:
            r1 = supabase.table("sales_master_log").select("sale_id", count="exact").eq("user_id", user_id).execute()
            c1 = getattr(r1, "count", 0) or 0
            r2 = supabase.table("sales_master_history").select("sale_id", count="exact").eq("user_id", user_id).execute()
            c2 = getattr(r2, "count", 0) or 0
            if c1 > 10 or c2 > 10:
                raise HTTPException(
                    status_code=403,
                    detail="Free plan limit reached (max 10 entries). Please upgrade to continue."
                )
    except HTTPException:
        raise
    except Exception:
        return


def _employee_has_access(current_user: dict, warehouse: str) -> bool:
    """Check if employee has access to warehouse"""
    if current_user["role"].lower() == "md":
        return True
    
    resp = (
        supabase.table("employees")
        .select("employee_id")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("name", current_user["username"])
        .limit(1)
        .execute()
    )
    emp = resp.data[0] if resp.data else None
    if not emp:
        return False
    
    resp2 = (
        supabase.table("warehouse_access")
        .select("warehouse_name")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("employee_id", emp["employee_id"])
        .eq("warehouse_name", warehouse)
        .limit(1)
        .execute()
    )
    return bool(resp2.data)


def _get_item_stock(user_id: int, warehouse: str, item_id: int, movement_date: date) -> dict:
    """Get item's current stock in warehouse at or before the given date"""
    # Get the latest inventory record at or before movement_date
    query = (
        supabase.table("inventory_master_log")
        .select("*")
        .eq("user_id", user_id)
        .eq("warehouse_name", warehouse)
        .eq("item_id", item_id)
        .lte("log_date", movement_date.isoformat())
        .order("log_date", desc=True)
        .limit(1)
        .execute()
    )
    
    item = query.data[0] if query.data else None
    
    if not item:
        # Fallback: get latest record overall
        response = (
            supabase.table("inventory_master_log")
            .select("*")
            .eq("user_id", user_id)
            .eq("warehouse_name", warehouse)
            .eq("item_id", item_id)
            .order("log_date", desc=True)
            .limit(1)
            .execute()
        )
        item = response.data[0] if response.data else None
    
    return item


def _validate_sufficient_stock(item: dict, required_quantity: int, warehouse: str):
    """Validate that warehouse has sufficient stock"""
    if not item:
        raise HTTPException(
            status_code=404, 
            detail=f"Item not found in warehouse '{warehouse}'"
        )
    
    # Check if item has no opening balance (not yet restocked at this date)
    open_balance = item.get("open_balance") or 0
    if open_balance == 0:
        raise HTTPException(
            status_code=400,
            detail=f"Item has not been restocked in warehouse '{warehouse}' at this date. Cannot perform transfer."
        )
    
    closing_balance = item.get("closing_balance") or 0
    if closing_balance < required_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock: {closing_balance} available in '{warehouse}', {required_quantity} required"
        )


def _update_inventory_stock_out(user_id: int, item: dict, quantity: int, movement_date: date):
    """Update source warehouse inventory (reduce stock) for the movement_date"""
    # Check if a record exists for the movement_date
    existing_record = (
        supabase.table("inventory_master_log")
        .select("*")
        .eq("user_id", user_id)
        .eq("warehouse_name", item.get("warehouse_name"))
        .eq("item_id", item.get("item_id"))  # Use item_id for unique constraint
        .eq("log_date", movement_date.isoformat())
        .limit(1)
        .execute()
    )
    
    if existing_record.data:
        # Update existing record for this date
        existing = existing_record.data[0]
        supabase.table("inventory_master_log").update({
            "stock_out": (existing.get("stock_out") or 0) + quantity,
            "last_updated": datetime.utcnow().isoformat()
        }).eq("id", existing["id"]).execute()
    else:
        # Create new record for movement_date
        # Get previous day's closing balance as opening balance
        prev_record = (
            supabase.table("inventory_master_log")
            .select("*")
            .eq("user_id", user_id)
            .eq("warehouse_name", item.get("warehouse_name"))
            .eq("item_id", item.get("item_id"))  # Use item_id for consistency
            .lt("log_date", movement_date.isoformat())
            .order("log_date", desc=True)
            .limit(1)
            .execute()
        )
        
        # Use previous closing balance; if no previous record, use current item's closing balance
        prev_closing = (prev_record.data[0].get("closing_balance") if prev_record.data else item.get("closing_balance")) or 0
        
        supabase.table("inventory_master_log").insert({
            "user_id": user_id,
            "item_id": item.get("item_id"),
            "item_name": item.get("item_name"),
            "warehouse_name": item.get("warehouse_name"),
            "open_balance": prev_closing,  # Previous closing becomes opening
            "supplied_quantity": 0,
            "stock_out": quantity,
            "return_quantity": 0,
            "price": item.get("price") or 0,
            "log_date": movement_date.isoformat(),
            "last_updated": datetime.utcnow().isoformat(),
            "barcode": item.get("barcode") or "",
            "sale_id": 0,
            "purchase_id": 0
        }).execute()


def _update_inventory_stock_in(user_id: int, warehouse: str, source_item_id: int, 
                                item_name: str, quantity: int, movement_date: date, 
                                from_item: dict, source_item_name: str):
    """Update destination warehouse inventory (add stock) for the movement_date
    Returns the destination item_id that was used.
    """
    
    # First, search globally for this item_name across ALL warehouses to get its item_id
    item_lookup = (
        supabase.table("inventory_master_log")
        .select("item_id")
        .eq("user_id", user_id)
        .eq("item_name", item_name)
        .order("log_date", desc=True)
        .limit(1)
        .execute()
    )
    
    # If item exists anywhere, use its existing item_id
    if item_lookup.data:
        dest_item_id = item_lookup.data[0].get("item_id")
    elif item_name != source_item_name:
        # Item transformation to a NEW item that doesn't exist: create new item_id
        max_id_result = (
            supabase.table("inventory_master_log")
            .select("item_id")
            .eq("user_id", user_id)
            .order("item_id", desc=True)
            .limit(1)
            .execute()
        )
        max_id = max_id_result.data[0].get("item_id") if max_id_result.data else source_item_id
        dest_item_id = max_id + 1  # Create new unique item_id
    else:
        # Same item name, use source item_id
        dest_item_id = source_item_id
    
    # Now get the latest record in THIS warehouse for opening balance
    to_last_before = (
        supabase.table("inventory_master_log")
        .select("*")
        .eq("user_id", user_id)
        .eq("warehouse_name", warehouse)
        .eq("item_name", item_name)
        .order("log_date", desc=True)
        .limit(1)
        .execute()
    )
    to_last_row = to_last_before.data[0] if to_last_before.data else None
    
    # Check if a record exists for the exact movement date with this dest_item_id
    to_exact = (
        supabase.table("inventory_master_log")
        .select("*")
        .eq("user_id", user_id)
        .eq("warehouse_name", warehouse)
        .eq("item_id", dest_item_id)
        .eq("log_date", movement_date.isoformat())
        .limit(1)
        .execute()
    )
    to_exact_row = to_exact.data[0] if to_exact.data else None

    if to_exact_row:
        # Update existing record for this date
        supabase.table("inventory_master_log").update({
            "supplied_quantity": (to_exact_row.get("supplied_quantity") or 0) + quantity,
            "last_updated": datetime.utcnow().isoformat()
        }).eq("id", to_exact_row["id"]).execute()
    else:
        # Get opening balance from previous record (before movement_date)
        prev_dest_record = (
            supabase.table("inventory_master_log")
            .select("*")
            .eq("user_id", user_id)
            .eq("warehouse_name", warehouse)
            .eq("item_id", dest_item_id)
            .lt("log_date", movement_date.isoformat())
            .order("log_date", desc=True)
            .limit(1)
            .execute()
        )
        prev_dest_row = prev_dest_record.data[0] if prev_dest_record.data else None
        
        # Use previous closing balance as opening balance (inventory continuation)
        open_balance_to = (prev_dest_row.get("closing_balance") if prev_dest_row else 0) or 0
        price_to = (to_last_row.get("price") if to_last_row else from_item.get("price")) or 0
        barcode_to = (to_last_row.get("barcode") if to_last_row else "")
        
        # Insert new record for movement_date with proper opening balance
        supabase.table("inventory_master_log").insert({
            "user_id": user_id,
            "item_id": dest_item_id,  # Use determined item_id (NEW if transformation)
            "item_name": item_name,   # Use destination item_name
            "warehouse_name": warehouse,
            "open_balance": open_balance_to,  # Previous closing balance
            "supplied_quantity": quantity,
            "stock_out": 0,
            "return_quantity": 0,
            "price": price_to,
            "log_date": movement_date.isoformat(),
            "last_updated": datetime.utcnow().isoformat(),
            "barcode": barcode_to,
            "sale_id": 0,
            "purchase_id": 0
        }).execute()
    
    # Return the destination item_id that was used
    return dest_item_id


def _log_stock_movement(user_id: int, transfer_type: str, source_warehouse: str,
                        destination_warehouse: Optional[str], source_item_id: int, item_name: str,
                        quantity: int, issued_by: str, received_by: Optional[str],
                        notes: Optional[str], item_name_to: Optional[str] = None,
                        dest_item_id: Optional[int] = None):
    """Log the movement to stock_movements table
    item_id = source item ID
    inventory_id = destination item ID (for warehouse transfers with transformation)
    """
    now_iso = datetime.utcnow().isoformat()
    
    # Use item_name_to if provided, otherwise use same as item_name
    dest_item_name = item_name_to if item_name_to else item_name
    
    # Use dest_item_id if provided (for transformations), otherwise same as source
    final_dest_item_id = dest_item_id if dest_item_id is not None else source_item_id
    
    supabase.table("stock_movements").insert({
        "user_id": user_id,
        "transfer_type": transfer_type,
        "from_store": source_warehouse,
        "to_store": destination_warehouse,
        "item_id": source_item_id,  # Source item ID
        "item_name_from": item_name,
        "item_name_to": dest_item_name,
        "quantity": quantity,
        "quantity_out": quantity,
        "quantity_in": quantity if destination_warehouse else 0,
        "issued_by": issued_by,
        "received_by": received_by,
        "details": notes,
        "inventory_id": final_dest_item_id,  # Destination item ID
        "movement_date": now_iso,
        "created_at": now_iso,
        "status": "completed"
    }).execute()


# =========================
# API Endpoints
# =========================

@router.get("/warehouses")
async def get_warehouses(current_user = Depends(get_protected_user)):
    """Get list of warehouses accessible by user"""
    role = current_user["role"].lower()
    if role == "md":
        response = (
            supabase.table("inventory_master_log")
            .select("warehouse_name")
            .eq("user_id", current_user.get("id", current_user.get("user_id")))
            .neq("warehouse_name", None)
            .execute()
        )
        warehouses = [row["warehouse_name"] for row in (response.data or []) if row.get("warehouse_name")]
        return sorted(set(warehouses))
    elif role == "employee":
        response = (
            supabase.table("employees")
            .select("employee_id")
            .eq("user_id", current_user.get("id", current_user.get("user_id")))
            .eq("name", current_user["username"])
            .limit(1)
            .execute()
        )
        employee = response.data[0] if response.data else None
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        response = (
            supabase.table("warehouse_access")
            .select("warehouse_name")
            .eq("user_id", current_user.get("id", current_user.get("user_id")))
            .eq("employee_id", employee["employee_id"])
            .execute()
        )
        warehouses = [row["warehouse_name"] for row in (response.data or []) if row.get("warehouse_name")]
        return sorted(set(warehouses))
    return []


@router.get("/inventory/{warehouse}")
async def get_inventory(warehouse: str, current_user = Depends(get_protected_user)):
    """Get inventory items in a specific warehouse with latest closing balance"""
    response = (
        supabase.table("inventory_master_log")
        .select("item_id,item_name,price,closing_balance,log_date")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("warehouse_name", warehouse)
        .order("log_date", desc=True)
        .execute()
    )
    items = response.data or []
    
    # Group by item_name and keep only the latest record for each unique item name
    seen_items = {}
    for item in items:
        if item.get("item_name") is not None:
            item_name = item["item_name"]
            if item_name not in seen_items:
                seen_items[item_name] = {
                    "item_id": item["item_id"],
                    "item_name": item_name,
                    "price": item.get("price") or 0,
                    "closing_balance": item.get("closing_balance") or 0,
                }
    
    return list(seen_items.values())


@router.post("/transfer/warehouse")
async def warehouse_transfer(request: WarehouseTransferRequest, current_user = Depends(get_protected_user)):
    """
    Transfer stock from one warehouse to another.
    - Reduces stock_out in source warehouse
    - Increases supplied_quantity in destination warehouse
    """
    _check_subscription_limit(current_user.get("id", current_user.get("user_id")))

    # Employee access check
    if current_user["role"].lower() == "employee":
        if not _employee_has_access(current_user, request.source_warehouse) or \
           not _employee_has_access(current_user, request.destination_warehouse):
            raise HTTPException(status_code=403, detail="You do not have access to one of the selected warehouses")

    # Get source item and validate stock
    from_item = _get_item_stock(current_user.get("id", current_user.get("user_id")), request.source_warehouse, request.item_id, request.movement_date)
    _validate_sufficient_stock(from_item, request.quantity, request.source_warehouse)

    # Determine destination item name (use item_name_to if provided, otherwise same as source)
    dest_item_name = request.item_name_to if request.item_name_to else request.item_name

    # Update source warehouse inventory (reduce stock out from source item)
    _update_inventory_stock_out(current_user.get("id", current_user.get("user_id")), from_item, request.quantity, request.movement_date)

    # Update destination warehouse inventory (add stock to destination item)
    # Returns the actual destination item_id used
    dest_item_id = _update_inventory_stock_in(
        current_user.get("id", current_user.get("user_id")), 
        request.destination_warehouse, 
        request.item_id,  # Source item_id
        dest_item_name,   # Destination item name
        request.quantity, 
        request.movement_date,
        from_item,
        request.item_name  # Source item name (to detect transformation)
    )

    # Log movement to stock_movements table with both source and dest item IDs
    _log_stock_movement(
        current_user.get("id", current_user.get("user_id")),
        "warehouse_transfer",
        request.source_warehouse,
        request.destination_warehouse,
        request.item_id,  # Source item ID
        request.item_name,
        request.quantity,
        request.issued_by,
        request.received_by,
        request.notes,
        dest_item_name,  # Destination item name
        dest_item_id     # Destination item ID
    )

    return {
        "message": f"Transferred {request.quantity} units of '{request.item_name}' → '{dest_item_name}' from {request.source_warehouse} to {request.destination_warehouse}",
        "transfer_type": "warehouse_transfer",
        "quantity": request.quantity
    }


@router.post("/transfer/customer")
async def customer_sale(request: CustomerSaleRequest, current_user = Depends(get_protected_user)):
    """
    Transfer stock from warehouse to customer (sale).
    - Reduces stock_out in source warehouse only
    - No destination warehouse update
    """
    _check_subscription_limit(current_user.get("id", current_user.get("user_id")))

    # Employee access check
    if current_user["role"].lower() == "employee":
        if not _employee_has_access(current_user, request.source_warehouse):
            raise HTTPException(status_code=403, detail="You do not have access to this warehouse")

    # Get source item and validate stock
    from_item = _get_item_stock(current_user.get("id", current_user.get("user_id")), request.source_warehouse, request.item_id, request.movement_date)
    _validate_sufficient_stock(from_item, request.quantity, request.source_warehouse)

    # Update source warehouse (reduce stock)
    _update_inventory_stock_out(current_user.get("id", current_user.get("user_id")), from_item, request.quantity, request.movement_date)

    # Combine customer name and notes
    notes_combined = f"Customer: {request.customer_name}. {request.notes or ''}" if request.customer_name else request.notes

    # Log movement
    _log_stock_movement(
        current_user.get("id", current_user.get("user_id")),
        "customer_sale",
        request.source_warehouse,
        None,  # No destination
        request.item_id,
        request.item_name,
        request.quantity,
        request.issued_by,
        None,  # No receiver
        notes_combined
    )

    return {
        "message": f"Sold {request.quantity} units of '{request.item_name}' from {request.source_warehouse} to customer",
        "transfer_type": "customer_sale",
        "quantity": request.quantity
    }


@router.post("/transfer/stockout")
async def stockout_writeoff(request: StockoutRequest, current_user = Depends(get_protected_user)):
    """
    Write off stock (damage, expiry, loss, etc.).
    - Reduces stock_out in source warehouse
    - Requires detailed notes explaining the reason
    """
    _check_subscription_limit(current_user.get("id", current_user.get("user_id")))

    # Employee access check
    if current_user["role"].lower() == "employee":
        if not _employee_has_access(current_user, request.source_warehouse):
            raise HTTPException(status_code=403, detail="You do not have access to this warehouse")

    # Get source item and validate stock
    from_item = _get_item_stock(current_user.get("id", current_user.get("user_id")), request.source_warehouse, request.item_id, request.movement_date)
    _validate_sufficient_stock(from_item, request.quantity, request.source_warehouse)

    # Update source warehouse (reduce stock)
    _update_inventory_stock_out(current_user.get("id", current_user.get("user_id")), from_item, request.quantity, request.movement_date)

    # Log movement with detailed notes
    _log_stock_movement(
        current_user.get("id", current_user.get("user_id")),
        "stockout",
        request.source_warehouse,
        None,  # No destination
        request.item_id,
        request.item_name,
        request.quantity,
        request.issued_by,
        None,  # No receiver
        f"WRITE-OFF: {request.notes}"
    )

    return {
        "message": f"Written off {request.quantity} units of '{request.item_name}' from {request.source_warehouse}",
        "transfer_type": "stockout",
        "quantity": request.quantity,
        "reason": request.notes
    }


@router.get("/movements")
async def get_stock_movements(
    transfer_type: Optional[str] = Query(None),
    warehouse: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user = Depends(get_protected_user)
):
    """Get stock movements with optional filters"""
    query = (
        supabase.table("stock_movements")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .order("movement_date", desc=True)
    )
    
    response = query.execute()
    movements = response.data or []
    
    # Apply filters
    if transfer_type:
        movements = [m for m in movements if m.get("transfer_type") == transfer_type]
    
    if warehouse:
        movements = [m for m in movements if m.get("from_store") == warehouse or m.get("to_store") == warehouse]
    
    if start_date:
        movements = [m for m in movements if m.get("movement_date") and m.get("movement_date") >= start_date.isoformat()]
    
    if end_date:
        movements = [m for m in movements if m.get("movement_date") and m.get("movement_date") <= end_date.isoformat()]
    
    return movements


@router.get("/movements/export")
async def export_movements_csv(
    transfer_type: Optional[str] = Query(None),
    current_user = Depends(get_protected_user)
):
    """Export stock movements as CSV"""
    response = (
        supabase.table("stock_movements")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .order("movement_date", desc=True)
        .execute()
    )
    movements = response.data or []
    
    if transfer_type:
        movements = [m for m in movements if m.get("transfer_type") == transfer_type]

    import io, csv
    if not movements:
        csv_str = ""
    else:
        fieldnames = sorted({k for row in movements for k in row.keys()})
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in movements:
            writer.writerow(row)
        csv_str = buf.getvalue()
    
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=stock_movements.csv"}
    )


