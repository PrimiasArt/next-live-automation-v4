import os
import json
import hashlib
import secrets
import time
from typing import Optional, Dict, List, Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
TOKENS_FILE = os.path.join(DATA_DIR, "tokens.json")

class AuthManager:
    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        self.users: Dict[str, Dict[str, Any]] = {}
        self.tokens: Dict[str, Dict[str, Any]] = {} # token -> {username, expires_at}
        self.load_data()
        self.ensure_default_admin()

    def _hash_password(self, password: str, salt: Optional[str] = None) -> str:
        if not salt:
            salt = secrets.token_hex(8)
        hashed = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
        return f"{salt}${hashed}"

    def _verify_password(self, password: str, stored_hash: str) -> bool:
        try:
            salt, hashed = stored_hash.split('$')
            return hashlib.sha256((salt + password).encode('utf-8')).hexdigest() == hashed
        except Exception:
            return False

    def load_data(self):
        if os.path.exists(USERS_FILE):
            try:
                with open(USERS_FILE, 'r', encoding='utf-8') as f:
                    self.users = json.load(f)
            except Exception:
                self.users = {}
        if os.path.exists(TOKENS_FILE):
            try:
                with open(TOKENS_FILE, 'r', encoding='utf-8') as f:
                    self.tokens = json.load(f)
            except Exception:
                self.tokens = {}

    def save_users(self):
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(self.users, f, ensure_ascii=False, indent=2)

    def save_tokens(self):
        # Clean expired tokens before saving
        now = time.time()
        self.tokens = {t: data for t, data in self.tokens.items() if data.get('expires_at', 0) > now}
        with open(TOKENS_FILE, 'w', encoding='utf-8') as f:
            json.dump(self.tokens, f, ensure_ascii=False, indent=2)

    def ensure_default_admin(self):
        if "admin" not in self.users:
            self.users["admin"] = {
                "id": "admin",
                "username": "admin",
                "password_hash": self._hash_password("admin@2026"),
                "role": "admin",
                "name": "Quản Trị Viên",
                "max_streams": 10,
                "disk_quota_mb": 51200, # 50 GB
                "status": "active",
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
            }
            self.save_users()

    def authenticate(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        user = self.users.get(username.strip())
        if not user or user.get("status") != "active":
            return None
        if not self._verify_password(password, user.get("password_hash", "")):
            return None
        
        # Tạo session token (hạn 30 ngày)
        token = secrets.token_hex(32)
        expires_at = time.time() + (30 * 86400)
        self.tokens[token] = {
            "username": user["username"],
            "expires_at": expires_at
        }
        self.save_tokens()
        
        user_info = self.get_user_safe(user["username"])
        return {
            "token": token,
            "user": user_info
        }

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        if not token:
            return None
        data = self.tokens.get(token)
        if not data:
            return None
        if data.get("expires_at", 0) < time.time():
            self.tokens.pop(token, None)
            self.save_tokens()
            return None
        
        username = data.get("username")
        user = self.users.get(username)
        if not user or user.get("status") != "active":
            return None
        return self.get_user_safe(username)

    def revoke_token(self, token: str) -> bool:
        if token in self.tokens:
            self.tokens.pop(token, None)
            self.save_tokens()
            return True
        return False

    def create_user(self, username: str, password: str, name: str = "", role: str = "client", max_streams: int = 2, disk_quota_mb: int = 10240) -> Dict[str, Any]:
        username = username.strip().lower()
        if not username or len(username) < 3:
            return {"success": False, "message": "Tên đăng nhập phải có ít nhất 3 ký tự"}
        if username in self.users:
            return {"success": False, "message": f"Tài khoản '{username}' đã tồn tại"}
        if len(password) < 6:
            return {"success": False, "message": "Mật khẩu phải có ít nhất 6 ký tự"}

        user_data = {
            "id": username,
            "username": username,
            "password_hash": self._hash_password(password),
            "role": role if role in ["admin", "client"] else "client",
            "name": name.strip() or username,
            "max_streams": int(max_streams) if int(max_streams) > 0 else 1,
            "disk_quota_mb": int(disk_quota_mb) if int(disk_quota_mb) > 0 else 5120,
            "status": "active",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        self.users[username] = user_data
        self.save_users()
        return {"success": True, "user": self.get_user_safe(username)}

    def update_user(self, username: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        user = self.users.get(username)
        if not user:
            return {"success": False, "message": "Người dùng không tồn tại"}

        if "password" in updates and updates["password"]:
            if len(updates["password"]) < 6:
                return {"success": False, "message": "Mật khẩu mới phải từ 6 ký tự"}
            user["password_hash"] = self._hash_password(updates["password"])
        
        if "name" in updates and updates["name"]:
            user["name"] = updates["name"].strip()
        if "role" in updates and updates["role"] in ["admin", "client"]:
            user["role"] = updates["role"]
        if "max_streams" in updates:
            user["max_streams"] = max(1, int(updates["max_streams"]))
        if "disk_quota_mb" in updates:
            user["disk_quota_mb"] = max(512, int(updates["disk_quota_mb"]))
        if "status" in updates and updates["status"] in ["active", "disabled"]:
            user["status"] = updates["status"]

        self.users[username] = user
        self.save_users()
        return {"success": True, "user": self.get_user_safe(username)}

    def delete_user(self, username: str) -> Dict[str, Any]:
        if username == "admin":
            return {"success": False, "message": "Không thể xóa tài khoản Admin mặc định"}
        if username not in self.users:
            return {"success": False, "message": "Người dùng không tồn tại"}
        
        self.users.pop(username, None)
        self.save_users()
        # Revoke user tokens
        self.tokens = {t: data for t, data in self.tokens.items() if data.get('username') != username}
        self.save_tokens()
        return {"success": True, "message": f"Đã xóa tài khoản {username}"}

    def list_users(self) -> List[Dict[str, Any]]:
        return [self.get_user_safe(u) for u in self.users.keys()]

    def get_user_safe(self, username: str) -> Optional[Dict[str, Any]]:
        user = self.users.get(username)
        if not user:
            return None
        safe = dict(user)
        safe.pop("password_hash", None)
        return safe

auth_manager = AuthManager()
