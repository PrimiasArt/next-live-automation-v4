import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import threading
import multiprocessing
from config import WEB_HOST, WEB_PORT, ADMIN_API_KEY
from core.state import state
from core.api_key_manager import api_key_manager
from core.cloud_stream_engine import cloud_stream_engine
from core.tunnel_manager import tunnel_manager
from web.app import create_app

def on_tunnel_ready(public_url):
    print("\n" + "=" * 75)
    print("🎉 HỆ THỐNG NEXT LIVE AUTOMATION V4 CLOUD SAAS ĐÃ TRỰC TUYẾN!")
    print("=" * 75)
    print(f"📱 TRUY CẬP TỪ XA QUA INTERNET (ĐIỆN THOẠI / LAPTOP BẤT KỲ):")
    print(f"👉 {public_url}")
    print("=" * 75)
    print(f"🔑 MASTER ADMIN API KEY:")
    print(f"   👉 {ADMIN_API_KEY}")
    print("=" * 75)
    print(f"💻 HOẶC TRUY CẬP NỘI BỘ: http://localhost:{WEB_PORT}")
    print("=" * 75 + "\n")

def main():
    multiprocessing.freeze_support()

    print("=" * 75)
    print("🚀 KHỞI ĐỘNG HỆ THỐNG: NEXT LIVE AUTOMATION V4 - CLOUD BROADCAST SAAS")
    print("=" * 75)
    print(f"⚡ Động cơ: Cloud Direct Stream Engine + Multi-Tenant Isolation")
    print(f"🔑 Hệ thống xác thực API Key: Đã nạp ({len(api_key_manager.keys)} mã khóa)")

    # 1. Kiểm tra Stream Processor cục bộ (nếu có)
    try:
        from core.stream_process_manager import process_manager
        is_running, pid = process_manager.get_process_info()
        if not is_running:
            res = process_manager.start_processor(minimize_to_tray=True)
            if res.get("success"):
                print(f"✅ Local Stream Processor đã khởi chạy ngầm (PID: {res.get('pid')})")
        else:
            print(f"✅ Local Stream Processor đang chạy (PID: {pid})")
    except Exception as e:
        print(f"ℹ️  Chế độ Cloud Headless (Không cần Stream Processor màn hình): {e}")

    # 2. Khởi tạo Flask App
    app = create_app()

    # 3. Kích hoạt Tunnel tự động lấy Public Link
    tunnel_manager.start_tunnel(local_port=WEB_PORT, on_url_ready=on_tunnel_ready)

    # 4. Tự động mở trình duyệt Web
    import webbrowser
    def _open_browser():
        import time
        time.sleep(1.2)
        try:
            webbrowser.open(f"http://localhost:{WEB_PORT}")
        except Exception:
            pass
    threading.Thread(target=_open_browser, daemon=True).start()

    # 5. Chạy Web Server Flask
    print(f"🌐 Web Server đang lắng nghe tại: http://{WEB_HOST}:{WEB_PORT}")
    try:
        app.run(host=WEB_HOST, port=WEB_PORT, debug=False, use_reloader=False)
    except (KeyboardInterrupt, SystemExit):
        print("\n🛑 Đang dừng hệ thống Next Live Automation v4...")
        tunnel_manager.stop_tunnel()
        sys.exit(0)

if __name__ == "__main__":
    main()
