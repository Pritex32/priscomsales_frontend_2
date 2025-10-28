# Brevo Email Setup Guide

The vendor notification system uses Brevo (formerly Sendinblue) to send emails when vendors and products are approved or rejected.

## Setup Steps

### 1. Create a Brevo Account
1. Go to [https://www.brevo.com/](https://www.brevo.com/)
2. Sign up for a free account (includes 300 emails/day)
3. Verify your email address

### 2. Get Your API Key
1. Log in to your Brevo account
2. Go to **Settings** → **SMTP & API** → **API Keys**
3. Click **Generate a new API key**
4. Give it a name (e.g., "PriscomSales Vendor Notifications")
5. Copy the API key

### 3. Configure the Application
1. Open `backend/.env` file
2. Replace `your_brevo_api_key_here` with your actual API key:
   ```
   BREVO_API_KEY=xkeysib-your-actual-api-key-here
   ```

### 4. Verify Sender Email (Important!)
1. In Brevo dashboard, go to **Senders & IP**
2. Add and verify the email address: `noreply@priscomsales.online`
3. Follow the verification process (usually involves adding DNS records or clicking a verification link)
4. **OR** update the sender email in `backend/utils.py` (line 201) to use a different verified email

### 5. Install Required Package
```bash
pip install requests
```

## Email Notifications Sent

The system sends emails for:

1. **Vendor Approval** - Includes access code
2. **Vendor Rejection** - Includes rejection reason
3. **Product Approval** - Confirms product is live
4. **Product Rejection** - Includes rejection reason

## Testing

To test the email function, restart your FastAPI server and:
1. Register a vendor
2. Approve the vendor from the admin dashboard
3. Check that the email is sent to the user's email address

## Troubleshooting

- **No emails sent**: Check that `BREVO_API_KEY` is correctly set in `.env`
- **API errors**: Verify your API key is active in Brevo dashboard
- **Sender not verified**: Make sure the sender email is verified in Brevo
- **Check logs**: The server console will show email send status

## Free Tier Limits

Brevo free plan includes:
- 300 emails per day
- Unlimited contacts
- Email templates
- API access

For higher volume, consider upgrading to a paid plan.
