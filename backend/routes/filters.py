from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any, Literal
from datetime import date, datetime
from io import BytesIO
import base64
import pandas as pd
import json

from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase

router = APIRouter(prefix="/filters", tags=["filters"])


# =========================
# Helpers
# =========================
def _enforce_free_plan_limit(user_id: int):
    """
    Match Streamlit gating:
      - If plan == 'free' or not active, block when either of sales tables exceeds 10 rows.
    """
    try:
        sub = (
            supabase.table("subscription")
            .select("plan,is_active,expires_at")
            .eq("user_id", user_id)
            .order("expires_at", desc=True)
            .limit(1)
            .execute()
        )
        data = sub.data or []
        plan = (data[0].get("plan") if data else "free") or "free"
        is_active = bool(data[0].get("is_active") if data else False)
    except Exception:
        plan, is_active = "free", False

    if plan == "free" or not is_active:
        c1 = supabase.table("sales_master_log").select("sale_id", count="exact").eq("user_id", user_id).execute()
        n1 = int(getattr(c1, "count", None) or 0)
        c2 = supabase.table("sales_master_history").select("sale_id", count="exact").eq("user_id", user_id).execute()
        n2 = int(getattr(c2, "count", None) or 0)
        if n1 > 10 or n2 > 10:
            raise HTTPException(
                status_code=402,
                detail="Free plan limit reached (max 10 entries in sales or purchases). Please upgrade to continue.",
            )


def _parse_csv_param(val: Optional[str]) -> List[str]:
    if not val:
        return []
    return [x.strip() for x in val.split(",") if x.strip()]


def _to_df(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(rows or [])


def _export_dataframe(df: pd.DataFrame, fmt: Literal["csv", "excel"]) -> Dict[str, str]:
    if fmt == "excel":
        buf = BytesIO()
        df.to_excel(buf, index=False)
        buf.seek(0)
        return {
            "filename": "filtered.xlsx",
            "content_base64": base64.b64encode(buf.read()).decode("utf-8"),
            "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
    else:
        csv_bytes = df.to_csv(index=False).encode("utf-8")
        return {
            "filename": "filtered.csv",
            "content_base64": base64.b64encode(csv_bytes).decode("utf-8"),
            "content_type": "text/csv",
        }


def _apply_keyword(df: pd.DataFrame, keyword: Optional[str]) -> pd.DataFrame:
    if not keyword or df.empty:
        return df
    kw = str(keyword).lower()
    mask = pd.Series(False, index=df.index)
    for col in df.columns:
        mask |= df[col].astype(str).str.lower().str.contains(kw, na=False)
    return df[mask]


# =========================
# Sales Filters
# =========================
@router.get("/sales")
async def filter_sales(
    keyword: Optional[str] = Query(None),
    customers: Optional[str] = Query(None, description="Comma-separated customer_name list"),
    employees: Optional[str] = Query(None, description="Comma-separated employee_name list"),
    phones: Optional[str] = Query(None, description="Comma-separated customer_phone list"),
    items: Optional[str] = Query(None, description="Comma-separated item_name list"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    _enforce_free_plan_limit(user_id)

    resp = (
        supabase.table("sales_master_history")
        .select("*")
        .eq("user_id", user_id)
        .order("sale_date", desc=True)
        .execute()
    )
    df = _to_df(resp.data or [])
    if df.empty:
        return []

    # Date handling
    if "sale_date" in df.columns:
        df["sale_date"] = pd.to_datetime(df["sale_date"], errors="coerce")

    # Keyword first (like Streamlit)
    df = _apply_keyword(df, keyword)

    # Specific dimension filters
    cust_list = _parse_csv_param(customers)
    if cust_list and "customer_name" in df.columns:
        df = df[df["customer_name"].isin(cust_list)]

    emp_list = _parse_csv_param(employees)
    if emp_list and "employee_name" in df.columns:
        df = df[df["employee_name"].isin(emp_list)]

    phone_list = _parse_csv_param(phones)
    if phone_list and "customer_phone" in df.columns:
        df = df[df["customer_phone"].isin(phone_list)]

    item_list = _parse_csv_param(items)
    if item_list and "item_name" in df.columns:
        df = df[df["item_name"].isin(item_list)]

    # Date range last
    if start_date and "sale_date" in df.columns:
        df = df[df["sale_date"] >= pd.to_datetime(start_date)]
    if end_date and "sale_date" in df.columns:
        df = df[df["sale_date"] <= pd.to_datetime(end_date)]

    return df.to_dict(orient="records")


@router.get("/sales/export")
async def export_sales(
    format: Literal["csv", "excel"] = Query("csv"),
    keyword: Optional[str] = Query(None),
    customers: Optional[str] = Query(None),
    employees: Optional[str] = Query(None),
    phones: Optional[str] = Query(None),
    items: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user=Depends(get_protected_user),
):
    rows = await filter_sales(keyword, customers, employees, phones, items, start_date, end_date, current_user)  # type: ignore
    df = _to_df(rows)
    return _export_dataframe(df, format)


# =========================
# Restock Filters (goods_bought_history)
# =========================
@router.get("/restock")
async def filter_restock(
    keyword: Optional[str] = Query(None),
    items: Optional[str] = Query(None, description="Comma-separated item_name list"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    _enforce_free_plan_limit(user_id)

    resp = (
        supabase.table("goods_bought_history")
        .select("*")
        .eq("user_id", user_id)
        .order("purchase_date", desc=True)
        .execute()
    )
    df = _to_df(resp.data or [])
    if df.empty:
        return []

    if "purchase_date" in df.columns:
        df["purchase_date"] = pd.to_datetime(df["purchase_date"], errors="coerce")

    df = _apply_keyword(df, keyword)

    item_list = _parse_csv_param(items)
    if item_list and "item_name" in df.columns:
        df = df[df["item_name"].isin(item_list)]

    if start_date and "purchase_date" in df.columns:
        df = df[df["purchase_date"] >= pd.to_datetime(start_date)]
    if end_date and "purchase_date" in df.columns:
        df = df[df["purchase_date"] <= pd.to_datetime(end_date)]

    return df.to_dict(orient="records")


@router.get("/restock/export")
async def export_restock(
    format: Literal["csv", "excel"] = Query("csv"),
    keyword: Optional[str] = Query(None),
    items: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user=Depends(get_protected_user),
):
    rows = await filter_restock(keyword, items, start_date, end_date, current_user)  # type: ignore
    df = _to_df(rows)
    return _export_dataframe(df, format)


# =========================
# Expenses Filters
# =========================
@router.get("/expenses")
async def filter_expenses(
    keyword: Optional[str] = Query(None),
    vendors: Optional[str] = Query(None, description="Comma-separated vendor_name list"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    _enforce_free_plan_limit(user_id)

    resp = supabase.table("expenses_master").select("*").eq("user_id", user_id).order("expense_date", desc=True).execute()
    df = _to_df(resp.data or [])
    if df.empty:
        return []

    if "expense_date" in df.columns:
        df["expense_date"] = pd.to_datetime(df["expense_date"], errors="coerce")

    df = _apply_keyword(df, keyword)

    vendor_list = _parse_csv_param(vendors)
    if vendor_list and "vendor_name" in df.columns:
        df = df[df["vendor_name"].isin(vendor_list)]

    if start_date and "expense_date" in df.columns:
        df = df[df["expense_date"] >= pd.to_datetime(start_date)]
    if end_date and "expense_date" in df.columns:
        df = df[df["expense_date"] <= pd.to_datetime(end_date)]

    return df.to_dict(orient="records")


@router.get("/expenses/export")
async def export_expenses(
    format: Literal["csv", "excel"] = Query("csv"),
    keyword: Optional[str] = Query(None),
    vendors: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user=Depends(get_protected_user),
):
    rows = await filter_expenses(keyword, vendors, start_date, end_date, current_user)  # type: ignore
    df = _to_df(rows)
    return _export_dataframe(df, format)


# =========================
# Payments Filters
# =========================
@router.get("/payments")
async def filter_payments(
    amount: Optional[float] = Query(None),
    amount_filter: Literal["eq", "gte"] = Query("eq"),
    methods: Optional[str] = Query(None, description="Comma-separated payment_method list"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user=Depends(get_protected_user),
):
    user_id = current_user.get("id") or current_user.get("user_id")
    _enforce_free_plan_limit(user_id)

    resp = supabase.table("payments").select("*").eq("user_id", user_id).order("payment_date", desc=True).execute()
    df = _to_df(resp.data or [])
    if df.empty:
        return []

    if "payment_date" in df.columns:
        df["payment_date"] = pd.to_datetime(df["payment_date"], errors="coerce")

    if amount is not None and "amount" in df.columns:
        if amount_filter == "eq":
            df = df[df["amount"] == float(amount)]
        else:
            df = df[df["amount"] >= float(amount)]

    method_list = _parse_csv_param(methods)
    if method_list and "payment_method" in df.columns:
        df = df[df["payment_method"].isin(method_list)]

    if start_date and "payment_date" in df.columns:
        df = df[df["payment_date"] >= pd.to_datetime(start_date)]
    if end_date and "payment_date" in df.columns:
        df = df[df["payment_date"] <= pd.to_datetime(end_date)]

    return df.to_dict(orient="records")


@router.get("/payments/export")
async def export_payments(
    format: Literal["csv", "excel"] = Query("csv"),
    amount: Optional[float] = Query(None),
    amount_filter: Literal["eq", "gte"] = Query("eq"),
    methods: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user=Depends(get_protected_user),
):
    rows = await filter_payments(amount, amount_filter, methods, start_date, end_date, current_user)  # type: ignore
    df = _to_df(rows)
    return _export_dataframe(df, format)

