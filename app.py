import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

# If running on Vercel Serverless, configure /tmp for writable data and storage
if os.getenv("VERCEL"):
    import shutil
    tmp_data = "/tmp/data"
    os.makedirs(tmp_data, exist_ok=True)
    data_src = os.path.join(CURRENT_DIR, "data")
    if os.path.exists(data_src):
        for item in os.listdir(data_src):
            s = os.path.join(data_src, item)
            d = os.path.join(tmp_data, item)
            if os.path.isfile(s) and not os.path.exists(d):
                try:
                    shutil.copy2(s, d)
                except Exception:
                    pass

    tmp_storage = "/tmp/storage"
    os.makedirs(tmp_storage, exist_ok=True)
    storage_src = os.path.join(CURRENT_DIR, "storage")
    if os.path.exists(storage_src):
        sys_av_src = os.path.join(storage_src, "system_avatars")
        sys_av_dst = os.path.join(tmp_storage, "system_avatars")
        os.makedirs(sys_av_dst, exist_ok=True)
        if os.path.exists(sys_av_src):
            for item in os.listdir(sys_av_src):
                s = os.path.join(sys_av_src, item)
                d = os.path.join(sys_av_dst, item)
                if os.path.isfile(s) and not os.path.exists(d):
                    try:
                        shutil.copy2(s, d)
                    except Exception:
                        pass

from web.app import create_app

app = create_app()

if __name__ == "__main__":
    from config import WEB_PORT
    app.run(host="0.0.0.0", port=WEB_PORT)

