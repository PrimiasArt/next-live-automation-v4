import os
import json
import re

try:
    import cv2
except Exception:
    cv2 = None
from config import PROFILES_DIR

def natural_sort_key(s: str):
    """
    Sắp xếp tự nhiên theo chuỗi và số học (ví dụ: base_1, base_2, ..., base_10)
    """
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

def get_file_duration_cv2(file_path: str):
    """
    Đọc thời lượng video chính xác đến phần trăm giây bằng OpenCV trực tiếp từ file
    """
    if not cv2 or not file_path or not os.path.exists(file_path):
        return None
    try:
        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            return None
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        cap.release()
        if fps and fps > 0 and frame_count and frame_count > 0:
            duration = frame_count / fps
            return round(duration, 2)
    except Exception as e:
        print(f"Lỗi đọc thời lượng bằng OpenCV cho {file_path}: {e}")
    return None

class ProfileManager:
    def __init__(self, profiles_dir: str = PROFILES_DIR):
        self.profiles_dir = profiles_dir
        try:
            os.makedirs(self.profiles_dir, exist_ok=True)
        except Exception:
            pass

    def list_profiles(self) -> list:
        profiles = []
        if not os.path.exists(self.profiles_dir):
            return profiles
            
        for fname in os.listdir(self.profiles_dir):
            if fname.endswith(".json"):
                fpath = os.path.join(self.profiles_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        profiles.append({
                            "id": data.get("id", os.path.splitext(fname)[0]),
                            "name": data.get("name", fname),
                            "scene_name": data.get("scene_name", ""),
                            "overlap_time": data.get("overlap_time", 1.0),
                            "video_count": len(data.get("videos", []))
                        })
                except Exception as e:
                    print(f"Lỗi đọc profile {fname}: {e}")
        return profiles

    def get_profile(self, profile_id: str) -> dict:
        if not profile_id:
            return None
        fpath = os.path.join(self.profiles_dir, f"{profile_id}.json")
        if not os.path.exists(fpath):
            fpath_alt = os.path.join(self.profiles_dir, profile_id)
            if os.path.exists(fpath_alt):
                fpath = fpath_alt
            else:
                return None
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Lỗi mở profile {profile_id}: {e}")
            return None

    def get_profile_by_scene(self, scene_name: str) -> dict:
        """
        Tìm profile đã lưu tương ứng với một Scene OBS
        """
        if not scene_name or not os.path.exists(self.profiles_dir):
            return None
        for fname in os.listdir(self.profiles_dir):
            if fname.endswith(".json"):
                fpath = os.path.join(self.profiles_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if data.get("scene_name") == scene_name:
                            return data
                except Exception:
                    pass
        return None

    def create_or_get_profile_for_scene(self, obs_client, scene_name: str) -> dict:
        """
        Lấy profile tương ứng với Scene, nếu chưa có thì tự động quét và tạo ngay
        """
        existing = self.get_profile_by_scene(scene_name)
        if existing:
            return existing

        # Quét tự động từ OBS
        scan_res = self.scan_scene_items(obs_client, scene_name)
        videos = scan_res.get("videos", []) if scan_res.get("success") else []

        pid = re.sub(r'[^a-zA-Z0-9_\-]', '_', scene_name.lower()).strip('_')
        new_profile = {
            "id": pid or "auto_scene",
            "name": f"Scene: {scene_name}",
            "scene_name": scene_name,
            "overlap_time": 1.0,
            "videos": videos
        }
        self.save_profile(new_profile)
        return new_profile

    def save_profile(self, profile_data: dict) -> bool:
        pid = profile_data.get("id")
        if not pid:
            name = profile_data.get("name", "profile")
            pid = re.sub(r'[^a-zA-Z0-9_\-]', '_', name.lower()).strip('_')
            profile_data["id"] = pid

        raw_videos = profile_data.get("videos", [])
        clean_videos = []
        for v in raw_videos:
            v_name = v.get("name", "").strip()
            if v_name.lower().startswith("base_"):
                clean_videos.append(v)
            else:
                clean_videos.append({
                    **v,
                    "name": f"base_{v_name}"
                })

        clean_videos.sort(key=lambda x: natural_sort_key(x.get("name", "")))
        profile_data["videos"] = clean_videos

        fpath = os.path.join(self.profiles_dir, f"{pid}.json")
        try:
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(profile_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"Lỗi lưu profile {pid}: {e}")
            return False

    def delete_profile(self, profile_id: str) -> bool:
        fpath = os.path.join(self.profiles_dir, f"{profile_id}.json")
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
                return True
            except Exception:
                return False
        return False

    def scan_obs_scenes(self, obs_client) -> dict:
        if not obs_client:
            return {"success": False, "message": "Chưa kết nối được tới OBS Studio"}
        
        try:
            scenes_res = obs_client.get_scene_list()
            scene_names = [s['sceneName'] for s in scenes_res.scenes]
            current_scene = scenes_res.current_program_scene_name
            
            return {
                "success": True,
                "scenes": scene_names,
                "current_program_scene": current_scene
            }
        except Exception as e:
            return {"success": False, "message": f"Lỗi quét danh sách Scene: {str(e)}"}

    def scan_scene_items(self, obs_client, scene_name: str) -> dict:
        """
        Quét danh sách Media Sources trong một Scene cụ thể:
        - CHỈ LẤY các source có tên dạng base_xxx (bỏ qua camera, text, logo, audio, v.v.)
        - ĐO THỜI LƯỢNG CHÍNH XÁC bằng OpenCV trực tiếp từ file video nguồn
        - Sắp xếp tự nhiên (base_1, base_2, ..., base_10)
        """
        if not obs_client:
            return {"success": False, "message": "Chưa kết nối được tới OBS Studio"}

        try:
            items_res = obs_client.get_scene_item_list(scene_name)
            items = items_res.scene_items
            videos = []

            base_items = [it for it in items if it.get('sourceName', '').lower().startswith("base_")]
            base_items.sort(key=lambda it: natural_sort_key(it.get('sourceName', '')))

            for it in base_items:
                s_name = it.get('sourceName', '')
                duration = None
                file_path = None

                try:
                    settings_res = obs_client.get_input_settings(s_name)
                    settings = getattr(settings_res, "input_settings", {})
                    if isinstance(settings, dict):
                        file_path = settings.get("local_file")
                        if not file_path and "playlist" in settings and isinstance(settings["playlist"], list):
                            if len(settings["playlist"]) > 0:
                                file_path = settings["playlist"][0].get("value")
                except Exception as e:
                    print(f"Không thể đọc settings cho {s_name}: {e}")

                if file_path:
                    duration = get_file_duration_cv2(file_path)

                if duration is None or duration <= 0:
                    try:
                        status = obs_client.get_media_input_status(s_name)
                        dur_ms = getattr(status, "media_duration", None)
                        if dur_ms and dur_ms > 0:
                            duration = round(dur_ms / 1000.0, 2)
                    except Exception:
                        pass

                if duration is None or duration <= 0:
                    duration = 30.0

                videos.append({
                    "name": s_name,
                    "duration": duration,
                    "title": s_name,
                    "file_path": file_path or ""
                })

            return {
                "success": True,
                "scene_name": scene_name,
                "videos": videos,
                "total_scanned_items": len(items),
                "matched_base_items": len(videos)
            }
        except Exception as e:
            return {"success": False, "message": f"Lỗi quét items trong Scene {scene_name}: {str(e)}"}

profile_manager = ProfileManager()
