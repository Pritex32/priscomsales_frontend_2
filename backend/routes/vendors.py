from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Query
from typing import List, Optional
from pydantic import BaseModel
from PIL import Image
from io import BytesIO
import os
from datetime import datetime
import random
import string
from fastapi.responses import HTMLResponse

from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase

router = APIRouter(prefix="/vendors", tags=["Vendors"])

def _load_vendor_terms_html() -> str:
    """
    Load vendor terms HTML from repository file when available.
    Fallback to embedded default content if file is not found.
    """
    # Attempt path based on this file's location:
    try_paths = []
    try:
        # workspace root
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        try_paths.append(os.path.join(root_dir, "priscomac_sales_software-main", "chibuzo_sales", "vendor_terms.html"))
        # current working directory
        try_paths.append(os.path.join(os.getcwd(), "priscomac_sales_software-main", "chibuzo_sales", "vendor_terms.html"))
    except Exception:
        pass

    for p in try_paths:
        try:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    return f.read()
        except Exception:
            continue

    # Fallback default
    return """<!DOCTYPE html>
<html lang=\\"en\\">
<head>
  <meta charset=\\"UTF-8\\">
  <title>Vendor Terms and Conditions - PriscomSales</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 2rem; line-height: 1.6; background: #f9f9f9; color: #333; }
    h1 { color: #2e7d32; }
    h2 { margin-top: 1.5rem; }
    ul { margin-left: 1rem; }
    strong { color: #2e7d32; }
  </style>
</head>
<body>
  <h1>Vendor Terms and Conditions for PriscomSales</h1>
  <p>By submitting your application as a vendor on the PriscomSales platform, you agree to the following terms:</p>
  <h2>1. Eligibility</h2>
  <ul>
    <li>You must be a legitimate wholesaler or authorized distributor of the products you offer.</li>
    <li>You must provide proof of your business registration.</li>
  </ul>
  <h2>2. Product Authenticity</h2>
  <ul>
    <li>All items listed must be genuine and not counterfeit.</li>
    <li>Selling fake, expired, or substandard products will lead to account termination.</li>
  </ul>
  <h2>3. Honest Representation</h2>
  <ul>
    <li>All descriptions, photos, and pricing must be accurate.</li>
  </ul>
  <h2>4. Delivery Commitments</h2>
  <ul>
    <li>If you select \\"Anywhere in Nigeria,\\\" you must fulfill orders nationwide.</li>
  </ul>
  <h2>5. No Retail-Only Sellers</h2>
  <ul>
    <li>PriscomSales is for wholesalers only.</li>
  </ul>
  <h2>6. Vendor Verification</h2>
  <ul>
    <li>Your vendor profile may be reviewed and verified before or after approval.</li>
  </ul>
  <h2>7. Platform Usage</h2>
  <ul>
    <li>Misuse of the platform for scamming, spamming, or misleading buyers is prohibited.</li>
  </ul>
  <h2>8. Commission and Fees</h2>
  <ul>
    <li>PriscomSales may charge a commission or advertising fee. You’ll be informed beforehand.</li>
  </ul>
  <h2>9. Data Accuracy</h2>
  <ul>
    <li>Your business and product information must be accurate and kept up to date.</li>
  </ul>
  <h2>10. Account Suspension</h2>
  <ul>
    <li>PriscomSales may suspend or delete accounts that violate these terms.</li>
  </ul>
  <h2>11. Legal Compliance</h2>
  <ul>
    <li>You must comply with applicable business laws, including taxes and consumer protection laws.</li>
  </ul>
</body>
</html>"""

@router.get("/terms", response_class=HTMLResponse)
async def vendor_terms():
    """
    Serve Vendor Terms as HTML for the frontend to display.
    The vendor registration endpoint enforces `accept_vendor_terms=True`.
    """
    html = _load_vendor_terms_html()
    # Wrap in a white container to mirror Streamlit page styling
    wrapped = f'<div style="background-color:white; padding:20px; border-radius:12px;">{html}</div>'
    return HTMLResponse(content=wrapped, media_type="text/html")

 
class VendorCreate(BaseModel):
    name: str
    category: str
    location: str
    contact_link: str
    description: str
    nin: Optional[str] = None
    cac: Optional[str] = None
    vendor_phone: str
    delivery_scope: str
    accept_vendor_terms: bool


class VendorUpdate(BaseModel):
    status: str
    verified: Optional[bool] = None
    access_code: Optional[str] = None
    rejection_reason: Optional[str] = None


class ProductCreate(BaseModel):
    product_name: str
    product_description: str
    price: float
    category: str
    stock_quantity: int
    seller_state: str
    within_state_fee: float
    outside_state_fee: float
    min_order_quantity: int
    max_quantity: int
    discount_type: str
    discount_value: float
    colors: Optional[List[str]] = None
    product_size: Optional[List[str]] = None
    nafdac_number: Optional[str] = None
    product_weight: Optional[str] = None


class ProductUpdate(BaseModel):
    product_status: str
    rejection_reason: Optional[str] = None


# Helper to generate access code
def generate_vendor_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


# Helper for file upload to supabase storage
async def upload_file(user_id, vendor_id, file: UploadFile, name_key: str):
    if not file:
        return None
    if hasattr(file, "size") and file.size and file.size > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(400, "File too large")

    ext = file.filename.split(".")[-1] if file.filename else "jpg"
    if ext.lower() == "pdf":
        raise HTTPException(400, "PDF not allowed; use images")

    # Convert WEBP to PNG if needed
    file.file.seek(0)
    if file.content_type == "image/webp":
        img = Image.open(file.file)
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        file_bytes = buffer.read()
        ext = "png"
        content_type = "image/png"
    else:
        file_bytes = file.file.read()
        content_type = file.content_type or f"image/{ext}"
    
    file.file.seek(0)  # Reset for potential reuse

    path = f"{user_id}/{vendor_id}/{name_key}.{ext}"

    # Check if exists
    try:
        existing = supabase.storage.from_("vendoruploads").list(f"{user_id}/{vendor_id}")
        if any(f.get("name") == f"{name_key}.{ext}" for f in (existing or [])):
            return supabase.storage.from_("vendoruploads").get_public_url(path)
    except Exception:
        # If list not supported or fails, proceed to upload
        pass

    # Upload
    supabase.storage.from_("vendoruploads").upload(path, file_bytes, {"content-type": content_type})
    return supabase.storage.from_("vendoruploads").get_public_url(path)


@router.post("/register")
async def register_vendor(
    name: str = Form(...),
    category: str = Form(...),
    location: str = Form(...),
    contact_link: str = Form(...),
    description: str = Form(...),
    vendor_phone: str = Form(...),
    delivery_scope: str = Form(...),
    accept_vendor_terms: bool = Form(...),
    nin: Optional[str] = Form(None),
    cac: Optional[str] = Form(None),
    gov_id: Optional[UploadFile] = File(None),
    cac_cert: Optional[UploadFile] = File(None),
    location_proof: Optional[UploadFile] = File(None),
    bulk_proof: Optional[UploadFile] = File(None),
    warehouse: Optional[UploadFile] = File(None),
    current_user=Depends(get_protected_user),
):
    # Debug logging
    print("\n=== VENDOR REGISTRATION DEBUG ===")
    print(f"Received vendor data:")
    print(f"  - name: {name}")
    print(f"  - category: {category}")
    print(f"  - location: {location}")
    print(f"  - contact_link: {contact_link}")
    print(f"  - vendor_phone: {vendor_phone}")
    print(f"  - delivery_scope: {delivery_scope}")
    print(f"  - accept_vendor_terms: {accept_vendor_terms}")
    print(f"Current user: {current_user.get('id')} - {current_user.get('username')}")
    print(f"Files received:")
    print(f"  - gov_id: {gov_id.filename if gov_id else 'None'}")
    print(f"  - cac_cert: {cac_cert.filename if cac_cert else 'None'}")
    print(f"  - location_proof: {location_proof.filename if location_proof else 'None'}")
    print(f"  - bulk_proof: {bulk_proof.filename if bulk_proof else 'None'}")
    print(f"  - warehouse: {warehouse.filename if warehouse else 'None'}")
    print("================================\n")
    
    if not accept_vendor_terms:
        raise HTTPException(400, "Must accept terms")

    # Check duplicate (by phone per user)
    existing = (
        supabase.table("vendor_listing")
        .select("vendor_id")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("vendor_phone", vendor_phone)
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(400, "Vendor with this phone already exists")

    # Insert vendor
    insert_data = {
        "user_id": current_user.get("id", current_user.get("user_id")),
        "name": name,
        "category": category,
        "location": location,
        "contact_link": contact_link,
        "description": description,
        "nin": nin,
        "cac": cac,
        "vendor_phone": vendor_phone,
        "status": "pending",
        "employee_id": current_user.get("id", current_user.get("user_id")),
        "employee_name": current_user["username"],
        "delivery_scope": delivery_scope,
        "accept_vendor_terms": accept_vendor_terms,
    }
    ins = supabase.table("vendor_listing").insert(insert_data).execute()
    if not ins.data:
        raise HTTPException(500, "Failed to create vendor")
    new_vendor = ins.data[0]
    vendor_id = new_vendor.get("vendor_id")

    # Upload files
    gov_id_url = await upload_file(current_user.get("id", current_user.get("user_id")), vendor_id, gov_id, "gov_id") if gov_id else None
    cac_url = await upload_file(current_user.get("id", current_user.get("user_id")), vendor_id, cac_cert, "cac_cert") if cac_cert else None
    location_proof_url = (
        await upload_file(current_user.get("id", current_user.get("user_id")), vendor_id, location_proof, "location_proof") if location_proof else None
    )
    bulk_url = await upload_file(current_user.get("id", current_user.get("user_id")), vendor_id, bulk_proof, "bulk_invoice") if bulk_proof else None
    warehouse_url = await upload_file(current_user.get("id", current_user.get("user_id")), vendor_id, warehouse, "warehouse") if warehouse else None

    # Update URLs if any
    update_fields = {
        "gov_id_url": gov_id_url,
        "cac_url": cac_url,
        "location_proof_url": location_proof_url,
        "bulk_invoice_url": bulk_url,
        "warehouse_photo_url": warehouse_url,
    }
    # Remove None to avoid overwriting with null
    update_fields = {k: v for k, v in update_fields.items() if v is not None}
    if update_fields:
        supabase.table("vendor_listing").update(update_fields).eq("vendor_id", vendor_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()

    return {"message": "Vendor registered, pending approval", "vendor_id": vendor_id}


@router.get("/pending")
async def get_pending_vendors(
    current_user=Depends(get_protected_user),
):
    if current_user["role"].lower() != "md":
        raise HTTPException(403, "Admin access required")

    result = (
        supabase.table("vendor_listing")
        .select(
            "vendor_id,name,category,location,contact_link,description,vendor_phone,delivery_scope,created_at,gov_id_url,cac_url,location_proof_url,bulk_invoice_url,warehouse_photo_url"
        )
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("status", "pending")
        .order("created_at", desc=True)
        .execute()
    )
    vendors = result.data or []
    return [
        {
            "vendor_id": v.get("vendor_id"),
            "name": v.get("name"),
            "category": v.get("category"),
            "location": v.get("location"),
            "contact_link": v.get("contact_link"),
            "description": v.get("description"),
            "vendor_phone": v.get("vendor_phone"),
            "delivery_scope": v.get("delivery_scope"),
            "created_at": v.get("created_at"),
            "gov_id_url": v.get("gov_id_url"),
            "cac_url": v.get("cac_url"),
            "location_proof_url": v.get("location_proof_url"),
            "bulk_invoice_url": v.get("bulk_invoice_url"),
            "warehouse_photo_url": v.get("warehouse_photo_url"),
        }
        for v in vendors
    ]


@router.put("/{vendor_id}/approve")
async def approve_vendor(
    vendor_id: int,
    current_user=Depends(get_protected_user),
):
    if current_user["role"].lower() != "md":
        raise HTTPException(403, "Admin access required")

    vendor_resp = (
        supabase.table("vendor_listing")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("vendor_id", vendor_id)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    vendor = vendor_resp.data[0] if vendor_resp.data else None
    if not vendor:
        raise HTTPException(404, "Vendor not found or not pending")

    access_code = generate_vendor_code()
    supabase.table("vendor_listing").update(
        {"status": "approved", "verified": True, "access_code": access_code}
    ).eq("vendor_id", vendor_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()

    # Log
    emp_resp = (
        supabase.table("employees")
        .select("employee_id,name")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("name", current_user["username"])
        .limit(1)
        .execute()
    )
    employee = emp_resp.data[0] if emp_resp.data else None
    if employee:
        supabase.table("admin_logs").insert(
            {
                "employee_id": employee.get("employee_id"),
                "employee_name": employee.get("name"),
                "action": "approve_vendor",
                "vendor_id": vendor_id,
                "vendor_name": vendor.get("name"),
            }
        ).execute()

    # Email (assume send_vendor_email_brevo from utils)
    try:
        from ..utils import send_vendor_email_brevo

        user_email = current_user.get("email")
        if user_email:
            send_vendor_email_brevo(user_email, vendor.get("name"), access_code, approved=True)
    except Exception:
        pass

    return {"message": "Vendor approved", "access_code": access_code}


@router.put("/{vendor_id}/reject")
async def reject_vendor(
    vendor_id: int,
    reason: str = Form(...),
    current_user=Depends(get_protected_user),
):
    if current_user["role"].lower() != "md":
        raise HTTPException(403, "Admin access required")

    vendor_resp = (
        supabase.table("vendor_listing")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("vendor_id", vendor_id)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    vendor = vendor_resp.data[0] if vendor_resp.data else None
    if not vendor:
        raise HTTPException(404, "Vendor not found or not pending")

    supabase.table("vendor_listing").update(
        {"status": "rejected", "rejection_reason": reason}
    ).eq("vendor_id", vendor_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()

    # Log
    emp_resp = (
        supabase.table("employees")
        .select("employee_id,name")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("name", current_user["username"])
        .limit(1)
        .execute()
    )
    employee = emp_resp.data[0] if emp_resp.data else None
    if employee:
        supabase.table("admin_logs").insert(
            {
                "employee_id": employee.get("employee_id"),
                "employee_name": employee.get("name"),
                "action": "reject_vendor",
                "vendor_id": vendor_id,
                "vendor_name": vendor.get("name"),
                "reason": reason,
            }
        ).execute()

    # Email
    try:
        from ..utils import send_vendor_email_brevo

        user_email = current_user.get("email")
        if user_email:
            send_vendor_email_brevo(user_email, vendor.get("name"), None, approved=False, reason=reason)
    except Exception:
        pass

    return {"message": "Vendor rejected"}


@router.post("/login")
async def vendor_login(
    access_code: str = Form(...),
    current_user=Depends(get_protected_user),
):
    vendor_resp = (
        supabase.table("vendor_listing")
        .select("vendor_id,name")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("access_code", access_code)
        .eq("status", "approved")
        .limit(1)
        .execute()
    )
    vendor = vendor_resp.data[0] if vendor_resp.data else None
    if not vendor:
        raise HTTPException(401, "Invalid access code or unapproved vendor")
    return {"vendor_id": vendor.get("vendor_id"), "name": vendor.get("name")}


@router.post("/products")
async def upload_product(
    product_name: str = Form(...),
    product_description: str = Form(...),
    price: float = Form(...),
    category: str = Form(...),
    stock_quantity: int = Form(...),
    seller_state: str = Form(...),
    within_state_fee: float = Form(...),
    outside_state_fee: float = Form(...),
    min_order_quantity: int = Form(...),
    max_quantity: int = Form(...),
    discount_type: str = Form(...),
    discount_value: float = Form(...),
    colors: Optional[str] = Form(None),
    product_size: Optional[str] = Form(None),
    nafdac_number: Optional[str] = Form(None),
    product_weight: Optional[str] = Form(None),
    images: List[UploadFile] = File(...),
    video: Optional[UploadFile] = File(None),
    current_user=Depends(get_protected_user),
):
    vendor_resp = (
        supabase.table("vendor_listing")
        .select("vendor_id,name")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("status", "approved")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    vendor = vendor_resp.data[0] if vendor_resp.data else None
    if not vendor:
        raise HTTPException(403, "No approved vendor found")

    # Parse colors and product_size from JSON strings if provided
    colors_list = None
    if colors:
        try:
            import json
            colors_list = json.loads(colors) if isinstance(colors, str) else colors
        except Exception:
            colors_list = [colors]  # Fallback to single item list
    
    product_size_list = None
    if product_size:
        try:
            import json
            product_size_list = json.loads(product_size) if isinstance(product_size, str) else product_size
        except Exception:
            product_size_list = [product_size]  # Fallback to single item list

    # Calculate final price
    final_price = price
    if discount_type == "Percentage":
        final_price *= (1 - discount_value / 100)
    elif discount_type == "Fixed":
        final_price -= discount_value

    insert_data = {
        "vendor_id": vendor.get("vendor_id"),
        "user_id": current_user.get("id", current_user.get("user_id")),
        "product_name": product_name,
        "product_description": product_description,
        "price": final_price,
        "original_price": price,
        "category": category,
        "stock_quantity": stock_quantity,
        "nafdac_number": nafdac_number,
        "seller_state": seller_state,
        "within_state_fee": within_state_fee,
        "outside_state_fee": outside_state_fee,
        "min_order_quantity": min_order_quantity,
        "max_quantity": max_quantity,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "colors": colors_list,
        "product_size": product_size_list,
        "product_weight": product_weight,
        "product_status": "pending",
    }
    newp = supabase.table("vendor_products").insert(insert_data).execute()
    if not newp.data:
        raise HTTPException(500, "Failed to create product")
    new_product = newp.data[0]
    product_id = new_product.get("id")

    # Upload images (max 2)
    image_urls = []
    for i, img in enumerate(images[:2]):
        url = await upload_file(current_user.get("id", current_user.get("user_id")), vendor.get("vendor_id"), img, f"{product_name}_img_{i+1}")
        if url:
            image_urls.append(url)

    update_fields = {}
    if image_urls:
        update_fields["product_images"] = image_urls
        update_fields["product_image_url"] = image_urls[0]

    # Video
    if video:
        if hasattr(video, "size") and video.size and video.size > 15 * 1024 * 1024:
            raise HTTPException(400, "Video too large")
        video_url = await upload_file(current_user.get("id", current_user.get("user_id")), vendor.get("vendor_id"), video, f"{product_name}_video")
        update_fields["video_url"] = video_url

    if update_fields:
        supabase.table("vendor_products").update(update_fields).eq("id", product_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()

    return {"message": "Product uploaded", "product_id": product_id}


@router.get("/products/pending")
async def get_pending_products(
    current_user=Depends(get_protected_user),
):
    if current_user["role"].lower() != "md":
        raise HTTPException(403, "Admin access required")

    resp = (
        supabase.table("vendor_products")
        .select("id,product_name,vendor_id,price,category,stock_quantity,created_at,product_images,nafdac_number,product_status,product_description")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("product_status", "pending")
        .order("created_at", desc=True)
        .execute()
    )
    products = resp.data or []
    return [
        {
            "id": p.get("id"),
            "product_name": p.get("product_name"),
            "vendor_id": p.get("vendor_id"),
            "price": float(p.get("price")) if p.get("price") is not None else None,
            "category": p.get("category"),
            "stock_quantity": p.get("stock_quantity"),
            "created_at": p.get("created_at"),
            "product_images": p.get("product_images"),
            "nafdac_number": p.get("nafdac_number"),
            "product_status": p.get("product_status"),
            "product_description": p.get("product_description"),
        }
        for p in products
    ]


@router.put("/products/{product_id}/approve")
async def approve_product(
    product_id: int,
    current_user=Depends(get_protected_user),
):
    if current_user["role"].lower() != "md":
        raise HTTPException(403, "Admin access required")

    product_resp = (
        supabase.table("vendor_products")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("id", product_id)
        .eq("product_status", "pending")
        .limit(1)
        .execute()
    )
    product = product_resp.data[0] if product_resp.data else None
    if not product:
        raise HTTPException(404, "Product not found or not pending")

    supabase.table("vendor_products").update({"product_status": "approved"}).eq("id", product_id).eq(
        "user_id", current_user.get("id", current_user.get("user_id"))
    ).execute()

    # Email vendor
    vendor_resp = supabase.table("vendor_listing").select("name").eq("vendor_id", product.get("vendor_id")).limit(1).execute()
    vendor = vendor_resp.data[0] if vendor_resp.data else None
    if vendor:
        try:
            from ..utils import send_vendor_email_brevo

            user_email = current_user.get("email")
            if user_email:
                send_vendor_email_brevo(user_email, vendor.get("name"), None, product_name=product.get("product_name"), approved=True)
        except Exception:
            pass

    return {"message": "Product approved"}


@router.put("/products/{product_id}/reject")
async def reject_product(
    product_id: int,
    reason: str = Form(...),
    current_user=Depends(get_protected_user),
):
    if current_user["role"].lower() != "md":
        raise HTTPException(403, "Admin access required")

    product_resp = (
        supabase.table("vendor_products")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("id", product_id)
        .eq("product_status", "pending")
        .limit(1)
        .execute()
    )
    product = product_resp.data[0] if product_resp.data else None
    if not product:
        raise HTTPException(404, "Product not found or not pending")

    supabase.table("vendor_products").update({"product_status": "rejected", "rejection_reason": reason}).eq("id", product_id).eq(
        "user_id", current_user.get("id", current_user.get("user_id"))
    ).execute()

    # Email
    vendor_resp = supabase.table("vendor_listing").select("name").eq("vendor_id", product.get("vendor_id")).limit(1).execute()
    vendor = vendor_resp.data[0] if vendor_resp.data else None
    if vendor:
        try:
            from ..utils import send_vendor_email_brevo

            user_email = current_user.get("email")
            if user_email:
                send_vendor_email_brevo(
                    user_email, vendor.get("name"), None, product_name=product.get("product_name"), approved=False, reason=reason
                )
        except Exception:
            pass

    return {"message": "Product rejected"}


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    reason: str = Form(...),
    current_user=Depends(get_protected_user),
):
    if current_user["role"].lower() != "md":
        raise HTTPException(403, "Admin access required")

    product_resp = (
        supabase.table("vendor_products")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("id", product_id)
        .limit(1)
        .execute()
    )
    product = product_resp.data[0] if product_resp.data else None
    if not product:
        raise HTTPException(404, "Product not found")

    # Log deletion
    vendor_resp = supabase.table("vendor_listing").select("vendor_id,name").eq("vendor_id", product.get("vendor_id")).limit(1).execute()
    vendor = vendor_resp.data[0] if vendor_resp.data else None

    emp_resp = (
        supabase.table("employees")
        .select("employee_id,name")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("name", current_user["username"])
        .limit(1)
        .execute()
    )
    employee = emp_resp.data[0] if emp_resp.data else None

    if employee and vendor:
        supabase.table("product_deletion_logs").insert(
            {
                "product_id": product_id,
                "vendor_id": vendor.get("vendor_id"),
                "user_id": current_user.get("id", current_user.get("user_id")),
                "product_name": product.get("product_name"),
                "reason": reason,
                "deleted_by": employee.get("name"),
            }
        ).execute()

    # Delete images from storage
    image_urls = product.get("product_images") or []
    for url in image_urls:
        # Extract path after '/object/public/vendoruploads/' to get the object path
        if "/object/public/vendoruploads/" in url:
            path = url.split("/object/public/vendoruploads/")[-1]
        else:
            # Fallback heuristic
            parts = url.split("/")
            path = "/".join(parts[-3:])  # try last 3 segments as path
        try:
            supabase.storage.from_("vendoruploads").remove([path])
        except Exception:
            pass  # Ignore errors

    # Delete product
    supabase.table("vendor_products").delete().eq("id", product_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"message": "Product deleted"}

