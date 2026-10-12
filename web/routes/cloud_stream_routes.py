from flask import Blueprint, request, jsonify
from web.routes.auth_routes import login_required
from core.cloud_stream_engine import cloud_stream_engine
from core.media_manager import media_manager

cloud_stream_bp = Blueprint('cloud_stream', __name__)

@cloud_stream_bp.route('/api/cloud-streams', methods=['GET'])
@login_required
def get_streams(user):
    streams = cloud_stream_engine.list_streams(user["username"], is_admin=False)
    return jsonify({
        "success": True,
        "streams": streams,
        "max_streams": user.get("max_streams", 1),
        "active_count": sum(1 for s in streams if s["status"] in ["starting", "running"])
    })

@cloud_stream_bp.route('/api/cloud-streams/save', methods=['POST'])
@login_required
def save_stream(user):
    data = request.json or {}
    video_filename = data.get("video_filename", "")
    rtmp_url = data.get("rtmp_url", "").strip()
    stream_key = data.get("stream_key", "").strip()
    title = data.get("title", "").strip()
    mode = data.get("mode", "direct") # 'direct' or 'transcode'
    stream_id = data.get("stream_id", None)

    filepath = media_manager.get_media_path(user["username"], video_filename)
    if not filepath:
        return jsonify({"success": False, "message": "Video đã chọn không tồn tại trong kho lưu trữ của bạn"}), 400

    res = cloud_stream_engine.create_or_update_stream(
        username=user["username"],
        title=title,
        input_file=filepath,
        rtmp_url=rtmp_url,
        stream_key=stream_key,
        mode=mode,
        stream_id=stream_id
    )
    return jsonify(res)

@cloud_stream_bp.route('/api/cloud-streams/delete', methods=['DELETE'])
@login_required
def delete_stream(user):
    data = request.json or {}
    stream_id = data.get("stream_id", "")
    res = cloud_stream_engine.delete_stream(user["username"], stream_id)
    return jsonify(res)

@cloud_stream_bp.route('/api/cloud-streams/start', methods=['POST'])
@login_required
def start_stream(user):
    data = request.json or {}
    stream_id = data.get("stream_id", "")
    res = cloud_stream_engine.start_stream(user["username"], stream_id)
    return jsonify(res)

@cloud_stream_bp.route('/api/cloud-streams/stop', methods=['POST'])
@login_required
def stop_stream(user):
    data = request.json or {}
    stream_id = data.get("stream_id", "")
    res = cloud_stream_engine.stop_stream(user["username"], stream_id)
    return jsonify(res)

@cloud_stream_bp.route('/api/cloud-streams/logs/<stream_id>', methods=['GET'])
@login_required
def get_logs(user, stream_id):
    res = cloud_stream_engine.get_stream_logs(user["username"], stream_id)
    return jsonify(res)
