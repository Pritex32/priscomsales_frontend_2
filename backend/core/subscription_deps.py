from fastapi import Depends, HTTPException, status
from typing import Dict
from datetime import datetime

from backend.core.auth_deps import get_current_user
from backend.core.supabase_client import supabase


async def check_subscription_limit(current_user: Dict = Depends(get_current_user)):
    """
    Dependency to check subscription status and usage limits.
    
    Checks:
    - Subscription table for plan and is_active status
    - Usage limits in sales_master_log and sales_master_history
    - If plan is free AND usage exceeds 10 rows OR subscription is expired:
        -> Return 403 with JSON {"detail": "Subscription expired or limit exceeded"}
    
    Returns the current_user dict if checks pass.
    """
    try:
        user_id = current_user.get("id") or current_user.get("user_id")
        
        # 1. Get subscription data
        sub_response = (
            supabase.table("subscription")
            .select("*")
            .eq("user_id", user_id)
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        
        # Default to free plan with inactive status
        plan = "free"
        is_active = False
        expires_at = None
        
        if sub_response.data:
            sub = sub_response.data[0]
            plan = sub.get("plan", "free")
            is_active = sub.get("is_active", False)
            expires_at = sub.get("expires_at")
            
            # Check if subscription has expired
            if expires_at and is_active:
                try:
                    exp_date = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                    if exp_date < datetime.utcnow():
                        is_active = False
                except Exception:
                    pass
        
        # 2. If plan is not free and is active, allow access
        if plan != "free" and is_active:
            return current_user
        
        # 3. For free plan or inactive subscription, check usage limits
        # Count rows in sales_master_log
        sales_log_response = (
            supabase.table("sales_master_log")
            .select("sale_id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        sales_log_count = getattr(sales_log_response, "count", 0) or 0
        
        # Count rows in sales_master_history
        sales_history_response = (
            supabase.table("sales_master_history")
            .select("sale_id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        sales_history_count = getattr(sales_history_response, "count", 0) or 0
        
        total_usage = sales_log_count + sales_history_count
        
        # 4. Check if free plan usage exceeds 10 rows
        FREE_PLAN_LIMIT = 10
        if plan == "free" and total_usage > FREE_PLAN_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Subscription expired or limit exceeded"
            )
        
        # 5. Check if subscription is inactive (expired)
        if not is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Subscription expired or limit exceeded"
            )
        
        return current_user
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error checking subscription limit: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking subscription: {str(e)}"
        )
