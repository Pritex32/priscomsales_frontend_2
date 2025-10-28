from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body, Query, Request
from datetime import datetime, date, timedelta
from typing import List, Optional, Literal, Dict, Any, Tuple
from io import BytesIO
import base64
import os
import uuid
import json

from pydantic import BaseModel

from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase
from backend.core.permission_check import require_permission

router = APIRouter(prefix="/restock", tags=["restock"])


# =========================
# Models
# =========================
class PriceUpdate(BaseModel):
    item_id: int
    new_price: float
    new_barcode: Optional[str] = None


class BulkPriceUpdateRequest(BaseModel):
    warehouse_name: Optional[str] = None  # optional scoping
    updates: List[PriceUpdate]


class RestockItem(BaseModel):
    # Existing item to restock (must resolve from inventory)
    item_id: Optional[int] = None
    item_name: Optional[str] = None
    warehouse_name: Optional[str] = None
    quantity: int
    unit_price: float
    total_cost: Optional[float] = None  # derived


class BatchRestockRequest(BaseModel):
    supplier_name: str
    supplier_phone: Optional[str] = None
    purchase_date: date
    warehouse_name: str
    payment_status: Literal["paid", "credit", "partial"] = "paid"
    payment_method: Literal["cash", "card", "transfer", "cheque"] = "cash"
    due_date: Optional[date] = None
    notes: Optional[str] = None
    items: List[RestockItem]
    total_price_paid: Optional[float] = None  # if partial, must be > 0
    invoice_file_url: Optional[str] = None  # optional pre-uploaded invoice URL
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None


class NewItemRequest(BaseModel):
    # New inventory item + initial restock
    item_name: str
    barcode: Optional[str] = None
    supplied_quantity: int
    reorder_level: int
    unit_price: float
    supplier_name: Optional[str] = None
    purchase_date: date
    description: Optional[str] = None
    payment_status: Literal["paid", "credit", "partial"] = "paid"
    payment_method: Literal["cash", "card", "transfer", "cheque"] = "cash"
    due_date: Optional[date] = None
    notes: Optional[str] = None
    warehouse_name: Optional[str] = None
    new_warehouse_name: Optional[str] = None  # if creating a new warehouse
    access_choice: Optional[Literal["No", "Yes"]] = "No"  # give all employees access
    total_price_paid: Optional[float] = None  # if partial
    invoice_file_url: Optional[str] = None
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None


class UploadInvoiceBase64(BaseModel):
    data_base64: str
    filename: Optional[str] = None  # e.g., "invoice.jpg"
    content_type: Optional[str] = None  # e.g., "image/jpeg"


# =========================
# Helpers
# =========================
def _upload_to_storage(user_id: int, uploaded_file: UploadFile, bucket: str, folder: str, desired_name_no_ext: Optional[str] = None) -> str:
    ext = os.path.splitext(uploaded_file.filename)[1] or ".bin"
    base_name = desired_name_no_ext.strip().replace(" ", "_") if desired_name_no_ext else os.path.splitext(uploaded_file.filename)[0]
    unique = uuid.uuid4().hex[:8]
    filename = f"{base_name}_{unique}{ext}"
    path = f"{folder}/{user_id}/{filename}"

    content = uploaded_file.file.read()
    with BytesIO(content) as buf:
        supabase.storage.from_(bucket).upload(path, buf, {"content-type": uploaded_file.content_type or "application/octet-stream"})
    return supabase.storage.from_(bucket).get_public_url(path)


def _upload_bytes_to_storage(user_id: int, data: bytes, content_type: str, desired_name_no_ext: Optional[str] = None, ext: Optional[str] = None, bucket: str = "salesinvoices", folder: str = "salesinvoices") -> str:
    base_name = (desired_name_no_ext or f"invoice_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}").strip().replace(" ", "_")
    unique = uuid.uuid4().hex[:8]
    ext2 = ext if ext and ext.startswith(".") else (f".{ext}" if ext else ".bin")
    filename = f"{base_name}_{unique}{ext2}"
    path = f"{folder}/{user_id}/{filename}"
    with BytesIO(data) as buf:
        supabase.storage.from_(bucket).upload(path, buf, {"content-type": content_type or "application/octet-stream"})
    return supabase.storage.from_(bucket).get_public_url(path)


def _inventory_items_for_warehouse(user_id: int, warehouse_name: str) -> List[Dict[str, Any]]:
    resp = supabase.table("inventory_master_log") \
        .select("item_id, item_name, price, barcode, warehouse_name") \
        .eq("user_id", user_id) \
        .eq("warehouse_name", warehouse_name) \
        .execute()
    return resp.data or []


def _ensure_unique_item(user_id: int, item_name: str, warehouse_name: Optional[str] = None) -> Dict[str, Any]:
    q = supabase.table("inventory_master_log") \
        .select("item_id, item_name, price, warehouse_name, supplied_quantity") \
        .eq("user_id", user_id) \
        .eq("item_name", item_name)
    if warehouse_name:
        q = q.eq("warehouse_name", warehouse_name)
    res = q.execute()
    data = res.data or []
    if not data:
        raise HTTPException(status_code=400, detail=f"Item '{item_name}' not found in inventory")
    if len(data) > 1:
        raise HTTPException(status_code=400, detail=f"Item '{item_name}' not unique. Specify warehouse_name or reference by item_id")
    return data[0]


def _resolve_item(user_id: int, it: RestockItem) -> Dict[str, Any]:
    inv = None
    if it.item_id is not None:
        q = supabase.table("inventory_master_log").select("item_id, item_name, price, warehouse_name, supplied_quantity") \
            .eq("user_id", user_id).eq("item_id", it.item_id)
        if it.warehouse_name:
            q = q.eq("warehouse_name", it.warehouse_name)
        res = q.execute()
        data = res.data or []
        if not data:
            raise HTTPException(status_code=400, detail=f"item_id '{it.item_id}' not found in inventory")
        inv = data[0]
    elif it.item_name:
        inv = _ensure_unique_item(user_id, it.item_name, it.warehouse_name)
    else:
        raise HTTPException(status_code=400, detail="Each item must specify item_id or item_name")
    return inv


def _adjust_inventory_supply(user_id: int, item_id: int, delta: int):
    """Increment or decrement supplied_quantity on the inventory item (never below 0)."""
    resp = supabase.table("inventory_master_log").select("supplied_quantity").eq("user_id", user_id).eq("item_id", item_id).limit(1).execute()
    data = (resp.data or [])
    current = 0
    if data:
        current = int(data[0].get("supplied_quantity") or 0)
    new_qty = max(current + int(delta), 0)
    supabase.table("inventory_master_log").update({"supplied_quantity": new_qty}).eq("user_id", user_id).eq("item_id", item_id).execute()


def _create_payment_for_purchase(user_id: int, purchase_id: int, amount: float, method: str, note: str, pay_date: Optional[date] = None):
    row = {
        "user_id": user_id,
        "purchase_id": purchase_id,
        "amount": float(amount or 0.0),
        "payment_method": method,
        "notes": note or "",
        "payment_date": (pay_date or datetime.utcnow().date()).isoformat()
    }
    supabase.table("payments").insert(row).execute()


# =========================
# Warehouses and inventory
# =========================
@router.get("/warehouses", dependencies=[Depends(require_permission("restock.page.access"))])
async def get_warehouses(current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("inventory_master_log").select("warehouse_name").eq("user_id", user_id).neq("warehouse_name", None).execute()
    names = [w.get("warehouse_name") for w in (resp.data or []) if w.get("warehouse_name")]
    # unique and sorted
    return sorted(list({n.strip() for n in names if isinstance(n, str) and n.strip()}))


@router.get("/warehouses/{warehouse_name}/access", dependencies=[Depends(require_permission("restock.page.access"))])
async def get_warehouse_access(warehouse_name: str, current_user=Depends(get_protected_user)):
    """Get access information for a specific warehouse"""
    user_id = current_user.get("id") or current_user.get("user_id")
    
    # Get warehouse access records
    access_resp = supabase.table("warehouse_access") \
        .select("employee_id, access_choice") \
        .eq("user_id", user_id) \
        .eq("warehouse_name", warehouse_name) \
        .execute()
    
    # Get warehouse info from warehouses table if it exists
    warehouse_resp = None
    try:
        warehouse_resp = supabase.table("warehouses") \
            .select("warehouse_name, access_choice") \
            .eq("user_id", user_id) \
            .eq("warehouse_name", warehouse_name) \
            .execute()
    except Exception:
        pass  # Warehouses table might not exist
    
    warehouse_info = None
    if warehouse_resp and warehouse_resp.data:
        warehouse_info = warehouse_resp.data[0]
    
    return {
        "warehouse_name": warehouse_name,
        "warehouse_info": warehouse_info,
        "access_records": access_resp.data or [],
        "has_employee_access": len(access_resp.data or []) > 0
    }


class WarehouseCreateRequest(BaseModel):
    new_warehouse_name: str
    access_choice: Literal["No", "Yes"] = "No"


@router.post("/warehouses/new", dependencies=[Depends(require_permission("restock.page.access"))])
async def create_warehouse(body: WarehouseCreateRequest, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    name = (body.new_warehouse_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="new_warehouse_name is required")
    
    # Insert new warehouse into inventory_master_log table (exactly as in Streamlit)
    warehouse_insert_resp = supabase.table("inventory_master_log").insert({
        "warehouse_name": name, 
        "user_id": user_id,
        "access_choice": body.access_choice or "No"
    }).execute()
    
    if not warehouse_insert_resp.data:
        raise HTTPException(status_code=500, detail="Failed to add new warehouse")
    
    warehouse_created = True
    
    # Also try to create in dedicated warehouses table if it exists (optional)
    try:
        supabase.table("warehouses").insert({
            "warehouse_name": name, 
            "user_id": user_id,
            "access_choice": body.access_choice or "No"
        }).execute()
    except Exception:
        # Warehouses table may not exist, that's fine
        pass

    # If Yes → give all employees access (exactly as in Streamlit)
    if body.access_choice == "Yes":
        all_employees = supabase.table("employees").select("employee_id").eq("user_id", user_id).execute()
        for emp in (all_employees.data or []):
            supabase.table("warehouse_access").insert({
                "warehouse_name": name,
                "employee_id": emp["employee_id"],
                "access_choice": body.access_choice,
                "user_id": user_id
            }).execute()

    success_msg = f"✅ Warehouse '{name}' added."
    
    return {
        "success": True,
        "msg": success_msg, 
        "warehouse_name": name,
        "warehouse_created": warehouse_created
    }


@router.get("/inventory-items", dependencies=[Depends(require_permission("restock.page.access"))])
async def get_inventory_items(warehouse_name: str = Query(...), current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    if not warehouse_name:
        return {}
    items = _inventory_items_for_warehouse(user_id, warehouse_name)
    return {
        it["item_name"]: {
            "item_id": it["item_id"],
            "price": (it.get("price", 0) or 0),
            "barcode": it.get("barcode")
        }
        for it in items if it.get("item_name") is not None
    }


# =========================
# Bulk price updates for items in a warehouse
# =========================
@router.post("/price-bulk-update", dependencies=[Depends(require_permission("restock.page.access"))])
async def price_bulk_update(body: BulkPriceUpdateRequest, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    if not body.updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    errors: List[str] = []
    updated = 0
    for u in body.updates:
        update_data: Dict[str, Any] = {"price": u.new_price}
        if u.new_barcode is not None and str(u.new_barcode).strip() != "":
            update_data["barcode"] = str(u.new_barcode).strip()
        q = supabase.table("inventory_master_log").update(update_data).eq("user_id", user_id).eq("item_id", u.item_id)
        if body.warehouse_name:
            q = q.eq("warehouse_name", body.warehouse_name)
        resp = q.execute()
        if not resp.data:
            errors.append(f"item_id {u.item_id}: update failed")
        else:
            updated += 1
    if errors and updated == 0:
        return {"success": False, "msg": "No updates applied", "updated": updated, "errors": errors}
    if errors:
        return {"success": True, "msg": "Some updates applied with errors", "updated": updated, "errors": errors}
    return {"success": True, "msg": "Updates applied successfully", "updated": updated}


# =========================
# Invoice upload (file and camera)
# =========================
@router.post("/upload-invoice")
async def upload_invoice(desired_name: Optional[str] = Form(None), invoice_file: UploadFile = File(...), current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    # 10 MB limit
    invoice_file.file.seek(0, os.SEEK_END)
    size = invoice_file.file.tell()
    invoice_file.file.seek(0)
    if size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    url = _upload_to_storage(user_id, invoice_file, bucket="salesinvoices", folder="salesinvoices", desired_name_no_ext=desired_name)
    return {"invoice_file_url": url}


@router.post("/upload-invoice-base64")
async def upload_invoice_base64(body: UploadInvoiceBase64, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    try:
        raw = body.data_base64
        # Strip possible data URL prefix
        if "," in raw and raw.strip().startswith("data:"):
            raw = raw.split(",", 1)[1]
        data = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")

    # Determine ext and content-type
    content_type = body.content_type or "application/octet-stream"
    ext = None
    if body.filename and "." in body.filename:
        ext = "." + body.filename.split(".")[-1]
    elif content_type.startswith("image/"):
        ext = "." + content_type.split("/", 1)[1]

    name_no_ext = (body.filename.split(".")[0] if body.filename else "invoice_camera")
    url = _upload_bytes_to_storage(user_id, data, content_type, desired_name_no_ext=name_no_ext, ext=ext or ".bin")
    return {"invoice_file_url": url}


# =========================
# New Item + Initial Restock (Add inventory item)
# =========================
@router.post("/new-item", dependencies=[Depends(require_permission("restock.page.access"))])
async def create_new_item(payload: NewItemRequest, current_user=Depends(get_protected_user), request: Request = None):
    # Log raw request body
    try:
        raw_body = await request.body() if request else b""
        raw_text = raw_body.decode("utf-8", "ignore") if raw_body else ""
        print(f"RESTOCK NEW-ITEM DEBUG: RAW BODY={raw_text[:500]}...")  # first 500 chars
    except Exception as e:
        print(f"RESTOCK DEBUG: Could not read raw body: {e}")
    
    print(f"RESTOCK NEW-ITEM DEBUG: Parsed payload={payload.model_dump() if hasattr(payload, 'model_dump') else payload.dict()}")
    print(f"RESTOCK NEW-ITEM DEBUG: Content-Type={request.headers.get('content-type') if request else 'unknown'}")
    user_id = current_user.get("id") or current_user.get("user_id")

    # Resolve warehouse target
    final_warehouse = None
    warehouse_created = False
    if payload.new_warehouse_name:
        # Create new warehouse entry - Store access_choice in both tables to match Streamlit behavior
        warehouse_name = payload.new_warehouse_name.strip()
        
        # Insert new warehouse into inventory_master_log table (exactly as in Streamlit)
        warehouse_insert_resp = supabase.table("inventory_master_log").insert({
            "warehouse_name": warehouse_name, 
            "user_id": user_id,
            "access_choice": payload.access_choice or "No"
        }).execute()
        if not warehouse_insert_resp.data:
            raise HTTPException(status_code=500, detail="Failed to add new warehouse")
        warehouse_created = True
        
        # Also try to create in warehouses table if it exists
        try:
            warehouse_resp = supabase.table("warehouses").insert({
                "warehouse_name": warehouse_name, 
                "user_id": user_id,
                "access_choice": payload.access_choice or "No"
            }).execute()
        except Exception:
            # Warehouses table may not exist, continue with inventory_master_log approach
            pass
        
        final_warehouse = warehouse_name
        
        # If Yes → give all employees access (exactly as in Streamlit)
        if payload.access_choice == "Yes":
            all_employees = supabase.table("employees").select("employee_id").eq("user_id", user_id).execute()
            for emp in (all_employees.data or []):
                supabase.table("warehouse_access").insert({
                    "warehouse_name": final_warehouse,
                    "employee_id": emp["employee_id"],
                    "access_choice": payload.access_choice,
                    "user_id": user_id
                }).execute()
    else:
        if not payload.warehouse_name:
            raise HTTPException(status_code=400, detail="warehouse_name or new_warehouse_name is required")
        final_warehouse = payload.warehouse_name

    # Validate input
    print(f"RESTOCK DEBUG: Validating item_name={payload.item_name!r}")
    if not payload.item_name or not payload.item_name.strip():
        print("RESTOCK ERROR: Item name is required")
        raise HTTPException(status_code=400, detail="Item name is required")
    
    print(f"RESTOCK DEBUG: Validating supplied_quantity={payload.supplied_quantity}")
    if payload.supplied_quantity < 0:
        print("RESTOCK ERROR: Supplied quantity cannot be negative")
        raise HTTPException(status_code=400, detail="Supplied quantity cannot be negative")
    
    print(f"RESTOCK DEBUG: Validating unit_price={payload.unit_price}")
    if payload.unit_price < 0:
        print("RESTOCK ERROR: Unit price cannot be negative")
        raise HTTPException(status_code=400, detail="Unit price cannot be negative")
    
    print(f"RESTOCK DEBUG: Validating reorder_level={payload.reorder_level}")
    if payload.reorder_level < 0:
        print("RESTOCK ERROR: Reorder level cannot be negative")
        raise HTTPException(status_code=400, detail="Reorder level cannot be negative")
    
    # Check if item already exists for the user
    print(f"RESTOCK DEBUG: Checking for existing item {payload.item_name.strip()!r} for user_id={user_id}")
    check_item = supabase.table("inventory_master_log") \
        .select("item_id, item_name, warehouse_name") \
        .eq("user_id", user_id) \
        .eq("item_name", payload.item_name.strip()) \
        .execute()
    print(f"RESTOCK DEBUG: check_item result count={len(check_item.data or [])}")
    
    if check_item.data:
        existing_warehouses = [item["warehouse_name"] for item in check_item.data if item["warehouse_name"]]
        print(f"RESTOCK ERROR: Item already exists in warehouses={existing_warehouses}")
        if existing_warehouses:
            raise HTTPException(
                status_code=409,  # 409 Conflict is more appropriate for duplicate resources
                detail=f"Item already exists: '{payload.item_name}' is already in warehouse(s): {', '.join(set(existing_warehouses))}. Please use the restock function to add more quantity."
            )
        else:
            raise HTTPException(
                status_code=409, 
                detail=f"Item already exists: '{payload.item_name}' is already in your inventory. Please use the restock function to add more quantity."
            )

    # Insert into inventory_master_log (regular item, not warehouse creation)
    new_item_row = {
        "item_name": payload.item_name.strip(),
        "barcode": (payload.barcode.strip() if payload.barcode else None),
        "supplied_quantity": int(payload.supplied_quantity or 0),
        "open_balance": 0,
        "price": float(payload.unit_price or 0),
        "warehouse_name": final_warehouse,
        "log_date": payload.purchase_date.isoformat(),
        "user_id": user_id,
        "reorder_level": int(payload.reorder_level or 0),
        # Note: access_choice is NOT included here since this is an item, not warehouse creation
    }
    print(f"RESTOCK DEBUG: Inserting into inventory_master_log: {new_item_row}")
    try:
        item_response = supabase.table("inventory_master_log").insert(new_item_row).execute()
    except Exception as e:
        print(f"RESTOCK ERROR: Insert failed: {e}")
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to add item to inventory: {str(e)}")
    if not item_response.data:
        print("RESTOCK ERROR: item_response.data is empty")
        raise HTTPException(status_code=500, detail="Failed to add item to inventory")
    print(f"RESTOCK DEBUG: Insert success, item_id={item_response.data[0].get('item_id')}")

    new_item_id = item_response.data[0]["item_id"]

    # Compute costs
    total_cost = float(payload.supplied_quantity or 0) * float(payload.unit_price or 0)
    if payload.payment_status == "paid":
        total_price_paid = total_cost
    elif payload.payment_status == "partial":
        if payload.total_price_paid is None or payload.total_price_paid <= 0 or payload.total_price_paid > total_cost:
            raise HTTPException(status_code=400, detail="Invalid total_price_paid for partial payment")
        total_price_paid = payload.total_price_paid
    else:
        total_price_paid = 0.0

    amount_balance = max(total_cost - total_price_paid, 0.0)

    # Skip employee_id validation - every user is considered an employee
    print(f"RESTOCK DEBUG: Skipping employee_id validation (user_id={user_id} will be used)")
    # Record initial restock in goods_bought_history (as in Streamlit)
    # Note: total_price is a generated column and should not be set manually
    restock_entry = {
        "purchase_date": payload.purchase_date.isoformat(),
        "supplier_name": payload.supplier_name,
        "supplier_phone": None,  # Not in NewItemRequest, can add later if needed
        "item_name": payload.item_name,
        "item_id": new_item_id,
        "supplied_quantity": int(payload.supplied_quantity or 0),
        "unit_price": float(payload.unit_price or 0),
        "total_cost": float(total_cost),
        # "total_price" removed - generated column computed by database
        "payment_status": payload.payment_status,
        "payment_method": payload.payment_method,
        "due_date": payload.due_date.isoformat() if payload.due_date else None,
        "total_price_paid": float(total_price_paid),
        "amount_paid": float(total_price_paid),  # alias for total_price_paid
        "amount_balance": float(amount_balance),
        "notes": payload.notes,
        "invoice_file_url": payload.invoice_file_url,
        "employee_id": None,  # Set to NULL to bypass FK constraint
        "employee_name": payload.employee_name or current_user.get("username") or current_user.get("name"),
        "user_id": user_id,
        "created_by_user_id": user_id,
        "warehouse_name": final_warehouse,
    }
    print(f"RESTOCK DEBUG: Attempting insert into goods_bought_history with entry={restock_entry}")
    try:
        restock_response = supabase.table("goods_bought_history").insert(restock_entry).execute()
        print(f"RESTOCK DEBUG: Insert response data={restock_response.data}")
    except Exception as e:
        print(f"RESTOCK ERROR: goods_bought_history insert failed: {e}")
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to record restock: {str(e)}")
    
    if not restock_response.data:
        print("RESTOCK ERROR: restock_response.data is empty after insert")
        # Rollback inventory add? For simplicity, return error.
        raise HTTPException(status_code=500, detail="Item added, but failed to record initial restock")

    purchase_id = restock_response.data[0]["purchase_id"]
    print(f"RESTOCK DEBUG: Restock recorded with purchase_id={purchase_id}")

    # Create payment record if applicable
    if payload.payment_status in ("paid", "partial") and total_price_paid > 0:
        print(f"RESTOCK DEBUG: Creating payment record for purchase_id={purchase_id}, amount={total_price_paid}")
        try:
            _create_payment_for_purchase(user_id, purchase_id, total_price_paid, payload.payment_method, "Initial stock payment", payload.purchase_date)
            print("RESTOCK DEBUG: Payment record created successfully")
        except Exception as e:
            print(f"RESTOCK ERROR: Payment record creation failed: {e}")
            import traceback
            print(traceback.format_exc())

    # Prepare success messages (matching Streamlit patterns)
    success_messages = []
    
    if warehouse_created:
        success_messages.append(f"✅ Warehouse '{final_warehouse}' added.")
    
    success_messages.append("✅ New item added and restocked successfully.")
    
    success_msg = " ".join(success_messages)
    
    result = {
        "success": True, 
        "msg": success_msg, 
        "item_id": new_item_id, 
        "purchase_id": purchase_id, 
        "warehouse_name": final_warehouse,
        "warehouse_created": warehouse_created,
        "total_cost": total_cost, 
        "total_price_paid": total_price_paid, 
        "amount_balance": amount_balance
    }
    print(f"RESTOCK DEBUG: Returning success response: {result}")
    return result


# =========================
# Batch Restock Existing Items (multi-item)
# =========================
@router.post("/batch", dependencies=[Depends(require_permission("restock.page.access"))])
async def batch_restock(payload: BatchRestockRequest, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")

    if not payload.items:
        raise HTTPException(status_code=400, detail="No items provided")

    # Ensure per-item warehouse_name defaults to batch warehouse
    for it in payload.items:
        if (not it.warehouse_name) and payload.warehouse_name:
            it.warehouse_name = payload.warehouse_name

    # Resolve and validate items, compute totals
    grand_total = 0.0
    resolved_items: List[Tuple[Dict[str, Any], RestockItem, float]] = []
    for it in payload.items:
        inv = _resolve_item(user_id, it)
        unit_price = float(it.unit_price or 0.0)
        qty = int(it.quantity or 0)
        total_cost = unit_price * qty
        grand_total += total_cost
        resolved_items.append((inv, it, total_cost))

    if payload.payment_status == "paid":
        total_price_paid = grand_total
    elif payload.payment_status == "partial":
        if payload.total_price_paid is None or payload.total_price_paid <= 0 or payload.total_price_paid > grand_total:
            raise HTTPException(status_code=400, detail="Invalid total_price_paid for partial payment")
        total_price_paid = float(payload.total_price_paid)
    else:
        total_price_paid = 0.0
    outstanding = max(grand_total - total_price_paid, 0.0)

    # Insert one goods_bought row per item and adjust inventory
    purchase_ids: List[int] = []
    for inv, it, cost in resolved_items:
        row = {
            "purchase_date": payload.purchase_date.isoformat(),
            "supplier_name": payload.supplier_name,
            "supplier_phone": payload.supplier_phone,
            "user_id": user_id,
            "item_name": inv.get("item_name"),
            "item_id": inv.get("item_id"),
            "supplied_quantity": int(it.quantity or 0),
            "unit_price": float(it.unit_price or 0),
            "total_cost": float(cost),
            "payment_status": payload.payment_status,
            "payment_method": payload.payment_method,
            "due_date": payload.due_date.isoformat() if payload.due_date else None,
            "total_price_paid": float(total_price_paid),  # total value; for per-item apportioning keep same pattern used in Streamlit
            "amount_balance": float(outstanding),
            "notes": payload.notes,
            "invoice_file_url": payload.invoice_file_url,
            "employee_id": payload.employee_id,
            "employee_name": payload.employee_name,
            "warehouse_name": payload.warehouse_name,
        }
        ins = supabase.table("goods_bought").insert(row).execute()
        if not ins.data:
            raise HTTPException(status_code=500, detail=f"Failed to insert restock for item {inv.get('item_name')}")
        pid = ins.data[0]["purchase_id"]
        purchase_ids.append(pid)

        # Adjust inventory supply
        _adjust_inventory_supply(user_id, int(inv.get("item_id")), int(it.quantity or 0))

    # Create a single payment record referencing the first purchase_id (aligned with sales pattern)
    if payload.payment_status in ("paid", "partial") and total_price_paid > 0 and purchase_ids:
        _create_payment_for_purchase(user_id, purchase_ids[0], total_price_paid, payload.payment_method, "Restock payment", payload.purchase_date)

    success_msg = f"Restock completed successfully for {len(purchase_ids)} item(s)"
    if payload.payment_status == "paid":
        success_msg += f" - Fully paid (₦{total_price_paid:,.2f})"
    elif payload.payment_status == "partial":
        success_msg += f" - Partial payment (₦{total_price_paid:,.2f} paid, ₦{outstanding:,.2f} outstanding)"
    elif payload.payment_status == "credit":
        success_msg += f" - On credit (₦{grand_total:,.2f} due)"
    
    return {
        "success": True,
        "msg": success_msg,
        "purchase_ids": purchase_ids,
        "items_count": len(purchase_ids),
        "grand_total": grand_total,
        "total_price_paid": total_price_paid,
        "amount_balance": outstanding
    }


# =========================
# Fetch Restock (Log and History)
# =========================
@router.get("/")
async def get_restock(skip: int = 0, limit: int = 100, warehouse_name: Optional[str] = None, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("goods_bought").select("*").eq("user_id", user_id).order("purchase_date", desc=True).range(skip, skip + limit - 1).execute()
    data = resp.data or []
    if warehouse_name:
        data = [r for r in data if r.get("warehouse_name") == warehouse_name]
    return data


@router.get("/history")
async def get_restock_history(skip: int = 0, limit: int = 100, warehouse_name: Optional[str] = None, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("goods_bought_history").select("*").eq("user_id", user_id).order("purchase_date", desc=True).range(skip, skip + limit - 1).execute()
    data = resp.data or []
    if warehouse_name:
        data = [r for r in data if r.get("warehouse_name") == warehouse_name]
    return data


# =========================
# Update a restock record (goods_bought)
# =========================
@router.put("/{purchase_id}")
async def update_restock(
    purchase_id: int,
    supplier_name: Optional[str] = Form(None),
    supplier_phone: Optional[str] = Form(None),
    item_name: Optional[str] = Form(None),
    supplied_quantity: Optional[int] = Form(None),
    unit_price: Optional[float] = Form(None),
    payment_status: Optional[str] = Form(None),
    payment_method: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    invoice_file: UploadFile = File(None),
    current_user=Depends(get_protected_user)
):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("goods_bought").select("*").eq("purchase_id", purchase_id).eq("user_id", user_id).execute()
    row = resp.data[0] if resp.data else None
    if not row:
        raise HTTPException(status_code=404, detail="Restock not found")

    update_data: Dict[str, Any] = {}
    # track inventory delta if quantity changes
    previous_qty = int(row.get("supplied_quantity") or 0)
    delta_qty: Optional[int] = None

    if supplier_name is not None:
        update_data["supplier_name"] = supplier_name
    if supplier_phone is not None:
        update_data["supplier_phone"] = supplier_phone
    if item_name is not None:
        update_data["item_name"] = item_name
    if supplied_quantity is not None:
        update_data["supplied_quantity"] = int(supplied_quantity)
        delta_qty = int(supplied_quantity) - previous_qty
    if unit_price is not None:
        update_data["unit_price"] = float(unit_price)
    # recalc total_cost if qty or unit_price changed
    if ("supplied_quantity" in update_data) or ("unit_price" in update_data):
        q = int(update_data.get("supplied_quantity", previous_qty))
        p = float(update_data.get("unit_price", row.get("unit_price") or 0.0))
        update_data["total_cost"] = float(q * p)

    if payment_status is not None:
        update_data["payment_status"] = payment_status
    if payment_method is not None:
        update_data["payment_method"] = payment_method
    if notes is not None:
        update_data["notes"] = notes

    if invoice_file:
        filename = f"restock_invoice_update_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        url = _upload_to_storage(user_id, invoice_file, bucket="salesinvoices", folder="salesinvoices", desired_name_no_ext=filename)
        update_data["invoice_file_url"] = url

    supabase.table("goods_bought").update(update_data).eq("purchase_id", purchase_id).eq("user_id", user_id).execute()

    # adjust inventory supply if needed
    if delta_qty is not None and int(row.get("item_id") or 0) > 0:
        _adjust_inventory_supply(user_id, int(row["item_id"]), delta=delta_qty)

    return {"msg": "Restock updated", "purchase_id": purchase_id}


# =========================
# Delete restock by purchase_id (log)
# =========================
@router.delete("/{purchase_id}")
async def delete_restock(purchase_id: int, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("goods_bought").select("*").eq("purchase_id", purchase_id).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Restock not found")

    row = resp.data[0]
    # Delete payments referencing this purchase
    supabase.table("payments").delete().eq("purchase_id", purchase_id).eq("user_id", user_id).execute()

    # Adjust inventory (revert supplied_quantity)
    if row.get("item_id"):
        _adjust_inventory_supply(user_id, int(row["item_id"]), delta=-int(row.get("supplied_quantity") or 0))

    supabase.table("goods_bought").delete().eq("purchase_id", purchase_id).eq("user_id", user_id).execute()
    return {"msg": "Restock deleted"}


# =========================
# Delete restock by id and date (history/log) with inventory update
# =========================
@router.delete("/delete-by-id-date")
async def delete_restock_by_id_date(purchase_id: int = Query(...), purchase_date: date = Query(...), current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")

    # Fetch from history and log
    hist = supabase.table("goods_bought_history").select("*").eq("purchase_id", purchase_id).eq("purchase_date", purchase_date.isoformat()).eq("user_id", user_id).execute().data
    log = supabase.table("goods_bought").select("*").eq("purchase_id", purchase_id).eq("purchase_date", purchase_date.isoformat()).eq("user_id", user_id).execute().data
    target = None
    if hist:
        target = hist[0]
    elif log:
        target = log[0]
    else:
        raise HTTPException(status_code=404, detail="No restock record found with given id and date")

    # Delete from appropriate tables
    if hist:
        supabase.table("goods_bought_history").delete().eq("purchase_id", purchase_id).eq("purchase_date", purchase_date.isoformat()).eq("user_id", user_id).execute()
    if log:
        supabase.table("goods_bought").delete().eq("purchase_id", purchase_id).eq("purchase_date", purchase_date.isoformat()).eq("user_id", user_id).execute()

    # Delete payments referencing this purchase
    supabase.table("payments").delete().eq("purchase_id", purchase_id).eq("user_id", user_id).execute()

    # Update inventory: subtract the supplied quantity
    item_id = target.get("item_id")
    supply_added = int(target.get("supplied_quantity") or 0)
    if item_id and supply_added:
        _adjust_inventory_supply(user_id, int(item_id), delta=-supply_added)

    return {"success": True, "msg": "Restock and related entries deleted, inventory updated", "purchase_id": purchase_id}


# =========================
# Barcode lookup
# =========================
@router.get("/barcode/lookup")
async def lookup_item_by_barcode(
    barcode: str = Query(...), 
    warehouse_name: Optional[str] = Query(None), 
    current_user=Depends(get_protected_user)
):
    """Look up an item by barcode, optionally scoped to a warehouse"""
    user_id = current_user.get("id") or current_user.get("user_id")
    
    if not barcode or not barcode.strip():
        raise HTTPException(status_code=400, detail="Barcode is required")
    
    q = supabase.table("inventory_master_log") \
        .select("item_id, item_name, price, barcode, warehouse_name, supplied_quantity") \
        .eq("user_id", user_id) \
        .eq("barcode", barcode.strip())
    
    if warehouse_name:
        q = q.eq("warehouse_name", warehouse_name)
    
    res = q.execute()
    data = res.data or []
    
    if not data:
        raise HTTPException(status_code=404, detail=f"No item found with barcode '{barcode}'")
    
    if len(data) > 1 and not warehouse_name:
        # Multiple items with same barcode across warehouses
        warehouses = [item["warehouse_name"] for item in data if item["warehouse_name"]]
        raise HTTPException(
            status_code=400, 
            detail=f"Barcode '{barcode}' found in multiple warehouses: {', '.join(set(warehouses))}. Please specify warehouse_name."
        )
    
    return data[0]


# =========================
# Check if item exists
# =========================
@router.get("/items/check")
async def check_item_exists(
    item_name: str = Query(...), 
    warehouse_name: Optional[str] = Query(None),
    current_user=Depends(get_protected_user)
):
    """Check if an item already exists for the user"""
    user_id = current_user.get("id") or current_user.get("user_id")
    
    q = supabase.table("inventory_master_log") \
        .select("item_id, item_name, warehouse_name") \
        .eq("user_id", user_id) \
        .eq("item_name", item_name.strip())
    
    if warehouse_name:
        q = q.eq("warehouse_name", warehouse_name)
    
    res = q.execute()
    data = res.data or []
    
    return {
        "exists": len(data) > 0,
        "count": len(data),
        "items": data
    }


# =========================
# Range report-like fetch (data only)
# =========================
@router.get("/history/range")
async def restock_history_range(
    start_date: date,
    end_date: date,
    item_name: Optional[str] = None,
    current_user=Depends(get_protected_user)
):
    user_id = current_user.get("id") or current_user.get("user_id")
    res = supabase.table("goods_bought_history").select("*").eq("user_id", user_id).execute()
    rows = res.data or []
    # filter in Python for flexibility
    out = []
    for r in rows:
        try:
            pd = date.fromisoformat(r.get("purchase_date"))
        except Exception:
            continue
        if pd < start_date or pd > end_date:
            continue
        if item_name and r.get("item_name") != item_name:
            continue
        out.append(r)
    return out

