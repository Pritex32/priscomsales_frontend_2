"""
Helper module to apply subscription protection to route files.

This module provides a protected_user dependency that combines authentication
and subscription checking, to be used in place of get_current_user in routes
that should be protected by subscription limits.
"""

from fastapi import Depends
from typing import Dict

from backend.core.auth_deps import get_current_user
from backend.core.subscription_deps import check_subscription_limit


async def get_protected_user(current_user: Dict = Depends(check_subscription_limit)):
    """
    Combined dependency for subscription-protected routes.
    
    This dependency:
    1. Checks authentication (via get_current_user in check_subscription_limit)
    2. Checks subscription limits and expiry
    3. Returns 403 if subscription is expired or limits exceeded
    
    Use this in place of get_current_user for routes that require subscription.
    
    Excluded routes (should use get_current_user only):
    - /auth/login
    - /auth/register  
    - /dashboard (read-only access allowed)
    """
    return current_user


__all__ = ["get_protected_user"]
