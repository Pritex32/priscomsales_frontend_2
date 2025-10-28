"""
RBAC Permissions API
FastAPI endpoints for role-based access control permission management
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import logging
from datetime import datetime

# Import supabase client and auth from your backend structure
try:
    from backend.core.supabase_client import supabase
    from backend.core.auth_deps import get_current_user
except ImportError:
    from core.supabase_client import supabase
    from core.auth_deps import get_current_user

logger = logging.getLogger(__name__)

# Import centralized permission checks to ensure single source of truth
try:
    from backend.core.permission_check import check_permission as core_check_permission, is_md_user as core_is_md_user
except ImportError:
    from core.permission_check import check_permission as core_check_permission, is_md_user as core_is_md_user

router = APIRouter(prefix="/permissions", tags=["permissions"])


# ============================================
# Pydantic Models
# ============================================

class PermissionCheck(BaseModel):
    """Model for checking a single permission"""
    user_id: int
    resource_key: str


class PermissionCheckMultiple(BaseModel):
    """Model for checking multiple permissions"""
    user_id: int
    resource_keys: List[str]


class PermissionGrant(BaseModel):
    """Model for granting permissions to a user"""
    user_id: int
    resource_keys: List[str]


class PermissionRevoke(BaseModel):
    """Model for revoking permissions from a user"""
    user_id: int
    resource_keys: List[str]


class Permission(BaseModel):
    """Permission model"""
    id: int
    resource_key: str
    description: str
    created_at: Optional[datetime] = None


class UserPermissionsResponse(BaseModel):
    """Response model for user permissions"""
    user_id: int
    permissions: List[Permission]


# ============================================
# Helper Functions
# ============================================

def is_md_user(user_role: str) -> bool:
    """Check if user is an MD (has all permissions)"""
    return user_role and user_role.lower() == 'md'


async def get_user_role(user_id: int) -> Optional[str]:
    """Get user role from database using Supabase"""
    try:
        # Check if user is in users table (MD)
        response = supabase.table("users").select("role").eq("user_id", user_id).execute()
        
        if response.data:
            return response.data[0].get("role")
        
        # Check if user is in employees table
        response = supabase.table("employees").select("role").eq("employee_id", user_id).execute()
        
        if response.data:
            return response.data[0].get("role")
        
        return None
    except Exception as e:
        logger.error(f"Error getting user role: {e}")
        return None


async def check_user_permission(user_id: int, resource_key: str) -> bool:
    """
    Check if user has a specific permission using the centralized logic.
    Returns True if:
    - User is MD (has all permissions)
    - Employee has explicit grant in employee_permissions table
    """
    try:
        # Get user role
        role = await get_user_role(user_id)

        # Use centralized permission check to ensure consistency
        return core_check_permission(user_id, resource_key, role)
    except Exception as e:
        logger.error(f"Error checking permission: {e}")
        return False


# ============================================
# API Endpoints
# ============================================

@router.get("/check")
async def check_permission(
    user_id: int = None,
    resource_key: str = "",
    current_user: dict = Depends(get_current_user)
):
    """
    Check if a user has a specific permission
    
    Query Parameters:
    - user_id: User ID to check
    - resource_key: Permission resource key (e.g., 'sales.delete.access')
    
    Returns:
    - has_permission: Boolean indicating if user has the permission
    """
    try:
        # MD users bypass all restrictions regardless of target user
        try:
            # If the current session is MD, always allow
            if core_is_md_user(current_user):
                return {
                    "user_id": user_id,
                    "resource_key": resource_key,
                    "has_permission": True
                }
        except Exception:
            pass

        # Determine target user ID: fallback to current_user if not provided
        target_user_id = user_id or current_user.get("employee_id") or current_user.get("user_id") or current_user.get("id")

        has_permission = await check_user_permission(target_user_id, resource_key)
        
        return {
            "user_id": target_user_id,
            "resource_key": resource_key,
            "has_permission": has_permission
        }
    except Exception as e:
        logger.error(f"Error in check_permission: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check permission: {str(e)}"
        )


@router.post("/check-multiple")
async def check_permissions_multiple(
    request: PermissionCheckMultiple,
    current_user: dict = Depends(get_current_user)
):
    """
    Check multiple permissions for a user at once
    
    Body:
    - user_id: User ID to check
    - resource_keys: List of permission resource keys
    
    Returns:
    - permissions: Dict mapping resource_key to boolean permission status
    """
    try:
        permissions = {}

        # Determine target user ID: fallback to current_user if not provided
        target_user_id = request.user_id or current_user.get("employee_id") or current_user.get("user_id") or current_user.get("id")

        # MD users bypass all restrictions
        if core_is_md_user(current_user):
            for resource_key in request.resource_keys:
                permissions[resource_key] = True
        else:
            for resource_key in request.resource_keys:
                has_permission = await check_user_permission(
                    target_user_id,
                    resource_key
                )
                permissions[resource_key] = has_permission
        
        return {
            "user_id": request.user_id,
            "permissions": permissions
        }
    except Exception as e:
        logger.error(f"Error in check_permissions_multiple: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check permissions: {str(e)}"
        )


@router.get("/user/{user_id}")
async def get_user_permissions(
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all permissions for a specific user
    
    Path Parameters:
    - user_id: User ID
    
    Returns:
    - List of permissions granted to the user
    """
    try:
        # Get user role first
        role = await get_user_role(user_id)
        
        # If MD, return all permissions
        if is_md_user(role):
            response = supabase.table("permissions")\
                .select("id, resource_key, description, created_at")\
                .is_("user_id", "null")\
                .order("resource_key")\
                .execute()
        else:
            # Get user's explicit permissions
            response = supabase.table("permissions")\
                .select("id, resource_key, description, created_at")\
                .eq("user_id", user_id)\
                .order("resource_key")\
                .execute()
        
        permissions = response.data or []
        
        return {
            "user_id": user_id,
            "role": role,
            "is_md": is_md_user(role),
            "permissions": permissions
        }
    except Exception as e:
        logger.error(f"Error getting user permissions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user permissions: {str(e)}"
        )


@router.get("/all")
async def get_all_permissions(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all available permissions in the system
    
    Returns:
    - List of all permission resources
    """
    try:
        response = supabase.table("permissions")\
            .select("id, resource_key, description")\
            .is_("user_id", "null")\
            .order("resource_key")\
            .execute()
        
        permissions = response.data or []
        
        return {
            "total": len(permissions),
            "permissions": permissions
        }
    except Exception as e:
        logger.error(f"Error getting all permissions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get permissions: {str(e)}"
        )


@router.post("/grant")
async def grant_permissions(
    request: PermissionGrant,
    current_user: dict = Depends(get_current_user)
):
    """
    Grant permissions to a user (MD only)
    
    Body:
    - user_id: User ID to grant permissions to
    - resource_keys: List of permission resource keys to grant
    
    Returns:
    - Success message with granted permissions
    """
    try:
        # Only MD users can grant permissions
        if not is_md_user(current_user.get("role")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only MD users can grant permissions"
            )
        
        granted = []
        for resource_key in request.resource_keys:
            try:
                # Check if permission already exists
                existing = supabase.table("permissions")\
                    .select("id", count="exact")\
                    .eq("user_id", request.user_id)\
                    .eq("resource_key", resource_key)\
                    .execute()
                
                if (existing.count or 0) == 0:
                    # Get description from template
                    template = supabase.table("permissions")\
                        .select("description")\
                        .eq("resource_key", resource_key)\
                        .is_("user_id", "null")\
                        .limit(1)\
                        .execute()
                    
                    description = template.data[0]["description"] if template.data else "User permission"
                    
                    # Insert new permission
                    supabase.table("permissions").insert({
                        "user_id": request.user_id,
                        "resource_key": resource_key,
                        "description": description,
                        "created_at": datetime.utcnow().isoformat()
                    }).execute()
                    
                    granted.append(resource_key)
            except Exception as e:
                logger.error(f"Error granting permission {resource_key}: {e}")
                continue
        
        return {
            "success": True,
            "user_id": request.user_id,
            "granted_permissions": granted,
            "total_granted": len(granted)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error granting permissions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to grant permissions: {str(e)}"
        )


@router.post("/revoke")
async def revoke_permissions(
    request: PermissionRevoke,
    current_user: dict = Depends(get_current_user)
):
    """
    Revoke permissions from a user (MD only)
    
    Body:
    - user_id: User ID to revoke permissions from
    - resource_keys: List of permission resource keys to revoke
    
    Returns:
    - Success message with revoked permissions
    """
    try:
        # Only MD users can revoke permissions
        if not is_md_user(current_user.get("role")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only MD users can revoke permissions"
            )
        
        revoked = []
        for resource_key in request.resource_keys:
            try:
                result = supabase.table("permissions")\
                    .delete()\
                    .eq("user_id", request.user_id)\
                    .eq("resource_key", resource_key)\
                    .execute()
                
                if result.data:
                    revoked.append(resource_key)
            except Exception as e:
                logger.error(f"Error revoking permission {resource_key}: {e}")
                continue
        
        return {
            "success": True,
            "user_id": request.user_id,
            "revoked_permissions": revoked,
            "total_revoked": len(revoked)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking permissions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke permissions: {str(e)}"
        )


@router.get("/search")
async def search_permissions(
    query: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Search for permissions by resource key or description
    
    Query Parameters:
    - query: Search term
    
    Returns:
    - List of matching permissions
    """
    try:
        response = supabase.table("permissions")\
            .select("id, resource_key, description")\
            .is_("user_id", "null")\
            .or_(f"resource_key.ilike.%{query}%,description.ilike.%{query}%")\
            .order("resource_key")\
            .limit(50)\
            .execute()
        
        permissions = response.data or []
        
        return {
            "query": query,
            "total": len(permissions),
            "permissions": permissions
        }
    except Exception as e:
        logger.error(f"Error searching permissions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search permissions: {str(e)}"
        )
