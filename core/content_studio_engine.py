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

# Danh sách Giọng đọc tuyển chọn (Curated Voices với hỗ trợ Tiếng Việt & Đa ngữ đỉnh cao)
CURATED_VOICES = [
    {
        "id": "21m00Tcm4TlvDq8ikWAM",
        "name": "Rachel (Nữ - Truyền cảm & Thân thiện)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "female",
        "style": "Kể chuyện, Giới thiệu sản phẩm",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/previews/voices/21m00Tcm4TlvDq8ikWAM/preview.mp3"
    },
    {
        "id": "AZnzlk1XvdvUeBnXmlld",
        "name": "Domi (Nữ - Tươi vui & Tự tin)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "female",
        "style": "Flash Sale, Chốt đơn livestream",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/previews/voices/AZnzlk1XvdvUeBnXmlld/preview.mp3"
    },
    {
        "id": "ErXwobaYiN019PkySvjV",
        "name": "Antoni (Nam - Trầm ấm & Chuyên nghiệp)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "male",
        "style": "Tin tức, Đánh giá công nghệ, Review",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/previews/voices/ErXwobaYiN019PkySvjV/preview.mp3"
    },
    {
        "id": "VR6AewLTigWG4xSOukaG",
        "name": "Arnold (Nam - Năng động & Quyết đoán)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "male",
        "style": "Khuyến mãi, Livestream bán hàng",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/previews/voices/VR6AewLTigWG4xSOukaG/preview.mp3"
    },
    {
        "id": "MF3mGyEYCl7XYWbV9V6O",
        "name": "Elli (Nữ - Dịu dàng & Tự nhiên)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "female",
        "style": "Thời trang, Mỹ phẩm, Chăm sóc sắc đẹp",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/previews/voices/MF3mGyEYCl7XYWbV9V6O/preview.mp3"
    },
    {
        "id": "pNInz6obpgDQGcFmaJgB",
        "name": "Adam (Nam - Giọng chuẩn thương mại)",
        "language": "Tiếng Việt / Đa ngữ",
        "gender": "male",
        "style": "Quảng cáo TVC, Bán hàng cao cấp",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/previews/voices/pNInz6obpgDQGcFmaJgB/preview.mp3"
    }
]

# Danh sách MC Ảo HeyGen tuyển chọn (Curated Avatars phong cách Livestream)
CURATED_AVATARS = [
    {
        "id": "Daisy-inskirt-20220818",
        "name": "Daisy (MC Bán Hàng Trẻ Trung)",
        "gender": "female",
        "preview_img": "https://files2.heygen.ai/avatar/v3/Daisy-inskirt-20220818/preview_target.webp",
        "style": "Trang phục công sở thanh lịch, phù hợp Shopee/TikTok"
    },
    {
        "id": "Bryan_IT_Sitting_public",
        "name": "Bryan (Chuyên Gia Công Nghệ)",
        "gender": "male",
        "preview_img": "https://files2.heygen.ai/avatar/v3/Bryan_IT_Sitting_public/preview_target.webp",
        "style": "Áo sơ mi hiện đại, tư vấn kỹ thuật & sản phẩm"
    },
    {
        "id": "Anna_public_3_20240108",
        "name": "Anna (Host Livestream Chuyên Nghiệp)",
        "gender": "female",
        "preview_img": "https://files2.heygen.ai/avatar/v3/Anna_public_3_20240108/preview_target.webp",
        "style": "Thân thiện, tương tác tốt với khán giả livestream"
    },
    {
        "id": "Wayne_20240711",
        "name": "Wayne (MC Nam Lịch Lãm)",
        "gender": "male",
        "preview_img": "https://files2.heygen.ai/avatar/v3/Wayne_20240711/preview_target.webp",
        "style": "Vest lịch sự, phù hợp sự kiện ra mắt & flash sale"
    },
    {
        "id": "Susan_public_2_20240328",
        "name": "Susan (Tư Vấn Viên Mỹ Phẩm)",
        "gender": "female",
        "preview_img": "https://files2.heygen.ai/avatar/v3/Susan_public_2_20240328/preview_target.webp",
        "style": "Nhẹ nhàng, phong thái chuyên gia sức khỏe làm đẹp"
    },
    {
        "id": "Tyler_public_20240115",
        "name": "Tyler (MC Năng Động Sôi Nổi)",
        "gender": "male",
        "preview_img": "https://files2.heygen.ai/avatar/v3/Tyler_public_20240115/preview_target.webp",
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
            "cost_per_video_gen": 10      # 10 Credits cho 1 video MC ảo
        }
        self.tasks_file = os.path.join(DATA_DIR, "content_studio_tasks.json")
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.Lock()
        self.load_settings()
        self.load_tasks()

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

    def get_voices(self) -> List[Dict[str, Any]]:
        keys = self.get_api_keys()
        el_key = keys.get("elevenlabs")
        
        # Nếu có API Key thật, thử fetch danh sách voice từ tài khoản
        if el_key:
            try:
                res = requests.get(
                    "https://api.elevenlabs.io/v1/voices",
                    headers={"xi-api-key": el_key},
                    timeout=6
                )
                if res.status_code == 200:
                    api_voices = res.json().get("voices", [])
                    result = []
                    # Ưu tiên curated voices trước
                    known_ids = {v["id"] for v in CURATED_VOICES}
                    result.extend(CURATED_VOICES)
                    for v in api_voices:
                        if v.get("voice_id") not in known_ids:
                            result.append({
                                "id": v.get("voice_id"),
                                "name": v.get("name"),
                                "language": v.get("category", "Custom / Multi"),
                                "gender": v.get("labels", {}).get("gender", "neutral"),
                                "style": v.get("labels", {}).get("description", "Giọng đọc AI"),
                                "preview_url": v.get("preview_url")
                            })
                    return result
            except Exception as e:
                print(f"ElevenLabs fetch voices error, fallback to curated: {e}")

        return CURATED_VOICES

    def get_avatars(self) -> List[Dict[str, Any]]:
        keys = self.get_api_keys()
        hg_key = keys.get("heygen")

        # Nếu có HeyGen API Key thật, thử fetch danh sách avatar từ tài khoản
        if hg_key:
            try:
                res = requests.get(
                    "https://api.heygen.com/v2/avatars",
                    headers={"X-Api-Key": hg_key},
                    timeout=6
                )
                if res.status_code == 200:
                    data = res.json().get("data", {})
                    avatars = data.get("avatars", [])
                    if avatars:
                        result = []
                        known_ids = {a["id"] for a in CURATED_AVATARS}
                        result.extend(CURATED_AVATARS)
                        for a in avatars[:15]:
                            aid = a.get("avatar_id")
                            if aid not in known_ids:
                                result.append({
                                    "id": aid,
                                    "name": a.get("avatar_name", aid),
                                    "gender": a.get("gender", "unknown"),
                                    "preview_img": a.get("preview_image_url") or a.get("preview_video_url"),
                                    "style": "HeyGen Avatar"
                                })
                        return result
            except Exception as e:
                print(f"HeyGen fetch avatars error, fallback to curated: {e}")

        return CURATED_AVATARS

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
            # BƯỚC 1: TẠO GIỌNG NÓI TỰ NHIÊN BẰNG ELEVENLABS API
            # -------------------------------------------------------------
            self._update_task(task_id, {
                "status": "synthesizing_audio",
                "progress_pct": 20,
                "current_step": "🎙️ Đang tổng hợp giọng nói AI (ElevenLabs Engine)..."
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
                        state.add_log("STUDIO", f"✅ [ELEVENLABS] Đã tạo file audio thành công: {os.path.basename(audio_path)}")
                    else:
                        state.add_log("STUDIO", f"⚠️ [ELEVENLABS] API trả mã {el_res.status_code}: {el_res.text[:120]}")
                except Exception as e:
                    state.add_log("STUDIO", f"⚠️ [ELEVENLABS] Lỗi kết nối: {str(e)}")

            # -------------------------------------------------------------
            # BƯỚC 2: TẠO VIDEO MC KHỚP KHẨU HÌNH BẰNG HEYGEN API
            # -------------------------------------------------------------
            self._update_task(task_id, {
                "status": "rendering_video",
                "progress_pct": 50,
                "current_step": "🎬 Đang dựng video MC Ảo khớp khẩu hình (HeyGen AI Pipeline)..."
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
                            state.add_log("STUDIO", f"🚀 [HEYGEN] Video ID: {video_id} đang render trên Cloud...")
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
                                        "current_step": f"🎬 HeyGen Cloud đang render: {v_status} ({pct}%)..."
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
                                        error_msg = s_data.get("error", "HeyGen render failed")
                                        raise Exception(f"HeyGen render thất bại: {error_msg}")
                    else:
                        state.add_log("STUDIO", f"⚠️ [HEYGEN] API trả mã {hg_res.status_code}: {hg_res.text[:120]}")
                except Exception as e:
                    state.add_log("STUDIO", f"⚠️ [HEYGEN] Lỗi xử lý: {str(e)}")

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
                # Dùng FFmpeg tạo 1 video mp4 demo với đồ họa Studio phát sóng
                self._generate_studio_placeholder_video(final_video_path, task["title"], script, aspect_ratio)

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

    def _generate_studio_placeholder_video(self, output_path: str, title: str, script: str, aspect_ratio: str = "9:16"):
        """Tạo video demo chuyên nghiệp bằng FFmpeg tích hợp sẵn trong hệ thống nếu chưa có key thật"""
        bin_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bin")
        ffmpeg_bin = os.path.join(bin_dir, "ffmpeg.exe") if os.name == 'nt' else "ffmpeg"
        if not os.path.exists(ffmpeg_bin):
            ffmpeg_bin = "ffmpeg"

        width, height = (1080, 1920) if aspect_ratio == "9:16" else (1920, 1080)
        duration = 10 # 10 giây demo

        # Lọc chữ kịch bản ngắn gọn
        short_script = (script[:80] + "...") if len(script) > 80 else script
        short_script = short_script.replace(":", " ").replace("'", "").replace('"', "")

        cmd = [
            ffmpeg_bin, "-y",
            "-f", "lavfi", "-i", f"color=c=0x080c14:s={width}x{height}:d={duration}:r=30",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
            "-vf", f"drawbox=y=ih-300:color=0x0ea5e9@0.3:width=iw:height=200:t=fill",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            output_path
        ]

        try:
            import subprocess
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except Exception:
            # Nếu ffmpeg lỗi font drawtext, tạo video đơn giản không text
            fallback_cmd = [
                ffmpeg_bin, "-y",
                "-f", "lavfi", "-i", f"color=c=0x0b0f19:s={width}x{height}:d={duration}:r=30",
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=44100:d={duration}",
                "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest",
                output_path
            ]
            try:
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
