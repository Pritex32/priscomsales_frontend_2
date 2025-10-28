from fastapi import APIRouter, Depends, HTTPException, Query, Header
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase

router = APIRouter(prefix="/admin", tags=["Admin Review"])


def verify_admin_access(current_user: dict, x_admin_unlocked: Optional[str] = Header(None)):
    """Verify both MD role and admin_unlocked session flag"""
    if current_user["role"].lower() not in ["md", "admin"]:
        raise HTTPException(403, "Admin access required")
    
    # For MD role, require admin_unlocked flag
    if current_user["role"].lower() == "md":
        if x_admin_unlocked != "true":
            raise HTTPException(403, "Admin dashboard must be unlocked first")
    
    return True


class VerificationUpdate(BaseModel):
    is_verified: bool
    verified_by: str
    verified_at: datetime
    verification_notes: Optional[str] = None


class LoginFilter(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    role: Optional[str] = None


@router.get("/login-logs")
async def get_login_logs(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_user=Depends(get_protected_user),
    x_admin_unlocked: Optional[str] = Header(None),
):
    verify_admin_access(current_user, x_admin_unlocked)

    query = supabase.table("login_logs").select("*", count="exact").eq("user_id", current_user.get("id", current_user.get("user_id")))

    if start_date:
        query = query.gte("login_time", start_date)
    if end_date:
        query = query.lte("login_time", end_date)
    if search:
        or_filter = f"username.ilike.%{search}%,ip_address.ilike.%{search}%"
        query = query.or_(or_filter)

    start = (page - 1) * limit
    end = start + limit - 1
    resp = query.order("login_time", desc=True).range(start, end).execute()
    logs = resp.data or []
    total = getattr(resp, "count", None) or len(logs)

    return {
        "logs": [
            {
                "id": log.get("id"),
                "user_id": log.get("user_id"),
                "role": log.get("role"),
                "username": log.get("username"),
                "login_time": log.get("login_time"),
                "ip_address": log.get("ip_address"),
                "device": log.get("device"),
                "user_agent": log.get("user_agent"),
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/employees")
async def get_employees(
    current_user=Depends(get_protected_user),
    x_admin_unlocked: Optional[str] = Header(None),
):
    verify_admin_access(current_user, x_admin_unlocked)

    resp = (
        supabase.table("employees")
        .select("employee_id,name,email,role,access_choice")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .execute()
    )
    employees = resp.data or []
    return [
        {
            "employee_id": emp.get("employee_id"),
            "name": emp.get("name"),
            "email": emp.get("email"),
            "role": emp.get("role"),
            "access_choice": emp.get("access_choice"),
        }
        for emp in employees
    ]


@router.get("/unverified/sales")
async def get_unverified_sales(
    current_user=Depends(get_protected_user),
    x_admin_unlocked: Optional[str] = Header(None),
):
    verify_admin_access(current_user, x_admin_unlocked)

    resp = (
        supabase.table("sales_master_history")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("is_verified", False)
        .order("sale_date", desc=True)
        .execute()
    )
    sales = resp.data or []
    return [
        {
            "sale_id": sale.get("sale_id"),
            "invoice_number": sale.get("invoice_number"),
            "customer_name": sale.get("customer_name"),
            "customer_phone": sale.get("customer_phone"),
            "item_name": sale.get("item_name"),
            "total_amount": float(sale.get("total_amount")) if sale.get("total_amount") is not None else None,
            "sale_date": sale.get("sale_date"),
            "payment_status": sale.get("payment_status"),
            "employee_name": sale.get("employee_name"),
            "invoice_file_url": sale.get("invoice_file_url"),
            "verification_notes": sale.get("verification_notes"),
        }
        for sale in sales
    ]


@router.put("/verify/sales/{sale_id}")
async def verify_sale(
    sale_id: int,
    update: VerificationUpdate,
    current_user=Depends(get_protected_user),
    x_admin_unlocked: Optional[str] = Header(None),
):
    verify_admin_access(current_user, x_admin_unlocked)

    check = (
        supabase.table("sales_master_history")
        .select("sale_id,is_verified,user_id")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("sale_id", sale_id)
        .eq("is_verified", False)
        .limit(1)
        .execute()
    )
    if not check.data:
        raise HTTPException(404, "Sale not found or already verified")

    update_data = {
        "is_verified": update.is_verified,
        "verified_by": update.verified_by,
        "verified_at": update.verified_at.isoformat() if isinstance(update.verified_at, datetime) else update.verified_at,
        "verification_notes": update.verification_notes,
    }
    supabase.table("sales_master_history").update(update_data).eq("sale_id", sale_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"message": "Sale verification updated"}


@router.get("/unverified/expenses")
async def get_unverified_expenses(
    current_user=Depends(get_protected_user),
    x_admin_unlocked: Optional[str] = Header(None),
):
    verify_admin_access(current_user, x_admin_unlocked)

    resp = (
        supabase.table("expenses_master")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("is_verified", False)
        .order("expense_date", desc=True)
        .execute()
    )
    expenses = resp.data or []
    return [
        {
            "expense_id": exp.get("expense_id"),
            "vendor_name": exp.get("vendor_name"),
            "total_amount": float(exp.get("total_amount")) if exp.get("total_amount") is not None else None,
            "expense_date": exp.get("expense_date"),
            "payment_status": exp.get("payment_status"),
            "employee_name": exp.get("employee_name"),
            "invoice_file_url": exp.get("invoice_file_url"),
            "amount_balance": float(exp.get("amount_balance")) if exp.get("amount_balance") is not None else None,
        }
        for exp in expenses
    ]


@router.get("/unverified/goods")
async def get_unverified_goods(
    current_user=Depends(get_protected_user),
    x_admin_unlocked: Optional[str] = Header(None),
):
    verify_admin_access(current_user, x_admin_unlocked)

    resp = (
        supabase.table("goods_bought_history")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("is_verified", False)
        .order("purchase_date", desc=True)
        .execute()
    )
    goods = resp.data or []
    return [
        {
            "purchase_id": g.get("purchase_id"),
            "supplier_name": g.get("supplier_name"),
            "item_name": g.get("item_name"),
            "total_cost": float(g.get("total_cost")) if g.get("total_cost") is not None else None,
            "purchase_date": g.get("purchase_date"),
            "payment_status": g.get("payment_status"),
            "employee_name": g.get("employee_name"),
            "invoice_file_url": g.get("invoice_file_url"),
            "amount_balance": float(g.get("amount_balance")) if g.get("amount_balance") is not None else None,
        }
        for g in goods
    ]


@router.delete("/invoice/sales/{sale_id}")
async def delete_sale_invoice(
    sale_id: int,
    current_user=Depends(get_protected_user),
    x_admin_unlocked: Optional[str] = Header(None),
):
    verify_admin_access(current_user, x_admin_unlocked)

    exists = (
        supabase.table("sales_master_history")
        .select("sale_id")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("sale_id", sale_id)
        .limit(1)
        .execute()
    )
    if not exists.data:
        raise HTTPException(404, "Sale not found")

    supabase.table("sales_master_history").delete().eq("sale_id", sale_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"message": "Sale invoice deleted"}


@router.delete("/invoice/expenses/{expense_id}")
async def delete_expense_invoice(
    expense_id: int,
    current_user=Depends(get_protected_user),
    x_admin_unlocked: Optional[str] = Header(None),
):
    verify_admin_access(current_user, x_admin_unlocked)

    exists = (
        supabase.table("expenses_master")
        .select("expense_id")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("expense_id", expense_id)
        .limit(1)
        .execute()
    )
    if not exists.data:
        raise HTTPException(404, "Expense not found")

    supabase.table("expenses_master").delete().eq("expense_id", expense_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"message": "Expense invoice deleted"}


@router.delete("/invoice/goods/{purchase_id}")
async def delete_goods_invoice(
    purchase_id: int,
    current_user=Depends(get_protected_user),
    x_admin_unlocked: Optional[str] = Header(None),
):
    verify_admin_access(current_user, x_admin_unlocked)

    exists = (
        supabase.table("goods_bought_history")
        .select("purchase_id")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("purchase_id", purchase_id)
        .limit(1)
        .execute()
    )
    if not exists.data:
        raise HTTPException(404, "Goods bought not found")

    supabase.table("goods_bought_history").delete().eq("purchase_id", purchase_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"message": "Goods bought invoice deleted"}

