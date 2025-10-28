from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
import jwt
import os

from backend.core.supabase_client import supabase

# JWT
SECRET_KEY = os.getenv("SECRET_KEY", "4606")
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class TokenData:
    username: str | None = None

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Development bypass - if token looks invalid, try to find a default user
    DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"
    
    try:
        # Handle empty or malformed tokens
        if not token or len(token.split('.')) != 3:
            print(f"DEBUG: Invalid token format: '{token[:50]}...'")
            if DEV_MODE:
                print("DEBUG: DEV_MODE enabled, using default user")
                # Try to find any user for development
                response = supabase.table("users").select("*").limit(1).execute()
                if response.data:
                    return response.data[0]
            raise credentials_exception
            
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None:
            raise credentials_exception
        token_data = TokenData()
        token_data.username = username
    except JWTError as e:
        print(f"DEBUG: JWT decode error: {e}")
        if DEV_MODE:
            print("DEBUG: DEV_MODE enabled, using default user")
            response = supabase.table("users").select("*").limit(1).execute()
            if response.data:
                return response.data[0]
        raise credentials_exception
    except Exception as e:
        print(f"DEBUG: Unexpected auth error: {e}")
        if DEV_MODE:
            print("DEBUG: DEV_MODE enabled, using default user")
            response = supabase.table("users").select("*").limit(1).execute()
            if response.data:
                return response.data[0]
        raise credentials_exception
    
    # Handle employee authentication
    if role == "employee" or username == "employee":
        # Employee token contains user_id, username, and email in payload
        employee_email = payload.get("email")
        tenant_user_id = payload.get("user_id")
        if not employee_email or not tenant_user_id:
            raise credentials_exception
        
        # Fetch employee from database
        response = supabase.table("employees").select("*").eq("email", employee_email).execute()
        employee = response.data[0] if response.data else None
        if employee is None:
            raise credentials_exception
        
        # Return employee data with role marker and consistent employee_id field
        return {
            **employee,
            "role": "employee",
            "username": payload.get("username"),
            "employee_id": employee.get("id") or employee.get("employee_id"),  # Map id to employee_id for consistency
        }
    
    # Handle regular user authentication
    response = supabase.table("users").select("*").eq("username", token_data.username).execute()
    user = response.data[0] if response.data else None
    if user is None:
        raise credentials_exception
    return user
