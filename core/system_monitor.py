import os
import time
import psutil
from typing import Dict, Any

class SystemMonitor:
    def __init__(self):
        self.start_time = time.time()

    def get_stats(self) -> Dict[str, Any]:
        try:
            cpu_percent = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage('/') if os.name != 'nt' else psutil.disk_usage(os.path.splitdrive(os.path.abspath(__file__))[0] + '\\')
            
            uptime_seconds = int(time.time() - self.start_time)
            hours, remainder = divmod(uptime_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            uptime_str = f"{hours}h {minutes}m {seconds}s"

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
