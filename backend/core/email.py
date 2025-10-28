import os
import httpx

BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "priscomac@priscomsales.online")
BREVO_SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "PriscomSales")
VERIFY_BASE_URL = os.getenv("VERIFY_BASE_URL", "https://priscomsales.online/auth/verify")

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def build_verification_link(token: str) -> str:
    # Ensure it matches: https://mydomain.com/auth/verify?token=XYZ
    return f"{VERIFY_BASE_URL}?token={token}"


async def send_verification_email(to_email: str, username: str, token: str) -> None:
    if not BREVO_API_KEY:
        # Fail-open for environments without API key (avoid breaking registration in dev)
        return

    verify_link = build_verification_link(token)
    subject = "Verify your email for PriscomSales"
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #222;">
        <h2>Verify your email</h2>
        <p>Hello {username},</p>
        <p>Thanks for registering with PriscomSales. Please verify your email address by clicking the link below:</p>
        <p><a href="{verify_link}" style="background:#1e88e5;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;">Verify Email</a></p>
        <p>If the button doesn't work, copy and paste this link into your browser:<br/>{verify_link}</p>
        <p>This link will expire in 24 hours.</p>
      </body>
    </html>
    """
    text_content = f"Hello {username},\n\nVerify your email by opening this link:\n{verify_link}\n\nThis link expires in 24 hours."

    headers = {
        "api-key": BREVO_API_KEY,
        "accept": "application/json",
        "content-type": "application/json",
    }

    payload = {
        "sender": {"email": BREVO_SENDER_EMAIL, "name": BREVO_SENDER_NAME},
        "to": [{"email": to_email, "name": username}],
        "subject": subject,
        "htmlContent": html_content,
        "textContent": text_content,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            res = await client.post(BREVO_API_URL, headers=headers, json=payload)
            # Don't raise in production path; silently ignore failures to avoid blocking user creation
            # Uncomment for debugging:
            # res.raise_for_status()
        except Exception:
            # Log if you have a logger; no-op here
            pass