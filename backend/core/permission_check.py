"""
Permission Check Utilities for Backend Security
Secure all endpoints by checking user permissions from employee_permission table
"""

from fastapi import HTTPException, status, Depends
from typing import List, Optional
import logging

try:
    from backend.core.supabase_client import supabase
    from backend.core.auth_deps import get_current_user
except ImportError:
    from core.supabase_client import supabase
    from core.auth_deps import get_current_user

logger = logging.getLogger(__name__)

# ==========================
# Permission key utilities
# ==========================

def to_permission_code(resource_key: str) -> str:
    """Convert a DB resource_key to an UPPER_SNAKE permission code for clients.
    Examples:
    - "sales" or "sales.page.access" => "PAGE_SALES"
    - "admin_review.page.access" => "PAGE_ADMIN_REVIEW"
    - "inventory.edit_button.access" => "BTN_INVENTORY_EDIT"
    - "sales.report_tab.access" => "PAGE_SALES_REPORT"
    """
    if not resource_key:
        return ""
    try:
        key = resource_key.strip().lower()
        parts = key.split('.')
        # Derive base and action
        base = parts[0] if parts else key
        action = None
        # Try to find action keywords in parts
        if len(parts) > 1:
            for p in parts[1:]:
                if p in ("edit", "delete", "add", "create", "update", "view", "export", "report", "print"):
                    action = p.upper()
                    break
                if p.endswith("_button"):
                    action = p.replace("_button", "").upper()
                    break
                if p.endswith("_tab"):
                    action = p.replace("_tab", "").upper()
                    break
        # Button style
        if "button" in key or (action in {"EDIT","DELETE","ADD","CREATE","UPDATE"}):
            code = f"BTN_{base.upper()}_{action or 'ACTION'}"
        # Report tab style => page code with suffix
        elif "report" in key and ("tab" in key or "report_tab" in key):
            code = f"PAGE_{base.upper()}_REPORT"
        else:
            # Default to PAGE_<BASE> or PAGE_<BASE>_<ACTION>
            code = f"PAGE_{base.upper()}"
            if action:
                code = f"{code}_{action}"
        # Normalize double underscores
        code = code.replace("__", "_")
        return code
    except Exception:
        return resource_key.upper().replace('.', '_')


def is_md_user(user: dict) -> bool:
    """Check if user is an MD (has all permissions)"""
    role = user.get("role", "").lower()
    return role == "md"


def _alias_keys(permission_key: str) -> List[str]:
    """Generate possible aliases for a permission key to tolerate different naming styles."""
    try:
        base = permission_key or ""
        candidates = set()
        if base:
            candidates.add(base)
        # Common suffix variants
        if base and not base.endswith('.page.access'):
            candidates.add(f"{base}.page.access")
        if base and not base.endswith('.access'):
            candidates.add(f"{base}.access")
        if base and not base.endswith('.view'):
            candidates.add(f"{base}.view")
        if base and not base.endswith('.page'):
            candidates.add(f"{base}.page")
        # Stripped variants
        if base.endswith('.page.access'):
            candidates.add(base.replace('.page.access', ''))
        if base.endswith('.access'):
            candidates.add(base.replace('.access', ''))
        if base.endswith('.view'):
            candidates.add(base.replace('.view', ''))
        if base.endswith('.page'):
            candidates.add(base.replace('.page', ''))
        return list(candidates)
    except Exception:
        return [permission_key]


def check_permission(user_id: int, permission_key: str, user_role: str = None) -> bool:
    """
    Check if a user has a specific permission.
    
    Args:
        user_id: User ID or Employee ID
        permission_key: Permission resource key (e.g., 'sales.report_tab.access' or 'admin_review')
        user_role: User role (optional, for MD bypass)
    
    Returns:
        bool: True if user has permission, False otherwise
    """
    try:
        print(f"\n[check_permission] Called with user_id={user_id}, permission_key={permission_key}, user_role={user_role}")
        
        # MD users have all permissions
        if user_role and user_role.lower() == "md":
            print(f"[check_permission] MD user - returning True")
            return True

        if not user_id:
            print(f"[check_permission] No user_id - returning False")
            return False

        # Resolve permission IDs from possible aliases
        keys = _alias_keys(permission_key)
        print(f"[check_permission] Alias keys: {keys}")
        
        perm_q = (
            supabase.table("permissions")
            .select("id, resource_key")
            .in_("resource_key", keys)
            .is_("user_id", "null")
            .execute()
        )
        print(f"[check_permission] Found {len(perm_q.data or [])} matching permissions in DB")
        print(f"[check_permission] Permission data: {perm_q.data}")
        
        if not perm_q.data:
            # Permission key not found in database => deny by default (security-first)
            logger.warning(f"Permission key '{permission_key}' not found in permissions table - denying access")
            print(f"[check_permission] Permission not found in DB - returning False")
            return False
        perm_ids = [row["id"] for row in perm_q.data]
        print(f"[check_permission] Permission IDs: {perm_ids}")

        # Check if user has any of these permission IDs granted
        access_q = (
            supabase.table("employee_permissions")
            .select("permission_id, can_access")
            .eq("employee_id", user_id)
            .in_("permission_id", perm_ids)
            .eq("can_access", True)
            .limit(1)
            .execute()
        )
        print(f"[check_permission] Found {len(access_q.data or [])} granted permissions for employee {user_id}")
        print(f"[check_permission] Access data: {access_q.data}")
        result = bool(access_q.data)
        print(f"[check_permission] Returning: {result}")
        return result
    except Exception as e:
        logger.error(f"Error checking permission: {e}")
        return False


def get_user_permissions(user_id: int, user_role: str = None) -> List[str]:
    """
    Get all permissions for a user.
    
    Args:
        user_id: User ID or Employee ID
        user_role: User role (optional, for MD bypass)
    
    Returns:
        List of permission resource keys
    """
    try:
        print(f"\n[get_user_permissions] Called with user_id={user_id}, user_role={user_role}")
        # MD users have all permissions
        if user_role and user_role.lower() == "md":
            # Return all available permissions
            response = supabase.table("permissions")\
                .select("resource_key")\
                .is_("user_id", "null")\
                .execute()
            perms = [p["resource_key"] for p in (response.data or [])]
            print(f"[get_user_permissions] MD user - returning {len(perms)} permissions")
            return perms

        if not user_id:
            print(f"[get_user_permissions] No user_id provided - returning empty list")
            return []
        
        # Get employee's granted permission IDs
        print(f"[get_user_permissions] Querying employee_permissions table for employee_id={user_id}")
        emp_perms = (
            supabase.table("employee_permissions")
            .select("permission_id")
            .eq("employee_id", user_id)
            .eq("can_access", True)
            .execute()
        )
        print(f"[get_user_permissions] Found {len(emp_perms.data or [])} granted permissions")
        print(f"[get_user_permissions] Permission IDs: {[ep['permission_id'] for ep in (emp_perms.data or [])]}")
        
        if not emp_perms.data:
            print(f"[get_user_permissions] No permissions found for employee {user_id}")
            return []
        permission_ids = [ep["permission_id"] for ep in emp_perms.data]

        # Get permission resource keys
        print(f"[get_user_permissions] Fetching resource_keys for permission IDs: {permission_ids}")
        perms = (
            supabase.table("permissions")
            .select("resource_key")
            .in_("id", permission_ids)
            .execute()
        )
        resource_keys = [p["resource_key"] for p in (perms.data or [])]
        print(f"[get_user_permissions] Returning {len(resource_keys)} resource keys: {resource_keys}")
        return resource_keys
    except Exception as e:
        logger.error(f"Error getting user permissions: {e}")
        print(f"[get_user_permissions] ERROR: {e}")
        import traceback
        traceback.print_exc()
        return []


def require_permission(permission_key: str):
    """
    Dependency to require a specific permission for an endpoint.
    
    Usage:
        @router.delete("/sales/{sale_id}", dependencies=[Depends(require_permission("sales.delete_button.access"))])
        async def delete_sale(sale_id: int):
            ...
    """
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        # MD users bypass all checks
        if is_md_user(current_user):
            return current_user
        
        # Get user/employee ID
        user_id = current_user.get("employee_id") or current_user.get("user_id") or current_user.get("id")
        user_role = current_user.get("role", "")
        
        # Check permission
        has_permission = check_permission(user_id, permission_key, user_role)
        
        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. You do not have permission to perform this action. Required permission: {permission_key}"
            )
        
        return current_user
    
    return permission_checker


def require_any_permission(permission_keys: List[str]):
    """
    Dependency to require ANY of the specified permissions for an endpoint.
    
    Usage:
        @router.get("/reports", dependencies=[Depends(require_any_permission(["sales.report_tab.access", "reports.view"]))])
        async def view_reports():
            ...
    """
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        # MD users bypass all checks
        if is_md_user(current_user):
            return current_user
        
        # Get user/employee ID
        user_id = current_user.get("employee_id") or current_user.get("user_id") or current_user.get("id")
        user_role = current_user.get("role", "")
        
        # Check if user has any of the required permissions
        for perm_key in permission_keys:
            if check_permission(user_id, perm_key, user_role):
                return current_user
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. You do not have permission to perform this action. Required permissions: {', '.join(permission_keys)}"
        )
    
    return permission_checker


def require_all_permissions(permission_keys: List[str]):
    """
    Dependency to require ALL of the specified permissions for an endpoint.
    
    Usage:
        @router.post("/admin/action", dependencies=[Depends(require_all_permissions(["admin_review.page.access", "settings.page.access"]))])
        async def admin_action():
            ...
    """
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        # MD users bypass all checks
        if is_md_user(current_user):
            return current_user
        
        # Get user/employee ID
        user_id = current_user.get("employee_id") or current_user.get("user_id") or current_user.get("id")
        user_role = current_user.get("role", "")
        
        # Check if user has all required permissions
        for perm_key in permission_keys:
            if not check_permission(user_id, perm_key, user_role):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied. You do not have all required permissions. Missing: {perm_key}"
                )
        
        return current_user
    
    return permission_checker


# Convenience function for manual checks within route handlers
async def ensure_permission(current_user: dict, permission_key: str):
    """
    Manually check permission within a route handler.
    Raises HTTPException if permission denied.
    
    Usage:
        @router.post("/some-action")
        async def some_action(current_user: dict = Depends(get_current_user)):
            await ensure_permission(current_user, "some.permission.key")
            # ... rest of logic
    """
    # MD users bypass all checks
    if is_md_user(current_user):
        return
    
    # Get user/employee ID
    user_id = current_user.get("employee_id") or current_user.get("user_id") or current_user.get("id")
    user_role = current_user.get("role", "")
    
    # Check permission
    has_permission = check_permission(user_id, permission_key, user_role)
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. You do not have permission to perform this action."
        )
