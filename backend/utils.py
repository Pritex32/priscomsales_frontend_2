import jwt
from supabase import create_client
from datetime import datetime, timezone, timedelta

# JWT Configuration (reuse from Streamlit)
jwt_SECRET_KEY = "4606"  # Use env vars in production
ALGORITHM = "HS256"

def generate_jwt(user_id, username, role, plan="free", is_active=False, email=None, access_code=None):
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "plan": plan,
        "is_active": is_active,
        "email": email,
        "access_code": access_code,
        "exp": datetime.now(timezone.utc) + timedelta(hours=4),
        "iat": datetime.now(timezone.utc)
    }
    token = jwt.encode(payload, jwt_SECRET_KEY, algorithm=ALGORITHM)
    return token

def decode_jwt(token):
    try:
        return jwt.decode(token, jwt_SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

# Supabase Configuration (reuse from Streamlit)
def get_supabase_client():
    supabase_url = 'https://ecsrlqvifparesxakokl.supabase.co'
    supabase_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjc3JscXZpZnBhcmVzeGFrb2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2NjczMDMsImV4cCI6MjA2MDI0MzMwM30.Zts7p1C3MNFqYYzp-wo3e0z-9MLfRDoY2YJ5cxSexHk'
    try:
        supabase = create_client(supabase_url, supabase_key)
        return supabase
    except Exception as e:
        raise Exception(f"Failed to connect to Supabase: {e}")

# Auth dependency for FastAPI
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_jwt(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user_id",
        )
    return int(user_id)

# Helper functions for data fetching (mirroring Streamlit)
def fetch_sales_data(supabase, user_id):
    response = supabase.table("sales_master_history").select("*").eq("user_id", user_id).order("sale_date", desc=True).execute()
    return response.data or []

def fetch_restock_data(supabase, user_id):
    response = supabase.table("goods_bought_history").select("*").eq("user_id", user_id).execute()
    return response.data or []

def fetch_expenses_data(supabase, user_id):
    response = supabase.table("expenses_master").select("*").eq("user_id", user_id).execute()
    return response.data or []

def fetch_payments_data(supabase, user_id):
    response = supabase.table("payments").select("*").eq("user_id", user_id).execute()
    return response.data or []

# Brevo Email Integration
import os
import requests

def send_vendor_email_brevo(
    to_email: str,
    vendor_name: str,
    access_code: str = None,
    approved: bool = True,
    reason: str = None,
    product_name: str = None
):
    """
    Send vendor notification emails via Brevo API.
    
    Args:
        to_email: Recipient email address
        vendor_name: Name of the vendor/business
        access_code: Vendor access code (for approval emails)
        approved: True for approval, False for rejection
        reason: Rejection reason (for rejection emails)
        product_name: Product name (for product approval/rejection)
    """
    brevo_api_key = os.getenv("BREVO_API_KEY")
    if not brevo_api_key:
        print("Warning: BREVO_API_KEY not set. Email not sent.")
        return False
    
    # Determine email subject and content
    if product_name:
        # Product approval/rejection
        if approved:
            subject = f"Product Approved: {product_name}"
            html_content = f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                        <h2 style="color: #28a745;">🎉 Product Approved!</h2>
                        <p>Dear <strong>{vendor_name}</strong>,</p>
                        <p>Great news! Your product <strong>"{product_name}"</strong> has been approved and is now live on PriscomSales.</p>
                        <p>Customers can now view and purchase your product.</p>
                        <hr style="border: 1px solid #ddd; margin: 20px 0;">
                        <p style="color: #666; font-size: 12px;">This is an automated message from PriscomSales.</p>
                    </div>
                </body>
            </html>
            """
        else:
            subject = f"Product Rejected: {product_name}"
            html_content = f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                        <h2 style="color: #dc3545;">❌ Product Rejected</h2>
                        <p>Dear <strong>{vendor_name}</strong>,</p>
                        <p>Unfortunately, your product <strong>"{product_name}"</strong> has been rejected.</p>
                        <p><strong>Reason:</strong> {reason or 'Not specified'}</p>
                        <p>Please review the requirements and resubmit with the necessary corrections.</p>
                        <hr style="border: 1px solid #ddd; margin: 20px 0;">
                        <p style="color: #666; font-size: 12px;">This is an automated message from PriscomSales.</p>
                    </div>
                </body>
            </html>
            """
    else:
        # Vendor approval/rejection
        if approved:
            subject = f"Vendor Application Approved - {vendor_name}"
            html_content = f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                        <h2 style="color: #28a745;">🎉 Welcome to PriscomSales!</h2>
                        <p>Dear <strong>{vendor_name}</strong>,</p>
                        <p>Congratulations! Your vendor application has been <strong>approved</strong>.</p>
                        <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                            <p style="margin: 0;"><strong>Your Access Code:</strong></p>
                            <p style="font-size: 24px; font-weight: bold; color: #28a745; margin: 10px 0;">{access_code}</p>
                            <p style="margin: 0; font-size: 12px; color: #666;">Keep this code safe. You'll need it to log in and manage your products.</p>
                        </div>
                        <p>You can now start uploading your products to the platform.</p>
                        <hr style="border: 1px solid #ddd; margin: 20px 0;">
                        <p style="color: #666; font-size: 12px;">This is an automated message from PriscomSales.</p>
                    </div>
                </body>
            </html>
            """
        else:
            subject = f"Vendor Application Rejected - {vendor_name}"
            html_content = f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                        <h2 style="color: #dc3545;">❌ Application Not Approved</h2>
                        <p>Dear <strong>{vendor_name}</strong>,</p>
                        <p>Unfortunately, your vendor application has been rejected.</p>
                        <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                            <p style="margin: 0;"><strong>Reason:</strong></p>
                            <p style="margin: 10px 0;">{reason or 'Not specified'}</p>
                        </div>
                        <p>Please review the requirements and feel free to reapply once you've addressed the issues.</p>
                        <hr style="border: 1px solid #ddd; margin: 20px 0;">
                        <p style="color: #666; font-size: 12px;">This is an automated message from PriscomSales.</p>
                    </div>
                </body>
            </html>
            """
    
    # Send email via Brevo API
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": brevo_api_key,
        "content-type": "application/json"
    }
    
    payload = {
        "sender": {
            "name": "PriscomSales",
            "email": "noreply@priscomsales.online"  # Update with your verified sender
        },
        "to": [
            {
                "email": to_email,
                "name": vendor_name
            }
        ],
        "subject": subject,
        "htmlContent": html_content
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code in [200, 201]:
            print(f"Email sent successfully to {to_email}")
            return True
        else:
            print(f"Failed to send email: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"Error sending email: {str(e)}")
        return False
