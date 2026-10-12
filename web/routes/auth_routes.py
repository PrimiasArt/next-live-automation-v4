from functools import wraps
from flask import Blueprint, request, jsonify
from core.auth_manager import auth_manager
from core.cloud_stream_engine import cloud_stream_engine
from core.media_manager import media_manager

auth_bp = Blueprint('auth', __name__)

def get_current_user():
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "token" in request.args:
        token = request.args.get("token", "").strip()
    elif request.json and "token" in request.json:
        token = request.json.get("token", "").strip()

    if not token:
        return None
    return auth_manager.verify_token(token)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "message": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."}), 401
        return f(user, *args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "message": "Vui lòng đăng nhập quyền Admin"}), 401
        if user.get("role") != "admin":
            return jsonify({"success": False, "message": "Bạn không có quyền quản trị viên"}), 403
        return f(user, *args, **kwargs)
    return decorated_function

@auth_bp.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({"success": False, "message": "Vui lòng nhập tên đăng nhập và mật khẩu"}), 400

    result = auth_manager.authenticate(username, password)
    if not result:
        return jsonify({"success": False, "message": "Tên đăng nhập hoặc mật khẩu không chính xác"}), 401

    return jsonify({
        "success": True,
        "token": result["token"],
        "user": result["user"]
    })

@auth_bp.route('/api/auth/me', methods=['GET'])
@login_required
def api_me(user):
    username = user["username"]
    active_streams = cloud_stream_engine.get_user_active_count(username)
    disk_usage_mb = media_manager.get_user_disk_usage_mb(username)
    
    user_info = dict(user)
    user_info["active_streams"] = active_streams
    user_info["disk_usage_mb"] = disk_usage_mb
    
    return jsonify({
        "success": True,
        "user": user_info
    })

@auth_bp.route('/api/auth/logout', methods=['POST'])
def api_logout():
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
    if token:
        auth_manager.revoke_token(token)
    return jsonify({"success": True, "message": "Đã đăng xuất"})

@auth_bp.route('/api/auth/change-password', methods=['POST'])
@login_required
def api_change_password(user):
    data = request.json or {}
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')

    if not auth_manager._verify_password(old_password, auth_manager.users[user["username"]]["password_hash"]):
        return jsonify({"success": False, "message": "Mật khẩu hiện tại không đúng"}), 400

    res = auth_manager.update_user(user["username"], {"password": new_password})
    return jsonify(res)
