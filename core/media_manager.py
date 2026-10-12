import os
import time
import shutil
from typing import List, Dict, Any, Optional

STORAGE_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")
USERS_STORAGE = os.path.join(STORAGE_ROOT, "users")

ALLOWED_EXTENSIONS = {'.mp4', '.mkv', '.flv', '.mov', '.avi', '.ts'}

class MediaManager:
    def __init__(self):
        os.makedirs(USERS_STORAGE, exist_ok=True)

    def get_user_media_dir(self, username: str) -> str:
        path = os.path.join(USERS_STORAGE, username, "media")
        os.makedirs(path, exist_ok=True)
        return path

    def get_user_disk_usage_mb(self, username: str) -> float:
        user_dir = os.path.join(USERS_STORAGE, username)
        if not os.path.exists(user_dir):
            return 0.0
        total_size = 0
        for dirpath, _, filenames in os.walk(user_dir):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if os.path.exists(fp):
                    total_size += os.path.getsize(fp)
        return round(total_size / (1024 * 1024), 2)

    def list_media(self, username: str) -> List[Dict[str, Any]]:
        media_dir = self.get_user_media_dir(username)
        files = []
        for filename in os.listdir(media_dir):
            ext = os.path.splitext(filename)[1].lower()
            if ext in ALLOWED_EXTENSIONS:
                filepath = os.path.join(media_dir, filename)
                try:
                    stat = os.stat(filepath)
                    size_mb = round(stat.st_size / (1024 * 1024), 2)
                    mtime = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
                    files.append({
                        "filename": filename,
                        "size_mb": size_mb,
                        "ext": ext,
                        "modified_at": mtime,
                        "filepath": filepath
                    })
                except Exception:
                    continue
        # Sort newest first
        files.sort(key=lambda x: x["modified_at"], reverse=True)
        return files

    def save_upload(self, username: str, file_obj, filename: str, max_quota_mb: int = 10240) -> Dict[str, Any]:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return {"success": False, "message": f"Định dạng file {ext} không được hỗ trợ. Chỉ hỗ trợ MP4, MKV, FLV, MOV, TS."}

        # Kiểm tra quota ổ đĩa
        current_usage = self.get_user_disk_usage_mb(username)
        if current_usage >= max_quota_mb:
            return {"success": False, "message": f"Dung lượng lưu trữ của bạn đã đầy ({current_usage:.1f}MB / {max_quota_mb}MB). Vui lòng xóa bớt video cũ!"}

        media_dir = self.get_user_media_dir(username)
        # Làm sạch tên file
        clean_name = "".join(c for c in filename if c.isalnum() or c in (' ', '.', '_', '-')).strip()
        if not clean_name:
            clean_name = f"video_{int(time.time())}{ext}"
        
        target_path = os.path.join(media_dir, clean_name)
        # Nếu trùng tên thì đổi tên
        base, extension = os.path.splitext(clean_name)
        counter = 1
        while os.path.exists(target_path):
            target_path = os.path.join(media_dir, f"{base}_{counter}{extension}")
            counter += 1

        file_obj.save(target_path)
        file_size_mb = round(os.path.getsize(target_path) / (1024 * 1024), 2)

        return {
            "success": True,
            "filename": os.path.basename(target_path),
            "size_mb": file_size_mb,
            "filepath": target_path
        }

    def delete_media(self, username: str, filename: str) -> Dict[str, Any]:
        media_dir = self.get_user_media_dir(username)
        target_path = os.path.join(media_dir, os.path.basename(filename))
        if os.path.exists(target_path) and os.path.isfile(target_path):
            os.remove(target_path)
            return {"success": True, "message": f"Đã xóa video {filename}"}
        return {"success": False, "message": "File không tồn tại"}

    def get_media_path(self, username: str, filename: str) -> Optional[str]:
        media_dir = self.get_user_media_dir(username)
        target_path = os.path.join(media_dir, os.path.basename(filename))
        if os.path.exists(target_path) and os.path.isfile(target_path):
            return target_path
        return None

media_manager = MediaManager()
