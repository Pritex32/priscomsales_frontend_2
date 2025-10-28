import os
from datetime import datetime, timedelta
from jose import JWTError
from jwt import PyJWTError
from passlib.context import CryptContext
from pydantic import BaseModel
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from fastapi import status
from backend.core.supabase_client import supabase
from typing import Optional
import jwt


SECRET_KEY = os.getenv("SECRET_KEY", "4606")
ALGORITHM = "HS256"
# Extend access token lifetime to 9 hours (540 minutes)
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 9

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Supports both MD (users table) and Employee principals via JWT claim 'role'.
    - For role == 'employee': trust token claims and return a user-shaped dict:
        { id: user_id(tenant owner), username: employee name, role: 'employee', email: employee email? }
      This lets downstream routes continue to use current_user['id'] as tenant user_id.
    - Otherwise (MD): legacy flow, look up by username in users table.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except (JWTError, PyJWTError):
        # Token invalid or expired -> 401 triggers frontend logout via interceptor
        raise credentials_exception

    role = payload.get("role")
    if role == "employee":
        user_id = payload.get("user_id")
        employee_id = payload.get("employee_id")  # Extract employee_id from JWT
        if not user_id:
            raise credentials_exception
        return {
            "id": user_id,  # tenant/company user_id
            "employee_id": employee_id,  # CRITICAL: Include employee_id for permission checks
            "username": payload.get("username") or payload.get("sub") or "employee",
            "role": "employee",
            "email": payload.get("email"),
        }

    # MD (owner) flow, lookup by username in users table
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception

    response = supabase.table("users").select("*").eq("username", username).execute()
    user = response.data[0] if response.data else None
    if user is None:
        raise credentials_exception
    # Normalize primary key so downstream code can safely use current_user["id"]
    if "id" not in user and "user_id" in user:
        user["id"] = user["user_id"]
    return user

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
