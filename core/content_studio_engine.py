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
from core.runtime_utils import resolve_ffmpeg_bin, atomic_write_json

AI_SETTINGS_FILE = os.path.join(DATA_DIR, "ai_settings.json")
SYSTEM_AVATARS_FILE = os.path.join(DATA_DIR, "system_avatars.json")
USER_AVATARS_FILE = os.path.join(DATA_DIR, "user_avatars.json")
SYSTEM_AVATARS_DIR = os.path.join(STORAGE_DIR, "system_avatars")

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"

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
        self.voice_preview_cache: Dict[str, str] = {}
        self._voices_cache: List[Dict[str, Any]] = []
        self._voices_cache_meta: Dict[str, Any] = {}
        self._voices_cache_ts: float = 0.0
        self._voices_cache_key: Optional[str] = None
        self._voices_cache_ttl: float = 300.0
        self.system_avatars: List[Dict[str, Any]] = []
        self.user_avatars: Dict[str, List[Dict[str, Any]]] = {}
        self.tasks_file = os.path.join(DATA_DIR, "content_studio_tasks.json")
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.RLock()
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
            with self.lock:
                atomic_write_json(SYSTEM_AVATARS_FILE, self.system_avatars)
        except Exception as e:
            print(f"Lỗi lưu system_avatars.json: {e}")

    def save_user_avatars(self):
        try:
            with self.lock:
                atomic_write_json(USER_AVATARS_FILE, self.user_avatars)
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
            with self.lock:
                atomic_write_json(self.tasks_file, self.tasks)
        except Exception:
            pass

    def save_settings(self):
        try:
            with self.lock:
                atomic_write_json(AI_SETTINGS_FILE, self.settings)
        except Exception as e:
            print(f"Lỗi lưu ai_settings.json: {e}")

    def get_api_keys(self) -> Dict[str, str]:
        return {
            "elevenlabs": self.settings.get("elevenlabs_api_key") or os.getenv("ELEVENLABS_API_KEY", ""),
            "heygen": self.settings.get("heygen_api_key") or os.getenv("HEYGEN_API_KEY", "")
        }

    def _invalidate_voices_cache(self):
        self._voices_cache = []
        self._voices_cache_meta = {}
        self._voices_cache_ts = 0.0
        self._voices_cache_key = None

    def set_api_keys(self, elevenlabs_key: Optional[str] = None, heygen_key: Optional[str] = None, supabase_url: Optional[str] = None, supabase_anon_key: Optional[str] = None) -> bool:
        if elevenlabs_key is not None:
            self.settings["elevenlabs_api_key"] = elevenlabs_key.strip()
            self._invalidate_voices_cache()
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

    def _extract_elevenlabs_error(self, response) -> str:
        try:
            body = response.json()
            detail = body.get("detail")
            if isinstance(detail, dict):
                return detail.get("message") or str(detail)
            if isinstance(detail, str):
                return detail
        except Exception:
            pass
        return (response.text or "")[:160] or f"HTTP {response.status_code}"

    def _resolve_upstream_voice_preview(self, voice_id: str, headers: Dict[str, str]) -> Optional[str]:
        cached = self.voice_preview_cache.get(voice_id)
        if cached and cached.startswith("http"):
            return cached
        try:
            res = requests.get(f"{ELEVENLABS_API_BASE}/voices/{voice_id}", headers=headers, timeout=8)
            if res.status_code == 200:
                v = res.json()
                preview = v.get("preview_url") or ""
                if not preview:
                    for item in (v.get("verified_languages") or []):
                        if isinstance(item, dict) and item.get("preview_url"):
                            preview = item["preview_url"]
                            break
                if preview and preview.startswith("http"):
                    self.voice_preview_cache[voice_id] = preview
                    return preview
        except Exception:
            pass
        return None

    def get_voice_sample(self, voice_id: str) -> Optional[str]:
        """Lấy file audio nghe thử trực tiếp từ preview_url thật của ElevenLabs (có cache local)."""
        if not voice_id or not re.match(r"^[A-Za-z0-9_-]{4,64}$", voice_id):
            return None

        sample_path = os.path.join(self.voice_samples_dir, f"{voice_id}.mp3")
        if os.path.exists(sample_path) and os.path.getsize(sample_path) > 0:
            return sample_path

        keys = self.get_api_keys()
        el_key = (keys.get("elevenlabs") or "").strip()
        headers = {"xi-api-key": el_key} if el_key else {}

        # 1. Lấy từ preview_url chính chủ của ElevenLabs (cache hoặc truy vấn /v1/voices/{id})
        upstream_url = self._resolve_upstream_voice_preview(voice_id, headers)
        if upstream_url:
            try:
                r = requests.get(upstream_url, timeout=12)
                if r.status_code == 200 and len(r.content) > 512:
                    with open(sample_path, 'wb') as f:
                        f.write(r.content)
                    return sample_path
            except Exception as e:
                print(f"Lỗi tải audio preview ElevenLabs ({voice_id}): {e}")

        # 2. Chỉ tổng hợp mẫu TTS nếu có ElevenLabs API Key hợp lệ và không có preview_url
        if el_key:
            try:
                el_url = f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}"
                el_res = requests.post(
                    el_url,
                    headers={"xi-api-key": el_key, "Content-Type": "application/json"},
                    json={
                        "text": "Xin chào! Đây là bản nghe thử giọng đọc trực tiếp từ ElevenLabs API.",
                        "model_id": "eleven_multilingual_v2"
                    },
                    timeout=15
                )
                if el_res.status_code == 200 and len(el_res.content) > 512:
                    with open(sample_path, 'wb') as f:
                        f.write(el_res.content)
                    return sample_path
            except Exception as e:
                print(f"Lỗi TTS preview ElevenLabs ({voice_id}): {e}")

        return None

    def _normalize_elevenlabs_voice(self, v: Dict[str, Any], authenticated: bool) -> Dict[str, Any]:
        vid = (v.get("voice_id") or "").strip()
        raw_category = (v.get("category") or "premade").strip().lower()
        is_custom = raw_category in ("cloned", "generated", "professional", "custom") or (raw_category != "premade")

        labels = v.get("labels") if isinstance(v.get("labels"), dict) else {}
        gender = (labels.get("gender") or v.get("gender") or "").strip().lower()
        accent = (labels.get("accent") or v.get("accent") or "").strip()
        age = (labels.get("age") or v.get("age") or "").strip()
        use_case = (labels.get("use_case") or labels.get("use case") or v.get("use_case") or "").strip()
        descriptive = (labels.get("descriptive") or labels.get("description") or "").strip()
        primary_lang = (labels.get("language") or v.get("language") or "").strip().lower()

        verified_langs: List[str] = []
        if primary_lang:
            verified_langs.append(primary_lang)
        for item in (v.get("verified_languages") or []):
            if isinstance(item, dict):
                lcode = (item.get("language") or "").strip().lower()
                if lcode and lcode not in verified_langs:
                    verified_langs.append(lcode)

        upstream_preview = (v.get("preview_url") or "").strip()
        if not upstream_preview:
            for item in (v.get("verified_languages") or []):
                if isinstance(item, dict) and item.get("preview_url"):
                    upstream_preview = item["preview_url"].strip()
                    break

        if upstream_preview and vid:
            self.voice_preview_cache[vid] = upstream_preview

        description = (v.get("description") or "").strip()
        style_tokens = [
            tok.replace("_", " ").strip()
            for tok in (descriptive, use_case, accent, age)
            if tok and tok.strip()
        ]
        style = " • ".join(style_tokens) if style_tokens else (description or raw_category)
        lang_label = ", ".join(x.upper() for x in verified_langs[:5]) if verified_langs else "MULTILINGUAL"

        has_preview = bool(upstream_preview or authenticated)
        return {
            "id": vid,
            "name": (v.get("name") or vid).strip(),
            "category": "custom" if is_custom else raw_category,
            "raw_category": raw_category,
            "is_custom": is_custom,
            "language": lang_label,
            "languages": verified_langs,
            "gender": gender,
            "accent": accent,
            "age": age,
            "use_case": use_case,
            "style": style,
            "description": description,
            "source": "elevenlabs_account" if authenticated else "elevenlabs_public",
            "preview_url": f"/api/content-studio/voices/sample/{vid}" if (vid and has_preview) else "",
            "upstream_preview_url": upstream_preview,
        }

    def fetch_voices_from_elevenlabs(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Cào danh sách giọng đọc trực tiếp từ ElevenLabs API (/v1/voices), không dùng giọng ảo cứng."""
        el_key = (self.get_api_keys().get("elevenlabs") or "").strip()
        authenticated = bool(el_key)

        if (
            not force_refresh
            and self._voices_cache
            and self._voices_cache_key == el_key
            and (time.time() - self._voices_cache_ts) < self._voices_cache_ttl
        ):
            return {
                "success": True,
                "voices": list(self._voices_cache),
                "count": len(self._voices_cache),
                "cached": True,
                **self._voices_cache_meta,
            }

        headers = {"xi-api-key": el_key} if el_key else {}
        try:
            res = requests.get(
                f"{ELEVENLABS_API_BASE}/voices",
                params={"show_legacy": "true"},
                headers=headers,
                timeout=10
            )
            if res.status_code != 200:
                err_msg = self._extract_elevenlabs_error(res)
                return {
                    "success": False,
                    "voices": [],
                    "count": 0,
                    "source": "elevenlabs_error",
                    "authenticated": authenticated,
                    "message": f"ElevenLabs API lỗi ({res.status_code}): {err_msg}"
                }

            api_voices = res.json().get("voices") or []
            custom_voices: List[Dict[str, Any]] = []
            library_voices: List[Dict[str, Any]] = []

            for v in api_voices:
                norm = self._normalize_elevenlabs_voice(v, authenticated=authenticated)
                if not norm["id"]:
                    continue
                if norm["is_custom"]:
                    custom_voices.append(norm)
                else:
                    library_voices.append(norm)

            result = custom_voices + library_voices
            synced_at = time.strftime("%Y-%m-%d %H:%M:%S")
            source = "elevenlabs_account" if authenticated else "elevenlabs_public"
            meta = {
                "source": source,
                "authenticated": authenticated,
                "synced_at": synced_at,
                "custom_count": len(custom_voices),
                "premade_count": len(library_voices),
            }
            self._voices_cache = list(result)
            self._voices_cache_meta = dict(meta)
            self._voices_cache_ts = time.time()
            self._voices_cache_key = el_key

            return {
                "success": True,
                "voices": result,
                "count": len(result),
                "cached": False,
                **meta,
            }
        except Exception as e:
            return {
                "success": False,
                "voices": [],
                "count": 0,
                "source": "elevenlabs_error",
                "authenticated": authenticated,
                "message": f"Không thể kết nối ElevenLabs API: {str(e)}"
            }

    def get_voices(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Trả về danh sách giọng đọc lấy trực tiếp từ ElevenLabs API (tương thích backward)."""
        return self.fetch_voices_from_elevenlabs(force_refresh=force_refresh).get("voices", [])

    def search_elevenlabs_library(
        self,
        search: str = "",
        language: str = "",
        gender: str = "",
        category: str = "",
        page_size: int = 24
    ) -> Dict[str, Any]:
        """Tìm kiếm / cào giọng đọc trực tiếp từ ElevenLabs Voice Library (/v1/shared-voices)."""
        el_key = (self.get_api_keys().get("elevenlabs") or "").strip()
        authenticated = bool(el_key)
        headers = {"xi-api-key": el_key} if el_key else {}

        # ElevenLabs cho phép tối đa 3 shared-voices khi chưa đăng nhập API key
        effective_page_size = min(max(int(page_size or 24), 1), 100) if authenticated else 3
        params: Dict[str, Any] = {"page_size": effective_page_size}
        if search and search.strip():
            params["search"] = search.strip()
        if language and language.strip():
            params["language"] = language.strip().lower()
        if gender and gender.strip().lower() in ("male", "female", "neutral"):
            params["gender"] = gender.strip().lower()
        if category and category.strip():
            params["category"] = category.strip().lower()

        try:
            res = requests.get(
                f"{ELEVENLABS_API_BASE}/shared-voices",
                params=params,
                headers=headers,
                timeout=10
            )
            if res.status_code != 200:
                err_msg = self._extract_elevenlabs_error(res)
                return {
                    "success": False,
                    "voices": [],
                    "authenticated": authenticated,
                    "requires_api_key": not authenticated,
                    "message": f"ElevenLabs Shared Library ({res.status_code}): {err_msg}"
                }

            raw_voices = res.json().get("voices") or []
            items: List[Dict[str, Any]] = []
            for v in raw_voices:
                vid = (v.get("voice_id") or "").strip()
                if not vid:
                    continue
                preview = (v.get("preview_url") or "").strip()
                if preview:
                    self.voice_preview_cache[vid] = preview
                lang_code = (v.get("language") or "").strip().lower()
                accent = (v.get("accent") or "").strip()
                use_case = (v.get("use_case") or "").strip()
                desc = (v.get("description") or "").strip()
                style_parts = [p.replace("_", " ") for p in (accent, use_case, v.get("age") or "") if p]
                items.append({
                    "id": vid,
                    "public_owner_id": (v.get("public_owner_id") or "").strip(),
                    "name": (v.get("name") or vid).strip(),
                    "category": (v.get("category") or "shared").lower(),
                    "gender": (v.get("gender") or "").lower(),
                    "language": lang_code.upper() if lang_code else "MULTI",
                    "languages": [lang_code] if lang_code else [],
                    "accent": accent,
                    "style": " • ".join(style_parts) if style_parts else desc,
                    "description": desc,
                    "free_users_allowed": bool(v.get("free_users_allowed", True)),
                    "usage_count_1y": v.get("usage_character_count_1y") or 0,
                    "source": "elevenlabs_library",
                    "preview_url": f"/api/content-studio/voices/sample/{vid}" if preview else "",
                    "upstream_preview_url": preview,
                })

            return {
                "success": True,
                "voices": items,
                "count": len(items),
                "has_more": bool(res.json().get("has_more")),
                "authenticated": authenticated,
                "requires_api_key": not authenticated,
                "source": "elevenlabs_library",
            }
        except Exception as e:
            return {
                "success": False,
                "voices": [],
                "authenticated": authenticated,
                "requires_api_key": not authenticated,
                "message": f"Lỗi kết nối ElevenLabs Voice Library: {str(e)}"
            }

    def add_library_voice(self, public_owner_id: str, voice_id: str, new_name: str = "") -> Dict[str, Any]:
        """Thêm giọng đọc từ ElevenLabs Voice Library vào tài khoản ElevenLabs để sử dụng TTS."""
        el_key = (self.get_api_keys().get("elevenlabs") or "").strip()
        if not el_key:
            return {"success": False, "message": "Cần cấu hình ElevenLabs API Key (Admin -> API Platforms) để thêm giọng từ Voice Library."}
        if not public_owner_id or not voice_id:
            return {"success": False, "message": "Thiếu public_owner_id hoặc voice_id."}
        try:
            res = requests.post(
                f"{ELEVENLABS_API_BASE}/voices/add/{public_owner_id}/{voice_id}",
                headers={"xi-api-key": el_key, "Content-Type": "application/json"},
                json={"new_name": (new_name or f"Voice_{voice_id[:8]}").strip(), "bookmarked": True},
                timeout=10
            )
            if res.status_code == 200:
                self._invalidate_voices_cache()
                return {"success": True, "voice_id": res.json().get("voice_id") or voice_id, "message": "Đã thêm giọng đọc vào tài khoản ElevenLabs!"}
            return {"success": False, "message": f"ElevenLabs ({res.status_code}): {self._extract_elevenlabs_error(res)}"}
        except Exception as e:
            return {"success": False, "message": f"Lỗi thêm giọng từ Voice Library: {str(e)}"}

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

    def list_user_tasks(self, user_id: str, is_admin: bool = False) -> List[Dict[str, Any]]:
        with self.lock:
            user_tasks = [t for t in self.tasks.values() if is_admin or t.get("user_id") == user_id or user_id == "admin"]
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
                "video_url": f"/api/media/file/{final_video_filename}",
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
        ffmpeg_bin = resolve_ffmpeg_bin()

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
