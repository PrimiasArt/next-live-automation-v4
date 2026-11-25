import os
import re
import signal
from flask import Blueprint, request, jsonify
from web.routes.auth_routes import login_required, admin_required
from core.state import state
from core.obs_engine import engine

live_bp = Blueprint('live', __name__)

@live_bp.route('/api/state', methods=['GET'])
@login_required
def get_state(user):
    return jsonify(state.to_dict())

@live_bp.route('/api/order', methods=['POST'])
@login_required
def order_video(user):
    data = request.get_json(silent=True) or {}
    video_name = data.get('video_name')
    is_ft = bool(data.get('ft', False))

    if not state.current_profile:
        return jsonify({"success": False, "message": "Hệ thống đang ở chế độ chờ (Chưa chọn Scene)"}), 400
    
    # Hỗ trợ cả trường hợp gửi số thứ tự val (1-indexed) để tương thích ngược
    raw_val = data.get('val')
    if not video_name and raw_val is not None:
        try:
            idx = int(raw_val) - 1
            videos = state.current_profile.get("videos", [])
            if 0 <= idx < len(videos):
                video_name = videos[idx]["name"]
        except Exception:
            pass

    if not video_name:
        return jsonify({"success": False, "message": "Tên video không hợp lệ"}), 400

    # Kiểm tra xem video_name có trong profile hiện tại không
    current_videos = [v["name"] for v in state.current_profile.get("videos", [])]
    if video_name not in current_videos:
        return jsonify({"success": False, "message": f"Video '{video_name}' không tồn tại trong Brand hiện tại"}), 400

    state.add_task(video_name, is_fast_track=is_ft)
    return jsonify({"success": True, "target": video_name, "fast_track": is_ft})

@live_bp.route('/api/chat/webhook', methods=['POST'])
@login_required
def chat_webhook(user):
    """
    Webhook nhận bình luận từ livestream (TikTok, Shopee, FB) hoặc từ Live Chat Simulator.
    Tự động phân tích số/mã sản phẩm và kích hoạt video tương ứng!
    """
    data = request.get_json(silent=True) or {}
    comment = data.get('comment', '').strip()
    author = data.get('author', 'Khách hàng')
    mode = data.get('mode', 'queue') # 'queue' hoặc 'fast_track'
    is_ft = (mode == 'fast_track')

    if not comment:
        return jsonify({"success": False, "message": "Bình luận trống"}), 400

    if not state.is_running or not state.current_profile:
        return jsonify({"success": False, "message": "Hệ thống đang ở chế độ chờ (Standby)"}), 400

    # Regex nhận diện: 'mẫu 5', 'mã 12', 'áo 3', 'sp 8', 'số 24', '#15', 'b4', hoặc chỉ gõ số '5'
    patterns = [
        r'(?:mẫu|mau|mã|ma|áo|ao|sp|sản phẩm|san pham|số|so|b|#|base[_\s]?)\s*(\d+)',
        r'^\s*(\d+)\s*$'
    ]

    matched_num = None
    for p in patterns:
        m = re.search(p, comment, re.IGNORECASE)
        if m:
            matched_num = int(m.group(1))
            break

    if matched_num is None:
        return jsonify({"success": False, "message": "Không nhận diện được số/mã sản phẩm trong bình luận"}), 200

    videos = state.current_profile.get("videos", [])
    target_video = None

    # Tìm theo thứ tự (1-indexed) hoặc theo tên chứa số đó (ví dụ base_5wp)
    for v in videos:
        vname = v.get("name", "").lower()
        if f"base_{matched_num}" in vname or f"base{matched_num}" in vname:
            target_video = v.get("name")
            break

    if not target_video and 0 < matched_num <= len(videos):
        target_video = videos[matched_num - 1].get("name")

    if not target_video:
        return jsonify({"success": False, "message": f"Không tìm thấy video nào tương ứng với số {matched_num}"}), 200

    state.add_task(target_video, is_fast_track=is_ft)
    action_text = "⚡ FAST TRACK (Phát ngay)" if is_ft else "📥 HÀNG ĐỢI (Queue)"
    state.add_log("AUTO-PILOT", f"🤖 [{author}] \"{comment}\" -> Tự động nhận diện Mã #{matched_num} ({target_video}) -> {action_text}")

    return jsonify({
        "success": True,
        "matched_number": matched_num,
        "target": target_video,
        "fast_track": is_ft,
        "message": f"Đã tự động kích hoạt video '{target_video}'"
    })

@live_bp.route('/api/queue/remove', methods=['POST'])
@login_required
def remove_queue_item(user):
    data = request.get_json(silent=True) or {}
    index = data.get('index')
    if index is not None and state.remove_task(int(index)):
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Index hàng đợi không hợp lệ"}), 400

@live_bp.route('/api/queue/clear', methods=['POST'])
@login_required
def clear_all_queue(user):
    state.clear_queue()
    return jsonify({"success": True})

@live_bp.route('/api/obs/sources', methods=['GET'])
@live_bp.route('/api/processor/sources', methods=['GET'])
@login_required
def get_obs_sources(user):
    scene_name = request.args.get('scene')
    sources = engine.get_scene_sources(scene_name)
    return jsonify({
        "success": True,
        "sources": sources
    })

@live_bp.route('/api/obs/bulk_create', methods=['POST'])
@live_bp.route('/api/processor/bulk_create', methods=['POST'])
@login_required
def bulk_create_obs_sources(user):
    data = request.get_json(silent=True) or {}
    folder_path = data.get('folder_path', '').strip()
    source_type = data.get('source_type', 'ffmpeg_source')
    file_pattern = data.get('file_pattern', '').strip()
    name_pattern = data.get('name_pattern', '').strip()
    looping = bool(data.get('looping', True))
    visible = bool(data.get('visible', True))
    scene_name = data.get('scene_name')

    res = engine.bulk_create_sources(
        folder_path=folder_path,
        source_type=source_type,
        file_pattern=file_pattern,
        name_pattern=name_pattern,
        looping=looping,
        visible=visible,
        target_scene=scene_name
    )
    return jsonify(res)

@live_bp.route('/api/terminate', methods=['POST'])
@admin_required
def terminate(admin_user):
    state.add_log("SYSTEM", "🛑 Đã nhận lệnh TERMINATE - Đang đóng tiến trình...")
    os.kill(os.getpid(), signal.SIGTERM)
    return jsonify({"success": True})

