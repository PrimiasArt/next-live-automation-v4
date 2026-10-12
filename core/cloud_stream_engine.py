import os
import sys
import time
import json
import subprocess
import threading
from typing import Dict, List, Any, Optional
from core.auth_manager import auth_manager

STORAGE_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")
USERS_STORAGE = os.path.join(STORAGE_ROOT, "users")

class CloudStreamProcess:
    def __init__(self, stream_id: str, username: str, title: str, input_file: str, rtmp_url: str, stream_key: str, mode: str = "direct"):
        self.stream_id = stream_id
        self.username = username
        self.title = title
        self.input_file = input_file
        self.rtmp_url = rtmp_url.strip()
        self.stream_key = stream_key.strip()
        self.mode = mode # 'direct' (copy, 1% CPU) or 'transcode' (x264)
        
        self.process: Optional[subprocess.Popen] = None
        self.status = "stopped" # 'stopped', 'starting', 'running', 'error'
        self.started_at: Optional[float] = None
        self.error_message = ""
        self.logs: List[str] = []
        self.auto_restart = True
        self.restart_count = 0

    def get_full_rtmp(self) -> str:
        url = self.rtmp_url.rstrip('/')
        if not self.stream_key:
            return url
        # If stream_key already included or separated by /
        if url.endswith('/live') or url.endswith('/app'):
            return f"{url}/{self.stream_key}"
        return f"{url}/{self.stream_key}"

    def to_dict(self) -> Dict[str, Any]:
        uptime_sec = 0
        if self.status == "running" and self.started_at:
            uptime_sec = int(time.time() - self.started_at)
        
        # Mask stream key for safety in dict representation
        masked_key = self.stream_key[:4] + "****" + self.stream_key[-3:] if len(self.stream_key) > 8 else "****"

        return {
            "stream_id": self.stream_id,
            "username": self.username,
            "title": self.title,
            "input_file": os.path.basename(self.input_file),
            "rtmp_url": self.rtmp_url,
            "stream_key_masked": masked_key,
            "mode": self.mode,
            "status": self.status,
            "uptime_sec": uptime_sec,
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.started_at)) if self.started_at else None,
            "error_message": self.error_message,
            "restart_count": self.restart_count,
            "auto_restart": self.auto_restart
        }

class CloudStreamEngine:
    def __init__(self):
        self.streams: Dict[str, CloudStreamProcess] = {}
        self.lock = threading.Lock()
        self.watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self.watchdog_thread.start()
        self.load_persisted_configs()

    def _get_user_config_file(self, username: str) -> str:
        user_dir = os.path.join(USERS_STORAGE, username)
        os.makedirs(user_dir, exist_ok=True)
        return os.path.join(user_dir, "streams_config.json")

    def load_persisted_configs(self):
        if not os.path.exists(USERS_STORAGE):
            return
        for user in os.listdir(USERS_STORAGE):
            cfg_file = self._get_user_config_file(user)
            if os.path.exists(cfg_file):
                try:
                    with open(cfg_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    for item in data:
                        sid = item.get("stream_id")
                        if sid:
                            p = CloudStreamProcess(
                                stream_id=sid,
                                username=item.get("username", user),
                                title=item.get("title", f"Luồng {sid}"),
                                input_file=item.get("input_file", ""),
                                rtmp_url=item.get("rtmp_url", ""),
                                stream_key=item.get("stream_key", ""),
                                mode=item.get("mode", "direct")
                            )
                            self.streams[sid] = p
                except Exception:
                    pass

    def save_user_configs(self, username: str):
        cfg_file = self._get_user_config_file(username)
        user_streams = [
            {
                "stream_id": p.stream_id,
                "username": p.username,
                "title": p.title,
                "input_file": p.input_file,
                "rtmp_url": p.rtmp_url,
                "stream_key": p.stream_key,
                "mode": p.mode
            }
            for p in self.streams.values() if p.username == username
        ]
        with open(cfg_file, 'w', encoding='utf-8') as f:
            json.dump(user_streams, f, ensure_ascii=False, indent=2)

    def get_user_active_count(self, username: str) -> int:
        with self.lock:
            return sum(1 for p in self.streams.values() if p.username == username and p.status in ["starting", "running"])

    def create_or_update_stream(self, username: str, title: str, input_file: str, rtmp_url: str, stream_key: str, mode: str = "direct", stream_id: Optional[str] = None) -> Dict[str, Any]:
        if not stream_id:
            stream_id = f"str_{username}_{int(time.time() * 1000) % 1000000}"

        if not os.path.exists(input_file):
            return {"success": False, "message": "File video nguồn không tồn tại trên Cloud Storage"}
        if not rtmp_url:
            return {"success": False, "message": "Vui lòng nhập RTMP URL"}

        with self.lock:
            proc = self.streams.get(stream_id)
            if proc and proc.status == "running":
                return {"success": False, "message": "Luồng đang phát sóng, vui lòng dừng luồng trước khi cập nhật cấu hình"}

            new_proc = CloudStreamProcess(
                stream_id=stream_id,
                username=username,
                title=title.strip() or f"Luồng {stream_id}",
                input_file=input_file,
                rtmp_url=rtmp_url,
                stream_key=stream_key,
                mode=mode
            )
            self.streams[stream_id] = new_proc
            self.save_user_configs(username)

        return {"success": True, "stream": new_proc.to_dict()}

    def delete_stream(self, username: str, stream_id: str, is_admin: bool = False) -> Dict[str, Any]:
        with self.lock:
            proc = self.streams.get(stream_id)
            if not proc:
                return {"success": False, "message": "Luồng không tồn tại"}
            if not is_admin and proc.username != username:
                return {"success": False, "message": "Bạn không có quyền xóa luồng này"}

            if proc.status == "running":
                self._stop_process(proc)

            self.streams.pop(stream_id, None)
            self.save_user_configs(proc.username)

        return {"success": True, "message": "Đã xóa cấu hình luồng"}

    def start_stream(self, username: str, stream_id: str, is_admin: bool = False) -> Dict[str, Any]:
        proc = self.streams.get(stream_id)
        if not proc:
            return {"success": False, "message": "Luồng không tồn tại"}
        if not is_admin and proc.username != username:
            return {"success": False, "message": "Bạn không có quyền điều khiển luồng này"}

        if proc.status == "running":
            return {"success": True, "message": "Luồng đã đang phát sóng", "stream": proc.to_dict()}

        # Kiểm tra quota số luồng tối đa của User
        user = auth_manager.get_user_safe(proc.username)
        max_streams = user.get("max_streams", 1) if user else 1
        active_count = self.get_user_active_count(proc.username)
        
        if not is_admin and active_count >= max_streams:
            return {
                "success": False, 
                "message": f"Bạn đã đạt giới hạn tối đa {max_streams} luồng live cùng lúc! Vui lòng dừng bớt luồng khác hoặc liên hệ Admin nâng cấp gói."
            }

        # Build FFmpeg command
        full_rtmp = proc.get_full_rtmp()
        
        # FFmpeg command options
        # -re: Read input at native frame rate
        # -stream_loop -1: Loop video infinitely
        cmd = ["ffmpeg", "-re", "-stream_loop", "-1", "-i", proc.input_file]

        if proc.mode == "direct":
            # DIRECT STREAM COPY: siêu nhẹ, tốn ~1% CPU
            # Copy video directly, transcode audio to aac if needed
            cmd.extend([
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "128k",
                "-ar", "44100",
                "-f", "flv",
                full_rtmp
            ])
        else:
            # TRANSCODE MODE: Chuyển mã chuẩn hóa x264
            cmd.extend([
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-b:v", "3500k",
                "-maxrate", "4000k",
                "-bufsize", "8000k",
                "-pix_fmt", "yuv420p",
                "-g", "60",
                "-c:a", "aac",
                "-b:a", "128k",
                "-ar", "44100",
                "-f", "flv",
                full_rtmp
            ])

        try:
            # Start subprocess detached
            proc.status = "starting"
            proc.error_message = ""
            proc.logs = []
            
            # Windows creationflags or Linux preexec_fn
            flags = 0
            if sys.platform == "win32":
                flags = subprocess.CREATE_NO_WINDOW

            p = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                creationflags=flags
            )
            proc.process = p
            proc.started_at = time.time()
            proc.status = "running"
            
            # Start log reading thread
            threading.Thread(target=self._capture_logs, args=(proc,), daemon=True).start()

            return {"success": True, "message": "🚀 Luồng phát sóng đã khởi chạy thành công!", "stream": proc.to_dict()}
        except Exception as e:
            proc.status = "error"
            proc.error_message = str(e)
            return {"success": False, "message": f"Lỗi khởi chạy FFmpeg: {str(e)}"}

    def _capture_logs(self, proc: CloudStreamProcess):
        if not proc.process:
            return
        try:
            for line in proc.process.stdout:
                line_str = line.strip()
                if line_str:
                    proc.logs.append(line_str)
                    if len(proc.logs) > 50:
                        proc.logs.pop(0)
        except Exception:
            pass

    def stop_stream(self, username: str, stream_id: str, is_admin: bool = False) -> Dict[str, Any]:
        proc = self.streams.get(stream_id)
        if not proc:
            return {"success": False, "message": "Luồng không tồn tại"}
        if not is_admin and proc.username != username:
            return {"success": False, "message": "Bạn không có quyền dừng luồng này"}

        self._stop_process(proc)
        return {"success": True, "message": "Đã dừng luồng phát sóng", "stream": proc.to_dict()}

    def _stop_process(self, proc: CloudStreamProcess):
        proc.auto_restart = False
        if proc.process:
            try:
                proc.process.terminate()
                proc.process.wait(timeout=3)
            except Exception:
                try:
                    proc.process.kill()
                except Exception:
                    pass
        proc.process = None
        proc.status = "stopped"
        proc.started_at = None

    def list_streams(self, username: str, is_admin: bool = False) -> List[Dict[str, Any]]:
        with self.lock:
            if is_admin:
                return [p.to_dict() for p in self.streams.values()]
            return [p.to_dict() for p in self.streams.values() if p.username == username]

    def get_stream_logs(self, username: str, stream_id: str, is_admin: bool = False) -> Dict[str, Any]:
        proc = self.streams.get(stream_id)
        if not proc:
            return {"success": False, "message": "Không tìm thấy luồng"}
        if not is_admin and proc.username != username:
            return {"success": False, "message": "Quyền truy cập bị từ chối"}
        return {"success": True, "logs": proc.logs[-30:], "status": proc.status}

    def _watchdog_loop(self):
        while True:
            time.sleep(3)
            with self.lock:
                for proc in list(self.streams.values()):
                    if proc.status == "running" and proc.process:
                        poll_result = proc.process.poll()
                        if poll_result is not None:
                            # Process died
                            if proc.auto_restart and proc.restart_count < 10:
                                proc.restart_count += 1
                                proc.logs.append(f"⚠️ Luồng bị ngắt kết nối. Đang tự động kết nối lại (lần {proc.restart_count})...")
                                # Restart
                                threading.Thread(target=self.start_stream, args=(proc.username, proc.stream_id, True), daemon=True).start()
                            else:
                                proc.status = "error"
                                proc.error_message = f"Tiến trình kết thúc với mã thoát {poll_result}"
                                proc.process = None

cloud_stream_engine = CloudStreamEngine()
