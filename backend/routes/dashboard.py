from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from datetime import datetime, date, timedelta
import hashlib
import string
import random
import requests
import os
# Load environment variables from backend/.env if available
try:
    from dotenv import load_dotenv  # type: ignore
    _ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(_ENV_PATH):
        load_dotenv(_ENV_PATH)
except Exception:
    # If python-dotenv is not installed or load fails, continue; env may already be set
    pass
from backend.core.supabase_client import supabase
from backend.core.auth_deps import get_current_user
from backend.core.permission_check import check_permission

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

# Paystack configuration
PAYSTACK_SECRET_KEY = os.getenv('PAYSTACK_SECRET_KEY')
CALLBACK_URL = "http://localhost:3000/dashboard"

# Subscription plans
SUBSCRIPTION_PLANS = {
    "monthly_pro": {"label": "Pro (Monthly)", "amount": 15000, "days": 30, "plan_code": "pro"},
    "yearly": {"label": "Yearly", "amount": 180000, "days": 365, "plan_code": "pro"},
}

# ============= Models =============
class EmployeeCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "employee"

class SubscriptionStatus(BaseModel):
    plan: str
    is_active: bool
    expires_at: Optional[str] = None
    started_at: Optional[str] = None

class PaymentInitResponse(BaseModel):
    authorization_url: str
    reference: str

# ============= Utilities =============
def hash_password(password: str) -> str:
    """Hash password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def generate_access_code(length=8) -> str:
    """Generate random access code"""
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))

async def send_employee_credentials_email(email: str, name: str, password: str):
    """Send email with login credentials to new employee"""
    try:
        # Using a simple email service (you can replace with SendGrid, AWS SES, etc.)
        # For now, we'll use a placeholder - you should implement your email service
        
        subject = "Welcome to PriscomSales - Your Account Details"
        body = f"""
        Hello {name},

        Your employee account has been created for PriscomSales!

        Login Details:
        - Email: {email}
        - Password: {password}
        - Portal: https://priscomsales.online

        Please login and change your password immediately.

        Best regards,
        PriscomSales Team
        """
        
        # TODO: Implement actual email sending
        # For now, we'll just log it
        print(f"Email would be sent to {email}:")
        print(body)
        
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

def verify_md_role(current_user: dict) -> bool:
    """Verify user is MD"""
    role = current_user.get("role", "").strip().lower()
    if role != "md":
        raise HTTPException(status_code=403, detail="Only MD users can access this feature")
    return True

# ============= Endpoints =============

@router.get("/subscription-status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    """Get current user's subscription status"""
    try:
        user_id = current_user.get("user_id") or current_user.get("id")
        
        response = supabase.table("subscription")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("started_at", desc=True)\
            .limit(1)\
            .execute()
        
        # Get transaction count for free plan tracking
        transaction_count = 0
        try:
            sales_response = supabase.table("sales")\
                .select("sale_id", count="exact")\
                .eq("user_id", user_id)\
                .execute()
            transaction_count = sales_response.count or 0
        except:
            pass
        
        if response.data:
            sub = response.data[0]
            expires_at = sub.get("expires_at")
            is_active = sub.get("is_active", False)
            
            # Check if expired
            if expires_at:
                try:
                    exp_date = datetime.fromisoformat(expires_at).date()
                    if exp_date < date.today():
                        is_active = False
                except:
                    pass
            
            return {
                "plan": sub.get("plan", "free"),
                "is_active": is_active,
                "expires_at": expires_at,
                "started_at": sub.get("started_at"),
                "created_at": sub.get("started_at"),
                "amount": sub.get("amount"),
                "reference": sub.get("reference"),
                "transaction_count": transaction_count
            }
        
        return {
            "plan": "free",
            "is_active": False,
            "expires_at": None,
            "started_at": None,
            "transaction_count": transaction_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching subscription: {str(e)}")

@router.post("/create-employee")
async def create_employee(
    employee: EmployeeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create new employee account (requires employees.manage.access permission)"""
    try:
        # Check permission
        # For permission checks, use employee_id if present (for employees), otherwise user_id (for MD)
        role = current_user.get("role", "")
        
        # Extract the correct ID for permission checking
        if role.lower() == "md":
            check_id = current_user.get("user_id") or current_user.get("id")
        else:
            # For employees, use employee_id for permission checks
            check_id = current_user.get("employee_id") or current_user.get("user_id") or current_user.get("id")
        
        print(f"\n[create_employee] DEBUG:")
        print(f"  current_user keys: {current_user.keys()}")
        print(f"  role: {role}")
        print(f"  check_id for permissions: {check_id}")
        print(f"  Checking permission: employees.manage.access")
        
        has_perm = check_permission(check_id, "employees.manage.access", role)
        print(f"  check_permission result: {has_perm}")
        
        if not has_perm:
            raise HTTPException(status_code=403, detail="You do not have permission to manage employees")
        
        # For MD, use their user_id; for employees, get the MD's user_id from their record
        if role.lower() == "md":
            md_user_id = check_id
        else:
            # Get the MD user_id from employee record using employee_id
            emp_response = supabase.table("employees")\
                .select("user_id")\
                .eq("employee_id", check_id)\
                .execute()
            md_user_id = emp_response.data[0]["user_id"] if emp_response.data else check_id
        
        # Check if email already exists
        existing = supabase.table("employees")\
            .select("email")\
            .eq("email", employee.email.lower())\
            .execute()
        
        if existing.data:
            raise HTTPException(status_code=400, detail="Employee with this email already exists")
        
        # Hash password
        hashed_pwd = hash_password(employee.password)
        
        # Create employee
        employee_data = {
            "name": employee.name.strip(),
            "email": employee.email.lower(),
            "password": hashed_pwd,
            "role": employee.role,
            "deleted": False,
            "user_id": md_user_id
        }
        
        result = supabase.table("employees").insert(employee_data).execute()
        
        if result.data:
            new_employee_id = result.data[0]["employee_id"]
            
            # Grant warehouse access
            warehouses = supabase.table("inventory_master_log")\
                .select("warehouse_name")\
                .eq("access_choice", "Yes")\
                .eq("user_id", md_user_id)\
                .execute()
            
            if warehouses.data:
                for wh in warehouses.data:
                    supabase.table("warehouse_access").insert({
                        "employee_id": new_employee_id,
                        "warehouse_name": wh["warehouse_name"],
                        "user_id": md_user_id,
                        "access_choice": "Yes"
                    }).execute()
            
            # Send email with credentials
            await send_employee_credentials_email(
                employee.email,
                employee.name,
                employee.password
            )
            
            return {
                "success": True,
                "message": f"Employee '{employee.name}' created successfully. Login credentials sent to {employee.email}",
                "employee_id": new_employee_id,
                "warehouses_granted": len(warehouses.data) if warehouses.data else 0
            }
        
        raise HTTPException(status_code=500, detail="Failed to create employee")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating employee: {str(e)}")

@router.get("/employees")
async def get_employees(current_user: dict = Depends(get_current_user)):
    """Get all employees (requires employees.manage.access permission)"""
    try:
        # Check permission
        role = current_user.get("role", "")
        
        # Extract the correct ID for permission checking
        if role.lower() == "md":
            check_id = current_user.get("user_id") or current_user.get("id")
        else:
            # For employees, use employee_id for permission checks
            check_id = current_user.get("employee_id") or current_user.get("user_id") or current_user.get("id")
        
        if not check_permission(check_id, "employees.manage.access", role):
            raise HTTPException(status_code=403, detail="You do not have permission to view employees")
        
        # For MD, use their user_id; for employees, use the MD's user_id from their record
        if role.lower() == "md":
            md_user_id = check_id
        else:
            # Get the MD user_id from employee record using employee_id
            emp_response = supabase.table("employees")\
                .select("user_id")\
                .eq("employee_id", check_id)\
                .execute()
            md_user_id = emp_response.data[0]["user_id"] if emp_response.data else check_id
        
        response = supabase.table("employees")\
            .select("employee_id, name, email, role, created_at")\
            .eq("user_id", md_user_id)\
            .eq("deleted", False)\
            .execute()
        
        return {"employees": response.data or []}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching employees: {str(e)}")

@router.post("/initialize-payment")
async def initialize_payment(
    plan_key: str,
    current_user: dict = Depends(get_current_user)
):
    """Initialize Paystack payment for subscription"""
    try:
        verify_md_role(current_user)
        
        if not PAYSTACK_SECRET_KEY:
            raise HTTPException(status_code=500, detail="Payment system not configured. Please contact support.")
        
        if plan_key not in SUBSCRIPTION_PLANS:
            raise HTTPException(status_code=400, detail="Invalid plan selected")
        
        plan = SUBSCRIPTION_PLANS[plan_key]
        user_id = current_user.get("user_id") or current_user.get("id")
        email = current_user.get("email")
        
        if not email:
            raise HTTPException(status_code=400, detail="User email not found")
        
        # Create unique reference
        unique_ref = f"{user_id}-{plan_key}-{int(plan['amount'])}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        headers = {
            "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
            "Content-Type": "application/json"
        }
        
        data = {
            "email": email,
            "amount": plan["amount"] * 100,  # Convert to kobo
            "reference": unique_ref,
            "callback_url": f"{CALLBACK_URL}?plan_key={plan_key}"
        }
        
        response = requests.post(
            "https://api.paystack.co/transaction/initialize",
            json=data,
            headers=headers,
            timeout=10
        )
        
        result = response.json()
        
        if result.get("status") and "data" in result:
            return {
                "authorization_url": result["data"]["authorization_url"],
                "reference": result["data"]["reference"]
            }
        
        error_message = result.get("message", "Failed to initialize payment")
        raise HTTPException(status_code=500, detail=error_message)
        
    except HTTPException:
        raise
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Network error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment initialization error: {str(e)}")

@router.get("/verify-payment")
async def verify_payment(
    reference: str = Query(...),
    current_user: dict = Depends(get_current_user)
):
    """Verify Paystack payment and activate subscription"""
    try:
        headers = {"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"}
        
        response = requests.get(
            f"https://api.paystack.co/transaction/verify/{reference}",
            headers=headers
        )
        
        result = response.json()
        
        if result.get("status") and result["data"]["status"] == "success":
            # Extract user_id and plan_key from reference
            parts = reference.split("-")
            user_id = int(parts[0])
            plan_key = parts[1]
            
            # Verify this is the current user
            current_user_id = current_user.get("user_id") or current_user.get("id")
            if user_id != current_user_id:
                raise HTTPException(status_code=403, detail="Payment reference doesn't match user")
            
            plan = SUBSCRIPTION_PLANS[plan_key]
            today = date.today()
            expires = today + timedelta(days=plan["days"])
            amount = result["data"]["amount"] // 100
            
            # Update or insert subscription
            existing = supabase.table("subscription")\
                .select("id")\
                .eq("user_id", user_id)\
                .execute()
            
            sub_data = {
                "reference": reference,
                "amount": amount,
                "status": "success",
                "plan": plan["plan_code"],
                "is_active": True,
                "started_at": today.isoformat(),
                "expires_at": expires.isoformat()
            }
            
            if existing.data:
                supabase.table("subscription")\
                    .update(sub_data)\
                    .eq("user_id", user_id)\
                    .execute()
            else:
                sub_data["user_id"] = user_id
                supabase.table("subscription").insert(sub_data).execute()
            
            return {
                "success": True,
                "message": f"Payment verified! Your {plan['label']} subscription is now active.",
                "plan": plan["plan_code"],
                "expires_at": expires.isoformat()
            }
        
        raise HTTPException(status_code=400, detail="Payment verification failed")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment verification error: {str(e)}")

@router.get("/plans")
async def get_subscription_plans():
    """Get available subscription plans"""
    return {
        "plans": [
            {
                "key": key,
                "label": plan["label"],
                "amount": plan["amount"],
                "days": plan["days"],
                "plan_code": plan["plan_code"]
            }
            for key, plan in SUBSCRIPTION_PLANS.items()
        ]
    }

@router.get("/dashboard-stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get dashboard statistics"""
    try:
        user_id = current_user.get("user_id") or current_user.get("id")
        
        # Get total sales count
        sales = supabase.table("sales_master_log")\
            .select("*", count="exact")\
            .eq("user_id", user_id)\
            .execute()
        
        # Get inventory count
        inventory = supabase.table("inventory_master_log")\
            .select("*", count="exact")\
            .eq("user_id", user_id)\
            .execute()
        
        # Get customers count
        customers = supabase.table("customers")\
            .select("*", count="exact")\
            .eq("user_id", user_id)\
            .execute()
        
        # Get employees count
        employees = supabase.table("employees")\
            .select("*", count="exact")\
            .eq("user_id", user_id)\
            .eq("deleted", False)\
            .execute()
        
        return {
            "total_sales": sales.count or 0,
            "inventory_items": inventory.count or 0,
            "active_customers": customers.count or 0,
            "employees": employees.count or 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stats: {str(e)}")

