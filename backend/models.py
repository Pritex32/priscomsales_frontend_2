"""
Supabase data access layer replacing SQLAlchemy models.

This module removes all SQLAlchemy ORM usages and provides thin, typed helpers
around the existing Supabase client for table-level CRUD and common queries.

Usage examples:
- Get a table handle directly:
    repo = SupabaseRepo(Tables.USERS)
    repo.get({"email": "foo@bar.com"}, single=True)

- Use convenience repositories for common flows:
    UsersRepo.get_by_email("foo@bar.com")
    SubscriptionRepo.get_latest_by_user(123)
    EmployeesRepo.get_by_email_and_password("e@x.com", sha256_hex)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
from datetime import date, datetime

from .core.supabase_client import supabase


# -------------------------
# Table name declarations
# -------------------------
class Tables:
    USERS = "users"
    EMPLOYEES = "employees"
    SUBSCRIPTION = "subscription"
    CUSTOMERS = "customers"
    SALES_MASTER_LOG = "sales_master_log"
    SALES_MASTER_HISTORY = "sales_master_history"
    EXPENSES_MASTER = "expenses_master"
    INVENTORY_MASTER_LOG = "inventory_master_log"
    GOODS_BOUGHT = "goods_bought"
    GOODS_BOUGHT_HISTORY = "goods_bought_history"
    PAYMENTS = "payments"
    PROFORMA_INVOICES = "proforma_invoices"
    REQUISITIONS = "requisitions"
    USER_SHEETS = "user_sheets"
    SHEET_DATA = "sheet_data"
    WAREHOUSE_ACCESS = "warehouse_access"
    VENDOR_LISTING = "vendor_listing"
    VENDOR_PRODUCTS = "vendor_products"
    STOCK_MOVEMENTS = "stock_movements"
    B2B_INVENTORY = "b2b_inventory"
    LOGIN_LOGS = "login_logs"
    ADMIN_LOGS = "admin_logs"
    PRODUCT_DELETION_LOGS = "product_deletion_logs"


def table(name: str):
    """
    Return a Supabase table query builder.
    """
    return supabase.table(name)


# --------------------------------
# Generic repository (CRUD helpers)
# --------------------------------
class SupabaseRepo:
    """
    Thin wrapper for common Supabase operations.
    """

    def __init__(self, table_name: str):
        self.table_name = table_name

    # Select rows
    def get(
        self,
        filters: Optional[Dict[str, Any]] = None,
        select: str = "*",
        order: Optional[Tuple[str, bool]] = None,  # (column, desc)
        limit: Optional[int] = None,
        single: bool = False,
    ) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
        q = table(self.table_name).select(select)

        if filters:
            for k, v in filters.items():
                q = q.eq(k, v)

        if order:
            col, desc = order
            q = q.order(col, desc=bool(desc))

        if limit:
            q = q.limit(limit)

        resp = q.single().execute() if single else q.execute()
        return resp.data or ([] if not single else {})

    # Insert new rows
    def insert(
        self,
        data: Union[Dict[str, Any], List[Dict[str, Any]]],
        returning: str = "representation",
    ) -> List[Dict[str, Any]]:
        resp = table(self.table_name).insert(data, returning=returning).execute()
        return resp.data or []

    # Update with filters (eq)
    def update(
        self,
        where: Dict[str, Any],
        data: Dict[str, Any],
        returning: str = "representation",
    ) -> List[Dict[str, Any]]:
        q = table(self.table_name).update(data, returning=returning)
        for k, v in where.items():
            q = q.eq(k, v)
        resp = q.execute()
        return resp.data or []

    # Delete with filters (eq)
    def delete(self, where: Dict[str, Any]) -> List[Dict[str, Any]]:
        q = table(self.table_name).delete()
        for k, v in where.items():
            q = q.eq(k, v)
        resp = q.execute()
        return resp.data or []

    # Upsert rows
    def upsert(
        self,
        data: Union[Dict[str, Any], List[Dict[str, Any]]],
        on_conflict: Optional[Union[str, Sequence[str]]] = None,
        returning: str = "representation",
    ) -> List[Dict[str, Any]]:
        resp = table(self.table_name).upsert(
            data, on_conflict=on_conflict, returning=returning
        ).execute()
        return resp.data or []

    # Call Postgres function
    @staticmethod
    def rpc(fn_name: str, params: Optional[Dict[str, Any]] = None) -> Any:
        resp = supabase.rpc(fn_name, params=params or {}).execute()
        return resp.data


# ------------------------------------
# Convenience repositories (by domain)
# ------------------------------------
class UsersRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.USERS)

    def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        data = self.get({"email": email}, single=True)
        return data or None

    def get_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        data = self.get({"username": username}, single=True)
        return data or None

    def exists_username(self, username: str) -> bool:
        data = self.get({"username": username}, select="user_id", limit=1)
        return bool(data)

    def exists_email(self, email: str) -> bool:
        data = self.get({"email": email}, select="user_id", limit=1)
        return bool(data)

    def insert_user(self, user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.insert(user)
        return rows[0] if rows else None


class EmployeesRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.EMPLOYEES)

    def get_by_email_and_password(self, email: str, password_hash: str) -> Optional[Dict[str, Any]]:
        q = table(self.table_name).select("*").eq("email", email).eq("password", password_hash).limit(1)
        resp = q.execute()
        data = (resp.data or [])
        return data[0] if data else None

    def exists_email(self, email: str) -> bool:
        data = self.get({"email": email}, select="employee_id", limit=1)
        return bool(data)

    def insert_employee(self, employee: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.insert(employee)
        return rows[0] if rows else None


class SubscriptionRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.SUBSCRIPTION)

    def get_latest_by_user(
        self,
        user_id: int,
        order_by: str = "expires_at",
        desc: bool = True,
    ) -> Optional[Dict[str, Any]]:
        q = table(self.table_name).select("*").eq("user_id", user_id).order(order_by, desc=desc).limit(1)
        resp = q.execute()
        data = (resp.data or [])
        return data[0] if data else None

    def update_by_user(self, user_id: int, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        return self.update({"user_id": user_id}, data)

    def insert_subscription(self, sub: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.insert(sub)
        return rows[0] if rows else None

    def upsert_by_user(self, user_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        # If subscription row exists for user, update; else insert
        latest = self.get_latest_by_user(user_id)
        if latest:
            rows = self.update({"user_id": user_id}, data)
        else:
            data2 = dict(data)
            data2["user_id"] = user_id
            rows = self.insert(data2)
        return rows[0] if rows else None


class FeedbackRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.FEEDBACK if hasattr(Tables, "FEEDBACK") else "feedback")  # fallback if not enumerated

    def insert_feedback(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.insert(payload)
        return rows[0] if rows else None


class LoginLogsRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.LOGIN_LOGS)

    def insert_log(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.insert(payload)
        return rows[0] if rows else None


class PaymentsRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.PAYMENTS)

    def insert_payment(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.insert(payload)
        return rows[0] if rows else None

    def update_payment(self, where: Dict[str, Any], data: Dict[str, Any]) -> List[Dict[str, Any]]:
        return self.update(where, data)


class VendorsRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.VENDOR_LISTING)


class VendorProductsRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.VENDOR_PRODUCTS)


class SalesLogRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.SALES_MASTER_LOG)


class ExpensesRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.EXPENSES_MASTER)


class InventoryLogRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.INVENTORY_MASTER_LOG)


class GoodsBoughtRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.GOODS_BOUGHT)


class RequisitionsRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.REQUISITIONS)


class SheetsRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.USER_SHEETS)


class SheetDataRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.SHEET_DATA)


class WarehouseAccessRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.WAREHOUSE_ACCESS)


class StockMovementsRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.STOCK_MOVEMENTS)


class B2BInventoryRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.B2B_INVENTORY)


class AdminLogsRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.ADMIN_LOGS)


class ProductDeletionLogsRepo(SupabaseRepo):
    def __init__(self):
        super().__init__(Tables.PRODUCT_DELETION_LOGS)


__all__ = [
    "Tables",
    "table",
    "SupabaseRepo",
    "UsersRepo",
    "EmployeesRepo",
    "SubscriptionRepo",
    "FeedbackRepo",
    "LoginLogsRepo",
    "PaymentsRepo",
    "VendorsRepo",
    "VendorProductsRepo",
    "SalesLogRepo",
    "ExpensesRepo",
    "InventoryLogRepo",
    "GoodsBoughtRepo",
    "RequisitionsRepo",
    "SheetsRepo",
    "SheetDataRepo",
    "WarehouseAccessRepo",
    "StockMovementsRepo",
    "B2BInventoryRepo",
    "AdminLogsRepo",
    "ProductDeletionLogsRepo",
]
