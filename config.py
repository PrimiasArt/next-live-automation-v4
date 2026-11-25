import os

# --- CẤU HÌNH OBS STUDIO ---
OBS_HOST = os.getenv("OBS_HOST", "127.0.0.1")
OBS_PORT = int(os.getenv("OBS_PORT", 4455))
OBS_PASSWORD = os.getenv("OBS_PASSWORD", "")  # Điền mật khẩu nếu OBS WebSocket có cài đặt mật khẩu

# --- MASTER ADMIN API KEY ---
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "hlc-live-automation-admin-12354-4856464-4687-438137-68817-46871-31587169-187146-001")

# --- CẤU HÌNH SUPABASE CLOUD ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://frredpdjfmafluafkrmr.supabase.co")
SUPABASE_ANON_KEY = os.getenv(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZycmVkcGRqZm1hZmx1YWZrcm1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3Mzk1NTAsImV4cCI6MjA5NDMxNTU1MH0.Rxd8dz_hZxZjqn6uyoStofhMtA2tEKFVxpsQa3e59Xo"
)

# --- THƯ MỤC GỐC & SERVERLESS CHECK ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_VERCEL = bool(
    os.getenv("VERCEL")
    or os.getenv("VERCEL_ENV")
    or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
    or os.getenv("LAMBDA_TASK_ROOT")
    or not os.access(BASE_DIR, os.W_OK)
)

# --- CẤU HÌNH WEB SERVER ---
WEB_HOST = "0.0.0.0"
WEB_PORT = 5000

# --- MASTER AI KEYS (CONTENT STUDIO: ELEVENLABS & HEYGEN) ---
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY", "")

# --- DATA / STORAGE / PROFILES PATHS ---
if IS_VERCEL:
    DATA_DIR = os.getenv("DATA_DIR", "/tmp/data")
    STORAGE_DIR = os.getenv("STORAGE_DIR", "/tmp/storage")
    PROFILES_DIR = os.getenv("PROFILES_DIR", "/tmp/profiles")
    for _d in (DATA_DIR, STORAGE_DIR, PROFILES_DIR):
        os.makedirs(_d, exist_ok=True)
else:
    DATA_DIR = os.getenv("DATA_DIR", os.path.join(BASE_DIR, "data"))
    STORAGE_DIR = os.getenv("STORAGE_DIR", os.path.join(BASE_DIR, "storage"))
    PROFILES_DIR = os.getenv("PROFILES_DIR", os.path.join(BASE_DIR, "profiles"))

