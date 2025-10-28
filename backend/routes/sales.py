from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Body
from datetime import datetime, timedelta, date
from typing import List, Optional, Literal, Tuple, Dict, Any
from io import BytesIO
from fpdf import FPDF
from PIL import Image
from pathlib import Path
import base64
import os
import uuid
import json
import datetime as dt
import tempfile
import re
from pydantic import BaseModel, Field, field_validator

from backend.core.route_protection import get_protected_user
from backend.core.security import ACCESS_TOKEN_EXPIRE_MINUTES
from backend.core.supabase_client import supabase
from backend.core.permission_check import require_permission
#


router = APIRouter(prefix="/sales", tags=["sales"])


# =========================
# Models
# =========================
class SaleItem(BaseModel):
    item_id: Optional[int] = None
    barcode: Optional[str] = None
    warehouse_name: Optional[str] = None
    item_name: str
    quantity: int
    unit_price: float
    total_amount: Optional[float] = None  # can be derived


class BatchSaleRequest(BaseModel):
    # Actor context
    employee_id: Optional[int] = Field(None, description="Employee ID - can be null or empty string")
    employee_name: Optional[str] = None
    
    @field_validator('employee_id', mode='before')
    @classmethod
    def validate_employee_id(cls, v):
        if v == "" or v is None:
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    # Customer and sale info
    customer_id: Optional[int] = None
    sale_date: Optional[date] = None
    customer_name: str
    customer_phone: Optional[str] = None
    notes: Optional[str] = None
    invoice_number: Optional[str] = None

    # Items and amounts
    items: List[SaleItem]
    apply_vat: bool = True
    vat_rate: float = 7.5
    discount_type: Literal["None", "Percentage", "Fixed Amount"] = "None"
    discount_value: float = 0.0  # percentage or fixed amount based on discount_type

    # Payment fields
    payment_method: Literal["cash", "card", "transfer", "none"] = "cash"
    payment_status: Literal["paid", "credit", "partial"] = "paid"
    amount_customer_paid: float = 0.0
    due_date: Optional[date] = None

    # Partial payment details (if partial)
    partial_payment_amount: Optional[float] = None
    partial_payment_date: Optional[date] = None
    partial_payment_note: Optional[str] = None

    # Optional pre-uploaded invoice file URL (via /sales/upload-invoice)
    invoice_file_url: Optional[str] = None
    
    # Invoice override flag (MD only)
    invoice_override: bool = False


class ProformaItem(BaseModel):
    item_id: Optional[int] = None
    item_name: str
    quantity: int
    unit_price: float
    total_amount: Optional[float] = None


class CreateProformaRequest(BaseModel):
    employee_id: Optional[int] = Field(None, description="Employee ID - can be null or empty string")
    employee_name: Optional[str] = None
    
    @field_validator('employee_id', mode='before')
    @classmethod
    def validate_employee_id(cls, v):
        if v == "" or v is None:
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None
    date: Optional[dt.date] = None
    customer_id: Optional[int] = None
    customer_name: str
    customer_phone: Optional[str] = None

    # VAT/discount configuration (server will compute totals)
    apply_vat: bool = True
    vat_rate: float = 7.5
    discount_type: Literal["None", "Percentage", "Fixed Amount"] = "None"
    discount_value: float = 0.0

    # Client may send these; server will override with computed values
    grand_total: Optional[float] = None
    vat_amount: Optional[float] = 0
    discount_amount: Optional[float] = 0

    items: List[ProformaItem]
    notes: Optional[str] = None


class ReceiptRequest(BaseModel):
    customer_name: str
    date: str
    pdf_format: Optional[Literal["A4", "THERMAL"]] = "A4"


class SendReceiptEmailRequest(BaseModel):
    customer_email: str
    customer_name: str
    sale_date: date
    pdf_format: Literal["A4", "THERMAL"] = "A4"


class SalesFilterRequest(BaseModel):
    keyword: Optional[str] = None
    filter_type: Optional[str] = None  # None | customer_name | employee_name | customer_phone | item_name
    filter_values: Optional[List[str]] = None  # Selected values for the filter
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    limit: int = 100


class SearchQuery(BaseModel):
    q: str
    limit: int = 100


class PaymentUpdateRequest(BaseModel):
    transaction_type: Literal["sale", "purchase", "expense"]
    record_id: int  # sale_id or purchase_id or expense_id
    amount: float
    payment_method: Literal["cash", "card", "transfer", "none"] = "cash"
    notes: Optional[str] = None
    transaction_date: Optional[date] = None


# =========================
# Helpers
# =========================
def _calc_totals(items: List[SaleItem], apply_vat: bool, vat_rate: float, discount_type: str, discount_value: float) -> Tuple[float, float, float, float]:
    """Returns (grand_total_before_vat, vat_amount, discount_amount, final_total)"""
    grand_total = 0.0
    for it in items:
        line_total = (it.quantity or 0) * (it.unit_price or 0)
        it.total_amount = line_total
        grand_total += line_total

    vat_amount = (vat_rate / 100.0) * grand_total if apply_vat else 0.0
    total_with_vat = grand_total + vat_amount

    if discount_type == "Percentage":
        discount_amount = (discount_value / 100.0) * total_with_vat
    elif discount_type == "Fixed Amount":
        discount_amount = discount_value
    else:
        discount_amount = 0.0

    final_total = max(total_with_vat - discount_amount, 0.0)
    return grand_total, vat_amount, discount_amount, final_total


def _upload_to_storage(user_id: int, uploaded_file: UploadFile, bucket: str, folder: str, desired_name_no_ext: Optional[str] = None) -> str:
    ext = os.path.splitext(uploaded_file.filename)[1] or ".bin"
    base_name = desired_name_no_ext.strip().replace(" ", "_") if desired_name_no_ext else os.path.splitext(uploaded_file.filename)[0]
    unique = uuid.uuid4().hex[:8]
    filename = f"{base_name}_{unique}{ext}"
    path = f"{folder}/{user_id}/{filename}"

    content = uploaded_file.file.read()
    supabase.storage.from_(bucket).upload(path, content, {"content-type": uploaded_file.content_type or "application/octet-stream"})
    return supabase.storage.from_(bucket).get_public_url(path)


def _upload_bytes_to_storage(user_id: int, data: bytes, content_type: str, desired_name_no_ext: Optional[str] = None, ext: Optional[str] = None, bucket: str = "salesinvoices", folder: str = "salesinvoices") -> str:
    base_name = (desired_name_no_ext or f"invoice_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}").strip().replace(" ", "_")
    unique = uuid.uuid4().hex[:8]
    ext2 = ext if ext and ext.startswith(".") else (f".{ext}" if ext else ".bin")
    filename = f"{base_name}_{unique}{ext2}"
    path = f"{folder}/{user_id}/{filename}"
    supabase.storage.from_(bucket).upload(path, data, {"content-type": content_type or "application/octet-stream"})
    return supabase.storage.from_(bucket).get_public_url(path)


def _lookup_item_by_barcode(user_id: int, barcode: str, warehouse_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if not barcode:
        print("DEBUG: _lookup_item_by_barcode called with empty barcode")
        return None
    try:
        print(f"DEBUG: Looking up barcode='{barcode}', user_id={user_id}, warehouse='{warehouse_name}'")
        q = supabase.table("inventory_master_log").select("item_id, item_name, price, warehouse_name").eq("user_id", user_id).eq("barcode", barcode)
        if warehouse_name:
            q = q.eq("warehouse_name", warehouse_name)
        resp = q.limit(1).execute()
        data = resp.data or []
        print(f"DEBUG: Barcode lookup result count={len(data)}; first={data[0] if data else None}")
        if data:
            return data[0]
        # Fallback: try canonical 'inventory' table
        try:
            print("DEBUG: Falling back to 'inventory' table for barcode lookup")
            resp2 = (
                supabase.table("inventory")
                .select("id, name, price")
                .eq("user_id", user_id)
                .eq("barcode", barcode)
                .limit(1)
                .execute()
            )
            data2 = resp2.data or []
            print(f"DEBUG: Inventory(barcode) result count={len(data2)}; first={data2[0] if data2 else None}")
            if data2:
                d0 = data2[0]
                return {"item_id": d0.get("id"), "item_name": d0.get("name"), "price": d0.get("price"), "warehouse_name": warehouse_name}
        except Exception as e2:
            print(f"ERROR: Fallback inventory barcode lookup failed: {e2!r}")
        return None
    except Exception as e:
        print(f"ERROR: Exception in _lookup_item_by_barcode: {e!r}")
        return None


def _check_stock_availability(user_id: int, item_id: int, requested_quantity: int, item_name: str = "Item") -> None:
    """
    Check if sufficient stock is available for the sale.
    Raises HTTPException if stock is insufficient or zero.
    
    Args:
        user_id: The user/tenant ID
        item_id: The inventory item ID
        requested_quantity: Quantity to be sold
        item_name: Name of the item (for error messages)
    
    Raises:
        HTTPException: If stock is insufficient or zero
    """
    if not item_id:
        return
    
    try:
        # Get today's inventory record to check available stock
        today = datetime.utcnow().date().isoformat()
        resp = supabase.table("inventory_master_log").select("open_balance, supplied_quantity, return_quantity, stock_out, closing_balance").eq("user_id", user_id).eq("item_id", item_id).eq("log_date", today).limit(1).execute()
        
        data = resp.data or []
        
        if not data:
            # No record for today, try to get the latest closing balance
            resp_latest = supabase.table("inventory_master_log").select("closing_balance").eq("user_id", user_id).eq("item_id", item_id).order("log_date", desc=True).limit(1).execute()
            latest_data = resp_latest.data or []
            
            if latest_data:
                available_stock = latest_data[0].get("closing_balance", 0) or 0
            else:
                available_stock = 0
        else:
            # Calculate available stock: open_balance + supplied_quantity + return_quantity - stock_out
            record = data[0]
            open_balance = record.get("open_balance", 0) or 0
            supplied_quantity = record.get("supplied_quantity", 0) or 0
            return_quantity = record.get("return_quantity", 0) or 0
            stock_out = record.get("stock_out", 0) or 0
            
            # Try to use closing_balance if available, otherwise calculate
            if record.get("closing_balance") is not None:
                available_stock = record.get("closing_balance", 0) or 0
            else:
                available_stock = open_balance + supplied_quantity + return_quantity - stock_out
        
        print(f"DEBUG: Stock check for item_id={item_id} ('{item_name}'): available={available_stock}, requested={requested_quantity}")
        
        # Check if stock is zero or insufficient
        if available_stock <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot create sale: '{item_name}' has zero stock available. Please restock this item before making a sale."
            )
        
        if available_stock < requested_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for '{item_name}'. Available: {available_stock}, Requested: {requested_quantity}. Please reduce the quantity or restock."
            )
        
        print(f"✓ Stock check passed for '{item_name}': {available_stock} >= {requested_quantity}")
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"ERROR: Stock availability check failed for item_id={item_id}: {e!r}")
        # Don't block sale if check fails (fallback to allow sale)
        import traceback
        print(f"ERROR: Traceback: {traceback.format_exc()}")


def _adjust_inventory_stock_out(user_id: int, item_id: Optional[int], delta: int):
    """Reduce or increase stock_out by delta for the given inventory item."""
    if not item_id:
        return
    resp = supabase.table("inventory_master_log").select("stock_out").eq("user_id", user_id).eq("item_id", item_id).limit(1).execute()
    data = (resp.data or [])
    current = 0
    if data:
        current = data[0].get("stock_out", 0) or 0
    new_qty = max(current + delta, 0)
    supabase.table("inventory_master_log").update({"stock_out": new_qty}).eq("user_id", user_id).eq("item_id", item_id).execute()


def _update_inventory_for_sale(user_id: int, item_id: int, quantity: int, warehouse_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Update inventory table for a sale transaction.
    Checks for existing record for TODAY, updates stock_out if exists, otherwise creates new row.
    The closing_balance is calculated automatically by the database.
    
    Args:
        user_id: The user/tenant ID
        item_id: The inventory item ID
        quantity: Quantity sold (will be added to stock_out)
        warehouse_name: Optional warehouse filter
        
    Returns:
        Dict with update status: {'action': 'updated'|'created', 'item_id': int, 'stock_out': int}
    """
    if not item_id:
        print(f"WARNING: _update_inventory_for_sale called with null item_id")
        return {'action': 'skipped', 'item_id': None, 'reason': 'null item_id'}
    
    today = datetime.utcnow().date().isoformat()
    
    print(f"\n--- Updating Inventory ---")
    print(f"Item ID: {item_id}")
    print(f"Quantity: {quantity}")
    print(f"Date: {today}")
    print(f"Warehouse: {warehouse_name or 'N/A'}")
    
    try:
        # Step 1: Check if record exists for today
        print(f"  Checking for existing record with user_id={user_id}, item_id={item_id}, date={today}")
        
        query = supabase.table("inventory_master_log").select("*").eq("user_id", user_id).eq("item_id", item_id).eq("log_date", today)
        
        if warehouse_name:
            query = query.eq("warehouse_name", warehouse_name)
            print(f"  Filtering by warehouse: {warehouse_name}")
        
        existing = query.limit(1).execute()
        print(f"  Query executed. Response status: {existing}")
        existing_data = existing.data or []
        print(f"  Found {len(existing_data)} existing records")
        
        if existing_data:
            # Record exists for today - UPDATE stock_out
            record = existing_data[0]
            current_stock_out = record.get("stock_out", 0) or 0
            new_stock_out = current_stock_out + quantity
            
            print(f"✓ Found existing inventory record for today")
            print(f"  Current stock_out: {current_stock_out}")
            print(f"  New stock_out: {new_stock_out}")
            
            # Update only stock_out - closing_balance is calculated by database
            update_data = {"stock_out": new_stock_out}
            
            print(f"  Executing UPDATE with data: {update_data}")
            update_result = supabase.table("inventory_master_log").update(update_data).eq("user_id", user_id).eq("item_id", item_id).eq("inventory_date", today).execute()
            print(f"  Update result: {update_result}")
            
            print(f"✓ Inventory updated for item_id={item_id}")
            
            return {'action': 'updated', 'item_id': item_id, 'stock_out': new_stock_out, 'previous_stock_out': current_stock_out}
            
        else:
            # No record for today - CREATE new row
            print(f"No existing inventory record for today - creating new row")
            
            # Get yesterday's closing balance to use as today's opening balance
            yesterday = (datetime.utcnow().date() - timedelta(days=1)).isoformat()
            
            # Query for closing_balance (or try open_balance + supplied_quantity - stock_out)
            yesterday_query = supabase.table("inventory_master_log").select("*").eq("user_id", user_id).eq("item_id", item_id).eq("log_date", yesterday)
            
            if warehouse_name:
                yesterday_query = yesterday_query.eq("warehouse_name", warehouse_name)
            
            yesterday_data = yesterday_query.limit(1).execute().data or []
            
            opening_balance = 0
            if yesterday_data:
                rec = yesterday_data[0]
                # Try closing_balance first, otherwise calculate
                if rec.get("closing_balance") is not None:
                    opening_balance = rec.get("closing_balance", 0) or 0
                else:
                    # Calculate: open_balance + supplied_quantity - stock_out
                    opening_balance = (rec.get("open_balance", 0) or 0) + (rec.get("supplied_quantity", 0) or 0) - (rec.get("stock_out", 0) or 0)
                print(f"  Using yesterday's closing balance as opening: {opening_balance}")
            else:
                # No yesterday record, try to get latest closing balance
                latest_query = supabase.table("inventory_master_log").select("*").eq("user_id", user_id).eq("item_id", item_id).order("log_date", desc=True)
                
                if warehouse_name:
                    latest_query = latest_query.eq("warehouse_name", warehouse_name)
                
                latest_data = latest_query.limit(1).execute().data or []
                
                if latest_data:
                    rec = latest_data[0]
                    if rec.get("closing_balance") is not None:
                        opening_balance = rec.get("closing_balance", 0) or 0
                    else:
                        opening_balance = (rec.get("open_balance", 0) or 0) + (rec.get("supplied_quantity", 0) or 0) - (rec.get("stock_out", 0) or 0)
                    print(f"  Using latest closing balance from {rec.get('log_date')} as opening: {opening_balance}")
                else:
                    print(f"  No previous records found - starting with opening balance: 0")
            
            # Create new inventory record
            # Note: Column names match database: open_balance, supplied_quantity, stock_out
            new_record = {
                "user_id": user_id,
                "item_id": item_id,
                "log_date": today,
                "open_balance": opening_balance,  # Changed from opening_balance
                "supplied_quantity": 0,           # Changed from stock_in
                "stock_out": quantity,
                # closing_balance is NOT set here - database calculates it automatically
            }
            
            if warehouse_name:
                new_record["warehouse_name"] = warehouse_name
            
            print(f"  Creating new record: opening={opening_balance}, stock_out={quantity}")
            print(f"  New record payload: {new_record}")
            
            insert_result = supabase.table("inventory_master_log").insert(new_record).execute()
            print(f"  Insert result: {insert_result}")
            
            print(f"✓ New inventory row created for item_id={item_id}")
            
            return {'action': 'created', 'item_id': item_id, 'stock_out': quantity, 'opening_balance': opening_balance}
        
        print(f"--- Inventory Update Complete ---\n")
        
    except Exception as e:
        print(f"\n!!! ERROR: Failed to update inventory for item_id={item_id} !!!")
        print(f"ERROR Type: {type(e).__name__}")
        print(f"ERROR Message: {e}")
        import traceback
        print(f"ERROR: Full Traceback:")
        print(traceback.format_exc())
        print(f"ERROR: Request details - user_id={user_id}, item_id={item_id}, quantity={quantity}, warehouse={warehouse_name}")
        print(f"!!! END ERROR !!!\n")
        # Don't raise - allow sale to complete even if inventory update fails
        # This prevents data inconsistency
        return {'action': 'failed', 'item_id': item_id, 'error': str(e)}


def _company_info(user_id: int) -> Dict[str, Any]:
    # Fetch company info using user_id column
    try:
        resp = supabase.table("users").select("tenant_name, logo_url, phone_number, address, account_number, bank_name, account_name").eq("user_id", user_id).single().execute()
        d = resp.data or {}
        print(f"DEBUG: Successfully fetched company info for user_id={user_id}")
    except Exception as e:
        print(f"ERROR: Failed to fetch company info for user_id={user_id}: {e}")
        d = {}
    
    return {
        "tenant_name": d.get("tenant_name", "My Company"),
        "logo_url": d.get("logo_url", ""),
        "phone_number": d.get("phone_number", ""),
        "address": d.get("address", ""),
        "account_number": d.get("account_number", ""),
        "bank_name": d.get("bank_name", ""),
        "account_name": d.get("account_name", ""),
    }


def _resolve_employee(user_id: int, requested_employee_id: Optional[int], requested_employee_name: Optional[str], current_user: Dict[str, Any]) -> Tuple[int, str]:
    """Resolve to a valid employees.employee_id and name for this tenant.
    Mirrors the Streamlit logic: prefer provided employee_id, then current_user.employee_id,
    else look up by employee_name/username, otherwise fail clearly.
    """
    print(
        f"DEBUG: _resolve_employee called with user_id={user_id}, requested_employee_id={requested_employee_id}, "
        f"requested_employee_name={requested_employee_name}, current_user.employee_id={current_user.get('employee_id')}"
    )
    # 1) If a specific employee_id was provided, validate it exists for this user
    if requested_employee_id is not None:
        try:
            print(f"DEBUG: Trying employee_id={requested_employee_id} for user_id={user_id}")
            resp = (
                supabase.table("employees")
                .select("employee_id, name")
                .eq("user_id", user_id)
                .eq("employee_id", requested_employee_id)
                .limit(1)
                .execute()
            )
            row = (resp.data or [])
            print(f"DEBUG: employees by id result count={len(row)}; first={row[0] if row else None}")
            if row:
                return row[0]["employee_id"], row[0].get("name") or (requested_employee_name or "")
        except Exception as e:
            print(f"ERROR: _resolve_employee lookup by id failed: {e!r}")

    # 2) Try employee_id from the authenticated user context
    cu_emp_id = current_user.get("employee_id")
    if cu_emp_id is not None:
        try:
            print(f"DEBUG: Trying current_user.employee_id={cu_emp_id} for user_id={user_id}")
            resp = (
                supabase.table("employees")
                .select("employee_id, name")
                .eq("user_id", user_id)
                .eq("employee_id", cu_emp_id)
                .limit(1)
                .execute()
            )
            row = (resp.data or [])
            print(f"DEBUG: employees by current user id result count={len(row)}; first={row[0] if row else None}")
            if row:
                return row[0]["employee_id"], row[0].get("name") or (requested_employee_name or current_user.get("username") or current_user.get("name") or "")
        except Exception as e:
            print(f"ERROR: _resolve_employee lookup by current user id failed: {e!r}")

    # 3) Try to resolve by name (payload.employee_name first, then current_user username/name)
    candidate_names = [requested_employee_name, current_user.get("username"), current_user.get("name")]
    for nm in candidate_names:
        nm = (nm or "").strip()
        if not nm:
            continue
        try:
            print(f"DEBUG: Trying employee lookup by name='{nm}' for user_id={user_id}")
            resp = (
                supabase.table("employees")
                .select("employee_id, name")
                .eq("user_id", user_id)
                .eq("name", nm)
                .limit(1)
                .execute()
            )
            row = (resp.data or [])
            print(f"DEBUG: employees by name result count={len(row)}; first={row[0] if row else None}")
            if row:
                return row[0]["employee_id"], row[0].get("name") or nm
        except Exception as e:
            print(f"ERROR: _resolve_employee lookup by name failed: {e!r}")

    # 4) As a very last resort, pick any employee belonging to this user (keeps parity with UI expectation)
    try:
        resp = (
            supabase.table("employees")
            .select("employee_id, name")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        row = (resp.data or [])
        if row:
            return row[0]["employee_id"], row[0].get("name") or (requested_employee_name or current_user.get("username") or "")
    except Exception:
        pass

    # If we reach here, we cannot satisfy the FK reliably
    raise HTTPException(status_code=400, detail="Employee record not found for this user. Please create an employee first.")


def _safe_text(text: Any) -> str:
    return str(text).replace("₦", "NGN")

def _grouped_sales_for(user_id: int, customer_name: str, sale_date: date) -> List[Dict[str, Any]]:
    sd = sale_date.isoformat()
    hist = supabase.table("sales_master_history").select("*").eq("user_id", user_id).eq("customer_name", customer_name).eq("sale_date", sd).order("created_at", desc=True).limit(500).execute().data or []
    log = supabase.table("sales_master_log").select("*").eq("user_id", user_id).eq("customer_name", customer_name).eq("sale_date", sd).order("created_at", desc=True).limit(500).execute().data or []
    return hist + log


def _build_pdf(company: Dict[str, Any], customer_name: str, sale_date: str, items: List[Dict[str, Any]], format_kind: Literal["A4", "THERMAL"]) -> bytes:
    try:
        print(f"DEBUG: Building PDF - customer='{customer_name}', items_count={len(items)}, format='{format_kind}'")
        
        if not items:
            raise ValueError("No items provided for PDF generation")
        
        # Compute totals - match original Streamlit logic
        total_amount_sum = sum(float(it.get("total_amount", 0) or 0) for it in items)
        
        # Use sale-level totals from the first item (as in original)
        first_item = items[0]
        grand_total = float(first_item.get("grand_total", total_amount_sum))
        amount_customer_paid = float(first_item.get("amount_customer_paid", 0))
        
        # Calculate balance properly
        balance_sum = grand_total - amount_customer_paid
        
        print(f"DEBUG: Totals calculated - total_amount_sum={total_amount_sum}, grand_total={grand_total}")
        
        if format_kind == "THERMAL":
            fmt = (58, 200)
            col_item, col_qty, col_unit, col_total = 20, 8, 12, 12
            font_title = 8
            font_normal = 5
            max_logo_w = 20
            cell_h = 3
            header_h = 6
            margin = 2
        else:
            fmt = "A4"
            col_item, col_qty, col_unit, col_total = 70, 25, 35, 40
            font_title = 18
            font_normal = 10
            max_logo_w = 45
            cell_h = 8
            header_h = 9
            margin = 15

        pdf = FPDF(orientation='P', unit='mm', format=fmt)
        pdf.set_margins(left=margin, top=margin, right=margin)
        pdf.add_page()

        # Logo
        logo_url = company.get("logo_url", "") or ""
        print(f"DEBUG: Logo URL from company info: '{logo_url}'")
        
        if logo_url and logo_url.strip():
            try:
                import urllib.request
                from PIL import Image
                import tempfile
                import os
                
                print(f"DEBUG: Attempting to download logo from: {logo_url}")
                
                # Create temp file with proper extension based on URL
                file_ext = '.png'
                if logo_url.lower().endswith('.jpg') or logo_url.lower().endswith('.jpeg'):
                    file_ext = '.jpg'
                elif logo_url.lower().endswith('.gif'):
                    file_ext = '.gif'
                
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=file_ext)
                tmp_path = tmp.name
                tmp.close()
                
                print(f"DEBUG: Downloading logo to temp file: {tmp_path}")
                urllib.request.urlretrieve(logo_url, tmp_path)
                print(f"DEBUG: Logo downloaded successfully")
                
                # Open and verify image
                img = Image.open(tmp_path)
                print(f"DEBUG: Logo image opened - size: {img.width}x{img.height}, format: {img.format}")
                
                aspect_ratio = img.height / img.width if img.width else 1.0
                height = max_logo_w * aspect_ratio
                page_width = pdf.w
                x_position = (page_width - max_logo_w) / 2
                
                print(f"DEBUG: Adding logo to PDF at position x={x_position}, y=10, w={max_logo_w}, h={height}")
                pdf.image(tmp_path, x=x_position, y=10, w=max_logo_w, h=height)
                pdf.set_y(15 + height)
                
                # Cleanup temp file
                try:
                    os.unlink(tmp_path)
                    print(f"DEBUG: Temp logo file cleaned up")
                except Exception as cleanup_err:
                    print(f"WARNING: Failed to cleanup temp logo file: {cleanup_err}")
                
                print(f"✓ Logo added successfully to PDF")
            except Exception as e:
                print(f"ERROR: Failed to add logo to PDF: {type(e).__name__}: {e}")
                import traceback
                print(f"ERROR: Logo traceback: {traceback.format_exc()}")
                pdf.set_y(20)
        else:
            print(f"DEBUG: No logo URL provided, skipping logo")
            pdf.set_y(20)

        # Modern Header Section
        if company["tenant_name"]:
            pdf.set_font("Arial", 'B', font_title)
            pdf.set_text_color(30, 58, 138)  # Modern blue
            pdf.cell(0, cell_h if format_kind == "THERMAL" else 12, f"{company['tenant_name']}", ln=True, align="C")
        
        # Receipt title with accent color
        pdf.set_font("Arial", 'B', (font_title - 2) if format_kind != "THERMAL" else 6)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, cell_h if format_kind == "THERMAL" else 8, "SALES RECEIPT", ln=True, align="C")
        pdf.ln(1 if format_kind == "THERMAL" else 3)
        
        # Horizontal line separator
        if format_kind != "THERMAL":
            pdf.set_draw_color(30, 58, 138)
            pdf.set_line_width(0.5)
            pdf.line(margin, pdf.get_y(), pdf.w - margin, pdf.get_y())
            pdf.ln(3)
        
        # Company details in smaller, cleaner format
        pdf.set_font("Arial", '', font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.set_text_color(80, 80, 80)
        if company["phone_number"]:
            pdf.multi_cell(0, 4 if format_kind == "THERMAL" else 5, f"Tel: {company['phone_number']}", align="C")
        if company["address"]:
            pdf.multi_cell(0, 4 if format_kind == "THERMAL" else 5, f"{company['address']}", align="C")
        if company["account_number"] and company["bank_name"]:
            pdf.multi_cell(0, 4 if format_kind == "THERMAL" else 5, f"Bank: {company['bank_name']} | Acct: {company['account_number']}", align="C")
        if company["account_name"]:
            pdf.multi_cell(0, 4 if format_kind == "THERMAL" else 5, f"Account Name: {company['account_name']}", align="C")
        pdf.ln(2 if format_kind == "THERMAL" else 5)

        # Customer & Date info box with background
        if format_kind != "THERMAL":
            pdf.set_fill_color(245, 247, 250)  # Light gray background
            pdf.rect(margin, pdf.get_y(), pdf.w - 2*margin, 15, 'F')
        
        pdf.set_font("Arial", 'B', font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.set_text_color(50, 50, 50)
        y_start = pdf.get_y()
        pdf.set_xy(margin + 3, y_start + 3)
        pdf.cell(0, 5 if format_kind != "THERMAL" else 3, f"CUSTOMER: {customer_name or 'Walk-in Customer'}", ln=True)
        pdf.set_x(margin + 3)
        pdf.set_font("Arial", '', font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.cell(0, 5 if format_kind != "THERMAL" else 3, f"Date: {sale_date}", ln=True)
        pdf.ln(2 if format_kind == "THERMAL" else 4)

        # Modern Table header with blue theme
        pdf.set_line_width(0.3)
        pdf.set_draw_color(30, 58, 138)  # Blue border
        pdf.set_font("Arial", 'B', font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.set_fill_color(30, 58, 138)  # Dark blue header
        pdf.set_text_color(255, 255, 255)  # White text
        
        pdf.cell(col_item, header_h, _safe_text("ITEM"), border=1, align="L", fill=True)
        pdf.cell(col_qty, header_h, _safe_text("QTY"), border=1, align="C", fill=True)
        pdf.cell(col_unit, header_h, _safe_text("UNIT (NGN)"), border=1, align="R", fill=True)
        pdf.cell(col_total, header_h, _safe_text("TOTAL (NGN)"), border=1, align="R", fill=True)
        pdf.ln()

        # Table rows with alternating colors
        pdf.set_font("Arial", "", font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.set_text_color(50, 50, 50)
        pdf.set_line_width(0.1)
        pdf.set_draw_color(200, 200, 200)  # Light gray borders
        
        for idx, it in enumerate(items):
            # Alternating row colors for better readability
            if idx % 2 == 0:
                pdf.set_fill_color(255, 255, 255)  # White
            else:
                pdf.set_fill_color(248, 250, 252)  # Light gray
            
            x_start = pdf.get_x()
            y_start = pdf.get_y()
            pdf.multi_cell(col_item, cell_h if format_kind == "THERMAL" else 7, _safe_text(it.get("item_name", "")), border=1, fill=True)
            y_end = pdf.get_y()
            row_height = y_end - y_start
            
            pdf.set_xy(x_start + col_item, y_start)
            pdf.cell(col_qty, row_height, _safe_text(str(it.get("quantity", 0))), border=1, align="C", fill=True)
            pdf.cell(col_unit, row_height, _safe_text(f"{float(it.get('unit_price', 0) or 0):,.2f}"), border=1, align="R", fill=True)
            pdf.cell(col_total, row_height, _safe_text(f"{float(it.get('total_amount', 0) or 0):,.2f}"), border=1, align="R", fill=True)
            pdf.set_y(y_end)

        # Modern Summary Section with highlighted totals
        pdf.ln(1 if format_kind == "THERMAL" else 2)
        pdf.set_line_width(0.2)
        pdf.set_draw_color(200, 200, 200)
        
        # Subtotal
        pdf.set_font("Arial", '', font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.set_text_color(80, 80, 80)
        pdf.set_fill_color(250, 250, 250)
        pdf.cell(col_item + col_qty + col_unit, header_h - 1, _safe_text("Subtotal"), border=1, fill=True)
        pdf.set_font("Arial", 'B', font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.cell(col_total, header_h - 1, _safe_text(f"NGN {total_amount_sum:,.2f}"), border=1, align="R", fill=True)
        pdf.ln()
        
        # Grand Total with accent color
        pdf.set_fill_color(30, 58, 138)  # Blue background
        pdf.set_text_color(255, 255, 255)  # White text
        pdf.set_font("Arial", 'B', font_normal if format_kind != "THERMAL" else 5)
        pdf.cell(col_item + col_qty + col_unit, header_h, _safe_text("GRAND TOTAL"), border=1, fill=True)
        pdf.cell(col_total, header_h, _safe_text(f"NGN {grand_total:,.2f}"), border=1, align="R", fill=True)
        pdf.ln()
        
        # Amount Paid
        pdf.set_fill_color(240, 253, 244)  # Light green
        pdf.set_text_color(22, 101, 52)  # Dark green
        pdf.set_font("Arial", 'B', font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.cell(col_item + col_qty + col_unit, header_h - 1, _safe_text("Amount Paid"), border=1, fill=True)
        pdf.cell(col_total, header_h - 1, _safe_text(f"NGN {amount_customer_paid:,.2f}"), border=1, align="R", fill=True)
        pdf.ln()
        
        # Balance (if any)
        if balance_sum > 0:
            pdf.set_fill_color(254, 242, 242)  # Light red
            pdf.set_text_color(153, 27, 27)  # Dark red
        else:
            pdf.set_fill_color(240, 253, 244)  # Light green
            pdf.set_text_color(22, 101, 52)  # Dark green
        pdf.set_font("Arial", 'B', font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.cell(col_item + col_qty + col_unit, header_h - 1, _safe_text("Balance Due"), border=1, fill=True)
        pdf.cell(col_total, header_h - 1, _safe_text(f"NGN {balance_sum:,.2f}"), border=1, align="R", fill=True)
        
        # Spacing before footer
        pdf.ln(3 if format_kind == "THERMAL" else 8)
        
        # Modern footer with border
        if format_kind == "A4":
            page_height = 297
        elif format_kind == "THERMAL":
            page_height = 200
        else:
            page_height = 297
            
        footer_height = 20
        current_y = pdf.get_y()
        
        if current_y + footer_height > page_height - 10:
            pdf.add_page()
            current_y = margin
        
        # Separator line before footer
        if format_kind != "THERMAL":
            pdf.set_draw_color(200, 200, 200)
            pdf.set_line_width(0.2)
            pdf.line(margin, pdf.get_y(), pdf.w - margin, pdf.get_y())
            pdf.ln(3)
        
        # Thank you message
        pdf.set_font("Arial", "I", font_normal - 1 if format_kind != "THERMAL" else 5)
        pdf.set_text_color(100, 100, 100)
        pdf.multi_cell(0, 4 if format_kind == "THERMAL" else 5, "Thank you for your business!", align="C")
        pdf.set_font("Arial", "", font_normal - 2 if format_kind != "THERMAL" else 4)
        pdf.multi_cell(0, 4 if format_kind == "THERMAL" else 5, "We appreciate your trust and look forward to serving you again.", align="C")

        print("DEBUG: Finalizing PDF output")
        try:
            # Create a temporary file to write the PDF
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
                pdf.output(tmp_file.name, 'F')
                tmp_file.seek(0)
                with open(tmp_file.name, 'rb') as f:
                    pdf_bytes = f.read()
            
            # Clean up the temporary file
            os.unlink(tmp_file.name)
            print(f"DEBUG: PDF creation completed, size: {len(pdf_bytes)} bytes")
            return pdf_bytes
        except Exception as e:
            print(f"ERROR: Failed to output PDF: {e}")
            # Fallback: try string output method
            try:
                pdf_str = pdf.output(dest='S')
                pdf_bytes = pdf_str.encode('latin1') if isinstance(pdf_str, str) else pdf_str
                return pdf_bytes
            except Exception as e2:
                print(f"ERROR: Fallback PDF output failed: {e2}")
                raise
        
    except Exception as e:
        print(f"ERROR: PDF creation failed: {e}")
        import traceback
        print(f"ERROR: PDF Traceback: {traceback.format_exc()}")
        raise


async def _send_email_with_attachment_brevo(to_email: str, subject: str, html: str, filename: str, file_b64: str):
    # Use Brevo raw HTTP API to send with attachment
    BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
    BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "no-reply@priscomsales.online")
    BREVO_SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "PriscomSales")
    BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"

    if not BREVO_API_KEY:
        return

    import httpx
    headers = {
        "api-key": BREVO_API_KEY,
        "accept": "application/json",
        "content-type": "application/json",
    }
    payload = {
        "sender": {"email": BREVO_SENDER_EMAIL, "name": BREVO_SENDER_NAME},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html,
        "attachment": [
            {"content": file_b64, "name": filename}
        ]
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            await client.post(BREVO_API_URL, headers=headers, json=payload)
        except Exception:
            pass


# =========================
# Inventory and Warehouse helpers (API)
# =========================
@router.get("/warehouses")
async def get_warehouses(role: str, employee_id: Optional[int] = None, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    if role.lower() == "md":
        resp = supabase.table("inventory_master_log").select("warehouse_name").eq("user_id", user_id).neq("warehouse_name", None).execute()
        data = resp.data or []
        return sorted(list({r["warehouse_name"] for r in data}))
    elif role.lower() == "employee":
        # Get employee_id from current_user if not explicitly provided
        emp_id = employee_id or current_user.get("employee_id") or current_user.get("id")
        if emp_id:
            print(f"DEBUG: Fetching warehouses for employee_id={emp_id}, user_id={user_id}")
            resp = supabase.table("warehouse_access").select("warehouse_name").eq("user_id", user_id).eq("employee_id", emp_id).execute()
            data = resp.data or []
            print(f"DEBUG: Found {len(data)} warehouse access records for employee {emp_id}")
            return sorted(list({r["warehouse_name"] for r in data}))
    return []


@router.get("/inventory-items")
async def get_inventory_items(warehouse_name: str, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    if not warehouse_name:
        raise HTTPException(status_code=400, detail="Please select a warehouse first.")
    
    try:
        resp = supabase.table("inventory_master_log").select("item_id, item_name, price, warehouse_name").eq("user_id", user_id).eq("warehouse_name", warehouse_name).execute()
        items = resp.data or []
        
        # Debug: Check how many items we found
        print(f"DEBUG: Found {len(items)} items for warehouse '{warehouse_name}' and user {user_id}")
        
        # Filter and build the items map, handling null item names
        items_map = {}
        for it in items:
            item_name = it.get("item_name")
            if item_name and item_name.strip():  # Ensure not null/empty
                items_map[item_name] = {
                    "item_id": it.get("item_id"),
                    "price": float(it.get("price") or 0)
                }
            else:
                print(f"DEBUG: Skipping item with null/empty name: {it}")
        
        print(f"DEBUG: Returning {len(items_map)} valid items: {list(items_map.keys())[:5]}...")  # Show first 5 item names
        return items_map
        
    except Exception as e:
        print(f"ERROR: Failed to fetch inventory items: {e}")
        return {}


@router.get("/barcode/item")
async def get_item_by_barcode(barcode: str, warehouse_name: Optional[str] = None, current_user=Depends(get_protected_user)):
    """
    Lookup a single inventory item by its barcode (and optional warehouse filter).
    Returns: { item_id, item_name, price, warehouse_name } or 404.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    if not warehouse_name:
        raise HTTPException(status_code=400, detail="Please select a warehouse first.")
    inv = _lookup_item_by_barcode(user_id, barcode, warehouse_name)
    if not inv:
        raise HTTPException(status_code=404, detail="Item not found for barcode")
    return inv


class BarcodeList(BaseModel):
    barcodes: List[str]
    warehouse_name: Optional[str] = None


@router.post("/barcode/items")
async def get_items_by_barcodes(body: BarcodeList, current_user=Depends(get_protected_user)):
    """
    Batch lookup of items by barcodes. Returns a mapping barcode -> item or null if not found.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    if not body.warehouse_name:
        raise HTTPException(status_code=400, detail="Please select a warehouse first.")
    result: Dict[str, Optional[Dict[str, Any]]] = {}
    for code in body.barcodes:
        result[code] = _lookup_item_by_barcode(user_id, code, body.warehouse_name)
    return result


# =========================
# Core Sales Endpoints
# =========================
@router.post("/filter")
async def filter_sales(body: SalesFilterRequest, current_user=Depends(get_protected_user)):
    """
    Filter sales data with comprehensive filtering options matching Streamlit functionality.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    
    print(f"DEBUG: Filter sales called with keyword={body.keyword}, filter_type={body.filter_type}, values={body.filter_values}")
    
    # Fetch all sales data first
    hist_data = supabase.table("sales_master_history").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data or []
    log_data = supabase.table("sales_master_log").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data or []
    
    # Combine all sales
    all_sales = hist_data + log_data
    print(f"DEBUG: Total sales records: {len(all_sales)}")
    
    # Apply filtering logic
    filtered_sales = []
    
    for sale in all_sales:
        include_record = True
        
        # Keyword filter (search across all fields)
        if body.keyword:
            keyword_lower = body.keyword.lower().strip()
            if keyword_lower:
                found_match = False
                for key, value in sale.items():
                    if value is not None:
                        if keyword_lower in str(value).lower():
                            found_match = True
                            break
                if not found_match:
                    include_record = False
        
        # Specific field filter
        if include_record and body.filter_type and body.filter_values:
            field_value = sale.get(body.filter_type)
            if field_value not in body.filter_values:
                include_record = False
        
        # Date range filter
        if include_record and (body.start_date or body.end_date):
            sale_date_str = sale.get("sale_date")
            if sale_date_str:
                try:
                    from datetime import datetime
                    sale_date = datetime.strptime(sale_date_str, "%Y-%m-%d").date()
                    
                    if body.start_date and sale_date < body.start_date:
                        include_record = False
                    if body.end_date and sale_date > body.end_date:
                        include_record = False
                except (ValueError, TypeError):
                    # Skip records with invalid dates
                    include_record = False
        
        if include_record:
            filtered_sales.append(sale)
    
    print(f"DEBUG: Filtered to {len(filtered_sales)} records")
    
    # Sort and limit results
    filtered_sales.sort(key=lambda x: (x.get("created_at", ""), x.get("sale_date", "")), reverse=True)
    
    return filtered_sales[:body.limit]


@router.get("/filter-options")
async def get_filter_options(current_user=Depends(get_protected_user)):
    """
    Get unique values for each filterable field to populate dropdown options.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    
    # Fetch all sales data
    hist_data = supabase.table("sales_master_history").select("customer_name, employee_name, customer_phone, item_name").eq("user_id", user_id).execute().data or []
    log_data = supabase.table("sales_master_log").select("customer_name, employee_name, customer_phone, item_name").eq("user_id", user_id).execute().data or []
    
    all_sales = hist_data + log_data
    
    # Extract unique values for each field
    customer_names = list({sale.get("customer_name") for sale in all_sales if sale.get("customer_name")})
    employee_names = list({sale.get("employee_name") for sale in all_sales if sale.get("employee_name")})
    customer_phones = list({sale.get("customer_phone") for sale in all_sales if sale.get("customer_phone")})
    item_names = list({sale.get("item_name") for sale in all_sales if sale.get("item_name")})
    
    # Sort lists
    customer_names.sort()
    employee_names.sort()
    customer_phones.sort()
    item_names.sort()
    
    return {
        "customer_names": customer_names,
        "employee_names": employee_names,
        "customer_phones": customer_phones,
        "item_names": item_names
    }


@router.get("/customers")
async def get_customers_for_receipt(current_user=Depends(get_protected_user)):
    """
    Get unique customers from sales_master_log and sales_master_history for receipt form.
    Returns customers ordered by most recent sale (descending) with no duplicates.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    
    # Fetch customers with sale dates from both tables, ordered by most recent
    hist_data = supabase.table("sales_master_history").select("customer_name, customer_phone, sale_date, created_at").eq("user_id", user_id).order("created_at", desc=True).order("sale_date", desc=True).execute().data or []
    log_data = supabase.table("sales_master_log").select("customer_name, customer_phone, sale_date, created_at").eq("user_id", user_id).order("created_at", desc=True).order("sale_date", desc=True).execute().data or []
    
    # Combine and sort all sales by date descending
    all_sales = hist_data + log_data
    all_sales.sort(key=lambda x: (x.get("created_at") or "", x.get("sale_date") or ""), reverse=True)
    
    # Create unique customers list maintaining order (most recent first)
    seen_customers = set()
    customer_list = []
    
    for sale in all_sales:
        name = sale.get("customer_name")
        if name and name not in seen_customers:
            seen_customers.add(name)
            customer_list.append({
                "name": name,
                "phone": sale.get("customer_phone", "")
            })
    
    return customer_list


@router.get("/for-receipt")
async def get_sales_for_receipt(date: Optional[str] = None, customer_name: Optional[str] = None, current_user=Depends(get_protected_user)):
    """
    Get sales for receipt generation filtered by date and/or customer name.
    Combines data from sales_master_log and sales_master_history.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    
    # Build queries for both tables
    hist_query = supabase.table("sales_master_history").select("*").eq("user_id", user_id)
    log_query = supabase.table("sales_master_log").select("*").eq("user_id", user_id)
    
    # Apply date filter if provided
    if date:
        hist_query = hist_query.eq("sale_date", date)
        log_query = log_query.eq("sale_date", date)
    
    # Apply customer name filter if provided
    if customer_name:
        hist_query = hist_query.eq("customer_name", customer_name)
        log_query = log_query.eq("customer_name", customer_name)
    
    # Execute queries
    hist_data = hist_query.order("created_at", desc=True).execute().data or []
    log_data = log_query.order("created_at", desc=True).execute().data or []
    
    # Combine and sort by date descending
    all_sales = hist_data + log_data
    all_sales.sort(key=lambda x: (x.get("created_at") or "", x.get("sale_date") or ""), reverse=True)
    
    return all_sales


@router.get("/", response_model=None)
async def get_sales(skip: int = 0, limit: int = 100, current_user=Depends(get_protected_user)):
    """
    Return latest sales first, combining current log and history for this tenant.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    # Fetch a larger slice from both tables, merge and sort by created_at then sale_date DESC
    log_resp = (
        supabase.table("sales_master_log")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(max(1, int(limit or 0)) * 2)
        .execute()
    )
    hist_resp = (
        supabase.table("sales_master_history")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(max(1, int(limit or 0)) * 2)
        .execute()
    )
    rows = (log_resp.data or []) + (hist_resp.data or [])

    def _key(r):
        created = r.get("created_at") or ""
        sale_date = r.get("sale_date") or r.get("date") or ""
        return (created, sale_date)

    rows.sort(key=_key, reverse=True)
    start = max(0, int(skip or 0))
    end = start + max(1, int(limit or 0))
    
    # Clean up null values and ensure consistent field names
    result = rows[start:end]
    cleaned_result = []
    
    for row in result:
        cleaned_row = dict(row)
        # Ensure item_name is not null/None
        if not cleaned_row.get('item_name'):
            cleaned_row['item_name'] = cleaned_row.get('product_name') or cleaned_row.get('name') or 'Unknown Item'
        
        # Ensure other common fields have default values
        cleaned_row['quantity'] = cleaned_row.get('quantity') or 0
        cleaned_row['unit_price'] = cleaned_row.get('unit_price') or 0
        cleaned_row['total_amount'] = cleaned_row.get('total_amount') or 0
        cleaned_row['customer_name'] = cleaned_row.get('customer_name') or 'Walk-in Customer'
        
        # Fix null employee_id - use user_id as fallback
        if not cleaned_row.get('employee_id'):
            cleaned_row['employee_id'] = cleaned_row.get('user_id') or 0
        
        # Debug: log if we had to fix missing item_name
        if not row.get('item_name'):
            print(f"DEBUG: Fixed missing item_name in row {row.get('sale_id', 'unknown')}: '{cleaned_row['item_name']}'")
        
        cleaned_result.append(cleaned_row)
    
    return cleaned_result


@router.post("/upload-invoice")
async def upload_invoice(desired_name: Optional[str] = Form(None), invoice_file: UploadFile = File(...), current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    # 10 MB limit enforcement (optional)
    invoice_file.file.seek(0, os.SEEK_END)
    size = invoice_file.file.tell()
    invoice_file.file.seek(0)
    if size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    url = _upload_to_storage(user_id, invoice_file, bucket="salesinvoices", folder="salesinvoices", desired_name_no_ext=desired_name)
    return {"invoice_file_url": url}


class UploadInvoiceBase64(BaseModel):
    data_base64: str
    filename: Optional[str] = None  # e.g., "invoice.jpg"
    content_type: Optional[str] = None  # e.g., "image/jpeg"


@router.post("/upload-invoice-base64")
async def upload_invoice_base64(body: UploadInvoiceBase64, current_user=Depends(get_protected_user)):
    """
    Accepts base64-encoded invoice content (e.g., from camera capture) and stores it.
    Returns a public URL usable in /sales/batch.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    try:
        raw = body.data_base64
        # Strip possible data URL prefix
        if "," in raw and raw.strip().startswith("data:"):
            raw = raw.split(",", 1)[1]
        data = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")

    # Heuristic for extension/content type
    content_type = body.content_type or "application/octet-stream"
    ext = None
    if body.filename and "." in body.filename:
        ext = "." + body.filename.split(".")[-1]
    elif content_type.startswith("image/"):
        ext = "." + content_type.split("/", 1)[1]

    name_no_ext = (body.filename.split(".")[0] if body.filename else "invoice_camera")
    url = _upload_bytes_to_storage(user_id, data, content_type, desired_name_no_ext=name_no_ext, ext=ext or ".bin")
    return {"invoice_file_url": url}


@router.post("/batch", response_model=dict)
async def create_sale_batch(payload: BatchSaleRequest, current_user=Depends(get_protected_user)):
    """
    Creates one logical sale comprised of multiple items.
    Inserts one row per item into sales_master_log.
    Creates a corresponding payment record for 'paid' or 'partial'.
    """
    user_id = current_user.get("id") or current_user.get("user_id")

    # Log full payload
    try:
        payload_dump = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        print(f"DEBUG: /sales/batch received payload: {payload_dump}")
    except Exception as e:
        print(f"ERROR: Could not dump payload: {e!r}")

    # Resolve a valid employee_id and name based on original Streamlit logic
    employee_id, employee_name = _resolve_employee(
        user_id=user_id,
        requested_employee_id=payload.employee_id,
        requested_employee_name=payload.employee_name,
        current_user=current_user,
    )

    print(f"DEBUG: Sales batch - employee_id set to: {employee_id}, role: {current_user.get('role')}, payload.employee_id: {payload.employee_id}")

    # Use provided customer_name and customer_phone directly (no customer_id handling)
    customer_name = payload.customer_name
    customer_phone = payload.customer_phone
    print(f"DEBUG: Customer details -> name='{customer_name}', phone='{customer_phone}'")
    # Debug-only: check if any customer exists with that name for this user
    try:
        cchk = (supabase.table("customers").select("customer_id").eq("user_id", user_id).eq("name", customer_name).limit(1).execute())
        print(f"DEBUG: Customer lookup by name result count={(cchk.data and len(cchk.data)) or 0}; first={(cchk.data or [None])[0]}")
    except Exception as e:
        print(f"ERROR: Customer lookup failed: {e!r}")

    # Resolve and strictly validate that each item comes from inventory with a unique match
    for idx, it in enumerate(payload.items):
        inv = None
        try:
            # Prefer barcode when provided
            if getattr(it, "barcode", None):
                print(f"DEBUG: Item[{idx}] validating by barcode -> barcode={it.barcode}, warehouse={getattr(it, 'warehouse_name', None)}")
                inv = _lookup_item_by_barcode(user_id, it.barcode, getattr(it, "warehouse_name", None))
                print(f"DEBUG: Item[{idx}] barcode lookup inv={inv}")
                if not inv:
                    raise HTTPException(status_code=400, detail=f"Barcode '{it.barcode}' not found in inventory")
            elif getattr(it, "item_id", None) is not None:
                # Validate item_id exists (and warehouse if specified)
                print(f"DEBUG: Item[{idx}] validating by item_id -> item_id={it.item_id}, warehouse={getattr(it, 'warehouse_name', None)}")
                q = supabase.table("inventory_master_log")\
                            .select("item_id, item_name, price, warehouse_name")\
                            .eq("user_id", user_id)\
                            .eq("item_id", it.item_id)
                if getattr(it, "warehouse_name", None):
                    q = q.eq("warehouse_name", it.warehouse_name)
                inv_list = q.execute().data or []
                print(f"DEBUG: Item[{idx}] item_id lookup count={len(inv_list)}; first={inv_list[0] if inv_list else None}")
                if not inv_list:
                    # Fallback to canonical 'inventory' table which may hold the FK
                    try:
                        print("DEBUG: No match in inventory_master_log; trying 'inventory' table by id")
                        resp2 = (
                            supabase.table("inventory")
                            .select("id, name, price")
                            .eq("user_id", user_id)
                            .eq("id", it.item_id)
                            .limit(1)
                            .execute()
                        )
                        data2 = resp2.data or []
                        print(f"DEBUG: Inventory(id) fallback count={len(data2)}; first={data2[0] if data2 else None}")
                        if not data2:
                            raise HTTPException(status_code=400, detail=f"item_id '{it.item_id}' not found in inventory")
                        d0 = data2[0]
                        inv = {"item_id": d0.get("id"), "item_name": d0.get("name"), "price": d0.get("price"), "warehouse_name": getattr(it, "warehouse_name", None)}
                    except HTTPException:
                        raise
                    except Exception as e2:
                        print(f"ERROR: Fallback inventory by id failed: {e2!r}")
                        raise HTTPException(status_code=400, detail=f"item_id '{it.item_id}' not found in inventory")
                else:
                    inv = inv_list[0]
            else:
                # Resolve by item_name; must be unique
                print(f"DEBUG: Item[{idx}] validating by item_name -> item_name='{it.item_name}', warehouse={getattr(it, 'warehouse_name', None)}")
                q = supabase.table("inventory_master_log")\
                            .select("item_id, item_name, price, warehouse_name")\
                            .eq("user_id", user_id)\
                            .eq("item_name", it.item_name)
                if getattr(it, "warehouse_name", None):
                    q = q.eq("warehouse_name", it.warehouse_name)
                inv_list = q.execute().data or []
                print(f"DEBUG: Item[{idx}] name lookup count={len(inv_list)}; list={inv_list}")
                if not inv_list:
                    # Fallback to canonical 'inventory' by name
                    try:
                        print("DEBUG: No match in inventory_master_log; trying 'inventory' table by name")
                        resp2 = (
                            supabase.table("inventory")
                            .select("id, name, price")
                            .eq("user_id", user_id)
                            .eq("name", it.item_name)
                            .execute()
                        )
                        data2 = resp2.data or []
                        print(f"DEBUG: Inventory(name) fallback count={len(data2)}; first={data2[0] if data2 else None}")
                        if not data2:
                            raise HTTPException(status_code=400, detail=f"Item name '{it.item_name}' not found in inventory")
                        if len(data2) > 1:
                            raise HTTPException(status_code=400, detail=f"Item name '{it.item_name}' is not unique in inventory. Use item_id.")
                        d0 = data2[0]
                        inv = {"item_id": d0.get("id"), "item_name": d0.get("name"), "price": d0.get("price"), "warehouse_name": getattr(it, "warehouse_name", None)}
                    except HTTPException:
                        raise
                    except Exception as e2:
                        print(f"ERROR: Fallback inventory by name failed: {e2!r}")
                        raise HTTPException(status_code=400, detail=f"Item name '{it.item_name}' not found in inventory")
                else:
                    if len(inv_list) > 1:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Item name '{it.item_name}' is not unique in inventory. Specify warehouse_name or use barcode/item_id."
                        )
                    inv = inv_list[0]
        except HTTPException:
            raise
        except Exception as e:
            print(f"ERROR: Exception while validating item[{idx}]: {e!r}")
            raise

        # Fill item fields from inventory
        it.item_id = inv.get("item_id")
        it.item_name = inv.get("item_name", it.item_name)
        if (it.unit_price is None) or (it.unit_price == 0):
            it.unit_price = float(inv.get("price") or 0)
        print(f"DEBUG: Item[{idx}] resolved -> item_id={it.item_id}, item_name='{it.item_name}', unit_price={it.unit_price}")

    # Validate stock availability for all items BEFORE creating the sale
    print(f"\n=== STOCK VALIDATION ===")
    for idx, it in enumerate(payload.items):
        _check_stock_availability(
            user_id=user_id,
            item_id=it.item_id,
            requested_quantity=it.quantity,
            item_name=it.item_name
        )
    print(f"✓ All items have sufficient stock")
    print(f"========================\n")

    grand_total, vat_amount, discount_amount, final_total = _calc_totals(
        payload.items, payload.apply_vat, payload.vat_rate, payload.discount_type, payload.discount_value
    )
    print(f"DEBUG: Totals -> grand_total={grand_total}, vat_amount={vat_amount}, discount_amount={discount_amount}, final_total={final_total}")

    # Validate partial fields
    if payload.payment_status == "partial":
        if not payload.partial_payment_amount or payload.partial_payment_amount <= 0:
            raise HTTPException(status_code=400, detail="Partial payment amount must be provided and greater than zero.")
        if payload.partial_payment_amount > final_total:
            raise HTTPException(status_code=400, detail="Partial payment amount cannot exceed final total.")

    # Validate invoice requirement - compulsory unless MD overrides
    role = (current_user.get("role") or "").lower()
    if not payload.invoice_file_url:
        # Check if override is enabled
        if payload.invoice_override:
            # Only MD can use override
            if role != "md":
                raise HTTPException(status_code=403, detail="Only MD users can override invoice upload requirement.")
            print(f"DEBUG: Invoice override enabled by MD user")
        else:
            # Invoice is compulsory if override is not enabled
            raise HTTPException(status_code=400, detail="Invoice upload is compulsory. Please upload an invoice before saving the sale.")
    
    # Validate sale date - only MD can backdate
    if payload.sale_date:
        today = datetime.utcnow().date()
        if payload.sale_date < today and role != "md":
            raise HTTPException(status_code=403, detail="Only MD users can backdate sales. Employees must use today's date.")
        sale_date_date = payload.sale_date
    else:
        sale_date_date = datetime.utcnow().date()
    sale_date = sale_date_date.isoformat()
    created_at = datetime.utcnow().isoformat()

    # Normalize partial-payment amount once, re-used across item allocations and payment record
    effective_partial_amount = None
    if payload.payment_status == "partial":
        base_pp = payload.partial_payment_amount if payload.partial_payment_amount is not None else (payload.amount_customer_paid or 0.0)
        effective_partial_amount = max(min(base_pp, final_total), 0.0)

    sale_ids: List[Tuple[int, float]] = []
    # Distribute VAT and discount per item in a consistent manner:
    # - Use grand_total (sum of line totals) as the base to determine per-item proportion.
    # - Compute per-item VAT from the item's base amount (if apply_vat).
    # - Distribute discount_amount proportionally against each item's (base + item_vat) so totals sum to final_total.
    base_total = grand_total if grand_total > 0 else 0.0
    total_with_vat = (grand_total + vat_amount) if payload.apply_vat else grand_total
    for idx, it in enumerate(payload.items):
        item_base = float(it.total_amount or 0.0)
        proportion = (item_base / base_total) if base_total > 0 else 0.0

        # per-item VAT (based on item's base)
        item_vat_amount = (payload.vat_rate / 100.0) * item_base if payload.apply_vat else 0.0

        # per-item subtotal including VAT before discount
        item_subtotal_with_vat = item_base + item_vat_amount

        # allocate discount proportionally across items using the subtotal-with-vat basis
        item_discount = 0.0
        if discount_amount and total_with_vat > 0:
            item_discount = (item_subtotal_with_vat / total_with_vat) * discount_amount

        # final per-item total after VAT and discount
        item_final_total = max(item_subtotal_with_vat - item_discount, 0.0)

        # Determine how much of this item is considered paid depending on payment_status
        if payload.payment_status == "paid":
            item_paid = item_final_total
        elif payload.payment_status == "partial":
            total_due = final_total if final_total > 0 else 0.0
            part = effective_partial_amount or 0.0
            item_paid = round((part * item_final_total) / total_due, 2) if total_due > 0 else 0.0
        else:
            item_paid = 0.0

        item_balance = max(item_final_total - item_paid, 0.0)
        print(
            f"DEBUG: Item[{idx}] breakdown -> base={item_base}, vat={item_vat_amount}, subtotal_w_vat={item_subtotal_with_vat}, "
            f"discount_alloc={item_discount}, final={item_final_total}, paid={item_paid}, balance={item_balance}"
        )

        sale_data = {
            # Required actor/tenant linkage
            "employee_id": employee_id,
            "employee_name": employee_name,
            "created_by_user_id": user_id,  # who created this record
            "user_id": user_id,

            # Timestamps
            "sale_date": sale_date,
            "created_at": created_at,

            # Customer
            "customer_name": customer_name,
            "customer_phone": customer_phone,

            # Item
            "item_id": it.item_id,
            "item_name": it.item_name,
            "quantity": it.quantity,
            "unit_price": it.unit_price,

            # Totals
            "grand_total": final_total,
            "total_amount": item_final_total,
            "amount_paid": item_paid,
            "amount_balance": item_balance,
            "amount_customer_paid": payload.amount_customer_paid or 0.0,

            # Payment
            "payment_method": payload.payment_method,
            "payment_status": payload.payment_status,
            "payment_id": None,  # will be set after inserting into payments

            # Tax/discount
            "vat_amount": item_vat_amount,          # per-item VAT
            "discount_amount": item_discount,      # per-item discount
            "discount_percentage": (payload.discount_value if payload.discount_type == "Percentage" else 0.0),

            # Misc
            "sale_type": "sale",
            "scanned_payment_alert": None,
            "parsed_payment_info": None,
            "due_date": payload.due_date.isoformat() if payload.due_date else None,
            "invoice_number": payload.invoice_number,
            "invoice_file_url": payload.invoice_file_url,
            "notes": payload.notes,
        }
        # DEBUG: Log the exact sale payload before inserting into DB
        print(f"DEBUG: Sale data to be inserted -> {sale_data}")
        try:
            res = supabase.table("sales_master_log").insert(sale_data).execute()
            print(f"DEBUG: Supabase insert response (raw): {res}")
            print(f"DEBUG: Supabase insert response data: {(getattr(res, 'data', None))}")
            if not getattr(res, 'data', None):
                raise HTTPException(status_code=500, detail="Failed to insert sale record - no data returned.")
            sale_id = res.data[0]["sale_id"]
        except Exception as e:
            print(f"ERROR: Insert into sales_master_log failed: type={type(e).__name__}, err={e!r}")
            try:
                # Some Supabase clients include details in e.args
                print(f"ERROR: Insert exception args: {getattr(e, 'args', None)}")
            except Exception:
                pass
            error_msg = str(e)
            if "duplicate" in error_msg.lower():
                raise HTTPException(status_code=400, detail="Duplicate sale record detected.")
            elif "foreign key" in error_msg.lower():
                raise HTTPException(status_code=400, detail="Invalid reference to item or customer.")
            elif "null value" in error_msg.lower():
                raise HTTPException(status_code=400, detail="Missing required field in sale record.")
            else:
                raise HTTPException(status_code=500, detail=f"Database error: {error_msg}")
        sale_ids.append((sale_id, item_final_total))

        # Adjust inventory stock_out (increment by quantity)
        _adjust_inventory_stock_out(user_id, it.item_id, delta=(it.quantity or 0))

    # Create payment record(s) for paid or partial
    if payload.payment_status in ("paid", "partial", "credit"):
        # Use the first sale_id as reference for payment
        ref_sale_id = sale_ids[0][0] if sale_ids else None
        if ref_sale_id:
            if payload.payment_status == "paid":
                base_amount = payload.amount_customer_paid or final_total
                pay_amount = min(max(base_amount, 0.0), final_total)
                pay_date = datetime.utcnow().date().isoformat()
                pay_note = "Sale payment"
            elif payload.payment_status == "partial":
                pay_amount = effective_partial_amount or 0.0
                pay_date = (payload.partial_payment_date or datetime.utcnow().date()).isoformat()
                pay_note = payload.partial_payment_note or "Partial payment"
            else:  # credit
                pay_amount = 0.0
                pay_date = datetime.utcnow().date().isoformat()
                pay_note = "Credit sale"

            payment_row = {
                "user_id": user_id,
                "sale_log_id": ref_sale_id,
                "payment_date": pay_date,
                "amount": pay_amount,
                "payment_method": (payload.payment_method if payload.payment_status != "credit" else "none"),
                "notes": pay_note
            }
            print(f"DEBUG: Inserting payment row -> {payment_row}")
            try:
                pay_ins = supabase.table("payments").insert(payment_row).execute()
                print(f"DEBUG: Payment insert response data: {(getattr(pay_ins, 'data', None))}")
            except Exception as e:
                print(f"ERROR: Payment insert failed: type={type(e).__name__}, err={e!r}")
                raise
            try:
                pay_id = (pay_ins.data or [{}])[0].get("payment_id")
            except Exception:
                pay_id = None
            # Backfill payment_id on the first sale row if available
            if pay_id:
                print(f"DEBUG: Backfilling payment_id={pay_id} into sale_id={ref_sale_id}")
                supabase.table("sales_master_log").update({"payment_id": pay_id}).eq("sale_id", ref_sale_id).eq("user_id", user_id).execute()

    return {
        "msg": "Sale recorded successfully",
        "sale_ids": [sid for (sid, _) in sale_ids],
        "final_total": final_total,
        "vat_amount": vat_amount,
        "discount_amount": discount_amount
    }


@router.post("/batch-multipart")
async def create_sale_batch_multipart(
    employee_id: Optional[int] = Form(None),
    employee_name: Optional[str] = Form(None),
    sale_date: Optional[date] = Form(None),
    customer_name: str = Form(...),
    customer_phone: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    invoice_number: Optional[str] = Form(None),
    apply_vat: bool = Form(True),
    vat_rate: float = Form(7.5),
    discount_type: Literal["None", "Percentage", "Fixed Amount"] = Form("None"),
    discount_value: float = Form(0.0),
    payment_method: Literal["cash", "card", "transfer", "none"] = Form("cash"),
    payment_status: Literal["paid", "credit", "partial"] = Form("paid"),
    amount_customer_paid: float = Form(0.0),
    # Accept potentially empty strings from form for optional fields to avoid 422
    due_date: Optional[str] = Form(None),
    partial_payment_amount: Optional[str] = Form(None),
    partial_payment_date: Optional[str] = Form(None),
    partial_payment_note: Optional[str] = Form(None),
    items_json: str = Form(...),
    invoice_file: UploadFile = File(None),
    current_user=Depends(get_protected_user)
):
    """
    Multipart variant to support browser file uploads (camera/file) and JSON items.
    items_json should be a JSON array of SaleItem objects.
    Parses empty-string form values for optional fields into proper Nones.
    """
    try:
        print(f"DEBUG: /sales/batch-multipart received form fields: employee_id={employee_id}, employee_name={employee_name}, sale_date={sale_date}, customer_name={customer_name}")
        print(f"DEBUG: /sales/batch-multipart raw items_json: {items_json}")
        items_payload = json.loads(items_json)
        items = [SaleItem(**obj) for obj in items_payload]
        print(f"DEBUG: Parsed items count={len(items)}; first={items_payload[0] if items_payload else None}")
    except Exception as e:
        print(f"ERROR: Failed to parse items_json: {e!r}")
        raise HTTPException(status_code=400, detail="Invalid items_json")

    # Parse optional fields that may come as empty strings
    def _parse_date(s: Optional[str]) -> Optional[date]:
        if s is None:
            return None
        s2 = str(s).strip()
        if not s2:
            return None
        try:
            return date.fromisoformat(s2)
        except Exception:
            return None

    def _parse_float(s: Optional[str]) -> Optional[float]:
        if s is None:
            return None
        s2 = str(s).strip()
        if not s2:
            return None
        try:
            return float(s2)
        except Exception:
            return None

    due_date_val = _parse_date(due_date)
    partial_payment_amount_val = _parse_float(partial_payment_amount)
    partial_payment_date_val = _parse_date(partial_payment_date)

    invoice_url = None
    if invoice_file is not None:
        # enforce 10MB cap
        invoice_file.file.seek(0, os.SEEK_END)
        size = invoice_file.file.tell()
        invoice_file.file.seek(0)
        if size > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 10MB.")
        invoice_url = _upload_to_storage(current_user.get("id", current_user.get("user_id")), invoice_file, bucket="salesinvoices", folder="salesinvoices", desired_name_no_ext="invoice")

    payload = BatchSaleRequest(
        employee_id=employee_id,
        employee_name=employee_name,
        sale_date=sale_date,
        customer_name=customer_name,
        customer_phone=customer_phone,
        notes=notes,
        invoice_number=invoice_number,
        items=items,
        apply_vat=apply_vat,
        vat_rate=vat_rate,
        discount_type=discount_type,
        discount_value=discount_value,
        payment_method=payment_method,
        payment_status=payment_status,
        amount_customer_paid=amount_customer_paid,
        due_date=due_date_val,
        partial_payment_amount=partial_payment_amount_val,
        partial_payment_date=partial_payment_date_val,
        partial_payment_note=partial_payment_note,
        invoice_file_url=invoice_url,
    )
    return await create_sale_batch(payload, current_user)


@router.delete("/{sale_id}")
async def delete_sale(sale_id: int, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    # Fetch sale from history or log
    resp_log = supabase.table("sales_master_log").select("*").eq("sale_id", sale_id).eq("user_id", user_id).execute()
    resp_hist = supabase.table("sales_master_history").select("*").eq("sale_id", sale_id).eq("user_id", user_id).execute()

    sale_row = (resp_log.data or resp_hist.data or [])
    if not sale_row:
        raise HTTPException(status_code=404, detail="Sale not found")

    row = sale_row[0]
    # Adjust inventory: revert stock_out by quantity
    _adjust_inventory_stock_out(user_id, row.get("item_id"), delta=-(row.get("quantity") or 0))

    # Delete related payments by sale_id or sale_log_id
    supabase.table("payments").delete().eq("sale_id", sale_id).eq("user_id", user_id).execute()
    supabase.table("payments").delete().eq("sale_log_id", sale_id).eq("user_id", user_id).execute()

    # Delete from both tables if present
    supabase.table("sales_master_log").delete().eq("sale_id", sale_id).eq("user_id", user_id).execute()
    supabase.table("sales_master_history").delete().eq("sale_id", sale_id).eq("user_id", user_id).execute()

    return {"msg": "Sale deleted successfully"}


@router.delete("/expense/{expense_id}")
async def delete_expense(expense_id: int, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    # Fetch expense
    resp = supabase.table("expenses_master").select("*").eq("expense_id", expense_id).eq("user_id", user_id).execute()
    data = resp.data or []
    if not data:
        raise HTTPException(status_code=404, detail="Expense not found")

    # Delete related payments for expense
    supabase.table("payments").delete().eq("expense_id", expense_id).eq("user_id", user_id).execute()

    # Delete the expense record
    supabase.table("expenses_master").delete().eq("expense_id", expense_id).eq("user_id", user_id).execute()
    return {"msg": "Expense record deleted"}


# =========================
# Proforma Endpoints
# =========================
@router.post("/proforma")
async def create_proforma(payload: CreateProformaRequest, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    d = payload.date or datetime.utcnow().date()
    expiry = d + timedelta(days=7)

    # Resolve customer details from customer_id if provided
    customer_name = payload.customer_name
    customer_phone = payload.customer_phone
    if getattr(payload, "customer_id", None):
        cresp = supabase.table("customers").select("*").eq("user_id", user_id).eq("customer_id", payload.customer_id).limit(1).execute()
        cd = (cresp.data or [])
        if cd:
            c = cd[0]
            customer_name = c.get("customer_name") or c.get("name") or customer_name
            customer_phone = c.get("customer_phone") or c.get("phone_number") or c.get("phone") or customer_phone

    # Compute line totals and overall VAT/discount on the server
    items_enhanced: List[Dict[str, Any]] = []
    base_total = 0.0
    for it in payload.items:
        qty = int(it.quantity or 0)
        unit = float(it.unit_price or 0)
        line_total = qty * unit
        it.total_amount = line_total
        items_enhanced.append(it.dict())
        base_total += line_total

    vat_amount = (payload.vat_rate / 100.0) * base_total if payload.apply_vat else 0.0
    total_with_vat = base_total + vat_amount
    if payload.discount_type == "Percentage":
        discount_amount = (payload.discount_value / 100.0) * total_with_vat
    elif payload.discount_type == "Fixed Amount":
        discount_amount = float(payload.discount_value or 0.0)
    else:
        discount_amount = 0.0
    final_total = max(total_with_vat - discount_amount, 0.0)

    row = {
        "user_id": user_id,
        # Ensure employee_id is never null
        "employee_id": (payload.employee_id if payload.employee_id else 
                      (current_user.get("employee_id") if current_user.get("employee_id") else user_id)),
        "employee_name": payload.employee_name or current_user.get("username", "") or current_user.get("name", ""),
        "date": d.isoformat(),
        "customer_id": payload.customer_id,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "grand_total": final_total,
        "status": "pending",
        "expiry_date": expiry.isoformat(),
        "items": items_enhanced,
        "notes": payload.notes,
        "vat_amount": vat_amount,
        "discount_amount": discount_amount,
    }
    res = supabase.table("proforma_invoices").insert(row).execute()
    prof = res.data[0]
    return {"proforma_id": prof["proforma_id"], "expiry_date": prof["expiry_date"]}


@router.get("/proforma/pending")
async def list_pending_proformas(customer_name: Optional[str] = None, customer_id: Optional[int] = None, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    q = supabase.table("proforma_invoices").select("*").eq("user_id", user_id).eq("status", "pending")
    if customer_id is not None:
        q = q.eq("customer_id", customer_id)
    if customer_name:
        q = q.eq("customer_name", customer_name)
    res = q.order("date", desc=True).execute()
    return res.data or []


@router.get("/proforma/all")
async def list_all_proformas(current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    res = supabase.table("proforma_invoices").select("*").eq("user_id", user_id).order("date", desc=True).execute()
    return res.data or []


@router.post("/proforma/{proforma_id}/upload-invoice")
async def proforma_upload_invoice(proforma_id: int, invoice_file: UploadFile = File(...), current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    
    print(f"\n=== UPLOAD INVOICE DEBUG ===")
    print(f"Proforma ID: {proforma_id}")
    print(f"User ID: {user_id}")
    
    # Check if invoice already exists for this proforma
    proforma_check = supabase.table("proforma_invoices").select("invoice_url").eq("proforma_id", proforma_id).eq("user_id", user_id).limit(1).execute()
    if proforma_check.data and proforma_check.data[0].get("invoice_url"):
        existing_url = proforma_check.data[0].get("invoice_url")
        print(f"Invoice already exists: {existing_url}")
        raise HTTPException(
            status_code=400,
            detail="Invoice already uploaded for this proforma. Delete the existing invoice first if you want to replace it."
        )
    
    print(f"Uploading invoice file: {invoice_file.filename}")
    url = _upload_to_storage(user_id, invoice_file, bucket="salesinvoices", folder="salesinvoices", desired_name_no_ext=f"proforma_{proforma_id}")
    print(f"Upload successful: {url}")
    
    supabase.table("proforma_invoices").update({"invoice_url": url}).eq("proforma_id", proforma_id).eq("user_id", user_id).execute()
    print(f"================================\n")
    
    return {"invoice_url": url}


@router.post("/proforma/{proforma_id}/convert")
async def convert_proforma(proforma_id: int, current_user=Depends(get_protected_user)):
    """
    Converts a pending proforma into paid sales entries.
    Requires that an invoice_url already exists for the proforma.
    Validates employee_id before conversion.
    Prevents duplicate conversions.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    
    print(f"\n=== PROFORMA CONVERSION DEBUG ===")
    print(f"Converting Proforma for User: {user_id}")
    print(f"Proforma ID: {proforma_id}")
    print(f"Current User Data: {current_user}")
    
    # Step 0: Check if this proforma has already been converted
    print(f"\n--- Checking for duplicate conversion ---")
    existing_sales = supabase.table("sales_master_log").select("sale_id").eq("user_id", user_id).eq("proforma_id", proforma_id).limit(1).execute()
    if existing_sales.data:
        print(f"ERROR: Proforma {proforma_id} has already been converted (sale_id: {existing_sales.data[0]['sale_id']})")
        raise HTTPException(
            status_code=400,
            detail="This proforma has already been converted to sales. Check the Sales List for the converted records."
        )
    
    # Fetch proforma
    res = supabase.table("proforma_invoices").select("*").eq("proforma_id", proforma_id).eq("user_id", user_id).limit(1).execute()
    d = (res.data or [])
    if not d:
        print(f"ERROR: Proforma {proforma_id} not found for user {user_id}")
        raise HTTPException(status_code=404, detail="Proforma not found")
    p = d[0]
    
    print(f"Proforma Data: customer={p.get('customer_name')}, employee_id={p.get('employee_id')}, employee_name={p.get('employee_name')}")

    if not p.get("invoice_url"):
        print(f"ERROR: No invoice_url for proforma {proforma_id}")
        raise HTTPException(status_code=400, detail="Upload invoice for this proforma before conversion.")
    
    print(f"Invoice URL: {p.get('invoice_url')}")

    # Step 1: Validate user_id exists in auth.users
    print(f"\n--- Validating user_id in auth.users ---")
    try:
        auth_user_check = supabase.table("users").select("id").eq("id", user_id).limit(1).execute()
        if not auth_user_check.data:
            print(f"ERROR: User {user_id} not found in auth.users table")
            raise HTTPException(
                status_code=400, 
                detail="User account not found. Please contact support."
            )
        print(f"✓ User {user_id} exists in auth.users")
    except Exception as e:
        print(f"WARNING: Could not validate user in auth.users: {e}")
        # Continue anyway as this might be a permission issue
    
    # Step 2: Resolve and validate employee_id
    print(f"\n--- Resolving employee_id ---")
    try:
        employee_id, employee_name = _resolve_employee(
            user_id=user_id,
            requested_employee_id=p.get("employee_id"),
            requested_employee_name=p.get("employee_name"),
            current_user=current_user
        )
        print(f"✓ Resolved Employee ID: {employee_id}, Name: {employee_name}")
    except HTTPException as he:
        # Re-raise with friendly message
        print(f"ERROR: Employee resolution failed: {he.detail}")
        if "Create an employee profile" in he.detail or "No employee record" in he.detail:
            raise HTTPException(
                status_code=400,
                detail="Create employee profile for this user before converting Proforma. Go to Settings > Employees to add your employee record."
            )
        raise
    except Exception as e:
        print(f"ERROR: Unexpected error resolving employee: {e}")
        raise HTTPException(
            status_code=400,
            detail="Create employee profile for this user before converting Proforma. Go to Settings > Employees to add your employee record."
        )
    
    # Step 3: Validate employee_id exists in employees table
    print(f"\n--- Validating employee_id in employees table ---")
    employee_check = supabase.table("employees").select("employee_id, name").eq("employee_id", employee_id).eq("user_id", user_id).limit(1).execute()
    if not employee_check.data:
        print(f"ERROR: Employee ID {employee_id} not found in employees table for user {user_id}")
        raise HTTPException(
            status_code=400,
            detail="Create employee profile for this user before converting Proforma. Go to Settings > Employees to add your employee record."
        )
    print(f"✓ Employee {employee_id} exists in employees table: {employee_check.data[0]}")
    
    # Step 4: Validate employee_id is not NULL
    if employee_id is None:
        print(f"ERROR: employee_id is NULL after resolution")
        raise HTTPException(
            status_code=400,
            detail="Create employee profile for this user before converting Proforma. Go to Settings > Employees to add your employee record."
        )
    
    print(f"\n--- Starting conversion with validated Employee: {employee_id} ---")

    items = p.get("items") or []
    sale_ids = []
    inventory_updates = []  # Track inventory updates for response
    
    print(f"Converting {len(items)} items to sales...")
    
    for idx, it in enumerate(items, 1):
        item_paid = float(it.get("total_amount") or 0.0)
        item_balance = 0.0
        
        print(f"  Item {idx}: {it.get('item_name')} (ID: {it.get('item_id')}, Qty: {it.get('quantity')})")
        
        row = {
            # Linkage - NEVER NULL
            "employee_id": employee_id,  # Validated employee_id
            "employee_name": employee_name,  # Validated employee_name
            "created_by_user_id": user_id,
            "user_id": user_id,
            "proforma_id": proforma_id,  # Track which proforma this came from

            # Timing
            "sale_date": p.get("date"),
            "created_at": datetime.utcnow().isoformat(),

            # Customer
            "customer_name": p.get("customer_name"),
            "customer_phone": p.get("customer_phone"),

            # Item
            "item_id": it.get("item_id"),
            "item_name": it.get("item_name"),
            "quantity": it.get("quantity"),
            "unit_price": it.get("unit_price"),

            # Totals
            "grand_total": p.get("grand_total"),
            "vat_amount": p.get("vat_amount", 0),
            "discount_amount": p.get("discount_amount", 0),
            "discount_percentage": 0.0,
            "total_amount": it.get("total_amount"),
            "amount_paid": item_paid,
            "amount_balance": item_balance,
            "amount_customer_paid": p.get("grand_total", 0.0),

            # Payment
            "payment_method": "cash",
            "payment_status": "paid",
            "payment_id": None,

            # Misc
            "due_date": None,
            "invoice_number": None,
            "invoice_file_url": p.get("invoice_url"),
            "sale_type": "sale",
            "scanned_payment_alert": None,
            "parsed_payment_info": None,
            "notes": p.get("notes"),
        }
        # Final validation before insert
        if row["employee_id"] is None:
            print(f"ERROR: Attempted to insert sale with NULL employee_id for item {idx}")
            raise HTTPException(
                status_code=400,
                detail="Employee ID cannot be NULL. Please create employee profile first."
            )
        
        print(f"  Inserting sale record with employee_id={row['employee_id']}...")
        ins = supabase.table("sales_master_log").insert(row).execute()
        sid = ins.data[0]["sale_id"]
        sale_ids.append(sid)
        print(f"  ✓ Created sale_id: {sid}")

        # Update inventory for this sale item
        print(f"  Updating inventory for item_id={it.get('item_id')}, quantity={it.get('quantity')}")
        inventory_result = _update_inventory_for_sale(
            user_id=user_id,
            item_id=it.get("item_id"),
            quantity=int(it.get("quantity") or 0),
            warehouse_name=it.get("warehouse_name")
        )
        
        # Track inventory update with item details (including errors)
        update_info = {
            'item_name': it.get('item_name'),
            'item_id': it.get('item_id'),
            'quantity': it.get('quantity'),
            'action': inventory_result.get('action'),
            'stock_out': inventory_result.get('stock_out', 0)
        }
        
        # Include error message if failed
        if inventory_result.get('action') == 'failed' and inventory_result.get('error'):
            update_info['error'] = inventory_result.get('error')
        
        inventory_updates.append(update_info)

    # Mark proforma as converted (don't delete, update status)
    print(f"\n--- Marking proforma as converted ---")
    supabase.table("proforma_invoices").update({"status": "converted"}).eq("proforma_id", proforma_id).eq("user_id", user_id).execute()
    
    print(f"\n=== CONVERSION COMPLETE ===")
    print(f"Proforma {proforma_id} converted to {len(sale_ids)} sales entries")
    print(f"Sale IDs: {sale_ids}")
    print(f"Employee: {employee_id} - {employee_name}")
    print(f"Inventory Updates: {inventory_updates}")
    print(f"================================\n")
    
    return {
        "msg": f"Proforma {proforma_id} converted to {len(sale_ids)} sales entries.",
        "sale_ids": sale_ids,
        "inventory_updates": inventory_updates,
        "items_count": len(items),
        "employee_name": employee_name
    }


@router.delete("/proforma/{proforma_id}")
async def delete_proforma(proforma_id: int, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    supabase.table("proforma_invoices").delete().eq("proforma_id", proforma_id).eq("user_id", user_id).execute()
    return {"msg": "Proforma deleted"}


@router.post("/proforma/pdf")
async def generate_proforma_pdf(
    data: dict = Body(...),
    current_user=Depends(get_protected_user)
):
    """
    Generate PDF for a proforma invoice.
    Expects: {"proforma_id": int, "format": "A4" or "THERMAL"}
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    
    try:
        proforma_id = data.get("proforma_id")
        pdf_format = data.get("format", "A4")
        
        if not proforma_id:
            raise HTTPException(status_code=422, detail="proforma_id is required")
        
        print(f"DEBUG: Generating proforma PDF for proforma_id={proforma_id}, format={pdf_format}")
        
        # Fetch proforma invoice
        res = supabase.table("proforma_invoices").select("*").eq("proforma_id", proforma_id).eq("user_id", user_id).limit(1).execute()
        d = (res.data or [])
        if not d:
            raise HTTPException(status_code=404, detail="Proforma not found")
        
        proforma = d[0]
        items = proforma.get("items") or []
        
        if not items:
            raise HTTPException(status_code=404, detail="No items found in this proforma")
        
        customer_name = proforma.get("customer_name", "Unknown Customer")
        date_str = proforma.get("date", datetime.utcnow().date().isoformat())
        
        print(f"DEBUG: Found proforma with {len(items)} items for customer '{customer_name}'")
        
        # Get company info
        company = _company_info(user_id)
        print(f"DEBUG: Company info: {company.get('tenant_name', 'No name')}")
        
        # Generate PDF
        format_type = "THERMAL" if pdf_format == "THERMAL" else "A4"
        print(f"DEBUG: Generating PDF in {format_type} format")
        pdf_bytes = _build_pdf(company, customer_name, date_str, items, format_type)
        
        if not pdf_bytes:
            raise HTTPException(status_code=500, detail="PDF generation returned empty bytes")
        
        print(f"DEBUG: PDF generated successfully, size: {len(pdf_bytes)} bytes")
        
        # Encode to base64
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
        print(f"DEBUG: Base64 encoded, length: {len(pdf_base64)}")
        
        return {"pdf_base64": pdf_base64}
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"ERROR: Proforma PDF generation failed: {e}")
        print(f"ERROR: Exception type: {type(e)}")
        import traceback
        print(f"ERROR: Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF proforma: {str(e)}")


# =========================
# Search across transactions
# =========================
@router.post("/search")
async def search_transactions(body: SearchQuery, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    term = (body.q or "").strip()
    print(f"DEBUG: Search called with term='{term}', user_id={user_id}")
    if not term:
        print("DEBUG: Empty search term, returning empty array")
        return []

    # Fetch recent slices and filter in Python for flexibility (to match Streamlit behavior)
    try:
        def fetch_table(tbl: str) -> List[Dict[str, Any]]:
            print(f"DEBUG: Fetching from table '{tbl}' for user_id={user_id}")
            try:
                # Try with created_at first
                sel = supabase.table(tbl).select("*").eq("user_id", user_id).order("created_at", desc=True).limit(body.limit).execute()
            except Exception as e:
                print(f"DEBUG: created_at not found in {tbl}, trying alternative ordering")
                # Fallback ordering for tables without created_at
                if tbl == "expenses_master":
                    sel = supabase.table(tbl).select("*").eq("user_id", user_id).order("expense_date", desc=True).limit(body.limit).execute()
                elif tbl == "goods_bought_history":
                    sel = supabase.table(tbl).select("*").eq("user_id", user_id).order("purchase_date", desc=True).limit(body.limit).execute()
                elif tbl == "payments":
                    sel = supabase.table(tbl).select("*").eq("user_id", user_id).order("payment_date", desc=True).limit(body.limit).execute()
                else:
                    # No ordering as fallback
                    sel = supabase.table(tbl).select("*").eq("user_id", user_id).limit(body.limit).execute()
            
            data = sel.data or []
            print(f"DEBUG: Found {len(data)} records in {tbl}")
            return data

        sales = fetch_table("sales_master_history") + fetch_table("sales_master_log")
        expenses = fetch_table("expenses_master")
        restock = fetch_table("goods_bought_history")
        payments = fetch_table("payments")
        
        print(f"DEBUG: Total records - sales: {len(sales)}, expenses: {len(expenses)}, restock: {len(restock)}, payments: {len(payments)}")

        import re
        pat = re.compile(re.escape(term), re.IGNORECASE)

        def matches(row: Dict[str, Any]) -> bool:
            for v in row.values():
                if v is None:
                    continue
                if isinstance(v, (int, float)):
                    if pat.search(str(v)):
                        return True
                elif isinstance(v, str):
                    if pat.search(v):
                        return True
            return False

        out: List[Dict[str, Any]] = []
        for r in sales:
            if matches(r):
                r2 = dict(r)
                r2["source"] = "Sales"
                # Ensure item_name is not null for sales records
                if not r2.get('item_name'):
                    r2['item_name'] = r2.get('product_name') or r2.get('name') or 'Unknown Item'
                out.append(r2)
        for r in expenses:
            if matches(r):
                r2 = dict(r)
                r2["source"] = "Expenses"
                out.append(r2)
        for r in restock:
            if matches(r):
                r2 = dict(r)
                r2["source"] = "Restock"
                # Ensure item_name is not null for restock records  
                if not r2.get('item_name'):
                    r2['item_name'] = r2.get('product_name') or r2.get('name') or 'Unknown Item'
                out.append(r2)
        for r in payments:
            if matches(r):
                r2 = dict(r)
                r2["source"] = "Payments"
                out.append(r2)

        print(f"DEBUG: Search completed - found {len(out)} matching records")
        return out[: body.limit]
        
    except Exception as e:
        print(f"ERROR: Search failed: {e}")
        import traceback
        print(f"ERROR: Search traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


# =========================
# Payments updates (partial / credit handling)
# =========================
def _update_payment_status(table_name: str, id_column: str, record_id: int, user_id: int) -> str:
    # Sum payments related to the record
    psel = supabase.table("payments").select("amount").eq(id_column, record_id).eq("user_id", user_id).execute()
    total_paid = sum((p.get("amount") or 0.0) for p in (psel.data or []))

    # Fetch record and determine total amount field
    if table_name == "expenses_master":
        r = supabase.table('expenses_master').select("total_amount, payment_status").eq("user_id", user_id).eq(id_column, record_id).single().execute().data or {}
        total_amount = float(r.get("total_amount") or 0.0)
    elif table_name == "sales_master_history":
        r = supabase.table('sales_master_history').select("total_amount, payment_status").eq("user_id", user_id).eq(id_column, record_id).single().execute().data or {}
        total_amount = float(r.get("total_amount") or 0.0)
    elif table_name == "goods_bought_history":
        r = supabase.table('goods_bought_history').select("total_cost, payment_status").eq("user_id", user_id).eq(id_column, record_id).single().execute().data or {}
        total_amount = float(r.get("total_cost") or 0.0)
    else:
        return "unknown"

    outstanding = max(total_amount - total_paid, 0.0)
    current_status = r.get("payment_status", "credit")

    if total_paid >= total_amount:
        new_status = "paid"
    elif total_paid > 0:
        new_status = "partial"
    else:
        new_status = current_status if current_status in ("credit", "partial") else "credit"

    supabase.table(table_name).update({
        "payment_status": new_status,
        "amount_paid": total_paid,
        "amount_balance": outstanding
    }).eq(id_column, record_id).eq("user_id", user_id).execute()

    return new_status


@router.post("/payments")
async def add_payment(payload: PaymentUpdateRequest, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    today = (payload.transaction_date or datetime.utcnow().date()).isoformat()
    pay_row = {
        "user_id": user_id,
        "amount": float(payload.amount),
        "payment_method": payload.payment_method,
        "notes": payload.notes or "",
        "payment_date": today,
    }

    table_name = None
    id_column = None
    if payload.transaction_type == "sale":
        table_name = "sales_master_history"
        id_column = "sale_id"
        pay_row["sale_id"] = payload.record_id
    elif payload.transaction_type == "purchase":
        table_name = "goods_bought_history"
        id_column = "purchase_id"
        pay_row["purchase_id"] = payload.record_id
    elif payload.transaction_type == "expense":
        table_name = "expenses_master"
        id_column = "expense_id"
        pay_row["expense_id"] = payload.record_id

    if not table_name:
        raise HTTPException(status_code=400, detail="Invalid transaction_type")

    supabase.table("payments").insert(pay_row).execute()
    new_status = _update_payment_status(table_name, id_column, payload.record_id, user_id)
    return {"msg": "Payment recorded", "new_status": new_status}


@router.get("/pending")
async def pending_transactions(current_user=Depends(get_protected_user)):
    """
    Combined list of transactions with payment_status in ['partial', 'credit']
    across sales, purchases, and expenses for the current user.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    sales = supabase.table("sales_master_history").select("*").eq("user_id", user_id).in_("payment_status", ["partial", "credit"]).execute().data or []
    purchases = supabase.table("goods_bought_history").select("*").eq("user_id", user_id).in_("payment_status", ["partial", "credit"]).execute().data or []
    expenses = supabase.table("expenses_master").select("*").eq("user_id", user_id).in_("payment_status", ["partial", "credit"]).execute().data or []
    return sales + purchases + expenses


# =========================
# Receipts: PDF and Email
# =========================
@router.post("/receipt/pdf")
async def generate_receipt_pdf(
    customer_name: Optional[str] = Form(None),
    date_raw: Optional[str] = Form(None),
    pdf_format: Optional[str] = Form(None),
    data: dict = Body(None),
    current_user=Depends(get_protected_user)
):
    user_id = current_user.get("id") or current_user.get("user_id")
    
    try:
        # ✅ Accept fallback JSON if FormData is missing
        if (not customer_name or not date_raw):
            if data:
                customer_name = data.get("customer_name")
                date_raw = data.get("date_raw")
                pdf_format = data.get("pdf_format", "A4")
                print(f"DEBUG: Using JSON body fallback - customer_name={customer_name!r} date_raw={date_raw!r} pdf_format={pdf_format!r}")
        
        if not customer_name or not date_raw:
            raise HTTPException(status_code=422, detail="Customer name and date are required")
        
        # Set default pdf_format if still None
        if not pdf_format:
            pdf_format = "A4"
        
        # Parse incoming payload
        from datetime import datetime
        print(f"DEBUG: /sales/receipt/pdf payload customer_name={customer_name!r} date_raw={date_raw!r} pdf_format={pdf_format!r}")

        # Normalize and validate date, allow ISO datetime strings (e.g., 2025-10-24T00:00:00Z)
        ds = str(date_raw).strip().replace('Z', '')
        if 'T' in ds:
            ds = ds.split('T', 1)[0]
        ds = ds.replace('/', '-')
        try:
            sale_date = datetime.strptime(ds, "%Y-%m-%d").date()
        except ValueError:
            print(f"ERROR: Invalid date format received: {date_raw!r} -> normalized {ds!r}")
            raise HTTPException(status_code=400, detail=f"Invalid date format. Use YYYY-MM-DD (got {date_raw})")
        
        print(f"DEBUG: Generating receipt PDF for customer='{customer_name}', date='{sale_date}', user_id={user_id}")
        
        # Get sales data
        items = _grouped_sales_for(user_id, customer_name, sale_date)
        print(f"DEBUG: Found {len(items)} items for receipt")
        
        if not items:
            raise HTTPException(status_code=404, detail=f"No matching sales found for customer '{customer_name}' on date '{sale_date}'.")
        
        # Get company info
        company = _company_info(user_id)
        print(f"DEBUG: Company info: {company.get('tenant_name', 'No name')}")
        
        # Generate PDF
        format_type = "THERMAL" if (pdf_format == "THERMAL") else "A4"
        print(f"DEBUG: Generating PDF in {format_type} format")
        pdf_bytes = _build_pdf(company, customer_name, sale_date.isoformat(), items, format_type)
        
        if not pdf_bytes:
            raise HTTPException(status_code=500, detail="PDF generation returned empty bytes")
        
        print(f"DEBUG: PDF generated successfully, size: {len(pdf_bytes)} bytes")
        
        # Encode to base64
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
        print(f"DEBUG: Base64 encoded, length: {len(pdf_base64)}")
        
        return {"pdf_base64": pdf_base64}
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"ERROR: Receipt PDF generation failed: {e}")
        print(f"ERROR: Exception type: {type(e)}")
        import traceback
        print(f"ERROR: Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF receipt: {str(e)}")


@router.post("/receipt/pdf-grouped")
async def generate_receipt_pdf_from_grouped(items: List[Dict[str, Any]] = Body(...), customer_name: str = Body(...), sale_date: str = Body(...), pdf_format: Literal["A4", "THERMAL"] = Body("A4"), current_user=Depends(get_protected_user)):
    """
    Generate receipt PDF from pre-grouped sales data (for date filtering functionality).
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    
    try:
        print(f"DEBUG: Generating receipt PDF from grouped data for customer='{customer_name}', date='{sale_date}'")
        print(f"DEBUG: Received {len(items)} items for receipt")
        
        if not items:
            raise HTTPException(status_code=404, detail=f"No sales items provided for receipt generation.")
        
        # Get company info
        company = _company_info(user_id)
        print(f"DEBUG: Company info: {company.get('tenant_name', 'No name')}")
        
        # Generate PDF
        format_type = "THERMAL" if pdf_format == "THERMAL" else "A4"
        print(f"DEBUG: Generating PDF in {format_type} format")
        pdf_bytes = _build_pdf(company, customer_name, sale_date, items, format_type)
        
        if not pdf_bytes:
            raise HTTPException(status_code=500, detail="PDF generation returned empty bytes")
        
        print(f"DEBUG: PDF generated successfully, size: {len(pdf_bytes)} bytes")
        
        # Encode to base64
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
        print(f"DEBUG: Base64 encoded, length: {len(pdf_base64)}")
        
        return {"pdf_base64": pdf_base64}
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"ERROR: Receipt PDF generation failed: {e}")
        print(f"ERROR: Exception type: {type(e)}")
        import traceback
        print(f"ERROR: Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF receipt: {str(e)}")


@router.post("/receipt/email")
async def send_receipt_email(req: SendReceiptEmailRequest, current_user=Depends(get_protected_user)):
    user_id = current_user.get("id") or current_user.get("user_id")
    items = _grouped_sales_for(user_id, req.customer_name, req.sale_date)
    if not items:
        raise HTTPException(status_code=404, detail="No matching sales found for the given customer and date.")
    company = _company_info(user_id)

    fmt = "THERMAL" if req.pdf_format == "THERMAL" else "A4"
    pdf_bytes = _build_pdf(company, req.customer_name, req.sale_date.isoformat(), items, fmt)
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    filename = f"receipt_{req.sale_date.isoformat()}.pdf"
    subject = f"Receipt for Sale on {req.sale_date.isoformat()}"
    # Build items HTML like original
    items_html = ""
    total_amount = sum(float(it.get('total_amount', 0) or 0) for it in items)
    
    for it in items:
        items_html += f"""
        <p>
            <b>{it.get('item_name', 'Unknown Item')}</b> — Qty: {it.get('quantity', 0)}, Unit: ₦{float(it.get('unit_price', 0) or 0):,.2f}, Total: ₦{float(it.get('total_amount', 0) or 0):,.2f}
        </p>"""

    html = f"""
    <p>Dear {req.customer_name},</p>
    <p>Thank you for your purchase! Please find your receipt attached below.</p>
    <h4>Items Purchased:</h4>
    {items_html}
    <p><b>Total:</b> ₦{total_amount:,.2f}</p>
    <p>Best regards,<br/>{company.get('tenant_name') or 'PriscomSales'} Team</p>
    """

    await _send_email_with_attachment_brevo(req.customer_email, subject, html, filename, pdf_b64)
    return {"msg": f"Receipt sent to {req.customer_email}"}
# --- Sales: Extra endpoints to fully cover 9_Sales Streamlit features (reports + company details) ---

from typing import DefaultDict

# =========================
# Sales Summary Report (parity with Streamlit tab5)
# =========================
@router.get("/reports/summary", dependencies=[Depends(require_permission("sales.report_tab.access"))])
async def sales_summary_report(
    start_date: date,
    end_date: date,
    limit: int = 10,
    current_user=Depends(get_protected_user)
):
    """
    Compute sales summary metrics and breakdowns between start_date and end_date (inclusive),
    mirroring the analytics shown in the 9_Sales.py report tab.

    Returns:
      - totals: total_sales, total_paid, total_credit, total_expenses, expenses_paid, expenses_credit, profit
      - payment_method_summary: totals by payment method (cash/card/transfer if present)
      - timeseries: daily totals for sales
      - top_products: by quantity and amount
      - low_selling_products: by quantity (ascending)
      - top_customers: by total spent and count
      - credit_sales: sales with amount_paid == 0 (limit)
      - partial_sales: 0 < amount_paid < total_amount (limit)
      - unpaid_expenses: expenses with amount_paid < total_amount (limit)
    """
    user_id = current_user.get("id") or current_user.get("user_id")

    # Fetch sales history in date range
    sresp = (
        supabase.table("sales_master_log")
        .select("*")
        .eq("user_id", user_id)
        .gte("sale_date", start_date.isoformat())
        .lte("sale_date", end_date.isoformat())
        .order("sale_date", desc=True)
        .execute()
    )
    sales = sresp.data or []

    # Normalize numeric fields
    def _f(x): 
        try:
            return float(x or 0)
        except Exception:
            return 0.0

    # Totals for sales
    total_sales = 0.0
    total_paid = 0.0
    total_credit = 0.0

    # Payment method summary
    method_map: DefaultDict[str, float] = DefaultDict(float)

    # Timeseries sum by date
    ts_map: DefaultDict[str, float] = DefaultDict(float)

    # Top products (by item_name)
    prod_qty: DefaultDict[str, float] = DefaultDict(float)
    prod_amt: DefaultDict[str, float] = DefaultDict(float)
    prod_count: DefaultDict[str, int] = DefaultDict(int)

    # Top customers
    cust_amt: DefaultDict[str, float] = DefaultDict(float)
    cust_count: DefaultDict[str, int] = DefaultDict(int)

    credit_sales_list = []
    partial_sales_list = []

    for r in sales:
        amt = _f(r.get("total_amount"))
        paid = _f(r.get("amount_paid"))
        total_sales += amt
        total_paid += paid
        total_credit += max(amt - paid, 0.0)

        m = (r.get("payment_method") or "").lower()
        if m:
            method_map[m] += amt

        sd = r.get("sale_date")
        if sd:
            ts_map[sd] += amt

        item = r.get("item_name") or ""
        qty = _f(r.get("quantity"))
        prod_qty[item] += qty
        prod_amt[item] += amt
        prod_count[item] += 1

        cust = r.get("customer_name") or "Walk-in"
        cust_amt[cust] += amt
        cust_count[cust] += 1

        if paid == 0:
            if len(credit_sales_list) < limit:
                credit_sales_list.append(r)
        elif paid > 0 and paid < amt:
            if len(partial_sales_list) < limit:
                partial_sales_list.append(r)

    # Expenses in date range
    eresp = (
        supabase.table("expenses_master")
        .select("*")
        .eq("user_id", user_id)
        .gte("expense_date", start_date.isoformat())
        .lte("expense_date", end_date.isoformat())
        .order("expense_date", desc=True)
        .execute()
    )
    expenses = eresp.data or []

    total_expenses = 0.0
    expenses_paid = 0.0
    expenses_credit = 0.0
    unpaid_expenses_list = []

    for e in expenses:
        t = _f(e.get("total_amount"))
        p = _f(e.get("amount_paid"))
        total_expenses += t
        expenses_paid += p
        expenses_credit += max(t - p, 0.0)
        if p < t and len(unpaid_expenses_list) < limit:
            unpaid_expenses_list.append(e)

    profit = total_sales - total_expenses

    # Build method summary for common ones first (card/transfer/cash), plus any extras
    common_methods = ["card", "transfer", "cash"]
    method_summary = []
    for cm in common_methods:
        if cm in method_map:
            method_summary.append({"payment_method": cm, "total_sales": method_map[cm]})
    # Add other methods encountered
    for k, v in method_map.items():
        if k not in common_methods:
            method_summary.append({"payment_method": k, "total_sales": v})
    method_summary.sort(key=lambda x: -x["total_sales"])

    # Timeseries array sorted ascending by date
    timeseries = [{"sale_date": d, "total_sales": v} for d, v in ts_map.items()]
    timeseries.sort(key=lambda x: x["sale_date"])

    # Top products
    top_products = []
    for item, qty_sum in prod_qty.items():
        top_products.append({
            "item_name": item,
            "quantity_sold": qty_sum,
            "total_sales": prod_amt.get(item, 0.0),
            "sales_count": prod_count.get(item, 0),
        })
    top_products.sort(key=lambda x: (-x["quantity_sold"], -x["total_sales"]))
    top_products = top_products[:max(1, limit)]

    # Low selling products (by quantity ASC)
    low_selling_products = list(top_products)  # start from computed list
    low_selling_products.sort(key=lambda x: (x["quantity_sold"], x["total_sales"]))
    low_selling_products = low_selling_products[:max(1, limit)]

    # Top customers
    top_customers = []
    for cust, amt_sum in cust_amt.items():
        top_customers.append({
            "customer_name": cust,
            "total_spent": amt_sum,
            "purchases": cust_count.get(cust, 0),
        })
    top_customers.sort(key=lambda x: (-x["total_spent"], -x["purchases"]))
    top_customers = top_customers[:max(1, limit)]

    return {
        "totals": {
            "total_sales": total_sales,
            "total_paid": total_paid,
            "total_credit": total_credit,
            "total_expenses": total_expenses,
            "expenses_paid": expenses_paid,
            "expenses_credit": expenses_credit,
            "profit": profit,
        },
        "payment_method_summary": method_summary,
        "timeseries": timeseries,
        "top_products": top_products,
        "low_selling_products": low_selling_products,
        "top_customers": top_customers,
        "credit_sales": credit_sales_list,
        "partial_sales": partial_sales_list,
        "unpaid_expenses": unpaid_expenses_list,
    }


# =========================
# Company Details + Logo upload (parity with receipt customization in Streamlit)
# =========================
@router.get("/company")
async def get_company_details(current_user=Depends(get_protected_user)):
    """
    Get company/tenant info used for receipts:
    tenant_name, account_number, bank_name, account_name, phone_number, address, logo_url.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    company_info = _company_info(user_id)
    return company_info


@router.put("/company")
async def update_company_details(
    tenant_name: Optional[str] = Body(None),
    account_number: Optional[str] = Body(None),
    bank_name: Optional[str] = Body(None),
    account_name: Optional[str] = Body(None),
    phone_number: Optional[str] = Body(None),
    address: Optional[str] = Body(None),
    current_user=Depends(get_protected_user)
):
    """
    Update company/tenant info used for receipts:
    tenant_name, account_number, bank_name, account_name, phone_number, address.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    update_data: Dict[str, Any] = {}
    if tenant_name is not None:
        update_data["tenant_name"] = tenant_name
    if account_number is not None:
        update_data["account_number"] = account_number
    if bank_name is not None:
        update_data["bank_name"] = bank_name
    if account_name is not None:
        update_data["account_name"] = account_name
    if phone_number is not None:
        update_data["phone_number"] = phone_number
    if address is not None:
        update_data["address"] = address

    if not update_data:
        return {"msg": "No changes"}

    supabase.table("users").update(update_data).eq("user_id", user_id).execute()
    return {"msg": "Company details updated", "updated_fields": list(update_data.keys())}


@router.post("/company/logo")
async def upload_company_logo(logo_file: UploadFile = File(...), current_user=Depends(get_protected_user)):
    """
    Upload a company logo to 'logos' bucket and store its public URL in users.logo_url.
    Max recommended size 10MB (client should enforce).
    Converts WEBP images to PNG before upload.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    unique = uuid.uuid4().hex[:8]
    
    # Convert WEBP to PNG if needed
    if logo_file.content_type == "image/webp":
        img = Image.open(logo_file.file)
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        file_bytes = buffer.read()
        file_ext = ".png"
        content_type = "image/png"
    else:
        file_bytes = logo_file.file.read()
        file_ext = Path(logo_file.filename).suffix or ".png"
        content_type = logo_file.content_type or "image/png"
    
    # Build storage path
    path = f"logos/{user_id}/logo_{unique}{file_ext}"

    # Upload
    supabase.storage.from_("logos").upload(path, file_bytes, {"content-type": content_type})

    url = supabase.storage.from_("logos").get_public_url(path)
    supabase.table("users").update({"logo_url": url}).eq("user_id", user_id).execute()
    return {"logo_url": url}


