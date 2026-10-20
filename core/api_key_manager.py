import os
import json
import time
import secrets
import re
from typing import Dict, List, Any, Optional
try:
    from config import ADMIN_API_KEY, DATA_DIR
except Exception:
    ADMIN_API_KEY = "hlc-live-automation-admin-12354-4856464-4687-438137-68817-46871-31587169-187146-001"
    DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

from core.quota_manager import quota_manager

KEYS_FILE = os.path.join(DATA_DIR, "api_keys.json")

# Master Admin Key mặc định
MASTER_ADMIN_KEY = os.getenv("ADMIN_API_KEY", ADMIN_API_KEY)

class ApiKeyManager:
    def __init__(self):
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
        except Exception:
            pass
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
        try:
            with open(KEYS_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.keys, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def ensure_default_keys(self):
        # Dọn dẹp key placeholder cũ nếu có
        if "HLC_ADMIN_MASTER_2026" in self.keys and MASTER_ADMIN_KEY != "HLC_ADMIN_MASTER_2026":
            del self.keys["HLC_ADMIN_MASTER_2026"]

        # 1. Luôn bảo đảm có Admin API Key
        admin_entry = {
            "key": MASTER_ADMIN_KEY,
            "id": "admin",
            "name": "Master Key (Trạm Phát Sóng Chính)",
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

    def generate_formatted_api_key(self) -> str:
        """
        Sinh mã API Key chuẩn theo cấu trúc yêu cầu của hệ thống:
        Ví dụ: hlc-live-automation-5381-903-294817-49501-33574-921475-88-10363827-5123-0
        """
        import random
        p1 = random.randint(1000, 9999)
        p2 = random.randint(100, 999)
        p3 = random.randint(100000, 999999)
        p4 = random.randint(10000, 99999)
        p5 = random.randint(10000, 99999)
        p6 = random.randint(100000, 999999)
        p7 = random.randint(10, 99)
        p8 = random.randint(10000000, 99999999)
        p9 = random.randint(1000, 9999)
        p10 = random.randint(0, 9)
        return f"hlc-live-automation-{p1}-{p2}-{p3}-{p4}-{p5}-{p6}-{p7}-{p8}-{p9}-{p10}"

    def push_to_supabase(self, api_key: str, name: str, quota_remaining: int = 500, expires_at: Optional[str] = None, user_id: Optional[str] = None, key_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Lưu trữ và đồng bộ API Key lên Supabase Cloud Database (Bảng api_keys)
        """
        import hashlib
        import uuid
        import requests
        from config import SUPABASE_URL, SUPABASE_ANON_KEY

        key_hash = hashlib.sha256(api_key.strip().encode('utf-8')).hexdigest()
        kid = key_id or str(uuid.uuid4())
        uid = user_id or "64f6b97a-c525-4722-b969-646ff6f779e1"
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        payload = {
            "id": kid,
            "user_id": uid,
            "name": name,
            "key_hash": key_hash,
            "key_prefix": "auto live",
            "status": "active",
            "rate_limit_per_min": 1,
            "quota_remaining": max(0, int(quota_remaining)),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00")
        }
        if expires_at:
            payload["expires_at"] = expires_at

        try:
            res = requests.post(f"{SUPABASE_URL}/rest/v1/api_keys", headers=headers, json=payload, timeout=8)
            if res.status_code in [200, 201]:
                return {"success": True, "data": res.json()}
            else:
                return {"success": False, "message": f"Supabase error ({res.status_code}): {res.text}"}
        except Exception as e:
            return {"success": False, "message": f"Lỗi kết nối Supabase Cloud: {str(e)}"}

    def create_client_key(self, name: str, custom_key: Optional[str] = None, max_streams: int = 2, disk_quota_mb: int = 10240, quota_remaining: int = 500, push_supabase: bool = True, expires_days: Optional[int] = None) -> Dict[str, Any]:
        name = (name or "").strip()
        if not name:
            return {"success": False, "message": "Vui lòng nhập tên khách hàng / tên shop"}

        # Sinh key theo cấu trúc chuẩn hoặc dùng key người dùng chỉ định
        if custom_key and custom_key.strip():
            key = custom_key.strip()
        else:
            key = self.generate_formatted_api_key()

        if key in self.keys:
            return {"success": False, "message": f"Mã API Key '{key}' đã tồn tại"}

        import uuid
        key_id = str(uuid.uuid4())
        user_id = self._slugify(name)
        # Đảm bảo user_id là duy nhất trong local
        base_id = user_id
        counter = 1
        existing_ids = {u.get("id") for u in self.keys.values()}
        while user_id in existing_ids:
            user_id = f"{base_id}_{counter}"
            counter += 1

        expires_at_iso = None
        if expires_days and int(expires_days) > 0:
            import datetime
            exp_date = datetime.datetime.utcnow() + datetime.timedelta(days=int(expires_days))
            expires_at_iso = exp_date.strftime("%Y-%m-%dT%H:%M:%S+00:00")

        # Đẩy lên Supabase Cloud nếu được yêu cầu
        supabase_res = None
        supabase_synced = False
        if push_supabase:
            supabase_res = self.push_to_supabase(
                api_key=key,
                name=name,
                quota_remaining=quota_remaining,
                expires_at=expires_at_iso,
                key_id=key_id
            )
            supabase_synced = bool(supabase_res.get("success"))

        import hashlib
        key_hash = hashlib.sha256(key.strip().encode('utf-8')).hexdigest()

        entry = {
            "key": key,
            "id": key_id,
            "user_id": user_id,
            "name": name,
            "role": "client",
            "max_streams": max(1, int(max_streams)),
            "disk_quota_mb": max(512, int(disk_quota_mb)),
            "quota_remaining": max(0, int(quota_remaining)),
            "status": "active",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "expires_at": expires_at_iso,
            "key_hash": key_hash,
            "synced_supabase": supabase_synced
        }
        self.keys[key] = entry
        self.save_keys()

        return {
            "success": True,
            "key_data": entry,
            "api_key": key,
            "supabase_synced": supabase_synced,
            "supabase_detail": supabase_res
        }

    def list_keys(self) -> List[Dict[str, Any]]:
        return list(self.keys.values())

    def toggle_key_status(self, key: str, new_status: Optional[str] = None) -> Dict[str, Any]:
        """
        Bật / Tắt (Active / Revoked) API Key người dùng ngay trên Web App
        Đồng bộ trực tiếp sang Supabase Cloud Database
        """
        if key == MASTER_ADMIN_KEY:
            return {"success": False, "message": "Không thể khóa Master Admin Key!"}

        if key not in self.keys:
            return {"success": False, "message": "API Key không tồn tại"}

        item = self.keys[key]
        current = item.get("status", "active")
        if not new_status:
            target_status = "revoked" if current == "active" else "active"
        else:
            target_status = "active" if new_status == "active" else "revoked"

        item["status"] = target_status
        self.keys[key] = item
        self.save_keys()

        # Đồng bộ sang Supabase Cloud qua key_hash hoặc id
        import hashlib
        import requests
        from config import SUPABASE_URL, SUPABASE_ANON_KEY

        key_hash = item.get("key_hash") or hashlib.sha256(key.strip().encode('utf-8')).hexdigest()
        kid = item.get("id")
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        }
        supabase_synced = False
        try:
            # Thử cập nhật theo id trước, nếu không được thử theo key_hash
            r = None
            if kid and len(str(kid)) > 20: # Valid UUID
                r = requests.patch(f"{SUPABASE_URL}/rest/v1/api_keys?id=eq.{kid}", headers=headers, json={"status": target_status}, timeout=5)
            if not r or r.status_code not in [200, 204]:
                r = requests.patch(f"{SUPABASE_URL}/rest/v1/api_keys?key_hash=eq.{key_hash}", headers=headers, json={"status": target_status}, timeout=5)
            
            if r and r.status_code in [200, 204]:
                supabase_synced = True
                item["synced_supabase"] = True
                self.save_keys()
        except Exception:
            pass

        action_label = "Kích hoạt (Mở khóa)" if target_status == "active" else "Tạm khóa (Tắt)"
        return {
            "success": True,
            "key": key,
            "status": target_status,
            "supabase_synced": supabase_synced,
            "message": f"Đã {action_label} API Key '{item.get('name', key)}' thành công!"
        }

    def sync_all_from_supabase(self) -> Dict[str, Any]:
        """
        Kéo và đồng bộ toàn bộ danh sách API Keys từ Supabase Cloud về Local
        """
        import requests
        from config import SUPABASE_URL, SUPABASE_ANON_KEY

        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
        }
        try:
            res = requests.get(f"{SUPABASE_URL}/rest/v1/api_keys?select=*", headers=headers, timeout=10)
            if res.status_code != 200:
                return {"success": False, "message": f"Lỗi truy vấn Supabase ({res.status_code}): {res.text}"}

            cloud_keys = res.json()
            synced_count = 0
            for ck in cloud_keys:
                ck_id = ck.get("id")
                ck_hash = ck.get("key_hash")
                ck_status = ck.get("status", "active")
                ck_quota = ck.get("quota_remaining", 0)
                ck_name = ck.get("name") or f"Khách hàng {str(ck_id)[:8]}"

                # Tìm key trong local
                found = False
                for local_k, local_entry in self.keys.items():
                    if local_entry.get("id") == ck_id or local_entry.get("key_hash") == ck_hash:
                        local_entry["status"] = ck_status
                        local_entry["quota_remaining"] = ck_quota
                        local_entry["name"] = ck_name
                        local_entry["synced_supabase"] = True
                        found = True
                        synced_count += 1
                        break

                if not found and ck.get("name") != "Admin":
                    key_placeholder = f"SUPA_{str(ck_id)[:8]}"
                    self.keys[key_placeholder] = {
                        "key": key_placeholder,
                        "id": str(ck_id),
                        "name": ck_name,
                        "role": "client",
                        "max_streams": 2,
                        "disk_quota_mb": 10240,
                        "quota_remaining": ck_quota,
                        "status": ck_status,
                        "created_at": ck.get("created_at", time.strftime("%Y-%m-%d %H:%M:%S")),
                        "key_hash": ck_hash,
                        "synced_supabase": True
                    }
                    synced_count += 1

            self.save_keys()
            return {"success": True, "count": synced_count, "total_cloud": len(cloud_keys)}
        except Exception as e:
            return {"success": False, "message": f"Lỗi kết nối Supabase Cloud: {str(e)}"}

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
        if "quota_remaining" in updates:
            item["quota_remaining"] = max(0, int(updates["quota_remaining"]))
        if "status" in updates:
            st = updates["status"]
            if st in ["active", "revoked", "disabled"]:
                item["status"] = "revoked" if st in ["revoked", "disabled"] else "active"
                # Đồng bộ trạng thái mới sang Supabase
                try:
                    import hashlib
                    import requests
                    from config import SUPABASE_URL, SUPABASE_ANON_KEY
                    khash = item.get("key_hash") or hashlib.sha256(key.strip().encode()).hexdigest()
                    requests.patch(
                        f"{SUPABASE_URL}/rest/v1/api_keys?key_hash=eq.{khash}",
                        headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"},
                        json={"status": item["status"]},
                        timeout=5
                    )
                except Exception:
                    pass

        self.keys[key] = item
        self.save_keys()
        return {"success": True, "key_data": item}

    def get_credits(self, api_key: str) -> int:
        if api_key == MASTER_ADMIN_KEY:
            return 999999
        item = self.keys.get(api_key)
        if not item:
            return 0
        return int(item.get("quota_remaining", 0))

    def deduct_credits(self, api_key: str, amount: int, reason: str = "") -> Dict[str, Any]:
        if api_key == MASTER_ADMIN_KEY:
            return {"success": True, "remaining": 999999, "deducted": 0, "is_admin": True}

        if api_key not in self.keys:
            return {"success": False, "message": "API Key không hợp lệ"}

        item = self.keys[api_key]
        current_credits = int(item.get("quota_remaining", 0))
        if current_credits < amount:
            return {
                "success": False, 
                "message": f"Số dư không đủ! Cần {amount} Credits nhưng chỉ còn {current_credits} Credits. Vui lòng liên hệ Admin để nạp thêm gói dịch vụ.",
                "current_credits": current_credits,
                "required_credits": amount
            }

        item["quota_remaining"] = current_credits - amount
        self.keys[api_key] = item
        self.save_keys()

        return {
            "success": True,
            "deducted": amount,
            "remaining": item["quota_remaining"],
            "reason": reason
        }

    def add_credits(self, api_key: str, amount: int) -> Dict[str, Any]:
        if api_key not in self.keys:
            return {"success": False, "message": "API Key không tồn tại"}

        item = self.keys[api_key]
        item["quota_remaining"] = int(item.get("quota_remaining", 0)) + int(amount)
        self.keys[api_key] = item
        self.save_keys()

        return {
            "success": True,
            "added": amount,
            "new_balance": item["quota_remaining"]
        }

    def delete_key(self, key: str) -> Dict[str, Any]:
        if key == MASTER_ADMIN_KEY:
            return {"success": False, "message": "Không thể xóa Admin Master Key"}
        if key not in self.keys:
            return {"success": False, "message": "API Key không tồn tại"}

        self.keys.pop(key, None)
        self.save_keys()
        return {"success": True, "message": "Đã xóa API Key thành công"}

api_key_manager = ApiKeyManager()

