from flask import Blueprint, request, jsonify
from web.routes.auth_routes import login_required, admin_required
from core.api_key_manager import api_key_manager
from core.content_studio_engine import content_studio_engine

content_studio_bp = Blueprint('content_studio', __name__)

@content_studio_bp.route('/api/content-studio/voices', methods=['GET'])
@login_required
def get_voices(user):
    voices = content_studio_engine.get_voices()
    return jsonify({"success": True, "voices": voices})

@content_studio_bp.route('/api/content-studio/avatars', methods=['GET'])
@login_required
def get_avatars(user):
    avatars = content_studio_engine.get_avatars()
    return jsonify({"success": True, "avatars": avatars})

@content_studio_bp.route('/api/content-studio/credits', methods=['GET'])
@login_required
def get_user_credits(user):
    api_key = user.get("key")
    credits = api_key_manager.get_credits(api_key)
    return jsonify({
        "success": True,
        "credits": credits,
        "role": user.get("role", "client"),
        "pricing": {
            "voice_credits": content_studio_engine.settings.get("cost_per_voice_gen", 2),
            "video_credits": content_studio_engine.settings.get("cost_per_video_gen", 10)
        }
    })

@content_studio_bp.route('/api/content-studio/generate', methods=['POST'])
@login_required
def generate_video(user):
    data = request.json or {}
    script = data.get("script", "").strip()
    title = data.get("title", "").strip() or "Video MC Bán Hàng"
    voice_id = data.get("voice_id", "21m00Tcm4TlvDq8ikWAM")
    avatar_id = data.get("avatar_id", "Daisy-inskirt-20220818")
    aspect_ratio = data.get("aspect_ratio", "9:16")

    if not script:
        return jsonify({"success": False, "message": "Vui lòng nhập kịch bản cần nói!"}), 400

    api_key = user.get("key")
    cost = content_studio_engine.settings.get("cost_per_video_gen", 10)

    # Trừ Credits của người dùng (nếu là Client)
    deduct_res = api_key_manager.deduct_credits(api_key, cost, reason=f"Tạo Video AI: {title}")
    if not deduct_res.get("success"):
        return jsonify(deduct_res), 402

    user_id = user.get("id") or user.get("key")
    task = content_studio_engine.create_video_task(
        user_id=user_id,
        title=title,
        script=script,
        voice_id=voice_id,
        avatar_id=avatar_id,
        aspect_ratio=aspect_ratio
    )

    return jsonify({
        "success": True,
        "message": f"Đã khởi tạo tác vụ render video thành công! (-{cost} Credits)",
        "task": task,
        "remaining_credits": deduct_res.get("remaining")
    })

@content_studio_bp.route('/api/content-studio/tasks', methods=['GET'])
@login_required
def list_tasks(user):
    user_id = user.get("id") or user.get("key")
    tasks = content_studio_engine.list_user_tasks(user_id)
    return jsonify({"success": True, "tasks": tasks})

@content_studio_bp.route('/api/content-studio/task/<task_id>', methods=['GET'])
@login_required
def get_task_status(user, task_id):
    task = content_studio_engine.get_task(task_id)
    if not task:
        return jsonify({"success": False, "message": "Không tìm thấy tác vụ này"}), 404
    return jsonify({"success": True, "task": task})

@content_studio_bp.route('/api/content-studio/push-obs', methods=['POST'])
@login_required
def push_to_obs(user):
    data = request.json or {}
    video_filename = data.get("video_filename", "")
    scene_name = data.get("scene_name", None)
    source_name = data.get("source_name", "MC_AI_Live")

    if not video_filename:
        return jsonify({"success": False, "message": "Thiếu tên file video"}), 400

    user_id = user.get("id") or user.get("key")
    res = content_studio_engine.push_video_to_obs(user_id, video_filename, scene_name, source_name)
    return jsonify(res)

@content_studio_bp.route('/api/content-studio/admin/topup', methods=['POST'])
@admin_required
def admin_topup_credits(user):
    data = request.json or {}
    target_key = data.get("api_key", "").strip()
    target_user_id = data.get("user_id", "").strip()
    amount = data.get("amount", 0)

    try:
        amount = int(amount)
    except Exception:
        return jsonify({"success": False, "message": "Số lượng Credits phải là số nguyên!"}), 400

    if not target_key and target_user_id:
        for k, info in api_key_manager.keys.items():
            if info.get("id") == target_user_id or info.get("name") == target_user_id:
                target_key = k
                break

    if not target_key or amount <= 0:
        return jsonify({"success": False, "message": "Vui lòng chọn API Key và nhập số lượng Credits hợp lệ (> 0)"}), 400

    res = api_key_manager.add_credits(target_key, amount)
    return jsonify(res)

@content_studio_bp.route('/api/content-studio/admin/config', methods=['GET', 'POST'])
@admin_required
def admin_ai_config(user):
    if request.method == 'GET':
        keys = content_studio_engine.get_api_keys()
        def mask(k):
            return f"{k[:4]}...{k[-4:]}" if k and len(k) > 8 else ("(Chưa cấu hình)" if not k else "***")

        return jsonify({
            "success": True,
            "has_elevenlabs": bool(keys.get("elevenlabs")),
            "has_heygen": bool(keys.get("heygen")),
            "elevenlabs_masked": mask(keys.get("elevenlabs")),
            "heygen_masked": mask(keys.get("heygen")),
            "cost_per_voice": content_studio_engine.settings.get("cost_per_voice_gen", 2),
            "cost_per_video": content_studio_engine.settings.get("cost_per_video_gen", 10)
        })

    data = request.json or {}
    el_key = data.get("elevenlabs_api_key")
    hg_key = data.get("heygen_api_key")
    if el_key is not None or hg_key is not None:
        content_studio_engine.set_api_keys(el_key, hg_key)

    if "cost_per_video" in data:
        content_studio_engine.settings["cost_per_video_gen"] = max(1, int(data["cost_per_video"]))
    if "cost_per_voice" in data:
        content_studio_engine.settings["cost_per_voice_gen"] = max(1, int(data["cost_per_voice"]))
    content_studio_engine.save_settings()

    return jsonify({"success": True, "message": "Đã cập nhật cấu hình Content Studio AI thành công!"})
