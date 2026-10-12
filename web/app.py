import os
from flask import Flask, render_template
from flask_cors import CORS
from core.state import state
from web.routes.auth_routes import auth_bp
from web.routes.admin_routes import admin_bp
from web.routes.media_routes import media_bp
from web.routes.cloud_stream_routes import cloud_stream_bp
from web.routes.live_routes import live_bp
from web.routes.profile_routes import profile_bp
from web.routes.stream_routes import stream_bp
from web.routes.group_routes import group_bp

def create_app():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    template_dir = os.path.join(base_dir, "templates")
    static_dir = os.path.join(base_dir, "static")

    app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)
    app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024 * 1024 # Cho phép upload video lên tới 4GB
    
    CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["POST", "GET", "PUT", "DELETE", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

    # Đăng ký các Blueprints v4 Cloud SaaS
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(cloud_stream_bp)
    
    # Giữ lại các Blueprints điều khiển Stream Processor gốc
    app.register_blueprint(live_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(stream_bp)
    app.register_blueprint(group_bp)

    @app.route('/')
    def index():
        return render_template("index.html")

    return app
