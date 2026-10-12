import os
import json
import time
import secrets
import re
from typing import Dict, List, Any, Optional
try:
    from config import ADMIN_API_KEY
except Exception:
    ADMIN_API_KEY = "HLC_ADMIN_MASTER_2026"

from core.quota_manager import quota_manager

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
KEYS_FILE = os.path.join(DATA_DIR, "api_keys.json")

# Master Admin Key mặc định
MASTER_ADMIN_KEY = os.getenv("ADMIN_API_KEY", ADMIN_API_KEY)

class ApiKeyManager:
    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        self.keys: Dict[str, Dict[str, Any]] = {}
        self.load_keys()
        self.ensure_default_keys()

    def _slugify(self, text: str) -> str:
        s = re.sub(r'[^a-zA-Z0-9_-]', '_', text).lower()
        return s.strip('_') or 'client'

    def load_keys(self):
        if os.path.exists(KEYS_FILE):
            try:
                with open(KEYS_FILE, 'r', encoding='utf-8') as f:
                    self.keys = json.load(f)
            except Exception:
                self.keys = {}
        else:
            self.keys = {}

    def save_keys(self):
        with open(KEYS_FILE, 'w', encoding='utf-8') as f:
            json.dump(self.keys, f, ensure_ascii=False, indent=2)

    def ensure_default_keys(self):
        # 1. Luôn bảo đảm có Admin API Key
        admin_entry = {
            "key": MASTER_ADMIN_KEY,
            "id": "admin",
            "name": "Quản Trị Viên (Admin Master)",
            "role": "admin",
            "max_streams": 20,
            "disk_quota_mb": 102400, # 100 GB
            "quota_remaining": 999999,
            "status": "active",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        self.keys[MASTER_ADMIN_KEY] = admin_entry

        # 2. Tạo 1 key demo mẫu cho khách hàng nếu chưa có
        demo_client_key = "HLC_DEMO_CLIENT_KEY"
        if demo_client_key not in self.keys:
            self.keys[demo_client_key] = {
                "key": demo_client_key,
                "id": "demo_shop",
                "name": "Shop Demo Thời Trang",
                "role": "client",
                "max_streams": 2,
                "disk_quota_mb": 10240, # 10 GB
                "quota_remaining": 500,
                "status": "active",
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
            }

        self.save_keys()

    def validate_key(self, api_key: str) -> Dict[str, Any]:
        api_key = (api_key or "").strip()
        if not api_key:
            return {"success": False, "message": "Vui lòng nhập API Key"}

        # 1. Kiểm tra Admin Key
        if api_key == MASTER_ADMIN_KEY:
            return {
                "success": True,
                "user": dict(self.keys[MASTER_ADMIN_KEY])
            }

        # 2. Kiểm tra trong kho Local API Keys
        if api_key in self.keys:
            item = self.keys[api_key]
            if item.get("status") != "active":
                return {"success": False, "message": "API Key này đã bị khóa hoặc hết hạn!"}
            return {
                "success": True,
                "user": dict(item)
            }

        # 3. Fallback: Kiểm tra qua Supabase Cloud (nếu có cấu hình)
        try:
            supa_res = quota_manager.validate_api_key(api_key)
            if supa_res.get("success"):
                key_id = supa_res.get("key_id", api_key[:12])
                user_obj = {
                    "key": api_key,
                    "id": str(key_id),
                    "name": f"Khách hàng {str(key_id)[:8]}",
                    "role": "client",
                    "max_streams": 2,
                    "disk_quota_mb": 10240,
                    "quota_remaining": supa_res.get("quota_remaining", 100),
                    "status": "active",
                    "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
                }
                # Lưu cache local
                self.keys[api_key] = user_obj
                self.save_keys()
                return {"success": True, "user": user_obj}
            else:
                return {"success": False, "message": supa_res.get("message", "API Key không hợp lệ!")}
        except Exception:
            pass

        return {"success": False, "message": "API Key không chính xác. Vui lòng kiểm tra lại!"}

    def create_client_key(self, name: str, custom_key: Optional[str] = None, max_streams: int = 2, disk_quota_mb: int = 10240) -> Dict[str, Any]:
        name = (name or "").strip()
        if not name:
            return {"success": False, "message": "Vui lòng nhập tên khách hàng / tên shop"}

        # Sinh key ngẫu nhiên hoặc dùng key người dùng chỉ định
        if custom_key and custom_key.strip():
            key = custom_key.strip()
        else:
            key = f"HLC_{self._slugify(name).upper()}_{secrets.token_hex(4).upper()}"

        if key in self.keys:
            return {"success": False, "message": f"Mã API Key '{key}' đã tồn tại"}

        user_id = self._slugify(name)
        # Đảm bảo user_id là duy nhất
        base_id = user_id
        counter = 1
        existing_ids = {u.get("id") for u in self.keys.values()}
        while user_id in existing_ids:
            user_id = f"{base_id}_{counter}"
            counter += 1

        entry = {
            "key": key,
            "id": user_id,
            "name": name,
            "role": "client",
            "max_streams": max(1, int(max_streams)),
            "disk_quota_mb": max(512, int(disk_quota_mb)),
            "quota_remaining": 1000,
            "status": "active",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        self.keys[key] = entry
        self.save_keys()
        return {"success": True, "key_data": entry}

    def list_keys(self) -> List[Dict[str, Any]]:
        return list(self.keys.values())

    def update_key(self, key: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if key not in self.keys:
            return {"success": False, "message": "API Key không tồn tại"}
        
        item = self.keys[key]
        if "name" in updates and updates["name"]:
            item["name"] = updates["name"].strip()
        if "max_streams" in updates:
            item["max_streams"] = max(1, int(updates["max_streams"]))
        if "disk_quota_mb" in updates:
            item["disk_quota_mb"] = max(512, int(updates["disk_quota_mb"]))
        if "status" in updates and updates["status"] in ["active", "disabled"]:
            item["status"] = updates["status"]

        self.keys[key] = item
        self.save_keys()
        return {"success": True, "key_data": item}

    def delete_key(self, key: str) -> Dict[str, Any]:
        if key == MASTER_ADMIN_KEY:
            return {"success": False, "message": "Không thể xóa Admin Master Key"}
        if key not in self.keys:
            return {"success": False, "message": "API Key không tồn tại"}

        self.keys.pop(key, None)
        self.save_keys()
        return {"success": True, "message": "Đã xóa API Key thành công"}

api_key_manager = ApiKeyManager()
