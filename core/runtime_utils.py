import json
import os
import shutil
import sys
import tempfile
from typing import Any


def resolve_ffmpeg_bin() -> str:
    """Tìm đường dẫn ffmpeg thực thi trên Windows (kể cả Conda env) và Linux/Docker."""
    env_bin = (os.getenv("FFMPEG_PATH") or "").strip()
    if env_bin and os.path.exists(env_bin):
        return env_bin

    which_bin = shutil.which("ffmpeg")
    if which_bin:
        return which_bin

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    exe_name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    py_dir = os.path.dirname(sys.executable)

    candidates = [
        os.path.join(project_root, "bin", exe_name),
        os.path.join(sys.prefix, "Library", "bin", exe_name),
        os.path.join(sys.prefix, "bin", exe_name),
        os.path.join(py_dir, exe_name),
        os.path.join(py_dir, "Library", "bin", exe_name),
    ]
    if sys.platform != "win32":
        candidates.extend(["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"])

    for path in candidates:
        if path and os.path.exists(path):
            return path

    return "ffmpeg"


def atomic_write_json(filepath: str, data: Any) -> None:
    """Ghi JSON an toàn qua file tạm + os.replace để tránh hỏng dữ liệu khi nhiều request đồng thời."""
    parent_dir = os.path.dirname(os.path.abspath(filepath)) or "."
    os.makedirs(parent_dir, exist_ok=True)
    base_name = os.path.basename(filepath)
    fd, tmp_path = tempfile.mkstemp(prefix=f".{base_name}.", suffix=".tmp", dir=parent_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
        os.replace(tmp_path, filepath)
    except Exception:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        raise
