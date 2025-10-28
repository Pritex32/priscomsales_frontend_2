from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from backend.core.route_protection import get_protected_user
from backend.core.supabase_client import supabase

router = APIRouter(prefix="/sheets", tags=["sheets"])

@router.get("/", response_model=None)
async def get_sheets(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_protected_user),
):
    # List sheets for current user with pagination
    start = max(0, skip)
    end = start + max(1, limit) - 1

    q = (
        supabase.table("user_sheets")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
    )

    # If employee, only return employee-accessible sheets (parity with Streamlit)
    role = (current_user.get("role") or "").lower()
    if role == "employee":
        q = q.eq("employee_access", True)

    resp = q.order("id", desc=True).range(start, end).execute()
    return resp.data or []

@router.post("/", response_model=dict)
async def create_sheet(
    sheet_name: str,
    columns: List[Dict[str, str]],  # [{"name": str, "type": str}]
    employee_access: bool = False,
    current_user: dict = Depends(get_protected_user),
):
    # Check if sheet exists (name must be unique per user)
    existing = (
        supabase.table("user_sheets")
        .select("id")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("sheet_name", sheet_name)
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="Sheet with this name already exists")

    payload = {
        "user_id": current_user.get("id", current_user.get("user_id")),
        "sheet_name": sheet_name,
        "columns": columns,
        "employee_access": employee_access,
    }
    ins = supabase.table("user_sheets").insert(payload).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to create sheet")
    sheet = ins.data[0]
    return {"sheet_id": sheet.get("id"), "sheet_name": sheet.get("sheet_name")}

@router.post("/{sheet_id}/data", response_model=dict)
async def add_data_to_sheet(
    sheet_id: int,
    data: Dict[str, Any],
    current_user: dict = Depends(get_protected_user),
):
    # Load sheet
    resp = (
        supabase.table("user_sheets")
        .select("*")
        .eq("id", sheet_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    sheet = resp.data[0] if resp.data else None
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")

    # Validate columns match
    cols = sheet.get("columns") or []
    expected_columns = {c.get("name") for c in cols if isinstance(c, dict) and "name" in c}
    provided_columns = set(data.keys())
    if not provided_columns.issubset(expected_columns):
        raise HTTPException(status_code=400, detail="Data columns do not match sheet schema")

    row_payload = {
        "user_id": current_user.get("id", current_user.get("user_id")),
        "sheet_name": sheet["sheet_name"],
        "data": data,
    }
    ins = supabase.table("sheet_data").insert(row_payload).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to insert sheet data")
    row = ins.data[0]
    return {"data_id": row.get("id")}

@router.get("/{sheet_id}/data", response_model=List[Dict[str, Any]])
async def get_sheet_data(
    sheet_id: int,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_protected_user),
):
    # Load sheet
    resp = (
        supabase.table("user_sheets")
        .select("*")
        .eq("id", sheet_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    sheet = resp.data[0] if resp.data else None
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")

    start = max(0, skip)
    end = start + max(1, limit) - 1
    data_resp = (
        supabase.table("sheet_data")
        .select("*")
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("sheet_name", sheet["sheet_name"])
        .order("id", desc=True)
        .range(start, end)
        .execute()
    )
    rows = data_resp.data or []
    return [r.get("data") for r in rows if isinstance(r, dict)]

@router.put("/{sheet_id}/data/{data_id}", response_model=dict)
async def update_sheet_data(
    sheet_id: int,
    data_id: int,
    data: Dict[str, Any],
    current_user: dict = Depends(get_protected_user),
):
    # Load sheet
    sheet_resp = (
        supabase.table("user_sheets")
        .select("*")
        .eq("id", sheet_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    sheet = sheet_resp.data[0] if sheet_resp.data else None
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")

    # Load data row
    row_resp = (
        supabase.table("sheet_data")
        .select("*")
        .eq("id", data_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("sheet_name", sheet["sheet_name"])
        .limit(1)
        .execute()
    )
    row = row_resp.data[0] if row_resp.data else None
    if not row:
        raise HTTPException(status_code=404, detail="Data row not found")

    # Validate columns
    cols = sheet.get("columns") or []
    expected_columns = {c.get("name") for c in cols if isinstance(c, dict) and "name" in c}
    provided_columns = set(data.keys())
    if not provided_columns.issubset(expected_columns):
        raise HTTPException(status_code=400, detail="Data columns do not match sheet schema")

    upd = (
        supabase.table("sheet_data")
        .update({"data": data})
        .eq("id", data_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("sheet_name", sheet["sheet_name"])
        .execute()
    )
    if upd.data is None:
        # Some clients of supabase-py may return None for update; consider it success
        pass
    return {"msg": "Data updated successfully", "data_id": data_id}

@router.delete("/{sheet_id}/data/{data_id}")
async def delete_sheet_data(
    sheet_id: int,
    data_id: int,
    current_user: dict = Depends(get_protected_user),
):
    # Load sheet
    sheet_resp = (
        supabase.table("user_sheets")
        .select("id,sheet_name,user_id")
        .eq("id", sheet_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    sheet = sheet_resp.data[0] if sheet_resp.data else None
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")

    # Ensure row exists
    row_resp = (
        supabase.table("sheet_data")
        .select("id")
        .eq("id", data_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .eq("sheet_name", sheet["sheet_name"])
        .limit(1)
        .execute()
    )
    if not row_resp.data:
        raise HTTPException(status_code=404, detail="Data row not found")

    supabase.table("sheet_data").delete().eq("id", data_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).eq("sheet_name", sheet["sheet_name"]).execute()
    return {"msg": "Data row deleted successfully"}

@router.delete("/{sheet_id}")
async def delete_sheet(
    sheet_id: int,
    current_user: dict = Depends(get_protected_user),
):
    # Load sheet
    sheet_resp = (
        supabase.table("user_sheets")
        .select("*")
        .eq("id", sheet_id)
        .eq("user_id", current_user.get("id", current_user.get("user_id")))
        .limit(1)
        .execute()
    )
    sheet = sheet_resp.data[0] if sheet_resp.data else None
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")

    # Delete all data rows first
    supabase.table("sheet_data").delete().eq("sheet_name", sheet["sheet_name"]).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    # Delete the sheet
    supabase.table("user_sheets").delete().eq("id", sheet_id).eq("user_id", current_user.get("id", current_user.get("user_id"))).execute()
    return {"msg": "Sheet and all data deleted successfully"}


