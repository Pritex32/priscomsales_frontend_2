from supabase import create_client, ClientOptions
import os
import ssl
import certifi

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://ecsrlqvifparesxakokl.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjc3JscXZpZnBhcmVzeGFrb2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2NjczMDMsImV4cCI6MjA2MDI0MzMwM30.Zts7p1C3MNFqYYzp-wo3e0z-9MLfRDoY2YJ5cxSexHk")

# Workaround for SSL errors on Windows
# Set SSL_CERT_FILE environment variable to use certifi's certificate bundle
try:
    os.environ['SSL_CERT_FILE'] = certifi.where()
except:
    pass  # If certifi not available, continue without it

# Create ClientOptions object with increased timeouts
options = ClientOptions(
    postgrest_client_timeout=30,
    storage_client_timeout=30
)

supabase = create_client(
    SUPABASE_URL, 
    SUPABASE_KEY,
    options=options
)
