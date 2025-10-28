#!/usr/bin/env python3
"""
Script to create a test user for login testing
"""
import requests
import json

# Your backend URL
BASE_URL = "http://localhost:8000"

def create_test_user():
    """Create a test user via the registration endpoint"""
    
    # Test user data
    user_data = {
        "username": "testuser",
        "email": "test@example.com", 
        "password": "password123",
        "role": "md",
        "plan": "free",
        "accepted_terms": True,
        "access_code": None
    }
    
    try:
        print("Creating test user...")
        response = requests.post(f"{BASE_URL}/auth/register", params=user_data)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ User created successfully!")
            print(f"User ID: {result.get('user_id')}")
            print(f"Message: {result.get('msg')}")
            print("\nTest credentials:")
            print(f"Username: {user_data['username']}")
            print(f"Password: {user_data['password']}")
            
            # Note about email verification
            print("\n⚠️  Note: You may need to verify the email before logging in.")
            print("Check the backend logs for the verification link or disable email verification for testing.")
            
        else:
            error_detail = response.json().get('detail', 'Unknown error')
            print(f"❌ Failed to create user: {error_detail}")
            
            if "already registered" in error_detail.lower():
                print("\n💡 The test user already exists. Try logging in with:")
                print(f"Username: {user_data['username']}")
                print(f"Password: {user_data['password']}")
    
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to backend. Make sure the server is running on localhost:8000")
    except Exception as e:
        print(f"❌ Error: {e}")

def test_login():
    """Test login with the created user"""
    
    login_data = {
        "username": "testuser",
        "password": "password123"
    }
    
    try:
        print("\n🔐 Testing login...")
        response = requests.post(f"{BASE_URL}/auth/token", data=login_data)
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Login successful!")
            print(f"Access token: {result.get('access_token', 'N/A')[:50]}...")
            print(f"Plan: {result.get('plan')}")
        else:
            error_detail = response.json().get('detail', 'Unknown error')
            print(f"❌ Login failed: {error_detail}")
            
    except Exception as e:
        print(f"❌ Login test error: {e}")

if __name__ == "__main__":
    create_test_user()
    test_login()