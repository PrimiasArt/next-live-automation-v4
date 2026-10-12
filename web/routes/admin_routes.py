from flask import Blueprint, request, jsonify
from web.routes.auth_routes import admin_required
from core.auth_manager import auth_manager
from core.cloud_stream_engine import cloud_stream_engine
from core.media_manager import media_manager
from core.system_monitor import system_monitor

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/api/admin/system', methods=['GET'])
@admin_required
def get_system_stats(admin_user):
    stats = system_monitor.get_stats()
    all_streams = cloud_stream_engine.list_streams(admin_user["username"], is_admin=True)
    active_count = sum(1 for s in all_streams if s["status"] in ["starting", "running"])
    
    return jsonify({
        "success": True,
        "system": stats,
        "streams_summary": {
            "total_streams": len(all_streams),
            "active_streams": active_count
        },
        "all_streams": all_streams
    })

@admin_bp.route('/api/admin/users', methods=['GET'])
@admin_required
def list_users(admin_user):
    users = auth_manager.list_users()
    enriched = []
    for u in users:
        uname = u["username"]
        item = dict(u)
        item["active_streams"] = cloud_stream_engine.get_user_active_count(uname)
        item["disk_usage_mb"] = media_manager.get_user_disk_usage_mb(uname)
        enriched.append(item)
    return jsonify({"success": True, "users": enriched})

@admin_bp.route('/api/admin/users', methods=['POST'])
@admin_required
def create_user(admin_user):
    data = request.json or {}
    res = auth_manager.create_user(
        username=data.get('username', ''),
        password=data.get('password', ''),
        name=data.get('name', ''),
        role=data.get('role', 'client'),
        max_streams=int(data.get('max_streams', 2)),
        disk_quota_mb=int(data.get('disk_quota_mb', 10240))
    )
    return jsonify(res)

@admin_bp.route('/api/admin/users/<username>', methods=['PUT'])
@admin_required
def update_user(admin_user, username):
    data = request.json or {}
    res = auth_manager.update_user(username, data)
    return jsonify(res)

@admin_bp.route('/api/admin/users/<username>', methods=['DELETE'])
@admin_required
def delete_user(admin_user, username):
    res = auth_manager.delete_user(username)
    return jsonify(res)

@admin_bp.route('/api/admin/kill-stream', methods=['POST'])
@admin_required
def admin_kill_stream(admin_user):
    data = request.json or {}
    stream_id = data.get('stream_id', '')
    res = cloud_stream_engine.stop_stream(admin_user["username"], stream_id, is_admin=True)
    return jsonify(res)
