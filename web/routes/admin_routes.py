from flask import Blueprint, request, jsonify
from web.routes.auth_routes import admin_required
from core.api_key_manager import api_key_manager
from core.cloud_stream_engine import cloud_stream_engine
from core.media_manager import media_manager
from core.system_monitor import system_monitor

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/api/admin/system', methods=['GET'])
@admin_required
def get_system_stats(admin_user):
    stats = system_monitor.get_stats()
    all_streams = cloud_stream_engine.list_streams(admin_user["id"], is_admin=True)
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

@admin_bp.route('/api/admin/keys', methods=['GET'])
@admin_required
def list_api_keys(admin_user):
    keys = api_key_manager.list_keys()
    enriched = []
    for k in keys:
        uid = k["id"]
        item = dict(k)
        item["active_streams"] = cloud_stream_engine.get_user_active_count(uid)
        item["disk_usage_mb"] = media_manager.get_user_disk_usage_mb(uid)
        enriched.append(item)
    return jsonify({"success": True, "keys": enriched})

@admin_bp.route('/api/admin/keys', methods=['POST'])
@admin_required
def create_api_key(admin_user):
    data = request.json or {}
    res = api_key_manager.create_client_key(
        name=data.get('name', ''),
        custom_key=data.get('custom_key', None),
        max_streams=int(data.get('max_streams', 2)),
        disk_quota_mb=int(data.get('disk_quota_mb', 10240))
    )
    return jsonify(res)

@admin_bp.route('/api/admin/keys/<path:key>', methods=['PUT'])
@admin_required
def update_api_key(admin_user, key):
    data = request.json or {}
    res = api_key_manager.update_key(key, data)
    return jsonify(res)

@admin_bp.route('/api/admin/keys/<path:key>', methods=['DELETE'])
@admin_required
def delete_api_key(admin_user, key):
    res = api_key_manager.delete_key(key)
    return jsonify(res)

@admin_bp.route('/api/admin/kill-stream', methods=['POST'])
@admin_required
def admin_kill_stream(admin_user):
    data = request.json or {}
    stream_id = data.get('stream_id', '')
    res = cloud_stream_engine.stop_stream(admin_user["id"], stream_id, is_admin=True)
    return jsonify(res)
