import os

# --- CẤU HÌNH OBS STUDIO ---
OBS_HOST = os.getenv("OBS_HOST", "127.0.0.1")
OBS_PORT = int(os.getenv("OBS_PORT", 4455))
OBS_PASSWORD = os.getenv("OBS_PASSWORD", "")  # Điền mật khẩu nếu OBS WebSocket có cài đặt mật khẩu

# --- MASTER ADMIN API KEY ---
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "HLC_ADMIN_MASTER_2026")

# --- CẤU HÌNH SUPABASE CLOUD ---
SUPABASE_URL = "https://frredpdjfmafluafkrmr.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZycmVkcGRqZm1hZmx1YWZrcm1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3Mzk1NTAsImV4cCI6MjA5NDMxNTU1MH0.Rxd8dz_hZxZjqn6uyoStofhMtA2tEKFVxpsQa3e59Xo"

# --- THƯ MỤC LƯU TRỮ PROFILES ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROFILES_DIR = os.path.join(BASE_DIR, "profiles")

# --- CẤU HÌNH WEB SERVER ---
WEB_HOST = "0.0.0.0"
WEB_PORT = 5000
