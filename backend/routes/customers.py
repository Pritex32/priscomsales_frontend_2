from fastapi import APIRouter, Depends, HTTPException, Query, Response
from typing import List, Optional
from pydantic import BaseModel

from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase

router = APIRouter(prefix="/customers", tags=["Customers"])

def _ensure_md(current_user):
    if current_user.get("role", "").lower() != "md":
        raise HTTPException(status_code=403, detail="Only MD can perform this action")

class CustomerCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None

class CustomerResponse(BaseModel):
    customer_id: int
    name: str
    phone: str
    email: Optional[str]
    address: Optional[str]
    created_at: Optional[str]

@router.post("/", response_model=CustomerResponse)
async def create_customer(
    customer: CustomerCreate,
    current_user=Depends(get_protected_user),
):
    # Check duplicate phone
    existing = (
        supabase.table("customers")
        .select("customer_id")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("phone", customer.phone)
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(400, "Customer with this phone already exists")

    insert_data = {
        "user_id": current_user.get("id", current_user.get("user_id")),
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
        "address": customer.address,
    }
    resp = supabase.table("customers").insert(insert_data).execute()
    new_customer = resp.data[0]
    return CustomerResponse(
        customer_id=new_customer.get("customer_id"),
        name=new_customer.get("name"),
        phone=new_customer.get("phone"),
        email=new_customer.get("email"),
        address=new_customer.get("address"),
        created_at=str(new_customer.get("created_at")) if new_customer.get("created_at") is not None else None,
    )

@router.get("/", response_model=List[CustomerResponse])
async def list_customers(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_user=Depends(get_protected_user),
):
    query = supabase.table("customers").select("*").eq("user_id", current_user.get("id", current_user.get("user_id")))
    if search:
        # ilike search on name or phone
        query = query.or_(f"name.ilike.%{search}%,phone.ilike.%{search}%")
    query = query.order("created_at", desc=True)

    start = (page - 1) * limit
    end = start + limit - 1
    resp = query.range(start, end).execute()
    customers = resp.data or []

    # total count (may require an extra query)
    count_resp = (
        supabase.table("customers").select("customer_id", count="exact").eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    )
    total = getattr(count_resp, "count", None)
    if total is None:
        total = len(customers)

    return [
        CustomerResponse(
            customer_id=c.get("customer_id"),
            name=c.get("name"),
            phone=c.get("phone"),
            email=c.get("email"),
            address=c.get("address"),
            created_at=str(c.get("created_at")) if c.get("created_at") is not None else None,
        )
        for c in customers
    ]

@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    current_user=Depends(get_protected_user),
):
    resp = (
        supabase.table("customers")
        .select("*")
        .eq("customer_id", customer_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    customer = resp.data[0] if resp.data else None
    if not customer:
        raise HTTPException(404, "Customer not found")
    return CustomerResponse(
        customer_id=customer.get("customer_id"),
        name=customer.get("name"),
        phone=customer.get("phone"),
        email=customer.get("email"),
        address=customer.get("address"),
        created_at=str(customer.get("created_at")) if customer.get("created_at") is not None else None,
    )

@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: int,
    update: CustomerUpdate,
    current_user=Depends(get_protected_user),
):
    # MD-only action
    _ensure_md(current_user)
    
    # Ensure customer exists
    resp = (
        supabase.table("customers")
        .select("*")
        .eq("customer_id", customer_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    customer = resp.data[0] if resp.data else None
    if not customer:
        raise HTTPException(404, "Customer not found")

    # Duplicate phone check if changing phone
    if update.phone is not None:
        dup = (
            supabase.table("customers")
            .select("customer_id")
            .eq("user_id", current_user.get("id", current_user.get("user_id")))
            .eq("phone", update.phone)
            .neq("customer_id", customer_id)
            .limit(1)
            .execute()
        )
        if dup.data:
            raise HTTPException(400, "Phone already in use by another customer")

    update_data = {}
    if update.name is not None:
        update_data["name"] = update.name
    if update.phone is not None:
        update_data["phone"] = update.phone
    if update.email is not None:
        update_data["email"] = update.email
    if update.address is not None:
        update_data["address"] = update.address

    if not update_data:
        # No changes
        updated = customer
    else:
        upd = supabase.table("customers").update(update_data).eq("customer_id", customer_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
        updated = upd.data[0] if upd.data else {**customer, **update_data}

    return CustomerResponse(
        customer_id=updated.get("customer_id"),
        name=updated.get("name"),
        phone=updated.get("phone"),
        email=updated.get("email"),
        address=updated.get("address"),
        created_at=str(updated.get("created_at")) if updated.get("created_at") is not None else None,
    )

@router.delete("/{customer_id}")
async def delete_customer(
    customer_id: int,
    current_user=Depends(get_protected_user),
):
    # MD-only action, matching Streamlit UI restriction
    _ensure_md(current_user)

    exists = (
        supabase.table("customers")
        .select("customer_id")
        .eq("customer_id", customer_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    if not exists.data:
        raise HTTPException(404, "Customer not found")

    supabase.table("customers").delete().eq("customer_id", customer_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"message": "Customer deleted successfully"}

@router.get("/metrics")
async def get_metrics(
    current_user=Depends(get_protected_user),
):
    count_resp = supabase.table("customers").select("customer_id", count="exact").eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    total = getattr(count_resp, "count", None)
    if total is None:
        data = supabase.table("customers").select("customer_id").eq("user_id", current_user.get("id", current_user.get("user_id"))).execute().data or []
        total = len(data)
    return {"total_customers": total}

@router.get("/customers/export")
async def export_customers(
    search: Optional[str] = Query(None),
    current_user=Depends(get_protected_user),
):
    # MD-only CSV export to match UI behavior
    _ensure_md(current_user)

    # Build base query
    query = supabase.table("customers").select("*").eq("user_id", current_user.get("id", current_user.get("user_id"))).order("created_at", desc=True)
    if search:
        # Case-insensitive match on name or phone
        query = query.or_(f"name.ilike.%{search}%,phone.ilike.%{search}%")

    # Fetch all rows (no pagination for export)
    resp = query.execute()
    rows = resp.data or []

    # Build CSV
    import io, csv
    if not rows:
        csv_str = ""
    else:
        # Stable column order
        fieldnames = ["customer_id", "name", "phone", "email", "address", "created_at"]
        # include any extra fields gracefully
        all_fields = list(dict.fromkeys(fieldnames + [k for r in rows for k in r.keys()]))
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=all_fields, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
        csv_str = buf.getvalue()

    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=customer_list.csv"}
    )

