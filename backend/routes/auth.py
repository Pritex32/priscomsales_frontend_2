from fastapi import APIRouter, Depends, HTTPException, status, Request, Form
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import jwt, JWTError
import hashlib
from backend.core.security import (
    pwd_context,
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_current_user,
)
from backend.core.supabase_client import supabase
from backend.core.rate_limit import is_ip_blocked, record_login_attempt, get_client_ip
from backend.core.email import send_verification_email
from backend.core.permission_check import get_user_permissions

from fastapi.responses import HTMLResponse
import os
import hashlib
from passlib.exc import UnknownHashError

router = APIRouter(prefix="/auth", tags=["auth"])

def verify_user_password(user: dict, plain_password: str) -> bool:
    """
    Verify MD user password with SHA256; support bcrypt and plaintext for existing hashes.
    """
    stored = (user or {}).get("password_hash") or ""
    if not stored:
        return False
    
    # Primary: SHA256 hex verification
    sha = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    if stored == sha:
        return True
    
    # Legacy: plaintext comparison
    if stored == plain_password:
        return True
    
    # Fallback: bcrypt for existing hashes
    try:
        if stored.startswith('$2b$') or stored.startswith('$2a$'):
            return pwd_context.verify(plain_password, stored)
    except (UnknownHashError, ValueError) as e:
        # Handle bcrypt errors gracefully
        pass
    except Exception:
        pass

    return False

def verify_employee_password(employee: dict, plain_password: str) -> bool:
    """
    Verify employee password with SHA256; support bcrypt and plaintext for existing passwords.
    employees.password stores the hash.
    """
    stored = (employee or {}).get("password") or ""
    if not stored:
        return False
    
    # Primary: SHA256 hex verification
    sha = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    if stored == sha:
        return True
    
    # Legacy: plaintext comparison
    if stored == plain_password:
        return True
    
    # Fallback: bcrypt for existing hashes
    try:
        if stored.startswith('$2b$') or stored.startswith('$2a$'):
            return pwd_context.verify(plain_password, stored)
    except (UnknownHashError, ValueError):
        pass
    except Exception:
        pass

    return False
 
def _load_app_terms_html() -> str:
    """
    Load PriscomSales Terms & Conditions HTML from a repository file if present,
    otherwise fall back to embedded content provided by the product owner.
    """
    try_paths = []
    try:
        # repo root relative to this file
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        try_paths.append(os.path.join(root_dir, "priscomac_sales_software-main", "chibuzo_sales", "terms.html"))
        # also try CWD
        try_paths.append(os.path.join(os.getcwd(), "priscomac_sales_software-main", "chibuzo_sales", "terms.html"))
    except Exception:
        pass

    for p in try_paths:
        try:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    return f.read()
        except Exception:
            continue

    # Embedded default based on provided Terms & Conditions text
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Terms and Conditions - PriscomSales</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 2rem; line-height: 1.6; background: #f9f9f9; color: #333; }
    h1 { color: #0f766e; }
    h2 { margin-top: 1.25rem; color: #134e4a; }
    ul { margin-left: 1rem; }
    .section { margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>Terms and Conditions for PriscomSales Software</h1>
  <p>Welcome to PriscomSales Software. By accessing, installing, or using our software, you agree to be bound by these Terms and Conditions. Please read them carefully before using the application.</p>

  <div class="section">
    <h2>1. Acceptance of Terms</h2>
    <p>By using PriscomSales, you acknowledge that you have read, understood, and agreed to these Terms. If you do not agree, you must discontinue use of the software immediately.</p>
  </div>

  <div class="section">
    <h2>2. License of Use</h2>
    <ul>
      <li>PriscomSales grants you a limited, non-exclusive, non-transferable license to use the software solely for your business operations.</li>
      <li>You may not modify, reverse engineer, resell, or distribute the software without prior written consent from PriscomSales.</li>
    </ul>
  </div>

  <div class="section">
    <h2>3. User Responsibilities</h2>
    <ul>
      <li>You are responsible for the accuracy of the data entered into the software.</li>
      <li>You agree not to use PriscomSales for any unlawful activities, fraud, or data manipulation.</li>
      <li>You must maintain the confidentiality of your login credentials and are responsible for all activities under your account.</li>
    </ul>
  </div>

  <div class="section">
    <h2>4. Data & Privacy</h2>
    <ul>
      <li>PriscomSales may collect and store certain data for functionality and analytics.</li>
      <li>Customer data entered remains the property of the user. PriscomSales will not sell or misuse your business data.</li>
      <li>For details, please refer to our Privacy Policy.</li>
    </ul>
  </div>

  <div class="section">
    <h2>5. Payment & Subscription</h2>
    <ul>
      <li>Certain features of PriscomSales may require payment or subscription.</li>
      <li>All fees are non-refundable unless otherwise stated.</li>
      <li>PriscomSales reserves the right to change pricing plans with prior notice.</li>
    </ul>
  </div>

  <div class="section">
    <h2>6. Limitations of Liability</h2>
    <ul>
      <li>PriscomSales is provided “as is” without warranties of any kind.</li>
      <li>We do not guarantee uninterrupted or error-free operation.</li>
      <li>PriscomSales shall not be held liable for loss of profits, data, or business interruptions resulting from the use or inability to use the software.</li>
    </ul>
  </div>

  <div class="section">
    <h2>7. Updates & Modifications</h2>
    <ul>
      <li>PriscomSales may update or modify the software periodically to enhance performance, security, or features.</li>
      <li>Continued use of the software after updates constitutes acceptance of those changes.</li>
    </ul>
  </div>

  <div class="section">
    <h2>8. Termination</h2>
    <p>PriscomSales reserves the right to suspend or terminate your account if you breach these Terms. Upon termination, your license to use the software ends immediately.</p>
  </div>

  <div class="section">
    <h2>9. Contact Information</h2>
    <p>If you have any questions about these Terms, please contact us at: <strong>priscomac@gmail.com</strong></p>
  </div>
</body>
</html>"""

@router.get("/terms", response_class=HTMLResponse)
async def get_terms():
    """
    Serve the PriscomSales Terms & Conditions as HTML for the registration page.
    Frontends should link to this endpoint near the 'I accept the Terms' checkbox.
    """
    html = _load_app_terms_html()
    wrapped = f'<div style="background-color:white; padding:20px; border-radius:12px;">{html}</div>'
    return HTMLResponse(content=wrapped, media_type="text/html")

@router.get("/registration-info")
async def registration_info():
    """
    Small helper to expose registration-related links.
    """
    return {"terms_url": "/auth/terms"}


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = "md"
    plan: str = "free"
    accepted_terms: bool = False
    access_code: str | None = None


@router.post("/register")
async def register(request: RegisterRequest):
    # Check if user exists
    response = supabase.table("users").select("*").eq("username", request.username).execute()
    if response.data:
        raise HTTPException(status_code=400, detail="Username already registered")

    response = supabase.table("users").select("*").eq("email", request.email).execute()
    if response.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Require acceptance of terms and conditions
    if not request.accepted_terms:
        raise HTTPException(status_code=400, detail="You must accept terms and conditions to register")

    # Hash password using SHA256 (matching Streamlit implementation)
    hashed_password = hashlib.sha256(request.password.encode()).hexdigest()

    # Create user (set is_verified=False)
    data = {
        "username": request.username,
        "email": request.email,
        "password_hash": hashed_password,
        "role": request.role,
        "access_code": request.access_code,
        "is_verified": False,
        "accepted_terms": request.accepted_terms,
        "deleted": False,
    }
    response = supabase.table("users").insert(data).execute()
    user = response.data[0]
    user_id = user_id = user.get("user_id") or user.get("id")
    # Create employee if role is md (auto-register as employee)
    if request.role == "md":
        employee_data = {
            "user_id": user_id,
            "name": request.username,
            "email": request.email,
            "role": "employee",
            "access_choice": None,
            "password": hashed_password,  # store hashed
            "deleted": False,
        }
        supabase.table("employees").insert(employee_data).execute()

    # Create subscription
    is_active = request.plan == "pro"
    started_at = datetime.utcnow().date() if is_active else None
    expires_at = started_at + timedelta(days=30) if is_active else None
    subscription_data = {
        "user_id": user_id,
        "plan": request.plan,
        "is_active": is_active,
        "started_at": started_at.isoformat() if started_at else None,
        "expires_at": expires_at.isoformat() if expires_at else None,
    }
    supabase.table("subscription").insert(subscription_data).execute()

    # Generate email verification token (valid for 24 hours) and send via Brevo
    verify_claims = {
        "sub": request.username,
        "type": "email_verify",
        "exp": datetime.utcnow() + timedelta(hours=24),
        "iat": datetime.utcnow(),
    }
    token = jwt.encode(verify_claims, SECRET_KEY, algorithm=ALGORITHM)
    await send_verification_email(request.email, request.username, token)

    return {"msg": "User registered successfully. Please verify your email.", "user_id": user_id}


@router.post("/token")
async def login_for_access_token(
    request: Request, form_data: OAuth2PasswordRequestForm = Depends()
):
    # Rate limit per IP: max 3 failed attempts in 30 minutes
    ip = get_client_ip(request)
    if is_ip_blocked(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in 30 minutes.",
        )

    # Authenticate user using supabase (username only)
    response = supabase.table("users").select("*").eq("username", form_data.username).execute()
    candidates = response.data or []

    # Fallback: case-insensitive and loose match to handle stray spaces/casing in stored usernames
    if not candidates:
        try:
            resp2 = supabase.table("users").select("*").ilike("username", form_data.username).execute()
            candidates.extend(resp2.data or [])
        except Exception:
            pass
        try:
            resp3 = supabase.table("users").select("*").ilike("username", f"%{form_data.username}%").execute()
            candidates.extend(resp3.data or [])
        except Exception:
            pass

    # Deduplicate by user_id/id/username
    seen = set()
    unique_candidates = []
    for u in candidates:
        key = u.get("user_id") or u.get("id") or u.get("username")
        if key not in seen:
            seen.add(key)
            unique_candidates.append(u)

    # Verify password against candidates
    user = None
    for u in unique_candidates:
        if verify_user_password(u, form_data.password):
            user = u
            break

    if not user:
        record_login_attempt(ip, False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Block login for unverified users - also send (or re-send) a verification email
    if not user.get("is_verified", False):
        # Create a fresh verification token valid for 24h and send via Brevo (if configured)
        verify_claims = {
            "sub": user["username"],
            "type": "email_verify",
            "exp": datetime.utcnow() + timedelta(hours=24),
            "iat": datetime.utcnow(),
        }
        token = jwt.encode(verify_claims, SECRET_KEY, algorithm=ALGORITHM)
        try:
            await send_verification_email(user.get("email") or "", user["username"], token)
        except Exception:
            # Never fail login flow due to email send issues; we still block unverified login.
            pass

        # Do not count as failed attempt; it's a verification gate
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. A verification email has been sent to your address.",
        )

    # Successful login - record and issue token
    record_login_attempt(ip, True)

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"], "role": user["role"]}, expires_delta=access_token_expires
    )

    # Fetch subscription for token
    response = (
        supabase.table("subscription")
        .select("*")
        .eq("user_id", user["user_id"])
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    subscription = response.data[0] if response.data else None
    plan = subscription["plan"] if subscription else "free"
    is_active = subscription["is_active"] if subscription else False

# Fetch user permissions (skip for MD - they have all permissions)
    permissions = []
    permission_codes = []
    if user.get("role", "").lower() != "md":
        try:
            user_id = user.get("user_id") or user.get("id")
            permissions = get_user_permissions(user_id, user.get("role"))
            # Convert to codes for client side
            try:
                from backend.core.permission_check import to_permission_code
            except Exception:
                to_permission_code = lambda x: (x or '').upper().replace('.', '_')
            permission_codes = list({to_permission_code(p) for p in (permissions or [])})
        except Exception:
            # Ignore permission fetch errors during login
            pass

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "plan": plan,
        "is_active": is_active,
        "permissions": permissions,
        "permission_codes": permission_codes,
        "role": user.get("role"),
        "username": user.get("username"),
    }

@router.post("/refresh-subscription")
async def refresh_subscription_token(current_user = Depends(get_current_user)):
    """
    Refresh token with updated subscription status.
    Called when subscription status changes (plan upgrade/downgrade, expiry).
    Returns updated token with current plan and is_active status.
    """
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        username = current_user.get("username")
        role = current_user.get("role", "md")
        
        # Fetch latest subscription
        sub_response = (
            supabase.table("subscription")
            .select("*")
            .eq("user_id", user_id)
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        
        subscription = sub_response.data[0] if sub_response.data else None
        plan = subscription.get("plan", "free") if subscription else "free"
        is_active = subscription.get("is_active", False) if subscription else False
        
        # Check if subscription has expired
        if subscription and subscription.get("expires_at"):
            try:
                exp_date = datetime.fromisoformat(subscription.get("expires_at").replace("Z", "+00:00"))
                if exp_date < datetime.utcnow():
                    is_active = False
                    # Auto-downgrade to free plan
                    supabase.table("subscription").update({
                        "plan": "free",
                        "is_active": False
                    }).eq("user_id", user_id).execute()
                    plan = "free"
            except Exception:
                pass
        
        # Generate new token with updated subscription data
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": username, "role": role}, 
            expires_delta=access_token_expires
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "plan": plan,
            "is_active": is_active,
            "refreshed": True
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing subscription: {str(e)}")

@router.post("/renew")
async def renew_access_token(current_user = Depends(get_current_user)):
    """
    Renew the access token for an active session.
    Keeps users logged in while they're active (sliding 9-hour window).
    """
    # Build claims based on principal type
    if current_user.get("role") == "employee":
        tenant_user_id = current_user.get("id")
        claims = {
            "sub": "employee",
            "role": "employee",
            "user_id": tenant_user_id,
            "username": current_user.get("username"),
            "email": current_user.get("email"),
            "iat": datetime.utcnow(),
        }
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(data=claims, expires_delta=access_token_expires)

        # Fetch subscription for tenant user
        sub_resp = (
            supabase.table("subscription")
            .select("*")
            .eq("user_id", tenant_user_id)
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        subscription = sub_resp.data[0] if sub_resp.data else None
        plan = subscription["plan"] if subscription else "free"
        is_active = subscription["is_active"] if subscription else False

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": "employee",
            "plan": plan,
            "is_active": is_active,
        }

    # MD (owner)
    username = current_user.get("username")
    role = current_user.get("role")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": username, "role": role}, expires_delta=access_token_expires
    )

    # Fetch subscription for token
    owner_user_id = current_user.get("id") or current_user.get("user_id")
    response = (
        supabase.table("subscription")
        .select("*")
        .eq("user_id", owner_user_id)
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    subscription = response.data[0] if response.data else None
    plan = subscription["plan"] if subscription else "free"
    is_active = subscription["is_active"] if subscription else False

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "plan": plan,
        "is_active": is_active,
    }

@router.post("/employee/token")
async def employee_login_for_access_token(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
):
    """
    Employee login using employees table.
    Issues JWT with role='employee' and embeds the tenant company user_id.
    """
    # Rate limit per IP
    ip = get_client_ip(request)
    if is_ip_blocked(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in 30 minutes.",
        )

    # Find employee by email
    resp = supabase.table("employees").select("*").eq("email", email).limit(1).execute()
    if not resp.data:
        record_login_attempt(ip, False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    employee = resp.data[0]
    # Verify password with bcrypt or legacy fallback; upgrade to bcrypt on success
    if not verify_employee_password(employee, password):
        record_login_attempt(ip, False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    # Success
    record_login_attempt(ip, True)

    # Build employee claims (tenant user_id = company owner id)
    tenant_user_id = employee.get("user_id")
    employee_id = employee.get("employee_id") or employee.get("id")
    claims = {
        "sub": "employee",
        "role": "employee",
        "user_id": tenant_user_id,
        "employee_id": employee_id,  # ADD employee_id to JWT
        "username": employee.get("name"),
        "email": employee.get("email"),
        "iat": datetime.utcnow(),
    }
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data=claims, expires_delta=access_token_expires)

    # Fetch subscription under tenant user
    sub_resp = (
        supabase.table("subscription")
        .select("*")
        .eq("user_id", tenant_user_id)
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    subscription = sub_resp.data[0] if sub_resp.data else None
    plan = subscription["plan"] if subscription else "free"
    is_active = subscription["is_active"] if subscription else False

    # Fetch employee permissions from employee_permissions table
    permissions = []
    permission_codes = []
    try:
        print(f"\n=== FETCHING PERMISSIONS FOR EMPLOYEE ID: {employee_id} ===")
        permissions = get_user_permissions(employee_id, "employee")
        print(f"Raw permissions fetched: {permissions}")
        try:
            from backend.core.permission_check import to_permission_code
        except Exception:
            to_permission_code = lambda x: (x or '').upper().replace('.', '_')
        permission_codes = list({to_permission_code(p) for p in (permissions or [])})
        print(f"Permission codes generated: {permission_codes}")
        print(f"=== END PERMISSIONS FETCH ===")
    except Exception as e:
        print(f"ERROR fetching permissions: {e}")
        import traceback
        traceback.print_exc()
        # Ignore permission fetch errors during login
        pass

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": "employee",
        "plan": plan,
        "is_active": is_active,
        "permissions": permissions,
        "permission_codes": permission_codes,
        "username": employee.get("name"),
        "employee_id": employee_id,
    }

@router.get("/verify")
async def verify_email(token: str):
    # Verify token and set is_verified=True
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "email_verify":
            raise HTTPException(status_code=400, detail="Invalid verification token.")
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=400, detail="Invalid verification token.")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token.")

    # Update user verification status
    resp = supabase.table("users").update({"is_verified": True}).eq("username", username).execute()
    # If user not found, treat as invalid token (to avoid leaking existence info)
    if not resp.data:
        raise HTTPException(status_code=400, detail="Invalid verification token.")

    return {"msg": "Email verified successfully."}


@router.post("/resend-verification")
async def resend_verification(email: str):
    # Find user by email
    resp = supabase.table("users").select("*").eq("email", email).execute()
    if not resp.data:
        # Return generic message to avoid enumeration
        return {"msg": "If an account exists for this email, a verification email has been sent."}
    user = resp.data[0]

    if user.get("is_verified", False):
        raise HTTPException(status_code=400, detail="This account is already verified.")

    username = user["username"]
    verify_claims = {
        "sub": username,
        "type": "email_verify",
        "exp": datetime.utcnow() + timedelta(hours=24),
        "iat": datetime.utcnow(),
    }
    token = jwt.encode(verify_claims, SECRET_KEY, algorithm=ALGORITHM)
    await send_verification_email(email, username, token)

    return {"msg": "Verification email sent."}


@router.get("/me")
async def get_current_user_info(current_user=Depends(get_current_user)):
    """
    Get current logged-in user information including access code.
    """
    user_id = current_user.get("id") or current_user.get("user_id")
    role = (current_user.get("role") or "").lower()
    
    # For MD users, fetch user info from users table
    if role == "md":
        resp = supabase.table("users").select("username,email,role,access_code").eq("user_id", user_id).limit(1).execute()
        if resp.data:
            user_info = resp.data[0]
            return {
                "id": user_id,
                "username": user_info.get("username"),
                "email": user_info.get("email"),
                "role": user_info.get("role"),
                "access_code": user_info.get("access_code"),
            }
    
    # For employees, return basic info
    return {
        "id": user_id,
        "username": current_user.get("username"),
        "email": current_user.get("email"),
        "role": current_user.get("role"),
    }

@router.get("/my-permissions")
async def get_my_permissions(current_user=Depends(get_current_user)):
    """Return current user's permissions in both raw and code forms."""
    try:
        role = (current_user.get("role") or "").lower()
        # MD has all permissions implicitly; we return empty list and a flag
        if role == "md":
            return {"permissions": [], "permission_codes": [], "is_md": True}
        # Employees: fetch by employee_id if available else fallback to id
        employee_id = current_user.get("employee_id") or current_user.get("id")
        perms = get_user_permissions(employee_id, role)
        try:
            from backend.core.permission_check import to_permission_code
        except Exception:
            to_permission_code = lambda x: (x or '').upper().replace('.', '_')
        codes = list({to_permission_code(p) for p in (perms or [])})
        return {"permissions": perms, "permission_codes": codes, "is_md": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load permissions: {str(e)}")


@router.get("/employee/permissions")
async def get_employee_permissions(current_user=Depends(get_current_user)):
    """
    Return employee permissions on login or refresh.
    For use by frontend to store and check permissions.
    
    Returns:
        - employee_id: Employee ID
        - permissions: List of permission resource keys (e.g., ['sales.delete_button.access'])
        - permission_codes: List of permission codes (e.g., ['BTN_SALES_DELETE'])
        - is_md: Whether user is MD (has all permissions)
    """
    try:
        role = (current_user.get("role") or "").lower()
        
        # MD has all permissions implicitly
        if role == "md":
            user_id = current_user.get("user_id") or current_user.get("id")
            return {
                "employee_id": user_id,
                "permissions": [],
                "permission_codes": [],
                "is_md": True
            }
        
        # Employees: fetch by employee_id
        employee_id = current_user.get("employee_id") or current_user.get("id")
        perms = get_user_permissions(employee_id, role)
        
        # Convert to permission codes
        try:
            from backend.core.permission_check import to_permission_code
        except Exception:
            to_permission_code = lambda x: (x or '').upper().replace('.', '_')
        
        codes = list({to_permission_code(p) for p in (perms or [])})
        
        return {
            "employee_id": employee_id,
            "permissions": perms,
            "permission_codes": codes,
            "is_md": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load permissions: {str(e)}")

