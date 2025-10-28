from fastapi import FastAPI, HTTPException, Depends, status, Form, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timedelta, date
import jwt
import requests
from supabase import create_client, Client
import json
from collections import defaultdict
import traceback
try:
    from backend.routes.auth import router as auth_router
except ModuleNotFoundError:
    from routes.auth import router as auth_router

# Import other routers (robust to run context)
try:
    from backend.routes.inventory import router as inventory_router
except ModuleNotFoundError:
    from routes.inventory import router as inventory_router
try:
    from backend.routes.restock import router as restock_router
except ModuleNotFoundError:
    from routes.restock import router as restock_router
try:
    from backend.routes.sales import router as sales_router
except ModuleNotFoundError:
    from routes.sales import router as sales_router
try:
    from backend.routes.expenses import router as expenses_router
except ModuleNotFoundError:
    from routes.expenses import router as expenses_router
try:
    from backend.routes.requisitions import router as requisitions_router
except ModuleNotFoundError:
    from routes.requisitions import router as requisitions_router
try:
    from backend.routes.customers import router as customers_router
except ModuleNotFoundError:
    from routes.customers import router as customers_router
try:
    from backend.routes.b2b import router as b2b_router
except ModuleNotFoundError:
    from routes.b2b import router as b2b_router
try:
    from backend.routes.vendors import router as vendors_router
except ModuleNotFoundError:
    from routes.vendors import router as vendors_router
try:
    from backend.routes.admin import router as admin_router
except ModuleNotFoundError:
    from routes.admin import router as admin_router
try:
    from backend.routes.dashboard import router as dashboard_router
except ModuleNotFoundError:
    from routes.dashboard import router as dashboard_router
try:
    from backend.routes.settings import router as settings_router
except ModuleNotFoundError:
    from routes.settings import router as settings_router
try:
    from backend.routes.sheets import router as sheets_router
except ModuleNotFoundError:
    from routes.sheets import router as sheets_router
try:
    from backend.routes.filters import router as filters_router
except ModuleNotFoundError:
    from routes.filters import router as filters_router
try:
    from backend.permissions_api import router as permissions_router
except ModuleNotFoundError:
    from permissions_api import router as permissions_router

# Security dependency for shared endpoints
try:
    from backend.core.security import get_current_user as core_get_current_user
except ModuleNotFoundError:
    from core.security import get_current_user as core_get_current_user

# FastAPI application instance
app = FastAPI(title="Priscomac Wholesaler Shop API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Strict JSON validation wrapper for /restock/new-item ===
# Import the target handler and its model to forward to existing logic
try:
    from backend.routes.restock import NewItemRequest as RestockNewItemRequest, create_new_item as restock_create_new_item
except ModuleNotFoundError:
    from routes.restock import NewItemRequest as RestockNewItemRequest, create_new_item as restock_create_new_item

class RestockNewItemBody(BaseModel):
    item_name: str
    supplied_quantity: int
    reorder_level: int
    unit_price: float
    purchase_date: date
    warehouse_name: Optional[str] = None
    new_warehouse_name: Optional[str] = None
    barcode: Optional[str] = None
    supplier_name: Optional[str] = None
    payment_status: Literal["paid", "credit", "partial"] = "paid"
    payment_method: Literal["cash", "card", "transfer", "cheque"] = "cash"
    due_date: Optional[date] = None
    notes: Optional[str] = None
    access_choice: Optional[Literal["No", "Yes"]] = "No"
    total_price_paid: Optional[float] = None
    invoice_file_url: Optional[str] = None
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None

@app.post("/restock/new-item")
async def restock_new_item_strict(body: RestockNewItemBody, current_user: Dict = Depends(core_get_current_user), request: Request = None):
    # Debug: log raw request
    try:
        raw_body = await request.body() if request else b""
        raw_text = raw_body.decode("utf-8", "ignore") if raw_body else ""
        print(f"MAIN.PY RESTOCK WRAPPER DEBUG: RAW BODY={raw_text[:500]}...")
    except Exception as e:
        print(f"MAIN.PY RESTOCK WRAPPER: Could not read raw body: {e}")
    
    print(f"MAIN.PY RESTOCK WRAPPER DEBUG: Parsed body={body.model_dump() if hasattr(body, 'model_dump') else body.dict()}")
    
    # Field-level validations with clear messages
    if not body.item_name or str(body.item_name).strip() == "":
        print("MAIN.PY RESTOCK WRAPPER ERROR: item_name is required")
        raise HTTPException(status_code=400, detail="item_name is required")

    if body.warehouse_name is None and (body.new_warehouse_name is None or str(body.new_warehouse_name).strip() == ""):
        raise HTTPException(status_code=400, detail="warehouse_name or new_warehouse_name is required")

    if body.supplied_quantity is None or int(body.supplied_quantity) < 0:
        raise HTTPException(status_code=400, detail="supplied_quantity must be >= 0")

    if body.reorder_level is None or int(body.reorder_level) < 0:
        raise HTTPException(status_code=400, detail="reorder_level must be >= 0")

    if body.unit_price is None or float(body.unit_price) < 0:
        print(f"MAIN.PY RESTOCK WRAPPER ERROR: unit_price must be >= 0, got {body.unit_price}")
        raise HTTPException(status_code=400, detail="unit_price must be >= 0")

    # Partial payment validation
    total_cost = float(body.supplied_quantity or 0) * float(body.unit_price or 0)
    print(f"MAIN.PY RESTOCK WRAPPER DEBUG: total_cost={total_cost}, payment_status={body.payment_status}, total_price_paid={body.total_price_paid}")
    
    if body.payment_status == "partial":
        if body.total_price_paid is None or body.total_price_paid <= 0 or body.total_price_paid > total_cost:
            print(f"MAIN.PY RESTOCK WRAPPER ERROR: Invalid partial payment: total_price_paid={body.total_price_paid}, total_cost={total_cost}")
            raise HTTPException(status_code=400, detail="total_price_paid must be > 0 and <= supplied_quantity*unit_price for partial payments")

    # Skip employee_id validation - use current user's ID as employee_id
    print(f"MAIN.PY RESTOCK WRAPPER DEBUG: Using current user ID as employee_id (no validation needed)")

    # Forward to existing implementation to preserve business logic
    print(f"MAIN.PY RESTOCK WRAPPER DEBUG: Forwarding to restock_create_new_item")
    try:
        # RestockNewItemBody is compatible with RestockNewItemRequest, forward directly
        forward = RestockNewItemRequest(**body.model_dump())
        result = await restock_create_new_item(forward, current_user=current_user)
        print(f"MAIN.PY RESTOCK WRAPPER DEBUG: Success, returning result")
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"MAIN.PY RESTOCK WRAPPER ERROR: {e}")
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

# Routers
app.include_router(auth_router)
app.include_router(inventory_router)
app.include_router(restock_router)
app.include_router(sales_router)
app.include_router(expenses_router)
app.include_router(requisitions_router)
app.include_router(customers_router)
app.include_router(b2b_router)
app.include_router(vendors_router)
app.include_router(admin_router)
app.include_router(dashboard_router)
app.include_router(settings_router)
app.include_router(sheets_router)
app.include_router(filters_router)
app.include_router(permissions_router)

# Configuration - Load from environment variables
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

JWT_SECRET_KEY = os.getenv("jwt_SECRET_KEY", "4606")  # Fallback for development only
ALGORITHM = os.getenv("ALGORITHM", "HS256")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://ecsrlqvifparesxakokl.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjc3JscXZpZnBhcmVzeGFrb2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2NjczMDMsImV4cCI6MjA2MDI0MzMwM30.Zts7p1C3MNFqYYzp-wo3e0z-9MLfRDoY2YJ5cxSexHk")
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY")

if not PAYSTACK_SECRET_KEY:
    print("WARNING: PAYSTACK_SECRET_KEY not set in environment variables!")

# Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Security
security = HTTPBearer()

# ===== MODELS =====

class TokenData(BaseModel):
    user_id: int
    username: str
    role: str
    plan: str = "free"
    is_active: bool = False
    email: Optional[str] = None

class Product(BaseModel):
    id: int
    product_name: str
    category: str
    original_price: float
    discount_value: Optional[float] = 0
    discount_type: Optional[str] = "None"
    stock_quantity: int
    min_order_quantity: int = 1
    max_quantity: Optional[int] = None
    product_images: List[str] = []
    video_url: Optional[str] = None
    product_sizes: List[str] = []
    colors: List[str] = []
    seller_state: str = "Lagos"
    within_state_fee: float = 0
    outside_state_fee: float = 0
    vendor_id: int
    discounted_price: Optional[float] = None

class CartItem(BaseModel):
    product_id: int
    product_name: str
    price: float
    original_price: float
    quantity: int
    product_sizes: Optional[str] = None
    product_color: Optional[str] = None
    vendor_id: int
    seller_state: str
    within_state_fee: float
    outside_state_fee: float

class AddToCartRequest(BaseModel):
    product_id: int
    quantity: int
    size: Optional[str] = None
    color: Optional[str] = None

class CheckoutRequest(BaseModel):
    buyer_name: str
    buyer_contact: str
    buyer_state: str
    buyer_email: EmailStr

class OrderResponse(BaseModel):
    payment_url: str
    reference: str
    total_amount: float

# ===== AUTH UTILITIES =====

def decode_jwt(token: str) -> Optional[Dict]:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    return decode_jwt(credentials.credentials)

# ===== ROUTES =====

@app.get("/")
async def root():
    return {"message": "Priscomac Wholesaler Shop API is running"}

# Alias endpoints expected by some clients
@app.get("/users/me")
async def users_me(current_user: Dict = Depends(core_get_current_user)):
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        role = (current_user.get("role") or "").lower()
        if role == "md":
            resp = supabase.table("users").select("username,email,role,access_code").eq("user_id", user_id).limit(1).execute()
            if resp.data:
                info = resp.data[0]
                return {
                    "id": user_id,
                    "username": info.get("username"),
                    "email": info.get("email"),
                    "role": info.get("role"),
                    "access_code": info.get("access_code"),
                }
        return {
            "id": user_id,
            "username": current_user.get("username"),
            "email": current_user.get("email"),
            "role": current_user.get("role"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/warehouses")
async def list_warehouses(current_user: Dict = Depends(core_get_current_user)):
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        resp = supabase.table("inventory_master_log").select("warehouse_name").eq("user_id", user_id).neq("warehouse_name", None).execute()
        names = [w.get("warehouse_name") for w in (resp.data or []) if w.get("warehouse_name")]
        return sorted(list({(n or "").strip() for n in names if isinstance(n, str) and (n or "").strip()}))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Subscription status aliases matching various frontend expectations
@app.get("/subscription-status")
@app.get("/dashboard/subscription-status")
async def subscription_status_alias(current_user: Dict = Depends(core_get_current_user)):
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        response = (
            supabase.table("subscription")
            .select("*")
            .eq("user_id", user_id)
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        transaction_count = 0
        try:
            sales_response = (
                supabase.table("sales")
                .select("sale_id", count="exact")
                .eq("user_id", user_id)
                .execute()
            )
            transaction_count = getattr(sales_response, "count", 0) or 0
        except Exception:
            pass
        if response.data:
            sub = response.data[0]
            is_active = sub.get("is_active", False)
            expires_at = sub.get("expires_at")
            # Expiry check
            if expires_at:
                try:
                    exp_date = datetime.fromisoformat(expires_at).date()
                    if exp_date < datetime.utcnow().date():
                        is_active = False
                except Exception:
                    pass
            return {
                "plan": sub.get("plan", "free"),
                "is_active": is_active,
                "expires_at": expires_at,
                "started_at": sub.get("started_at"),
                "created_at": sub.get("started_at"),
                "amount": sub.get("amount"),
                "reference": sub.get("reference"),
                "transaction_count": transaction_count,
            }
        return {
            "plan": "free",
            "is_active": False,
            "expires_at": None,
            "started_at": None,
            "transaction_count": transaction_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching subscription: {str(e)}")

# Feedback endpoint expected by frontend
class FeedbackRequest(BaseModel):
    message: str
    email: Optional[str] = None
    rating: Optional[int] = None
    meta: Optional[Dict[str, Any]] = None

@app.post("/feedback")
async def submit_feedback(
    message: Optional[str] = Form(None),
    feedback: Optional[str] = Form(None),  # alias some clients may use
    email: Optional[str] = Form(None),
    rating: Optional[str] = Form(None),  # accept as string from forms
    meta: Optional[str] = Form(None),    # JSON string from forms
    payload: Optional[FeedbackRequest] = Body(None),
    current_user: Dict = Depends(core_get_current_user),
    request: Request = None,
):
    try:
        ctype = request.headers.get("content-type") if request else None
        print(f"FEEDBACK DEBUG: content-type={ctype}")
        print(f"FEEDBACK DEBUG: raw form fields message={message!r} feedback={feedback!r} email={email!r} rating={rating!r} meta={meta!r}")
        try:
            payload_dump = payload.model_dump() if payload is not None and hasattr(payload, "model_dump") else (payload.dict() if payload is not None and hasattr(payload, "dict") else None)
        except Exception:
            payload_dump = None
        print(f"FEEDBACK DEBUG: json payload={payload_dump}")

        # Try raw body fallback when content-type is JSON/plain and no parsed payload
        raw_text = ""
        try:
            body_bytes = await request.body() if request else b""
            raw_text = body_bytes.decode("utf-8", "ignore").strip() if body_bytes else ""
        except Exception:
            raw_text = ""
        print(f"FEEDBACK DEBUG: raw body={raw_text!r}")
        raw_json: Optional[Any] = None
        if raw_text:
            try:
                raw_json = json.loads(raw_text)
            except Exception:
                raw_json = None

        # Prefer JSON payload if provided; fall back to form fields or raw body
        msg = (payload.message if payload and getattr(payload, "message", None) else None) or message or feedback
        eml = (payload.email if payload and getattr(payload, "email", None) else None) or email or None
        # If still missing, check raw_json or raw_text for message and email
        if not msg:
            if isinstance(raw_json, dict):
                for k in ("message", "feedback", "text", "content", "body", "msg", "comment"):
                    v = raw_json.get(k)
                    if v is not None and str(v).strip() != "":
                        msg = str(v)
                        break
            elif isinstance(raw_json, str) and raw_json.strip() != "":
                msg = raw_json.strip()
            elif raw_text and (ctype or "").startswith("text/"):
                msg = raw_text
        if not eml and isinstance(raw_json, dict) and raw_json.get("email"):
            eml = str(raw_json.get("email"))
        # Final defaults
        if not eml:
            eml = current_user.get("email")
        # Parse rating
        rat_val = None
        if payload and getattr(payload, "rating", None) is not None:
            rat_val = payload.rating
        elif rating is not None and str(rating).strip() != "":
            try:
                rat_val = int(str(rating).strip())
            except ValueError:
                rat_val = None
        elif isinstance(raw_json, dict):
            try:
                rv = raw_json.get("rating")
                if rv is not None and str(rv).strip() != "":
                    rat_val = int(str(rv).strip())
            except Exception:
                rat_val = None
        # Parse meta (dict or JSON string)
        meta_val: Optional[Dict[str, Any]] = None
        if payload and getattr(payload, "meta", None) is not None:
            meta_val = payload.meta  # type: ignore
        elif meta:
            try:
                meta_val = json.loads(meta)
            except Exception:
                meta_val = {"raw": meta}
        elif isinstance(raw_json, dict) and raw_json.get("meta") is not None:
            mv = raw_json.get("meta")
            if isinstance(mv, (dict, list)):
                meta_val = mv  # type: ignore
            else:
                try:
                    meta_val = json.loads(str(mv))
                except Exception:
                    meta_val = {"raw": mv}

        if not msg or str(msg).strip() == "":
            msg = "[empty]"

        user_id = current_user.get("id") or current_user.get("user_id")
        # Resolve name (from body or current user)
        nm = None
        if isinstance(raw_json, dict):
            nm = raw_json.get("name") or raw_json.get("username")
        if not nm:
            nm = current_user.get("username") or current_user.get("name")
        row = {
            "user_id": user_id,
            "name": nm,
            "feedback": str(msg).strip(),
            "email": eml,
            "created_at": datetime.utcnow().isoformat(),
        }
        print(f"FEEDBACK DEBUG: insert row={row}")
        supabase.table("feedback").insert(row).execute()
        return {"msg": "Feedback submitted"}
    except HTTPException:
        raise
    except Exception as e:
        print("FEEDBACK ERROR:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/products")
async def get_products(
    page: int = 1,
    per_page: int = 9,
    category: Optional[str] = None
):
    """Fetch approved products with pagination"""
    try:
        query = supabase.table("vendor_products").select("*").eq("product_status", "approved")
        
        if category:
            query = query.eq("category", category)
        
        response = query.execute()
        products = response.data
        
        # Calculate discounted prices and group by category
        grouped = defaultdict(list)
        for p in products:
            discount_value = p.get("discount_value", 0) or 0
            discount_type = p.get("discount_type", "None")
            original_price = p.get("original_price", 0) or 0
            
            if discount_type == "Percentage":
                p["discounted_price"] = original_price * (1 - discount_value / 100)
            elif discount_type == "Fixed":
                p["discounted_price"] = max(original_price - discount_value, 0)
            else:
                p["discounted_price"] = original_price
            
            grouped[p["category"]].append(p)
        
        # Flatten for pagination
        all_products = [p for category_items in grouped.values() for p in category_items]
        
        # Paginate
        start = (page - 1) * per_page
        end = start + per_page
        paginated = all_products[start:end]
        
        total_products = len(all_products)
        total_pages = (total_products + per_page - 1) // per_page
        
        return {
            "products": paginated,
            "total": total_products,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch products: {str(e)}")

@app.get("/api/products/categories")
async def get_categories():
    """Get all unique product categories"""
    try:
        response = supabase.table("vendor_products").select("category").eq("product_status", "approved").execute()
        categories = list(set([p["category"] for p in response.data]))
        return {"categories": categories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cart")
async def get_cart(user: Dict = Depends(get_current_user)):
    """Get user's cart items"""
    try:
        user_id = user["user_id"]
        response = supabase.table("cart").select("*").eq("user_id", user_id).execute()
        return {"cart": response.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/cart/add")
async def add_to_cart(
    request: AddToCartRequest,
    user: Dict = Depends(get_current_user)
):
    """Add item to cart"""
    try:
        user_id = user["user_id"]
        
        # Fetch product details
        product_response = supabase.table("vendor_products").select("*").eq("id", request.product_id).single().execute()
        product = product_response.data
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # Calculate discounted price
        discount_value = product.get("discount_value", 0) or 0
        discount_type = product.get("discount_type", "None")
        original_price = product["original_price"]
        
        if discount_type == "Percentage":
            discounted_price = original_price * (1 - discount_value / 100)
        elif discount_type == "Fixed":
            discounted_price = max(original_price - discount_value, 0)
        else:
            discounted_price = original_price
        
        # Create cart item
        cart_item = {
            "product_id": product["id"],
            "user_id": user_id,
            "product_name": product["product_name"],
            "price": discounted_price,
            "original_price": original_price,
            "quantity": request.quantity,
            "product_sizes": request.size,
            "product_color": request.color,
            "vendor_id": product["vendor_id"],
            "seller_state": product.get("seller_state", "Lagos"),
            "within_state_fee": product.get("within_state_fee", 0),
            "outside_state_fee": product.get("outside_state_fee", 0)
        }
        
        response = supabase.table("cart").insert(cart_item).execute()
        return {"message": "Added to cart successfully", "cart_item": response.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/cart/{cart_id}")
async def remove_from_cart(
    cart_id: int,
    user: Dict = Depends(get_current_user)
):
    """Remove item from cart"""
    try:
        user_id = user["user_id"]
        supabase.table("cart").delete().eq("id", cart_id).eq("user_id", user_id).execute()
        return {"message": "Item removed from cart"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/checkout")
async def checkout(
    request: CheckoutRequest,
    user: Dict = Depends(get_current_user)
):
    """Process checkout and initialize payment"""
    try:
        user_id = user["user_id"]
        
        # Fetch cart items
        cart_response = supabase.table("cart").select("*").eq("user_id", user_id).execute()
        cart = cart_response.data
        
        if not cart:
            raise HTTPException(status_code=400, detail="Cart is empty")
        
        # Calculate total
        total_amount = 0
        for item in cart:
            price = float(item.get("price", 0))
            qty = int(item.get("quantity", 0))
            
            # Calculate delivery fee
            fee = float(item.get("within_state_fee", 0)) if request.buyer_state == item.get("seller_state") else float(item.get("outside_state_fee", 0))
            
            item_total = (price * qty) + fee
            total_amount += item_total
        
        # Initialize Paystack payment
        headers = {
            "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
            "Content-Type": "application/json"
        }
        
        data = {
            "email": request.buyer_email,
            "amount": int(total_amount * 100),  # Convert to kobo
            "callback_url": "http://localhost:3000/verify-payment"
        }
        
        res = requests.post("https://api.paystack.co/transaction/initialize", json=data, headers=headers)
        
        if res.status_code == 200 and res.json().get("status"):
            payment_data = res.json()["data"]
            ref = payment_data["reference"]
            auth_url = payment_data["authorization_url"]
            
            # Save orders to database
            for item in cart:
                fee = float(item.get("within_state_fee", 0)) if request.buyer_state == item.get("seller_state") else float(item.get("outside_state_fee", 0))
                total_price = (item["price"] * item["quantity"]) + fee
                
                order_record = {
                    "product_id": item["product_id"],
                    "vendor_id": item["vendor_id"],
                    "user_id": user_id,
                    "buyer_name": request.buyer_name,
                    "buyer_contact": request.buyer_contact,
                    "delivery_state": request.buyer_state,
                    "buyer_email": request.buyer_email,
                    "delivery_fee": fee,
                    "quantity": item["quantity"],
                    "cart": json.dumps(cart),
                    "total_price": total_price,
                    "status": "pending",
                    "payment_reference": ref,
                    "created_at": str(datetime.now())
                }
                
                supabase.table("orders").insert(order_record).execute()
            
            return {
                "payment_url": auth_url,
                "reference": ref,
                "total_amount": total_amount
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to initialize payment")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/verify-payment/{reference}")
async def verify_payment(reference: str, user: Dict = Depends(get_current_user)):
    """Verify payment and update order status"""
    try:
        user_id = user["user_id"]
        
        # Verify with Paystack
        headers = {"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"}
        res = requests.get(f"https://api.paystack.co/transaction/verify/{reference}", headers=headers)
        
        if res.status_code == 200:
            response_data = res.json().get("data", {})
            
            if response_data.get("status") == "success":
                # Update orders
                supabase.table("orders").update({
                    "status": "paid",
                    "payment_status": "escrow",
                    "updated_at": str(datetime.now())
                }).eq("payment_reference", reference).execute()
                
                # Clear cart
                supabase.table("cart").delete().eq("user_id", user_id).execute()
                
                # Fetch orders for receipt
                orders_response = supabase.table("orders").select("*").eq("payment_reference", reference).execute()
                
                return {
                    "success": True,
                    "message": "Payment successful",
                    "orders": orders_response.data
                }
            else:
                return {
                    "success": False,
                    "message": "Payment not successful"
                }
        else:
            raise HTTPException(status_code=500, detail="Failed to verify payment")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
