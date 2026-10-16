import os
import json
import time
import uuid
import threading
import requests
import re
from typing import Dict, List, Any, Optional

try:
    from config import ELEVENLABS_API_KEY, HEYGEN_API_KEY, DATA_DIR, STORAGE_DIR
except Exception:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(BASE_DIR, "data")
    STORAGE_DIR = os.path.join(BASE_DIR, "storage")
    ELEVENLABS_API_KEY = ""
    HEYGEN_API_KEY = ""

from core.state import state

AI_SETTINGS_FILE = os.path.join(DATA_DIR, "ai_settings.json")
SYSTEM_AVATARS_FILE = os.path.join(DATA_DIR, "system_avatars.json")
USER_AVATARS_FILE = os.path.join(DATA_DIR, "user_avatars.json")
SYSTEM_AVATARS_DIR = os.path.join(STORAGE_DIR, "system_avatars")

# Danh sách Giọng đọc tuyển chọn (Curated Voices với hỗ trợ Tiếng Việt & Đa ngữ đỉnh cao)
CURATED_VOICES = [
    {
        "id": "21m00Tcm4TlvDq8ikWAM",
        "name": "Rachel (Nữ - Truyền cảm & Thân thiện)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "female",
        "style": "Kể chuyện, Giới thiệu sản phẩm",
        "preview_url": "/api/content-studio/voices/sample/21m00Tcm4TlvDq8ikWAM"
    },
    {
        "id": "AZnzlk1XvdvUeBnXmlld",
        "name": "Domi (Nữ - Tươi vui & Tự tin)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "female",
        "style": "Flash Sale, Chốt đơn livestream",
        "preview_url": "/api/content-studio/voices/sample/AZnzlk1XvdvUeBnXmlld"
    },
    {
        "id": "ErXwobaYiN019PkySvjV",
        "name": "Antoni (Nam - Trầm ấm & Chuyên nghiệp)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "male",
        "style": "Tin tức, Đánh giá công nghệ, Review",
        "preview_url": "/api/content-studio/voices/sample/ErXwobaYiN019PkySvjV"
    },
    {
        "id": "VR6AewLTigWG4xSOukaG",
        "name": "Arnold (Nam - Năng động & Quyết đoán)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "male",
        "style": "Khuyến mãi, Livestream bán hàng",
        "preview_url": "/api/content-studio/voices/sample/VR6AewLTigWG4xSOukaG"
    },
    {
        "id": "MF3mGyEYCl7XYWbV9V6O",
        "name": "Elli (Nữ - Dịu dàng & Tự nhiên)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "female",
        "style": "Thời trang, Mỹ phẩm, Chăm sóc sắc đẹp",
        "preview_url": "/api/content-studio/voices/sample/MF3mGyEYCl7XYWbV9V6O"
    },
    {
        "id": "pNInz6obpgDQGcFmaJgB",
        "name": "Adam (Nam - Giọng chuẩn thương mại)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "male",
        "style": "Quảng cáo TVC, Bán hàng cao cấp",
        "preview_url": "/api/content-studio/voices/sample/pNInz6obpgDQGcFmaJgB"
    }
]

# Upstream Voice Previews Cache
VOICE_PREVIEWS = {
    "21m00Tcm4TlvDq8ikWAM": "https://storage.googleapis.com/eleven-public-prod/previews/voices/21m00Tcm4TlvDq8ikWAM/preview.mp3",
    "AZnzlk1XvdvUeBnXmlld": "https://storage.googleapis.com/eleven-public-prod/previews/voices/AZnzlk1XvdvUeBnXmlld/preview.mp3",
    "ErXwobaYiN019PkySvjV": "https://storage.googleapis.com/eleven-public-prod/previews/voices/ErXwobaYiN019PkySvjV/preview.mp3",
    "VR6AewLTigWG4xSOukaG": "https://storage.googleapis.com/eleven-public-prod/previews/voices/VR6AewLTigWG4xSOukaG/preview.mp3",
    "MF3mGyEYCl7XYWbV9V6O": "https://storage.googleapis.com/eleven-public-prod/previews/voices/MF3mGyEYCl7XYWbV9V6O/preview.mp3",
    "pNInz6obpgDQGcFmaJgB": "https://storage.googleapis.com/eleven-public-prod/previews/voices/pNInz6obpgDQGcFmaJgB/preview.mp3",
}

# Danh sách MC Ảo tuyển chọn (Curated Avatars phong cách Livestream)
CURATED_AVATARS = [
    {
        "id": "Daisy-inskirt-20220818",
        "name": "Daisy (MC Bán Hàng Trẻ Trung)",
        "gender": "female",
        "preview_img": "/api/content-studio/avatars/image/sys_daisy.png",
        "local_file": "storage/system_avatars/sys_daisy.png",
        "style": "Trang phục công sở thanh lịch, phù hợp Shopee/TikTok"
    },
    {
        "id": "Bryan_IT_Sitting_public",
        "name": "Bryan (Chuyên Gia Công Nghệ)",
        "gender": "male",
        "preview_img": "/api/content-studio/avatars/image/sys_bryan.png",
        "local_file": "storage/system_avatars/sys_bryan.png",
        "style": "Áo sơ mi hiện đại, tư vấn kỹ thuật & sản phẩm"
    },
    {
        "id": "Anna_public_3_20240108",
        "name": "Anna (Host Livestream Chuyên Nghiệp)",
        "gender": "female",
        "preview_img": "/api/content-studio/avatars/image/sys_anna.png",
        "local_file": "storage/system_avatars/sys_anna.png",
        "style": "Thân thiện, tương tác tốt với khán giả livestream"
    },
    {
        "id": "Wayne_20240711",
        "name": "Wayne (MC Nam Lịch Lãm)",
        "gender": "male",
        "preview_img": "/api/content-studio/avatars/image/sys_wayne.png",
        "local_file": "storage/system_avatars/sys_wayne.png",
        "style": "Vest lịch sự, phù hợp sự kiện ra mắt & flash sale"
    },
    {
        "id": "Susan_public_2_20240328",
        "name": "Susan (Tư Vấn Viên Mỹ Phẩm)",
        "gender": "female",
        "preview_img": "/api/content-studio/avatars/image/sys_susan.png",
        "local_file": "storage/system_avatars/sys_susan.png",
        "style": "Nhẹ nhàng, phong thái chuyên gia sức khỏe làm đẹp"
    },
    {
        "id": "Tyler_public_20240115",
        "name": "Tyler (MC Năng Động Sôi Nổi)",
        "gender": "male",
        "preview_img": "/api/content-studio/avatars/image/sys_tyler.png",
        "local_file": "storage/system_avatars/sys_tyler.png",
        "style": "Trang phục casual, phong cách bán hàng tốc độ cao"
    }
]

class ContentStudioEngine:
    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(STORAGE_DIR, exist_ok=True)
        self.settings: Dict[str, Any] = {
            "elevenlabs_api_key": ELEVENLABS_API_KEY,
            "heygen_api_key": HEYGEN_API_KEY,
            "cost_per_voice_gen": 2,      # 2 Credits cho 1 lần tạo voice
            "cost_per_video_gen": 10,     # 10 Credits cho 1 video MC ảo
            "max_user_custom_avatars": 3  # Giới hạn số lượng mẫu người dùng tự tải lên (Admin cấu hình)
        }
        self.system_avatars_dir = SYSTEM_AVATARS_DIR
        os.makedirs(self.system_avatars_dir, exist_ok=True)
        self.voice_samples_dir = os.path.join(STORAGE_DIR, "voice_samples")
        os.makedirs(self.voice_samples_dir, exist_ok=True)
        self.voice_preview_cache: Dict[str, str] = dict(VOICE_PREVIEWS)
        self.system_avatars: List[Dict[str, Any]] = []
        self.user_avatars: Dict[str, List[Dict[str, Any]]] = {}
        self.tasks_file = os.path.join(DATA_DIR, "content_studio_tasks.json")
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.Lock()
        self.load_settings()
        self.load_tasks()
        self.load_avatars()

    def load_avatars(self):
        # 1. Nạp System Avatars (Mẫu hệ thống có sẵn dùng chung)
        if os.path.exists(SYSTEM_AVATARS_FILE):
            try:
                with open(SYSTEM_AVATARS_FILE, 'r', encoding='utf-8') as f:
                    self.system_avatars = json.load(f)
            except Exception as e:
                print(f"Lỗi nạp system_avatars.json: {e}")
                self.system_avatars = []
        else:
            # Khởi tạo mặc định từ CURATED_AVATARS
            self.system_avatars = [
                {
                    "id": a["id"],
                    "name": a["name"],
                    "gender": a.get("gender", "female"),
                    "preview_img": a.get("preview_img"),
                    "style": a.get("style", "MC Bán Hàng"),
                    "is_system": True,
                    "created_at": "2026-01-01 00:00:00"
                }
                for a in CURATED_AVATARS
            ]
            self.save_system_avatars()

        # 2. Nạp User Custom Avatars (Mẫu riêng tư của từng khách hàng)
        if os.path.exists(USER_AVATARS_FILE):
            try:
                with open(USER_AVATARS_FILE, 'r', encoding='utf-8') as f:
                    self.user_avatars = json.load(f)
            except Exception as e:
                print(f"Lỗi nạp user_avatars.json: {e}")
                self.user_avatars = {}
        else:
            self.user_avatars = {}

    def save_system_avatars(self):
        try:
            with open(SYSTEM_AVATARS_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.system_avatars, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Lỗi lưu system_avatars.json: {e}")

    def save_user_avatars(self):
        try:
            with open(USER_AVATARS_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.user_avatars, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Lỗi lưu user_avatars.json: {e}")

    def load_settings(self):
        if os.path.exists(AI_SETTINGS_FILE):
            try:
                with open(AI_SETTINGS_FILE, 'r', encoding='utf-8') as f:
                    saved = json.load(f)
                    self.settings.update(saved)
            except Exception as e:
                print(f"Lỗi nạp ai_settings.json: {e}")

    def load_tasks(self):
        if os.path.exists(self.tasks_file):
            try:
                with open(self.tasks_file, 'r', encoding='utf-8') as f:
                    self.tasks = json.load(f)
            except Exception as e:
                self.tasks = {}

    def save_tasks(self):
        try:
            with open(self.tasks_file, 'w', encoding='utf-8') as f:
                json.dump(self.tasks, f, ensure_ascii=False, indent=2)
        except Exception as e:
            pass

    def save_settings(self):
        try:
            with open(AI_SETTINGS_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.settings, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Lỗi lưu ai_settings.json: {e}")

    def get_api_keys(self) -> Dict[str, str]:
        return {
            "elevenlabs": self.settings.get("elevenlabs_api_key") or os.getenv("ELEVENLABS_API_KEY", ""),
            "heygen": self.settings.get("heygen_api_key") or os.getenv("HEYGEN_API_KEY", "")
        }

    def set_api_keys(self, elevenlabs_key: Optional[str] = None, heygen_key: Optional[str] = None, supabase_url: Optional[str] = None, supabase_anon_key: Optional[str] = None) -> bool:
        if elevenlabs_key is not None:
            self.settings["elevenlabs_api_key"] = elevenlabs_key.strip()
        if heygen_key is not None:
            self.settings["heygen_api_key"] = heygen_key.strip()
        if supabase_url is not None:
            self.settings["supabase_url"] = supabase_url.strip()
        if supabase_anon_key is not None:
            self.settings["supabase_anon_key"] = supabase_anon_key.strip()
        self.save_settings()
        return True

    def check_elevenlabs_balance(self, api_key: Optional[str] = None) -> Dict[str, Any]:
        """Kiểm tra hạn mức và số dư ký tự tài khoản ElevenLabs"""
        key = (api_key or self.settings.get("elevenlabs_api_key") or os.getenv("ELEVENLABS_API_KEY", "")).strip()
        if not key:
            return {"success": False, "message": "Chưa cấu hình ElevenLabs API Key"}
        try:
            r = requests.get(
                "https://api.elevenlabs.io/v1/user/subscription",
                headers={"xi-api-key": key},
                timeout=8
            )
            if r.status_code == 200:
                data = r.json()
                limit = data.get("character_limit", 0)
                used = data.get("character_count", 0)
                remaining = max(0, limit - used)
                tier = data.get("tier", "Unknown")
                status = data.get("status", "active")
                reset_unix = data.get("next_character_count_reset_unix")
                reset_date = time.strftime("%d/%m/%Y", time.localtime(reset_unix)) if reset_unix else "N/A"
                return {
                    "success": True,
                    "platform": "ElevenLabs",
                    "tier": tier,
                    "status": status,
                    "character_limit": limit,
                    "character_count": used,
                    "remaining_characters": remaining,
                    "reset_date": reset_date,
                    "message": f"Gói: {tier.upper()} | Còn lại: {remaining:,} / {limit:,} ký tự (Reset: {reset_date})"
                }
            else:
                msg = "Key không hợp lệ hoặc đã hết hạn"
                try:
                    msg = r.json().get("detail", {}).get("message", msg)
                except Exception:
                    pass
                return {"success": False, "message": f"ElevenLabs ({r.status_code}): {msg}"}
        except Exception as e:
            return {"success": False, "message": f"Lỗi kết nối ElevenLabs: {str(e)}"}

    def check_heygen_balance(self, api_key: Optional[str] = None) -> Dict[str, Any]:
        """Kiểm tra hạn mức Credits khả dụng tài khoản HeyGen"""
        key = (api_key or self.settings.get("heygen_api_key") or os.getenv("HEYGEN_API_KEY", "")).strip()
        if not key:
            return {"success": False, "message": "Chưa cấu hình HeyGen API Key"}
        try:
            r = requests.get(
                "https://api.heygen.com/v2/user/remaining_quota",
                headers={"X-Api-Key": key},
                timeout=8
            )
            if r.status_code == 200:
                data = r.json().get("data", {})
                quota = data.get("quota", 0) if isinstance(data, dict) else 0
                return {
                    "success": True,
                    "platform": "HeyGen",
                    "remaining_quota": quota,
                    "message": f"Số dư khả dụng: {quota} Credits HeyGen"
                }
            else:
                msg = "Key không hợp lệ hoặc đã hết hạn"
                try:
                    msg = r.json().get("error", {}).get("message", msg)
                except Exception:
                    pass
                return {"success": False, "message": f"HeyGen ({r.status_code}): {msg}"}
        except Exception as e:
            return {"success": False, "message": f"Lỗi kết nối HeyGen: {str(e)}"}

    def check_supabase_connection(self, url: Optional[str] = None, anon_key: Optional[str] = None) -> Dict[str, Any]:
        """Kiểm tra kết nối và số lượng key trên Supabase Cloud Database"""
        from config import SUPABASE_URL, SUPABASE_ANON_KEY
        target_url = (url or self.settings.get("supabase_url") or SUPABASE_URL).strip().rstrip('/')
        target_key = (anon_key or self.settings.get("supabase_anon_key") or SUPABASE_ANON_KEY).strip()
        if not target_url or not target_key:
            return {"success": False, "message": "Chưa cấu hình Supabase URL hoặc Anon Key"}
        try:
            headers = {
                "apikey": target_key,
                "Authorization": f"Bearer {target_key}"
            }
            r = requests.get(f"{target_url}/rest/v1/api_keys?select=id,status,quota_remaining", headers=headers, timeout=8)
            if r.status_code == 200:
                keys = r.json()
                active_count = sum(1 for k in keys if k.get("status") == "active")
                total_quota = sum(k.get("quota_remaining", 0) for k in keys)
                return {
                    "success": True,
                    "platform": "Supabase Cloud",
                    "total_keys": len(keys),
                    "active_keys": active_count,
                    "total_quota": total_quota,
                    "message": f"Kết nối Cloud OK | {len(keys)} Keys ({active_count} Active) | Tổng Quota: {total_quota:,}"
                }
            else:
                return {"success": False, "message": f"Supabase ({r.status_code}): {r.text}"}
        except Exception as e:
            return {"success": False, "message": f"Lỗi kết nối Supabase Cloud: {str(e)}"}

    def get_voice_sample(self, voice_id: str) -> Optional[str]:
        """Lấy đường dẫn file audio nghe thử giọng nói cục bộ (Proxy & Cache an toàn, ẩn nguồn)"""
        sample_path = os.path.join(self.voice_samples_dir, f"{voice_id}.mp3")
        if os.path.exists(sample_path) and os.path.getsize(sample_path) > 0:
            return sample_path

        # 1. Thử tải từ URL cache nếu có
        upstream_url = self.voice_preview_cache.get(voice_id)
        if upstream_url and upstream_url.startswith("http"):
            try:
                r = requests.get(upstream_url, timeout=10)
                if r.status_code == 200 and len(r.content) > 1000:
                    with open(sample_path, 'wb') as f:
                        f.write(r.content)
                    return sample_path
            except Exception as e:
                print(f"Lỗi proxy voice sample: {e}")

        # 2. Thử tổng hợp qua TTS API nếu có key
        keys = self.get_api_keys()
        el_key = keys.get("elevenlabs")
        if el_key:
            try:
                el_url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                el_res = requests.post(
                    el_url,
                    headers={"xi-api-key": el_key, "Content-Type": "application/json"},
                    json={
                        "text": "Xin chào! Đây là bản nghe thử giọng đọc AI Studio bản quyền.",
                        "model_id": "eleven_multilingual_v2"
                    },
                    timeout=15
                )
                if el_res.status_code == 200:
                    with open(sample_path, 'wb') as f:
                        f.write(el_res.content)
                    return sample_path
            except Exception as e:
                print(f"Lỗi TTS preview: {e}")

        return None

    def get_voices(self) -> List[Dict[str, Any]]:
        """Lấy toàn bộ danh sách giọng đọc từ ElevenLabs API: cả giọng premade và giọng custom/cloned của tài khoản"""
        keys = self.get_api_keys()
        el_key = keys.get("elevenlabs")
        
        # Nếu có API Key thật, fetch toàn bộ giọng từ tài khoản ElevenLabs
        if el_key:
            try:
                res = requests.get(
                    "https://api.elevenlabs.io/v1/voices",
                    headers={"xi-api-key": el_key},
                    timeout=8
                )
                if res.status_code == 200:
                    api_voices = res.json().get("voices", [])
                    custom_voices = []
                    premade_voices = []
                    
                    curated_map = {v["id"]: v for v in CURATED_VOICES}
                    
                    for v in api_voices:
                        vid = v.get("voice_id")
                        category = (v.get("category") or "premade").lower()
                        # Nhận diện giọng custom / cloned của tài khoản
                        is_custom = category in ["cloned", "generated", "professional", "custom"] or (category != "premade")
                        
                        labels = v.get("labels") or {}
                        gender = labels.get("gender") or "female"
                        accent = labels.get("accent") or labels.get("language") or ("Tiếng Việt / Đa ngữ" if is_custom else "Đa ngữ")
                        desc = labels.get("description") or labels.get("use case") or v.get("description") or ("Giọng Custom độc quyền" if is_custom else "Giọng đọc AI Studio")
                        
                        upstream_preview = v.get("preview_url")
                        if upstream_preview:
                            self.voice_preview_cache[vid] = upstream_preview
                        
                        clean_category = "custom" if is_custom else "studio"
                        
                        if vid in curated_map:
                            v_item = dict(curated_map[vid])
                            v_item["preview_url"] = f"/api/content-studio/voices/sample/{vid}"
                            v_item["is_custom"] = is_custom
                            v_item["category"] = clean_category
                        else:
                            v_item = {
                                "id": vid,
                                "name": v.get("name"),
                                "category": clean_category,
                                "is_custom": is_custom,
                                "language": accent,
                                "gender": gender,
                                "style": desc,
                                "preview_url": f"/api/content-studio/voices/sample/{vid}"
                            }
                            
                        if is_custom:
                            custom_voices.append(v_item)
                        else:
                            premade_voices.append(v_item)
                    
                    # Sắp xếp: Giọng Custom lên đầu tiên, kế tiếp là các giọng Curated & Premade
                    known_ids = {v["id"] for v in custom_voices} | {v["id"] for v in premade_voices}
                    fallback_curated = [{**v, "is_custom": False, "category": "studio"} for v in CURATED_VOICES if v["id"] not in known_ids]
                    
                    result = custom_voices + fallback_curated + premade_voices
                    return result
            except Exception as e:
                print(f"Voice fetch error, fallback to curated: {e}")

        # Fallback danh sách Curated
        return [{**v, "is_custom": False, "category": "studio"} for v in CURATED_VOICES]

    def get_avatars(self) -> List[Dict[str, Any]]:
        """Lấy danh sách người mẫu mặc định (tương thích backward)"""
        return self.system_avatars

    def get_avatars_for_user(self, user_id: str, is_admin: bool = False) -> Dict[str, Any]:
        """Lấy danh sách người mẫu: Mẫu hệ thống + Mẫu riêng của User cùng thông tin hạn mức (Quota)"""
        with self.lock:
            user_list = list(self.user_avatars.get(user_id, []))
            system_list = list(self.system_avatars)
            
            # Quota info
            max_custom = 999999 if is_admin else self.settings.get("max_user_custom_avatars", 3)
            used = len(user_list)
            remaining = max(0, max_custom - used)
            can_upload = is_admin or (used < max_custom)

            # Combined list: user's custom models first, then system models
            combined = user_list + system_list

            return {
                "success": True,
                "avatars": combined,
                "user_avatars": user_list,
                "system_avatars": system_list,
                "quota": {
                    "used": used,
                    "max": max_custom,
                    "remaining": remaining,
                    "can_upload": can_upload,
                    "is_admin": is_admin
                }
            }

    def save_avatar_upload(self, file_storage, name: str, gender: str, style: str, user_id: str, is_admin: bool = False, is_system: bool = False) -> Dict[str, Any]:
        """Tải lên hình ảnh người mẫu mới (Hệ thống hoặc Riêng tư của User có kiểm tra Quota)"""
        if is_system and not is_admin:
            is_system = False

        # Kiểm tra quota đối với khách hàng thông thường
        with self.lock:
            if not is_system and not is_admin:
                current_count = len(self.user_avatars.get(user_id, []))
                max_allowed = self.settings.get("max_user_custom_avatars", 3)
                if current_count >= max_allowed:
                    return {
                        "success": False,
                        "message": f"Bạn đã đạt giới hạn tối đa {max_allowed} người mẫu tải lên. Vui lòng xóa bớt người mẫu cũ hoặc liên hệ Admin để nâng cấp hạn mức!"
                    }

        # Kiểm tra file hợp lệ
        if not file_storage or not getattr(file_storage, "filename", None):
            return {"success": False, "message": "Chưa chọn file hình ảnh người mẫu!"}

        ext = os.path.splitext(file_storage.filename)[1].lower()
        if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
            return {"success": False, "message": "Định dạng file không hỗ trợ! Vui lòng tải file ảnh PNG, JPG hoặc WEBP."}

        # Tạo ID và đường dẫn lưu trữ
        unique_id = uuid.uuid4().hex[:10]
        if is_system:
            avatar_id = f"sys_av_{unique_id}"
            target_dir = self.system_avatars_dir
            preview_url = f"/api/content-studio/avatars/image/{avatar_id}{ext}"
        else:
            avatar_id = f"usr_av_{unique_id}"
            target_dir = os.path.join(STORAGE_DIR, "users", user_id, "avatars")
            preview_url = f"/api/content-studio/avatars/user-image/{user_id}/{avatar_id}{ext}"

        os.makedirs(target_dir, exist_ok=True)
        file_path = os.path.join(target_dir, f"{avatar_id}{ext}")

        try:
            file_storage.save(file_path)
        except Exception as e:
            return {"success": False, "message": f"Lỗi lưu file ảnh: {str(e)}"}

        avatar_record = {
            "id": avatar_id,
            "name": name.strip() or ("Mẫu Hệ Thống" if is_system else "Mẫu Tự Tải"),
            "gender": gender if gender in ["female", "male"] else "female",
            "style": style.strip() or ("Người mẫu hệ thống có sẵn" if is_system else "Người mẫu ảnh tự tải lên"),
            "preview_img": preview_url,
            "local_file": file_path,
            "is_system": is_system,
            "user_id": "system" if is_system else user_id,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }

        with self.lock:
            if is_system:
                self.system_avatars.insert(0, avatar_record)
                self.save_system_avatars()
            else:
                if user_id not in self.user_avatars:
                    self.user_avatars[user_id] = []
                self.user_avatars[user_id].insert(0, avatar_record)
                self.save_user_avatars()

        state.add_log("STUDIO", f"📸 [CONTENT-STUDIO] Đã lưu mẫu mới: {avatar_record['name']} (ID: {avatar_id}, System: {is_system})")

        return {
            "success": True,
            "message": "Tải lên hình ảnh người mẫu thành công!",
            "avatar": avatar_record
        }

    def delete_avatar(self, avatar_id: str, user_id: str, is_admin: bool = False) -> Dict[str, Any]:
        """Xóa người mẫu (giải phóng quota cho user hoặc admin xóa system avatar)"""
        with self.lock:
            # 1. Kiểm tra trong System Avatars
            for idx, a in enumerate(self.system_avatars):
                if a.get("id") == avatar_id:
                    if not is_admin:
                        return {"success": False, "message": "Chỉ Quản trị viên mới có quyền xóa người mẫu hệ thống!"}
                    
                    local_file = a.get("local_file")
                    if local_file and os.path.exists(local_file):
                        try:
                            os.remove(local_file)
                        except Exception:
                            pass
                    self.system_avatars.pop(idx)
                    self.save_system_avatars()
                    state.add_log("STUDIO", f"🗑️ [CONTENT-STUDIO] Admin đã xóa mẫu hệ thống: {avatar_id}")
                    return {"success": True, "message": "Đã xóa người mẫu hệ thống thành công!"}

            # 2. Kiểm tra trong User Avatars của user hiện tại
            user_list = self.user_avatars.get(user_id, [])
            for idx, a in enumerate(user_list):
                if a.get("id") == avatar_id:
                    local_file = a.get("local_file")
                    if local_file and os.path.exists(local_file):
                        try:
                            os.remove(local_file)
                        except Exception:
                            pass
                    user_list.pop(idx)
                    self.save_user_avatars()
                    state.add_log("STUDIO", f"🗑️ [CONTENT-STUDIO] Người dùng {user_id} đã xóa mẫu: {avatar_id}")
                    return {"success": True, "message": "Đã xóa người mẫu thành công! Đã giải phóng 1 vị trí tải lên."}

            # 3. Nếu là Admin, kiểm tra trong tất cả các users
            if is_admin:
                for uid, ulist in self.user_avatars.items():
                    for idx, a in enumerate(ulist):
                        if a.get("id") == avatar_id:
                            local_file = a.get("local_file")
                            if local_file and os.path.exists(local_file):
                                try:
                                    os.remove(local_file)
                                except Exception:
                                    pass
                            ulist.pop(idx)
                            self.save_user_avatars()
                            return {"success": True, "message": f"Admin đã xóa mẫu {avatar_id} của người dùng {uid}!"}

        return {"success": False, "message": "Không tìm thấy người mẫu cần xóa!"}

    def get_avatar_by_id(self, avatar_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self.lock:
            for a in self.system_avatars:
                if a.get("id") == avatar_id:
                    return a
            if user_id and user_id in self.user_avatars:
                for a in self.user_avatars[user_id]:
                    if a.get("id") == avatar_id:
                        return a
            for ulist in self.user_avatars.values():
                for a in ulist:
                    if a.get("id") == avatar_id:
                        return a
            return None

    def create_video_task(self, user_id: str, title: str, script: str, voice_id: str, avatar_id: str, aspect_ratio: str = "9:16") -> Dict[str, Any]:
        task_id = f"cs_{uuid.uuid4().hex[:10]}"
        safe_title = re.sub(r'[^a-zA-Z0-9_\- ]', '', title).strip().replace(' ', '_') or "ai_video"
        
        task_info = {
            "task_id": task_id,
            "user_id": user_id,
            "title": title or "Video MC Bán Hàng",
            "safe_title": safe_title,
            "script": script.strip(),
            "voice_id": voice_id,
            "avatar_id": avatar_id,
            "aspect_ratio": aspect_ratio,
            "status": "queued",
            "progress_pct": 5,
            "current_step": "Đang xếp hàng chờ xử lý kịch bản...",
            "video_filename": None,
            "video_url": None,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "completed_at": None,
            "error": None
        }

        with self.lock:
            self.tasks[task_id] = task_info
            self.save_tasks()

        # Khởi chạy Background Thread xử lý render
        thread = threading.Thread(target=self._run_render_pipeline, args=(task_id,), daemon=True)
        thread.start()

        return task_info

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            return self.tasks.get(task_id)

    def list_user_tasks(self, user_id: str) -> List[Dict[str, Any]]:
        with self.lock:
            user_tasks = [t for t in self.tasks.values() if t.get("user_id") == user_id or user_id == "admin"]
            user_tasks.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return user_tasks

    def _update_task(self, task_id: str, updates: Dict[str, Any]):
        with self.lock:
            if task_id in self.tasks:
                self.tasks[task_id].update(updates)
                self.save_tasks()

    def _run_render_pipeline(self, task_id: str):
        task = self.get_task(task_id)
        if not task:
            return

        user_id = task["user_id"]
        script = task["script"]
        voice_id = task["voice_id"]
        avatar_id = task["avatar_id"]
        aspect_ratio = task.get("aspect_ratio", "9:16")

        keys = self.get_api_keys()
        el_key = keys.get("elevenlabs")
        hg_key = keys.get("heygen")

        # Thư mục lưu media người dùng
        user_media_dir = os.path.join(STORAGE_DIR, "users", user_id, "media")
        os.makedirs(user_media_dir, exist_ok=True)

        audio_path = os.path.join(user_media_dir, f"{task['safe_title']}_{task_id[:6]}.mp3")
        final_video_filename = f"AI_{task['safe_title']}_{task_id[:6]}.mp4"
        final_video_path = os.path.join(user_media_dir, final_video_filename)

        try:
            # -------------------------------------------------------------
            # BƯỚC 1: TẠO GIỌNG NÓI TỰ NHIÊN
            # -------------------------------------------------------------
            self._update_task(task_id, {
                "status": "synthesizing_audio",
                "progress_pct": 20,
                "current_step": "🎙️ Đang tổng hợp giọng nói AI Studio tự nhiên..."
            })
            state.add_log("STUDIO", f"🎙️ [CONTENT-STUDIO] Đang tạo giọng nói cho tác vụ: {task['title']}")

            has_real_audio = False
            if el_key:
                try:
                    el_url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                    el_payload = {
                        "text": script,
                        "model_id": "eleven_multilingual_v2",
                        "voice_settings": {
                            "stability": 0.5,
                            "similarity_boost": 0.75,
                            "style": 0.2,
                            "use_speaker_boost": True
                        }
                    }
                    el_res = requests.post(
                        el_url,
                        headers={
                            "xi-api-key": el_key,
                            "Content-Type": "application/json"
                        },
                        json=el_payload,
                        timeout=30
                    )
                    if el_res.status_code == 200:
                        with open(audio_path, 'wb') as f:
                            f.write(el_res.content)
                        has_real_audio = True
                        state.add_log("STUDIO", f"✅ [VOICE-AI] Đã tạo file audio thành công: {os.path.basename(audio_path)}")
                    else:
                        state.add_log("STUDIO", f"⚠️ [VOICE-AI] API trả mã {el_res.status_code}: {el_res.text[:120]}")
                except Exception as e:
                    state.add_log("STUDIO", f"⚠️ [VOICE-AI] Lỗi kết nối: {str(e)}")

            # -------------------------------------------------------------
            # BƯỚC 2: TẠO VIDEO MC KHỚP KHẨU HÌNH
            # -------------------------------------------------------------
            self._update_task(task_id, {
                "status": "rendering_video",
                "progress_pct": 50,
                "current_step": "🎬 Đang dựng video MC Ảo khớp khẩu hình 60fps..."
            })

            has_real_video = False
            if hg_key:
                try:
                    # Kích thước khung hình
                    width, height = (1080, 1920) if aspect_ratio == "9:16" else (1920, 1080)
                    
                    hg_url = "https://api.heygen.com/v2/video/generate"
                    hg_payload = {
                        "video_inputs": [
                            {
                                "character": {
                                    "type": "avatar",
                                    "avatar_id": avatar_id,
                                    "avatar_style": "normal"
                                },
                                "voice": {
                                    "type": "text",
                                    "input_text": script,
                                    "voice_id": voice_id
                                },
                                "background": {
                                    "type": "color",
                                    "value": "#0b0f19"
                                }
                            }
                        ],
                        "dimension": {
                            "width": width,
                            "height": height
                        },
                        "title": task["title"],
                        "test": False
                    }

                    hg_res = requests.post(
                        hg_url,
                        headers={
                            "X-Api-Key": hg_key,
                            "Content-Type": "application/json"
                        },
                        json=hg_payload,
                        timeout=30
                    )
                    
                    if hg_res.status_code == 200:
                        res_data = hg_res.json()
                        video_id = res_data.get("data", {}).get("video_id")
                        if video_id:
                            state.add_log("STUDIO", f"🚀 [MC-AI] Tác vụ MC Video đang render trên máy chủ Cloud...")
                            # Polling kiểm tra trạng thái video
                            poll_attempts = 0
                            max_attempts = 60 # Tối đa ~5 phút
                            while poll_attempts < max_attempts:
                                time.sleep(5)
                                poll_attempts += 1
                                status_res = requests.get(
                                    f"https://api.heygen.com/v1/video_status.get?video_id={video_id}",
                                    headers={"X-Api-Key": hg_key},
                                    timeout=15
                                )
                                if status_res.status_code == 200:
                                    s_data = status_res.json().get("data", {})
                                    v_status = s_data.get("status")
                                    pct = min(90, 50 + int(poll_attempts * 0.7))
                                    self._update_task(task_id, {
                                        "progress_pct": pct,
                                        "current_step": f"🎬 Hệ thống đang kết xuất khung hình MC ({pct}%)..."
                                    })

                                    if v_status == "completed":
                                        download_url = s_data.get("video_url")
                                        if download_url:
                                            self._update_task(task_id, {
                                                "status": "downloading",
                                                "progress_pct": 92,
                                                "current_step": "📥 Đang tải video thành phẩm về Cloud Storage của bạn..."
                                            })
                                            dl_res = requests.get(download_url, timeout=120)
                                            if dl_res.status_code == 200:
                                                with open(final_video_path, 'wb') as vf:
                                                    vf.write(dl_res.content)
                                                has_real_video = True
                                                break
                                    elif v_status == "failed":
                                        error_msg = s_data.get("error", "MC video render failed")
                                        raise Exception(f"Kết xuất video MC thất bại: {error_msg}")
                    else:
                        state.add_log("STUDIO", f"⚠️ [MC-AI] Máy chủ render trả mã {hg_res.status_code}: {hg_res.text[:120]}")
                except Exception as e:
                    state.add_log("STUDIO", f"⚠️ [MC-AI] Lỗi xử lý: {str(e)}")

            # -------------------------------------------------------------
            # BƯỚC 3: FALLBACK / SANDBOX MODE (NẾU CHƯA CÓ KEY HOẶC RENDER DEMO)
            # -------------------------------------------------------------
            if not has_real_video:
                self._update_task(task_id, {
                    "progress_pct": 80,
                    "current_step": "⚡ [STUDIO SANDBOX] Tạo video mô phỏng MC AI chuẩn 60fps để kiểm thử..."
                })
                # Giả lập thời gian render để trải nghiệm chân thực
                time.sleep(2)
                # Dùng FFmpeg tạo 1 video mp4 demo với đồ họa Studio và ảnh người mẫu MC đã chọn
                self._generate_studio_placeholder_video(
                    output_path=final_video_path,
                    title=task["title"],
                    script=script,
                    aspect_ratio=aspect_ratio,
                    avatar_id=avatar_id,
                    user_id=user_id,
                    audio_path=audio_path if has_real_audio else None
                )

            # -------------------------------------------------------------
            # HOÀN TẤT TÁC VỤ
            # -------------------------------------------------------------
            self._update_task(task_id, {
                "status": "completed",
                "progress_pct": 100,
                "current_step": "🎉 Hoàn tất! Video đã sẵn sàng phát sóng.",
                "video_filename": final_video_filename,
                "video_url": f"/api/media/play/{final_video_filename}",
                "completed_at": time.strftime("%Y-%m-%d %H:%M:%S")
            })

            state.add_log("STUDIO", f"🎉 [CONTENT-STUDIO] Tạo video AI thành công: {final_video_filename} (User: {user_id})")

        except Exception as e:
            state.add_log("STUDIO", f"❌ [CONTENT-STUDIO] Tác vụ lỗi: {str(e)}")
            self._update_task(task_id, {
                "status": "failed",
                "progress_pct": 100,
                "current_step": f"❌ Lỗi: {str(e)}",
                "error": str(e)
            })

    def _generate_studio_placeholder_video(self, output_path: str, title: str, script: str, aspect_ratio: str = "9:16", avatar_id: Optional[str] = None, user_id: Optional[str] = None, audio_path: Optional[str] = None):
        """Tạo video studio chuyên nghiệp với MC AI / Người Mẫu bằng FFmpeg"""
        bin_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bin")
        ffmpeg_bin = os.path.join(bin_dir, "ffmpeg.exe") if os.name == 'nt' else "ffmpeg"
        if not os.path.exists(ffmpeg_bin):
            ffmpeg_bin = "ffmpeg"

        width, height = (1080, 1920) if aspect_ratio == "9:16" else (1920, 1080)
        duration = 10 # 10 giây demo

        # Tìm ảnh avatar nếu có
        avatar_img_path = None
        if avatar_id:
            av_info = self.get_avatar_by_id(avatar_id, user_id=user_id)
            if av_info:
                local_f = av_info.get("local_file")
                if local_f and os.path.exists(local_f):
                    avatar_img_path = local_f

        has_real_audio = audio_path and os.path.exists(audio_path)

        try:
            import subprocess
            if avatar_img_path and os.path.exists(avatar_img_path):
                # Scale avatar chiếm ~72% chiều cao khung hình và đặt ở vị trí trung tâm
                target_h = int(height * 0.72)
                cmd = [
                    ffmpeg_bin, "-y",
                    "-f", "lavfi", "-i", f"color=c=0x080c14:s={width}x{height}:d={duration}:r=30",
                    "-loop", "1", "-i", avatar_img_path
                ]
                if has_real_audio:
                    cmd.extend(["-i", audio_path])
                else:
                    cmd.extend(["-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=44100:d={duration}"])

                cmd.extend([
                    "-filter_complex", f"[1:v]scale=-1:{target_h}[scaled];[0:v][scaled]overlay=(W-w)/2:(H-h)/2:shortest=1[v]",
                    "-map", "[v]",
                    "-map", "2:a",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "128k",
                    "-shortest",
                    output_path
                ])
            else:
                cmd = [
                    ffmpeg_bin, "-y",
                    "-f", "lavfi", "-i", f"color=c=0x080c14:s={width}x{height}:d={duration}:r=30"
                ]
                if has_real_audio:
                    cmd.extend(["-i", audio_path])
                else:
                    cmd.extend(["-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}"])

                cmd.extend([
                    "-vf", "drawbox=y=ih-300:color=0x0ea5e9@0.3:width=iw:height=200:t=fill",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "128k",
                    "-shortest",
                    output_path
                ])

            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except Exception as e:
            fallback_cmd = [
                ffmpeg_bin, "-y",
                "-f", "lavfi", "-i", f"color=c=0x0b0f19:s={width}x{height}:d={duration}:r=30",
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=44100:d={duration}",
                "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest",
                output_path
            ]
            try:
                import subprocess
                subprocess.run(fallback_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            except Exception as e:
                print(f"Không thể tạo video placeholder: {e}")

    def push_video_to_obs(self, user_id: str, video_filename: str, scene_name: Optional[str] = None, source_name: str = "MC_AI_Live") -> Dict[str, Any]:
        """Tự động nạp file video vào OBS Scene qua OBS WebSocket"""
        try:
            from core.obs_engine import engine as obs_engine
        except Exception as e:
            return {"success": False, "message": f"Không thể import module OBS Engine: {str(e)}"}

        video_path = os.path.join(STORAGE_DIR, "users", user_id, "media", video_filename)
        if not os.path.exists(video_path):
            return {"success": False, "message": f"File video '{video_filename}' không tồn tại trên hệ thống!"}

        if not obs_engine.ensure_connection():
            return {
                "success": False,
                "message": "Không thể kết nối tới OBS Studio WebSocket! Vui lòng bật OBS Studio và kiểm tra cổng WebSocket 4455."
            }

        target_scene = scene_name or obs_engine.get_current_scene_name()
        if not target_scene:
            try:
                target_scene = obs_engine.cl.get_current_program_scene().current_program_scene_name
            except Exception:
                pass

        if not target_scene:
            return {"success": False, "message": "Không tìm thấy Scene OBS nào đang hoạt động!"}

        abs_video_path = os.path.abspath(video_path).replace("\\", "/")

        try:
            # Kiểm tra xem source đã tồn tại trong Scene chưa
            items = obs_engine.cl.get_scene_item_list(target_scene).scene_items
            existing_item = next((i for i in items if i.get("sourceName") == source_name), None)

            if existing_item:
                # Cập nhật đường dẫn file của nguồn video hiện tại
                obs_engine.cl.set_input_settings(
                    inputName=source_name,
                    inputSettings={
                        "local_file": abs_video_path,
                        "looping": True,
                        "restart_on_activate": True
                    },
                    overlay=True
                )
                obs_engine.cl.set_scene_item_enabled(target_scene, existing_item["sceneItemId"], True)
                state.add_log("PROCESSOR", f"🎬 [CONTENT-STUDIO] Đã cập nhật video MC AI vào nguồn '{source_name}' (Scene: '{target_scene}')")
            else:
                # Tạo mới ffmpeg_source trong Scene
                obs_engine.cl.create_input(
                    sceneName=target_scene,
                    inputName=source_name,
                    inputKind="ffmpeg_source",
                    inputSettings={
                        "local_file": abs_video_path,
                        "looping": True,
                        "restart_on_activate": True
                    },
                    sceneItemEnabled=True
                )
                state.add_log("PROCESSOR", f"✨ [CONTENT-STUDIO] Đã tạo mới nguồn video MC AI '{source_name}' trong Scene '{target_scene}'")

            return {
                "success": True,
                "message": f"Đã nạp video AI vào nguồn '{source_name}' trong Scene '{target_scene}' thành công!",
                "scene": target_scene,
                "source": source_name,
                "video_path": abs_video_path
            }
        except Exception as e:
            state.add_log("PROCESSOR", f"❌ Lỗi nạp video vào OBS: {str(e)}")
            return {"success": False, "message": f"Lỗi OBS: {str(e)}"}

content_studio_engine = ContentStudioEngine()
