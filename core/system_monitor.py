import os
import sys
import time
import shutil
import threading
from typing import Dict, Any

try:
    import psutil
except ImportError:
    psutil = None

class SystemMonitor:
    def __init__(self):
        self.start_time = time.time()
        self._cpu_lock = threading.Lock()
        self._prev_cpu_sample = None
        self._last_cpu_pct = 0.0
        if psutil is None and sys.platform == "win32":
            try:
                sample = self._read_windows_system_times()
                if sample:
                    self._prev_cpu_sample = sample
            except Exception:
                pass

    def _read_windows_system_times(self):
        import ctypes
        import ctypes.wintypes as w

        k32 = ctypes.windll.kernel32
        idle_ft, kernel_ft, user_ft = w.FILETIME(), w.FILETIME(), w.FILETIME()
        if not k32.GetSystemTimes(ctypes.byref(idle_ft), ctypes.byref(kernel_ft), ctypes.byref(user_ft)):
            return None
        idle = (idle_ft.dwHighDateTime << 32) | idle_ft.dwLowDateTime
        kernel = (kernel_ft.dwHighDateTime << 32) | kernel_ft.dwLowDateTime
        user = (user_ft.dwHighDateTime << 32) | user_ft.dwLowDateTime
        return (time.monotonic(), idle, kernel, user)

    def _get_windows_cpu_mem(self) -> tuple[float, Dict[str, Any]]:
        """Đọc CPU% và RAM thực tế trên Windows qua Win32 API khi không có psutil."""
        import ctypes
        import ctypes.wintypes as w

        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", w.DWORD),
                ("dwMemoryLoad", w.DWORD),
                ("ullTotalPhys", ctypes.c_uint64),
                ("ullAvailPhys", ctypes.c_uint64),
                ("ullTotalPageFile", ctypes.c_uint64),
                ("ullAvailPageFile", ctypes.c_uint64),
                ("ullTotalVirtual", ctypes.c_uint64),
                ("ullAvailVirtual", ctypes.c_uint64),
                ("ullAvailExtendedVirtual", ctypes.c_uint64),
            ]

        k32 = ctypes.windll.kernel32
        mem_stat = MEMORYSTATUSEX()
        mem_stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        mem_info = {"total_gb": 0.0, "used_gb": 0.0, "percent": 0.0}
        if k32.GlobalMemoryStatusEx(ctypes.byref(mem_stat)):
            total_b = mem_stat.ullTotalPhys or 0
            avail_b = mem_stat.ullAvailPhys or 0
            used_b = max(0, total_b - avail_b)
            mem_info = {
                "total_gb": round(total_b / (1024**3), 2),
                "used_gb": round(used_b / (1024**3), 2),
                "percent": round((used_b / total_b) * 100, 1) if total_b else float(mem_stat.dwMemoryLoad),
            }

        cur = self._read_windows_system_times()
        if cur:
            now, idle, kernel, user = cur
            with self._cpu_lock:
                if self._prev_cpu_sample is None:
                    self._prev_cpu_sample = cur
                else:
                    p_ts, p_idle, p_kernel, p_user = self._prev_cpu_sample
                    if (now - p_ts) >= 0.5:
                        d_total = (kernel - p_kernel) + (user - p_user)
                        d_idle = idle - p_idle
                        if d_total > 0:
                            self._last_cpu_pct = round(max(0.0, min(100.0, ((d_total - d_idle) / d_total) * 100.0)), 1)
                        self._prev_cpu_sample = cur

        return self._last_cpu_pct, mem_info

    def get_stats(self) -> Dict[str, Any]:
        try:
            uptime_seconds = int(time.time() - self.start_time)
            hours, remainder = divmod(uptime_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            uptime_str = f"{hours}h {minutes}m {seconds}s"

            if psutil is None:
                root_path = '/' if os.name != 'nt' else os.path.splitdrive(os.path.abspath(__file__))[0] + '\\'
                disk = shutil.disk_usage(root_path)
                disk_pct = round((disk.used / disk.total) * 100, 1) if disk.total else 0.0
                cpu_percent = 0.0
                mem_info = {"total_gb": 0, "used_gb": 0, "percent": 0}
                if sys.platform == "win32":
                    try:
                        cpu_percent, mem_info = self._get_windows_cpu_mem()
                    except Exception:
                        pass
                return {
                    "cpu_percent": cpu_percent,
                    "memory": mem_info,
                    "disk": {
                        "total_gb": round(disk.total / (1024**3), 2),
                        "used_gb": round(disk.used / (1024**3), 2),
                        "free_gb": round(disk.free / (1024**3), 2),
                        "percent": disk_pct
                    },
                    "uptime": uptime_str,
                    "status": "healthy" if cpu_percent < 85 and mem_info.get("percent", 0) < 90 else "warning"
                }

            cpu_percent = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage('/') if os.name != 'nt' else psutil.disk_usage(os.path.splitdrive(os.path.abspath(__file__))[0] + '\\')

            return {
                "cpu_percent": cpu_percent,
                "memory": {
                    "total_gb": round(mem.total / (1024**3), 2),
                    "used_gb": round(mem.used / (1024**3), 2),
                    "percent": mem.percent
                },
                "disk": {
                    "total_gb": round(disk.total / (1024**3), 2),
                    "used_gb": round(disk.used / (1024**3), 2),
                    "free_gb": round(disk.free / (1024**3), 2),
                    "percent": disk.percent
                },
                "uptime": uptime_str,
                "status": "healthy" if cpu_percent < 85 and mem.percent < 90 else "warning"
            }
        except Exception as e:
            return {
                "cpu_percent": 0.0,
                "memory": {"total_gb": 0, "used_gb": 0, "percent": 0},
                "disk": {"total_gb": 0, "used_gb": 0, "free_gb": 0, "percent": 0},
                "uptime": "N/A",
                "error": str(e)
            }

system_monitor = SystemMonitor()
