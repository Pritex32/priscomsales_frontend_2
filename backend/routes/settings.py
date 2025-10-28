from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from datetime import date, datetime
import hashlib
import random
import string
import os

from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase


router = APIRouter(prefix="/settings", tags=["settings"])


# =========================
# Helpers
# =========================
def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _assert_md(current_user: Dict[str, Any]):
    role = (current_user.get("role") or "").lower()
    if role != "md":
        raise HTTPException(status_code=403, detail="Only MD can access settings operations")


# =========================
# Access Code Management
# =========================
class SetAccessCodeRequest(BaseModel):
    code: str = Field(..., min_length=1, description="New access code to set")


@router.put("/access-code/generate")
async def generate_access_code(current_user=Depends(get_protected_user)):
    """
    Generate a new random access code for the MD (users table).
    """
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")
    new_code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    resp = supabase.table("users").update({"access_code": new_code}).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to update access code")
    return {"access_code": new_code}


@router.put("/access-code")
async def set_access_code(payload: SetAccessCodeRequest, current_user=Depends(get_protected_user)):
    """
    Set a custom access code for the MD (users table).
    """
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("users").update({"access_code": payload.code.strip()}).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to set access code")
    return {"msg": "Access code updated", "access_code": payload.code.strip()}


# =========================
# Change Password (MD)
# =========================
class ChangePasswordRequest(BaseModel):
    email: str
    access_code: str
    new_password: str


@router.post("/change-password")
async def change_password(payload: ChangePasswordRequest, current_user=Depends(get_protected_user)):
    """
    Change password for the MD (users table) after verifying email and access_code.
    """
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")

    # Fetch user by email (scoped by this tenant)
    sel = supabase.table("users").select("*").eq("email", payload.email).eq("user_id", user_id).limit(1).execute()
    row = sel.data[0] if sel.data else None
    if not row:
        raise HTTPException(status_code=404, detail="Account not found for provided email")
    stored_code = row.get("access_code")
    if stored_code != payload.access_code:
        raise HTTPException(status_code=400, detail="Invalid access code")

    hashed = _hash_password(payload.new_password)
    upd = supabase.table("users").update({"password_hash": hashed}).eq("email", payload.email).eq("user_id", user_id).execute()
    if not upd.data:
        raise HTTPException(status_code=500, detail="Failed to update password")
    return {"msg": "Password updated successfully"}


# =========================
# Inventory Officers CRUD
# =========================
class OfficerCreate(BaseModel):
    officer_name: str
    officer_email: str


class OfficerUpdate(BaseModel):
    officer_name: Optional[str] = None
    officer_email: Optional[str] = None


@router.post("/inventory-officers")
async def add_inventory_officer(payload: OfficerCreate, current_user=Depends(get_protected_user)):
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")

    # Check unique email per user
    exists = supabase.table("inventory_officer").select("officer_id").eq("user_id", user_id).eq("officer_email", payload.officer_email).execute()
    if exists.data:
        raise HTTPException(status_code=400, detail="Officer email already exists for this tenant")

    ins = supabase.table("inventory_officer").insert({
        "officer_name": payload.officer_name,
        "officer_email": payload.officer_email,
        "user_id": user_id
    }).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to add officer")
    return {"msg": "Officer added", "officer_id": ins.data[0].get("officer_id")}


@router.get("/inventory-officers")
async def list_inventory_officers(current_user=Depends(get_protected_user)):
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("inventory_officer").select("*").eq("user_id", user_id).execute()
    return resp.data or []


@router.put("/inventory-officers/{officer_id}")
async def update_inventory_officer(officer_id: int, payload: OfficerUpdate, current_user=Depends(get_protected_user)):
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")

    # Ensure officer exists for this user
    sel = supabase.table("inventory_officer").select("*").eq("officer_id", officer_id).eq("user_id", user_id).limit(1).execute()
    if not sel.data:
        raise HTTPException(status_code=404, detail="Officer not found")

    update_data: Dict[str, Any] = {}
    if payload.officer_name is not None:
        update_data["officer_name"] = payload.officer_name
    if payload.officer_email is not None:
        # Check unique email per user if updating
        exists = supabase.table("inventory_officer").select("officer_id").eq("user_id", user_id).eq("officer_email", payload.officer_email).execute()
        if exists.data and exists.data[0]["officer_id"] != officer_id:
            raise HTTPException(status_code=400, detail="Another officer with this email already exists")
        update_data["officer_email"] = payload.officer_email

    if not update_data:
        return {"msg": "No changes"}
    upd = supabase.table("inventory_officer").update(update_data).eq("officer_id", officer_id).eq("user_id", user_id).execute()
    if not upd.data:
        raise HTTPException(status_code=500, detail="Failed to update officer")
    return {"msg": "Officer updated"}


@router.delete("/inventory-officers/{officer_id}")
async def delete_inventory_officer(officer_id: int, current_user=Depends(get_protected_user)):
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")
    sel = supabase.table("inventory_officer").select("officer_id").eq("officer_id", officer_id).eq("user_id", user_id).limit(1).execute()
    if not sel.data:
        raise HTTPException(status_code=404, detail="Officer not found")
    supabase.table("inventory_officer").delete().eq("officer_id", officer_id).eq("user_id", user_id).execute()
    return {"msg": "Officer deleted"}


# =========================
# Delete Account (soft delete)
# =========================
class DeleteAccountRequest(BaseModel):
    account_type: Literal["user", "employee"] = Field(..., description="Delete MD account or an employee account")
    email: str
    password: str
    name_value: Optional[str] = Field(None, description="Username for MD or Name for employee (optional)")


@router.post("/delete-account")
async def delete_account(payload: DeleteAccountRequest, current_user=Depends(get_protected_user)):
    """
    Soft-delete account by setting deleted=True.
    - For 'user': verifies against users.password_hash (hashed via SHA-256) and scoped to current tenant.
    - For 'employee': verifies against employees.password (stored hashed via SHA-256) and scoped to current tenant.
    """
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")
    hashed_pw = _hash_password(payload.password)

    if payload.account_type == "user":
        q = supabase.table("users").select("*").eq("email", payload.email).eq("user_id", user_id).eq("deleted", False).limit(1)
        if payload.name_value:
            q = q.eq("username", payload.name_value)
        sel = q.execute()
        row = sel.data[0] if sel.data else None
        if not row:
            raise HTTPException(status_code=404, detail="Account not found or already deleted")
        if (row.get("password_hash") or "") != hashed_pw:
            raise HTTPException(status_code=400, detail="Invalid password")
        supabase.table("users").update({"deleted": True}).eq("email", payload.email).eq("user_id", user_id).execute()
        return {"msg": "User account deleted (soft delete)"}

    # employee path
    q = supabase.table("employees").select("*").eq("email", payload.email).eq("user_id", user_id).eq("deleted", False).limit(1)
    if payload.name_value:
        q = q.eq("name", payload.name_value)
    sel = q.execute()
    row = sel.data[0] if sel.data else None
    if not row:
        raise HTTPException(status_code=404, detail="Employee account not found or already deleted")
    if (row.get("password") or "") != hashed_pw:
        raise HTTPException(status_code=400, detail="Invalid password")
    supabase.table("employees").update({"deleted": True}).eq("email", payload.email).eq("user_id", user_id).execute()
    return {"msg": "Employee account deleted (soft delete)"}


# =========================
# Bank/POS Linking (Mono)
# =========================
class MonoLinkRequest(BaseModel):
    code: str = Field(..., description="Authorization code from Mono Connect widget")
    access_code: str = Field(..., description="MD's access code for verification")


class LinkedAccount(BaseModel):
    account_id: str
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None


@router.get("/linked-accounts")
async def get_linked_accounts(current_user=Depends(get_protected_user)):
    """
    Return linked account(s) for current tenant (MD only).
    """
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = supabase.table("linked_accounts").select("*").eq("user_id", user_id).execute()
    return resp.data or []


@router.post("/mono/link")
async def link_mono_account(payload: MonoLinkRequest, current_user=Depends(get_protected_user)):
    """
    Verify MD access_code, exchange Mono authorization code for account, fetch details,
    and persist in linked_accounts.
    """
    # Lazy import to avoid hard dependency during app start if unused
    try:
        import httpx  # type: ignore
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"httpx not installed on server: {e}")

    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")

    # Debug logs
    try:
        code_preview = (payload.code or "")[:6] + "..."
    except Exception:
        code_preview = "(invalid)"
    print(f"DEBUG: /settings/mono/link called by user_id={user_id}, code={code_preview}")

    # Validate access code
    sel = supabase.table("users").select("access_code").eq("user_id", user_id).single().execute()
    stored_code = (sel.data or {}).get("access_code")
    print(f"DEBUG: access_code provided? {bool(payload.access_code)}, stored? {bool(stored_code)}")
    if not stored_code or stored_code != payload.access_code:
        print("DEBUG: Access code mismatch")
        raise HTTPException(status_code=400, detail="Invalid access code. Please try again.")

    mono_secret = os.getenv("MONO_SECRET_KEY")
    print(f"DEBUG: MONO_SECRET_KEY present: {bool(mono_secret)}")
    if not mono_secret:
        raise HTTPException(status_code=500, detail="Mono secret not configured on server")

    headers = {
        "mono-sec-key": mono_secret,
        "content-type": "application/json",
        "accept": "application/json",
    }

    # Exchange code -> account id
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            auth_resp = await client.post(
                "https://api.withmono.com/v2/accounts/auth",
                headers=headers,
                json={"code": payload.code},
            )
        print(f"DEBUG: Mono auth status={auth_resp.status_code}, body={auth_resp.text[:300]}")
    except Exception as e:
        print(f"ERROR: Mono auth request exception: {e}")
        raise HTTPException(status_code=502, detail=f"Mono auth request failed: {e}")

    if auth_resp.status_code >= 400:
        detail = None
        try:
            detail = auth_resp.json()
        except Exception:
            detail = auth_resp.text
        raise HTTPException(status_code=400, detail=f"Mono auth error: {detail}")

    auth_data = auth_resp.json() if auth_resp.headers.get("content-type", "").startswith("application/json") else {}
    mono_account_id = auth_data.get("id") or (auth_data.get("account") or {}).get("id")
    print(f"DEBUG: mono_account_id={mono_account_id}")
    if not mono_account_id:
        raise HTTPException(status_code=400, detail="Mono did not return an account id")

    # Fetch account details
    async with httpx.AsyncClient(timeout=30.0) as client:
        acct_resp = await client.get(
            f"https://api.withmono.com/v2/accounts/{mono_account_id}",
            headers=headers,
        )
    print(f"DEBUG: Mono acct status={acct_resp.status_code}, body={acct_resp.text[:300]}")

    if acct_resp.status_code >= 400:
        detail = None
        try:
            detail = acct_resp.json()
        except Exception:
            detail = acct_resp.text
        raise HTTPException(status_code=400, detail=f"Mono account fetch error: {detail}")

    acct = acct_resp.json() if acct_resp.headers.get("content-type", "").startswith("application/json") else {}

    # Normalize fields from possible Mono schema variants
    bank_name = (
        ((acct.get("account") or {}).get("institution") or {}).get("name")
        or (acct.get("account") or {}).get("bank_name")
        or (acct.get("bank") or {}).get("name")
    )
    account_name = (acct.get("account") or {}).get("name") or acct.get("account_name")
    account_number = (acct.get("account") or {}).get("accountNumber") or acct.get("account_number")

    # If an account already exists for this user, upsert to keep single row
    existing = supabase.table("linked_accounts").select("id, account_id").eq("user_id", user_id).limit(1).execute()
    payload_row = {
        "user_id": user_id,
        "account_id": mono_account_id,
        "bank_name": bank_name,
        "account_name": account_name,
        "account_number": account_number,
    }
    if existing.data:
        supabase.table("linked_accounts").update(payload_row).eq("user_id", user_id).execute()
    else:
        supabase.table("linked_accounts").insert(payload_row).execute()

    print("DEBUG: Linked account saved successfully")
    return {"msg": "Account successfully linked and secured with your access code.", "linked_account": payload_row}


@router.delete("/linked-accounts/{account_id}")
async def unlink_account(account_id: str, current_user=Depends(get_protected_user)):
    """
    Disconnect a linked account for this tenant (MD only).
    """
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")
    supabase.table("linked_accounts").delete().eq("user_id", user_id).eq("account_id", account_id).execute()
    return {"msg": "Account disconnected"}


# =========================
# Manage Employee Access (Permissions)
# =========================
class PermissionGrant(BaseModel):
    resource_key: str
    can_access: bool


class UpdateEmployeePermissionsRequest(BaseModel):
    grants: List[PermissionGrant] = Field(default_factory=list)


@router.get("/permissions")
async def list_global_permissions(current_user=Depends(get_protected_user)):
    """
    List all global permissions (available for assignment to employees).
    MD only.
    """
    _assert_md(current_user)
    resp = (
        supabase.table("permissions")
        .select("id, resource_key")
        .is_("user_id", None)
        .order("resource_key")
        .execute()
    )
    return resp.data or []


@router.get("/employees")
async def list_tenant_employees(current_user=Depends(get_protected_user)):
    """
    List employees under the current tenant (MD only).
    """
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")
    resp = (
        supabase.table("employees")
        .select("employee_id, name, email")
        .eq("user_id", user_id)
        .eq("deleted", False)
        .order("name")
        .execute()
    )
    return resp.data or []


@router.get("/employee-permissions/{employee_id}")
async def get_employee_permissions(employee_id: int, current_user=Depends(get_protected_user)):
    """
    Get current permission grants for an employee (as resource_key + can_access pairs).
    MD only and scoped to tenant.
    """
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")

    # Validate employee belongs to tenant
    emp_sel = (
        supabase.table("employees")
        .select("employee_id")
        .eq("employee_id", employee_id)
        .eq("user_id", user_id)
        .eq("deleted", False)
        .limit(1)
        .execute()
    )
    if not emp_sel.data:
        raise HTTPException(status_code=404, detail="Employee not found")

    ep_resp = (
        supabase.table("employee_permissions")
        .select("permission_id, can_access")
        .eq("employee_id", employee_id)
        .execute()
    )
    if not ep_resp.data:
        return {"employee_id": employee_id, "grants": []}

    perm_ids = [row["permission_id"] for row in ep_resp.data]
    perms_resp = (
        supabase.table("permissions")
        .select("id, resource_key")
        .in_("id", perm_ids)
        .execute()
    )
    id_to_key = {p["id"]: p["resource_key"] for p in (perms_resp.data or [])}

    grants = [
        {"resource_key": id_to_key.get(row["permission_id"]), "can_access": row.get("can_access", False)}
        for row in ep_resp.data
        if id_to_key.get(row["permission_id"]) is not None
    ]
    return {"employee_id": employee_id, "grants": grants}


@router.post("/employee-permissions/{employee_id}")
async def update_employee_permissions(
    employee_id: int,
    payload: UpdateEmployeePermissionsRequest,
    current_user=Depends(get_protected_user),
):
    """
    Update permission grants for an employee.
    Accepts a list of {resource_key, can_access} entries and upserts rows in employee_permission.
    MD only and scoped to tenant.
    """
    _assert_md(current_user)
    user_id = current_user.get("id") or current_user.get("user_id")

    # Validate employee belongs to tenant
    emp_sel = (
        supabase.table("employees")
        .select("employee_id")
        .eq("employee_id", employee_id)
        .eq("user_id", user_id)
        .eq("deleted", False)
        .limit(1)
        .execute()
    )
    if not emp_sel.data:
        raise HTTPException(status_code=404, detail="Employee not found")

    grants = payload.grants or []
    if not grants:
        return {"msg": "No changes", "updated": 0}

    # Map resource_keys -> permission ids
    keys = list({g.resource_key for g in grants})
    perms_resp = (
        supabase.table("permissions")
        .select("id, resource_key")
        .in_("resource_key", keys)
        .is_("user_id", None)
        .execute()
    )
    if not perms_resp.data:
        raise HTTPException(status_code=400, detail="No matching permissions for provided keys")
    key_to_id = {p["resource_key"]: p["id"] for p in perms_resp.data}

    updated = 0
    for g in grants:
        perm_id = key_to_id.get(g.resource_key)
        if perm_id is None:
            # Skip unknown keys
            continue
        # Try to update existing, else insert
        existing = (
            supabase.table("employee_permissions")
            .select("permission_id, can_access")
            .eq("employee_id", employee_id)
            .eq("permission_id", perm_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            upd = (
                supabase.table("employee_permissions")
                .update({"can_access": bool(g.can_access)})
                .eq("employee_id", employee_id)
                .eq("permission_id", perm_id)
                .execute()
            )
            updated += 1 if upd.data is not None else 0
        else:
            ins = (
                supabase.table("employee_permissions")
                .insert({
                    "employee_id": employee_id,
                    "permission_id": perm_id,
                    "user_id": user_id,
                    "can_access": bool(g.can_access),
                })
                .execute()
            )
            updated += 1 if ins.data is not None else 0

    return {"msg": "Permissions updated", "updated": updated}

