from flask import Blueprint, request, jsonify
from web.routes.auth_routes import admin_required
from core.api_key_manager import api_key_manager
from core.cloud_stream_engine import cloud_stream_engine
from core.media_manager import media_manager
from core.system_monitor import system_monitor
from core.content_studio_engine import content_studio_engine

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

@admin_bp.route('/api/admin/keys/generate-code', methods=['GET'])
@admin_required
def generate_key_code(admin_user):
    """Sinh mã API Key chuẩn cấu trúc hlc-live-automation-xxxx..."""
    code = api_key_manager.generate_formatted_api_key()
    return jsonify({"success": True, "key": code})

@admin_bp.route('/api/admin/keys', methods=['POST'])
@admin_required
def create_api_key(admin_user):
    """Cấp mã khóa phát sóng mới và đồng bộ trực tiếp lên Supabase Cloud"""
    data = request.json or {}
    res = api_key_manager.create_client_key(
        name=data.get('name', ''),
        custom_key=data.get('custom_key', None),
        max_streams=int(data.get('max_streams', 2)),
        disk_quota_mb=int(data.get('disk_quota_mb', 10240)),
        quota_remaining=int(data.get('quota_remaining', 500)),
        push_supabase=data.get('push_supabase', True),
        expires_days=data.get('expires_days', None)
    )
    return jsonify(res)

@admin_bp.route('/api/admin/keys/<path:key>/toggle', methods=['POST'])
@admin_required
def toggle_api_key_status(admin_user, key):
    """Bật / Tắt trạng thái hoạt động (Active / Revoked) của Key trên Web App & Supabase"""
    data = request.json or {}
    new_status = data.get('status')
    res = api_key_manager.toggle_key_status(key, new_status=new_status)
    return jsonify(res)

@admin_bp.route('/api/admin/keys/sync-supabase', methods=['POST'])
@admin_required
def sync_supabase_keys(admin_user):
    """Kéo toàn bộ danh sách API Keys từ Supabase Cloud Database về hệ thống"""
    res = api_key_manager.sync_all_from_supabase()
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

# ==========================================
# CẤU HÌNH API NỀN TẢNG & KIỂM TRA SỐ DƯ
# ==========================================

@admin_bp.route('/api/admin/platforms/config', methods=['GET', 'POST'])
@admin_required
def platform_config(admin_user):
    from config import SUPABASE_URL, SUPABASE_ANON_KEY
    if request.method == 'GET':
        keys = content_studio_engine.get_api_keys()
        supa_url = content_studio_engine.settings.get("supabase_url") or SUPABASE_URL
        supa_key = content_studio_engine.settings.get("supabase_anon_key") or SUPABASE_ANON_KEY

        def mask(k):
            return f"{k[:4]}...{k[-4:]}" if k and len(k) > 8 else ("(Chưa cấu hình)" if not k else "***")

        return jsonify({
            "success": True,
            "has_elevenlabs": bool(keys.get("elevenlabs")),
            "has_heygen": bool(keys.get("heygen")),
            "elevenlabs_masked": mask(keys.get("elevenlabs")),
            "heygen_masked": mask(keys.get("heygen")),
            "supabase_url": supa_url,
            "supabase_anon_masked": mask(supa_key),
            "cost_per_voice": content_studio_engine.settings.get("cost_per_voice_gen", 2),
            "cost_per_video": content_studio_engine.settings.get("cost_per_video_gen", 10)
        })

    data = request.json or {}
    el_key = data.get("elevenlabs_api_key")
    hg_key = data.get("heygen_api_key")
    supa_url = data.get("supabase_url")
    supa_key = data.get("supabase_anon_key")

    content_studio_engine.set_api_keys(
        elevenlabs_key=el_key if el_key and el_key.strip() else None,
        heygen_key=hg_key if hg_key and hg_key.strip() else None,
        supabase_url=supa_url if supa_url and supa_url.strip() else None,
        supabase_anon_key=supa_key if supa_key and supa_key.strip() else None
    )

    if "cost_per_video" in data:
        content_studio_engine.settings["cost_per_video_gen"] = max(1, int(data["cost_per_video"]))
    if "cost_per_voice" in data:
        content_studio_engine.settings["cost_per_voice_gen"] = max(1, int(data["cost_per_voice"]))
    content_studio_engine.save_settings()

    return jsonify({"success": True, "message": "Đã lưu cấu hình API các nền tảng thành công!"})

@admin_bp.route('/api/admin/platforms/check-elevenlabs', methods=['POST'])
@admin_required
def check_elevenlabs(admin_user):
    data = request.json or {}
    custom_key = data.get("api_key")
    res = content_studio_engine.check_elevenlabs_balance(api_key=custom_key)
    return jsonify(res)

@admin_bp.route('/api/admin/platforms/check-heygen', methods=['POST'])
@admin_required
def check_heygen(admin_user):
    data = request.json or {}
    custom_key = data.get("api_key")
    res = content_studio_engine.check_heygen_balance(api_key=custom_key)
    return jsonify(res)

@admin_bp.route('/api/admin/platforms/check-supabase', methods=['POST'])
@admin_required
def check_supabase(admin_user):
    data = request.json or {}
    url = data.get("supabase_url")
    anon_key = data.get("supabase_anon_key")
    res = content_studio_engine.check_supabase_connection(url=url, anon_key=anon_key)
    return jsonify(res)

@admin_bp.route('/api/admin/kill-stream', methods=['POST'])
@admin_required
def admin_kill_stream(admin_user):
    data = request.json or {}
    stream_id = data.get('stream_id', '')
    res = cloud_stream_engine.stop_stream(admin_user["id"], stream_id, is_admin=True)
    return jsonify(res)
