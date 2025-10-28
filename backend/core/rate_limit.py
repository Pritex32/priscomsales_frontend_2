from datetime import datetime, timedelta
from typing import Optional
from fastapi import Request

from backend.core.supabase_client import supabase

WINDOW_MINUTES_DEFAULT = 30
MAX_FAILURES_DEFAULT = 3

def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        ip = xff.split(",")[0].strip()
        if ip:
            return ip
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip
    client = request.client
    return client.host if client else "unknown"

def _failed_count_in_window(ip: str, window_minutes: int = WINDOW_MINUTES_DEFAULT) -> int:
    cutoff = (datetime.utcnow() - timedelta(minutes=window_minutes)).isoformat()
    try:
        resp = supabase.table("login_logs").select("id, attempted_at, success").eq("ip", ip).eq("success", False).gte("attempted_at", cutoff).execute()
        data = resp.data or []
        return len(data)
    except Exception:
        # Fail-open on rate limit read errors
        return 0

def is_ip_blocked(ip: str, window_minutes: int = WINDOW_MINUTES_DEFAULT, max_failures: int = MAX_FAILURES_DEFAULT) -> bool:
    return _failed_count_in_window(ip, window_minutes) >= max_failures

def record_login_attempt(ip: str, success: bool) -> None:
    payload = {
        "ip": ip,
        "success": success,
        "attempted_at": datetime.utcnow().isoformat()
    }
    try:
        supabase.table("login_logs").insert(payload).execute()
    except Exception:
        # Ignore logging failures to not break auth flow
        pass