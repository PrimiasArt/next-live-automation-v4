import os
from flask import Blueprint, request, jsonify, send_file
from web.routes.auth_routes import login_required
from core.media_manager import media_manager

media_bp = Blueprint('media', __name__)

@media_bp.route('/api/media/list', methods=['GET'])
@login_required
def list_media(user):
    tenant_id = user.get("id") or user.get("key") or "default"
    files = media_manager.list_media(tenant_id)
    usage_mb = media_manager.get_user_disk_usage_mb(tenant_id)
    quota_mb = user.get("disk_quota_mb", 10240)
    
    return jsonify({
        "success": True,
        "files": files,
        "usage_mb": usage_mb,
        "quota_mb": quota_mb,
        "percent": round((usage_mb / quota_mb) * 100, 1) if quota_mb > 0 else 0
    })

@media_bp.route('/api/media/upload', methods=['POST'])
@login_required
def upload_media(user):
    if 'file' not in request.files:
        return jsonify({"success": False, "message": "Không tìm thấy file tải lên"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "message": "Tên file rỗng"}), 400

    tenant_id = user.get("id") or user.get("key") or "default"
    quota_mb = user.get("disk_quota_mb", 10240)
    
    res = media_manager.save_upload(tenant_id, file, file.filename, max_quota_mb=quota_mb)
    return jsonify(res)

@media_bp.route('/api/media/delete', methods=['DELETE'])
@login_required
def delete_media(user):
    data = request.json or {}
    filename = data.get("filename", "")
    if not filename:
        return jsonify({"success": False, "message": "Thiếu tên file"}), 400
    
    tenant_id = user.get("id") or user.get("key") or "default"
    res = media_manager.delete_media(tenant_id, filename)
    return jsonify(res)

@media_bp.route('/api/media/file/<filename>', methods=['GET'])
@login_required
def get_media_file(user, filename):
    tenant_id = user.get("id") or user.get("key") or "default"
    filepath = media_manager.get_media_path(tenant_id, filename)
    if not filepath or not os.path.exists(filepath):
        return jsonify({"success": False, "message": "File không tồn tại"}), 404
    return send_file(filepath)
