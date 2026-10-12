from functools import wraps
from flask import Blueprint, request, jsonify
from core.api_key_manager import api_key_manager
from core.cloud_stream_engine import cloud_stream_engine
from core.media_manager import media_manager
from core.state import state

auth_bp = Blueprint('auth', __name__)

def get_current_user():
    # 1. Kiểm tra header Authorization: Bearer <api_key>
    auth_header = request.headers.get("Authorization", "")
    api_key = ""
    if auth_header.startswith("Bearer "):
        api_key = auth_header[7:].strip()
    
    # 2. Kiểm tra header X-API-Key
    if not api_key:
        api_key = request.headers.get("X-API-Key", "").strip()

    # 3. Kiểm tra query param hoặc JSON body
    if not api_key and "api_key" in request.args:
        api_key = request.args.get("api_key", "").strip()
    elif not api_key and request.json and "api_key" in request.json:
        api_key = request.json.get("api_key", "").strip()

    if not api_key:
        return None

    res = api_key_manager.validate_key(api_key)
    if res.get("success"):
        return res.get("user")
    return None

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "message": "API Key không hợp lệ hoặc đã hết hạn!"}), 401
        return f(user, *args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "message": "Vui lòng nhập Admin API Key"}), 401
        if user.get("role") != "admin":
            return jsonify({"success": False, "message": "Chỉ Quản trị viên (Admin API Key) mới có quyền truy cập!"}), 403
        return f(user, *args, **kwargs)
    return decorated_function

# Endpoint đăng nhập / kích hoạt bằng API Key (tương thích cả v1-v3 lẫn v4)
@auth_bp.route('/api/login', methods=['POST'])
@auth_bp.route('/api/auth/login', methods=['POST'])
def api_key_login():
    data = request.json or {}
    api_key = data.get('api_key', '').strip()

    if not api_key:
        return jsonify({"success": False, "message": "Vui lòng nhập Cloud API Key"}), 400

    res = api_key_manager.validate_key(api_key)
    if res.get("success"):
        user = res["user"]
        # Cập nhật state hệ thống
        state.set_authorized(True, key_id=user["id"], quota=user.get("quota_remaining", 999999))
        state.add_log("AUTH", f"🔑 Xác thực thành công: {user['name']} (Quyền: {user['role'].upper()})")

        return jsonify({
            "success": True,
            "token": user["key"], # Token chính là API Key
            "user": user,
            "quota": user.get("quota_remaining", 999999)
        })
    else:
        return jsonify({"success": False, "message": res.get("message", "API Key không hợp lệ")}), 401

@auth_bp.route('/api/auth/me', methods=['GET'])
@login_required
def api_me(user):
    user_id = user["id"]
    active_streams = cloud_stream_engine.get_user_active_count(user_id)
    disk_usage_mb = media_manager.get_user_disk_usage_mb(user_id)

    user_info = dict(user)
    user_info["active_streams"] = active_streams
    user_info["disk_usage_mb"] = disk_usage_mb

    return jsonify({
        "success": True,
        "user": user_info
    })

@auth_bp.route('/api/auth/logout', methods=['POST'])
def api_logout():
    state.set_authorized(False)
    return jsonify({"success": True, "message": "Đã ngắt phiên kết nối API Key"})
