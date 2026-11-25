import os
import sys
import traceback

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

os.environ.setdefault("VERCEL", "1")

try:
    from app import app
except Exception:
    err_tb = traceback.format_exc()
    print("FATAL ERROR INITIALIZING APPLICATION ON VERCEL:\n", err_tb)
    from flask import Flask, Response
    app = Flask(__name__)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def vercel_startup_error(path):
        return Response(f"<h3>Startup Error</h3><pre>{err_tb}</pre>", status=500, mimetype="text/html")

