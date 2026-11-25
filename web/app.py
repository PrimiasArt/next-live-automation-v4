import os
from flask import Flask, render_template
from flask_cors import CORS
from core.state import state
from core.obs_engine import engine
from web.routes.auth_routes import auth_bp
from web.routes.admin_routes import admin_bp
from web.routes.media_routes import media_bp
from web.routes.cloud_stream_routes import cloud_stream_bp
from web.routes.content_studio_routes import content_studio_bp
from web.routes.live_routes import live_bp
from web.routes.profile_routes import profile_bp
from web.routes.stream_routes import stream_bp
from web.routes.group_routes import group_bp

def create_app():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    template_dir = os.path.join(base_dir, "templates")
    static_dir = os.path.join(base_dir, "static")

    app = Flask(__name__, template_folder=template_dir, static_folder=static_dir, static_url_path='/static')
    app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024 * 1024 # Cho phép upload video lên tới 4GB
    
    CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["POST", "GET", "PUT", "DELETE", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

    # Đăng ký các Blueprints v4 Cloud SaaS & Content Studio
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(cloud_stream_bp)
    app.register_blueprint(content_studio_bp)
    
    # Giữ lại các Blueprints điều khiển Stream Processor gốc
    app.register_blueprint(live_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(stream_bp)
    app.register_blueprint(group_bp)

    @app.route('/')
    def index():
        tpl_file = os.path.join(template_dir, "index.html")
        if os.path.exists(tpl_file):
            try:
                return render_template("index.html")
            except Exception:
                with open(tpl_file, "r", encoding="utf-8") as f:
                    return f.read(), 200, {"Content-Type": "text/html; charset=utf-8"}
        return "<h3>index.html template not found</h3>", 404

    from urllib.parse import parse_qs, urlencode

    class VercelPathFixMiddleware:
        """Khôi phục PATH_INFO & QUERY_STRING gốc khi Vercel rewrite /(.*) -> /api/index?__vercel_path=$1."""
        def __init__(self, wsgi_app):
            self.wsgi_app = wsgi_app

        def __call__(self, environ, start_response):
            qs = parse_qs(environ.get("QUERY_STRING", ""), keep_blank_values=True)
            if "__vercel_path" in qs:
                raw_path = (qs.pop("__vercel_path")[0] or "").lstrip("/")
                environ["PATH_INFO"] = "/" + raw_path
                environ["QUERY_STRING"] = urlencode(qs, doseq=True)
            elif environ.get("PATH_INFO") in ("/api/index", "/api/index/"):
                environ["PATH_INFO"] = "/"
            elif (environ.get("PATH_INFO") or "").startswith("/api/index/"):
                environ["PATH_INFO"] = environ["PATH_INFO"][len("/api/index"):]
            return self.wsgi_app(environ, start_response)

    app.wsgi_app = VercelPathFixMiddleware(app.wsgi_app)

    # Khởi chạy vòng lặp tự động phát video OBS trên luồng nền (không chạy trên Vercel Serverless)
    engine.start_background_loop()

    return app
