/**
 * NEXT LIVE AUTOMATION v4 - CLOUD BROADCAST SAAS CONTROLLER
 * API-Key Powered Authentication, Multi-tenant Isolation, FFmpeg Direct Engine & Admin Portal
 */

let currentUser = null;
let cloudStreamsList = [];
let cloudMediaList = [];
let cloudStreamsPollInterval = null;
let streamLogsPollInterval = null;
let currentViewingStreamId = null;

// --- AUTHENTICATION & SESSION BẰNG API KEY ---

function getAuthHeaders() {
    const key = localStorage.getItem('hlc_api_key') || localStorage.getItem('hlc_cloud_key') || '';
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'X-API-Key': key
    };
}

async function checkAuthSession() {
    const key = localStorage.getItem('hlc_api_key') || localStorage.getItem('hlc_cloud_key');
    if (!key) {
        showAuthModal();
        return;
    }

    try {
        const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.user) {
            currentUser = data.user;
            onLoginSuccess();
        } else {
            showAuthModal();
        }
    } catch (e) {
        console.error("Auth check failed:", e);
        showAuthModal();
    }
}

function showAuthModal() {
    const authEl = document.getElementById('auth');
    if (authEl) authEl.classList.remove('hidden');
    const userPill = document.getElementById('v4-user-pill');
    if (userPill) userPill.classList.add('hidden');
    if (cloudStreamsPollInterval) clearInterval(cloudStreamsPollInterval);
}

function hideAuthModal() {
    const authEl = document.getElementById('auth');
    if (authEl) authEl.classList.add('hidden');
    const userPill = document.getElementById('v4-user-pill');
    if (userPill) userPill.classList.remove('hidden');
}

function onLoginSuccess() {
    hideAuthModal();
    updateUserHeaderUI();

    // Hiển thị tab Admin nếu là Admin API Key
    const adminTabBtn = document.getElementById('v4-tab-btn-admin');
    if (adminTabBtn) {
        if (currentUser.role === 'admin') {
            adminTabBtn.classList.remove('hidden');
            adminTabBtn.classList.add('flex');
        } else {
            adminTabBtn.classList.add('hidden');
            adminTabBtn.classList.remove('flex');
        }
    }

    // Tự động load dữ liệu cho tab mặc định
    switchV4Tab('cloud-streams');

    // Polling cập nhật luồng live mỗi 4s
    if (cloudStreamsPollInterval) clearInterval(cloudStreamsPollInterval);
    cloudStreamsPollInterval = setInterval(() => {
        const panelStreams = document.getElementById('panel-cloud-streams');
        if (panelStreams && !panelStreams.classList.contains('hidden')) {
            loadCloudStreams(false);
        }
    }, 4000);
}

function updateUserHeaderUI() {
    if (!currentUser) return;
    const nameEl = document.getElementById('v4-user-name');
    const roleEl = document.getElementById('v4-user-role-badge');
    const streamsEl = document.getElementById('v4-quota-streams');
    const diskEl = document.getElementById('v4-quota-disk');

    if (nameEl) nameEl.innerText = currentUser.name || currentUser.id;
    if (roleEl) {
        roleEl.innerText = currentUser.role.toUpperCase();
        if (currentUser.role === 'admin') {
            roleEl.className = "text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40";
        } else {
            roleEl.className = "text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40";
        }
    }
    if (streamsEl) streamsEl.innerText = `${currentUser.active_streams || 0}/${currentUser.max_streams || 1}`;
    if (diskEl) diskEl.innerText = `${(currentUser.disk_usage_mb || 0).toLocaleString()} MB / ${(currentUser.disk_quota_mb || 10240).toLocaleString()} MB`;
}

// Hàm xác thực bằng Cloud API Key (Duy nhất 1 ô nhập)
async function validateCloudKey() {
    const keyInput = document.getElementById('key-input');
    const errEl = document.getElementById('error-msg');
    const apiKey = keyInput ? keyInput.value.trim() : '';

    if (!apiKey) {
        if (errEl) {
            errEl.innerText = "Vui lòng nhập Cloud API Key!";
            errEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey })
        });
        const data = await res.json();
        if (data.success && data.user) {
            localStorage.setItem('hlc_api_key', apiKey);
            localStorage.setItem('hlc_cloud_key', apiKey);
            currentUser = data.user;
            if (errEl) errEl.classList.add('hidden');
            onLoginSuccess();
        } else {
            if (errEl) {
                errEl.innerText = data.message || "API Key không hợp lệ!";
                errEl.classList.remove('hidden');
            }
        }
    } catch (e) {
        if (errEl) {
            errEl.innerText = "Lỗi kết nối máy chủ: " + e.message;
            errEl.classList.remove('hidden');
        }
    }
}

async function logoutV4() {
    if (!confirm("Bạn có chắc chắn muốn ngắt kết nối API Key này?")) return;
    try {
        await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() });
    } catch (e) {}
    localStorage.removeItem('hlc_api_key');
    localStorage.removeItem('hlc_cloud_key');
    currentUser = null;
    showAuthModal();
}


// --- TAB SWITCHING ---

function switchV4Tab(tabId) {
    const panels = document.querySelectorAll('.v4-panel');
    panels.forEach(p => p.classList.add('hidden'));

    const targetPanel = document.getElementById(`panel-${tabId}`);
    if (targetPanel) targetPanel.classList.remove('hidden');

    const tabBtns = [
        { id: 'v4-tab-btn-streams', tab: 'cloud-streams', activeClass: 'bg-sky-600/20 text-sky-300 border-sky-500/40' },
        { id: 'v4-tab-btn-media', tab: 'cloud-media', activeClass: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40' },
        { id: 'v4-tab-btn-processor', tab: 'processor-studio', activeClass: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40' },
        { id: 'v4-tab-btn-admin', tab: 'admin-panel', activeClass: 'bg-purple-600/20 text-purple-300 border-purple-500/40' }
    ];

    tabBtns.forEach(btnInfo => {
        const el = document.getElementById(btnInfo.id);
        if (!el) return;
        if (btnInfo.tab === tabId) {
            el.className = `px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all cursor-pointer whitespace-nowrap shadow-lg ${btnInfo.activeClass}`;
        } else {
            el.className = `px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 border bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer whitespace-nowrap`;
        }
    });

    if (tabId === 'cloud-streams') {
        loadCloudStreams(true);
    } else if (tabId === 'cloud-media') {
        loadCloudMedia();
    } else if (tabId === 'admin-panel') {
        loadAdminPanel();
    }
}


// --- TAB 1: CLOUD STREAMS CONTROLLER ---

async function loadCloudStreams(showLoading = false) {
    const container = document.getElementById('cloud-streams-list');
    if (!container) return;

    if (showLoading && container.innerHTML.trim() === '') {
        container.innerHTML = `<div class="text-slate-500 text-xs italic py-8 text-center">Đang tải danh sách luồng phát sóng...</div>`;
    }

    try {
        const res = await fetch('/api/cloud-streams', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            cloudStreamsList = data.streams || [];
            
            const badge = document.getElementById('v4-active-streams-badge');
            if (badge) badge.innerText = data.active_count || 0;

            const quotaStreams = document.getElementById('v4-quota-streams');
            if (quotaStreams && currentUser) {
                quotaStreams.innerText = `${data.active_count || 0}/${data.max_streams || currentUser.max_streams || 1}`;
            }

            renderCloudStreams(cloudStreamsList);
        }
    } catch (e) {
        console.error("Load cloud streams error:", e);
    }
}

function renderCloudStreams(streams) {
    const container = document.getElementById('cloud-streams-list');
    if (!container) return;

    if (!streams || streams.length === 0) {
        container.innerHTML = `
            <div class="glass p-10 rounded-2xl text-center border border-dashed border-slate-700/80 space-y-3">
                <div class="text-4xl">📡</div>
                <h4 class="text-base font-bold text-slate-200">Chưa có luồng phát sóng nào</h4>
                <p class="text-xs text-slate-400 max-w-md mx-auto">Bạn có thể tạo luồng phát mới, chọn video từ kho Cloud và điền Stream Key để phát 24/7 trực tiếp từ Data Center.</p>
                <button onclick="openNewStreamModal()" class="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-600/30 uppercase tracking-wider transition-all cursor-pointer">
                    ➕ Khởi Tạo Luồng Live Đầu Tiên
                </button>
            </div>
        `;
        return;
    }

    let html = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;

    streams.forEach(s => {
        const isRunning = s.status === 'running';
        const isStarting = s.status === 'starting';
        const isError = s.status === 'error';

        let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-slate-400 border border-slate-700">🔴 ĐÃ DỪNG</span>`;
        let cardBorder = "border-slate-800";
        if (isRunning) {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>🟢 ĐANG PHÁT LIVE</span>`;
            cardBorder = "border-emerald-500/50 shadow-emerald-950/20";
        } else if (isStarting) {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-950/80 text-amber-400 border border-amber-500/50">🟡 ĐANG KẾT NỐI...</span>`;
            cardBorder = "border-amber-500/40";
        } else if (isError) {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-950/80 text-rose-400 border border-rose-500/50">⚠️ LỖI KẾT NỐI</span>`;
            cardBorder = "border-rose-500/40";
        }

        const uptimeStr = s.uptime_sec ? formatUptime(s.uptime_sec) : "--:--:--";
        const modeBadge = s.mode === 'direct' 
            ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-400 border border-sky-800 font-mono" title="Stream Copy - Tiết kiệm CPU">⚡ 1% CPU (Direct)</span>`
            : `<span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-400 border border-purple-800 font-mono">⚙️ Transcode x264</span>`;

        html += `
            <div class="glass p-5 rounded-2xl border ${cardBorder} shadow-xl flex flex-col justify-between space-y-4">
                <div class="space-y-2.5">
                    <div class="flex justify-between items-start gap-2">
                        <div>
                            <h4 class="font-bold text-white text-sm flex items-center gap-2">
                                <span>${s.title}</span>
                                ${modeBadge}
                            </h4>
                            <span class="text-[11px] text-slate-400 font-mono">ID: ${s.stream_id}</span>
                        </div>
                        <div>${statusBadge}</div>
                    </div>

                    <div class="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs font-mono">
                        <div class="flex justify-between text-slate-400">
                            <span>🎬 Video loop:</span>
                            <span class="text-slate-200 truncate max-w-[200px]" title="${s.input_file}">${s.input_file}</span>
                        </div>
                        <div class="flex justify-between text-slate-400">
                            <span>🌐 Nền tảng:</span>
                            <span class="text-sky-400 truncate max-w-[200px]" title="${s.rtmp_url}">${s.rtmp_url}</span>
                        </div>
                        <div class="flex justify-between text-slate-400">
                            <span>🔑 Key:</span>
                            <span class="text-slate-300 font-bold">${s.stream_key_masked}</span>
                        </div>
                        <div class="flex justify-between text-slate-400 pt-1 border-t border-slate-800/80">
                            <span>⏱️ Thời gian live:</span>
                            <span class="text-amber-400 font-bold">${uptimeStr}</span>
                        </div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                    <div class="flex items-center gap-1.5">
                        <button onclick="openStreamLogsModal('${s.stream_id}', '${s.title}')" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer" title="Xem nhật ký kết nối">
                            <span>📜 Logs</span>
                        </button>
                        <button onclick="deleteCloudStream('${s.stream_id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-all cursor-pointer" title="Xóa luồng">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>

                    <div>
                        ${isRunning ? `
                            <button onclick="stopCloudStream('${s.stream_id}')" class="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer">
                                <span>⏹ Dừng Live</span>
                            </button>
                        ` : `
                            <button onclick="startCloudStream('${s.stream_id}')" class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer">
                                <span>▶️ Bắt Đầu Live</span>
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function startCloudStream(streamId) {
    try {
        const res = await fetch('/api/cloud-streams/start', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ stream_id: streamId })
        });
        const data = await res.json();
        if (data.success) {
            loadCloudStreams(false);
        } else {
            alert(data.message || "Không thể bắt đầu luồng live");
        }
    } catch (e) {
        alert("Lỗi mạng: " + e.message);
    }
}

async function stopCloudStream(streamId) {
    if (!confirm("Bạn có chắc chắn muốn DỪNG phát sóng luồng live này?")) return;
    try {
        const res = await fetch('/api/cloud-streams/stop', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ stream_id: streamId })
        });
        const data = await res.json();
        if (data.success) {
            loadCloudStreams(false);
        } else {
            alert(data.message || "Không thể dừng luồng live");
        }
    } catch (e) {
        alert("Lỗi mạng: " + e.message);
    }
}

async function deleteCloudStream(streamId) {
    if (!confirm("Bạn có chắc chắn muốn xóa cấu hình luồng live này?")) return;
    try {
        const res = await fetch('/api/cloud-streams/delete', {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ stream_id: streamId })
        });
        const data = await res.json();
        if (data.success) {
            loadCloudStreams(false);
        } else {
            alert(data.message || "Không thể xóa luồng");
        }
    } catch (e) {
        alert("Lỗi mạng: " + e.message);
    }
}


// --- MODAL: KHỞI TẠO LUỒNG LIVE MỚI ---

async function openNewStreamModal(preselectedVideo = "") {
    const modal = document.getElementById('modal-new-stream');
    if (!modal) return;

    const videoSelect = document.getElementById('new-stream-video');
    if (videoSelect) {
        videoSelect.innerHTML = `<option value="">-- Đang nạp danh sách video từ Cloud... --</option>`;
        try {
            const res = await fetch('/api/media/list', { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success && data.files) {
                cloudMediaList = data.files;
                if (cloudMediaList.length === 0) {
                    videoSelect.innerHTML = `<option value="">⚠️ Chưa có video nào! Vui lòng vào Tab 'Kho Video Cloud' tải lên trước.</option>`;
                } else {
                    let optHtml = `<option value="">-- Chọn video phát sóng --</option>`;
                    cloudMediaList.forEach(v => {
                        const isSel = (v.filename === preselectedVideo) ? 'selected' : '';
                        optHtml += `<option value="${v.filename}" ${isSel}>${v.filename} (${v.size_mb} MB)</option>`;
                    });
                    videoSelect.innerHTML = optHtml;
                }
            }
        } catch (e) {
            videoSelect.innerHTML = `<option value="">Lỗi tải video</option>`;
        }
    }

    modal.classList.remove('hidden');
}

function closeNewStreamModal() {
    const modal = document.getElementById('modal-new-stream');
    if (modal) modal.classList.add('hidden');
}

function setCloudStreamPreset(platform) {
    const urlInput = document.getElementById('new-stream-rtmp');
    if (!urlInput) return;
    if (platform === 'tiktok') {
        urlInput.value = "rtmp://live-push.tiktok.com/live/";
    } else if (platform === 'shopee') {
        urlInput.value = "rtmp://live.shopee.vn/live/";
    } else if (platform === 'facebook') {
        urlInput.value = "rtmps://live-api-s.facebook.com:443/rtmp/";
    } else if (platform === 'youtube') {
        urlInput.value = "rtmp://a.rtmp.youtube.com/live2";
    }
}

async function submitCreateNewStream() {
    const title = document.getElementById('new-stream-title').value.trim();
    const video = document.getElementById('new-stream-video').value;
    const rtmp = document.getElementById('new-stream-rtmp').value.trim();
    const key = document.getElementById('new-stream-key').value.trim();
    const mode = document.getElementById('new-stream-mode').value;
    const autoStart = document.getElementById('new-stream-autostart').checked;

    if (!video) {
        alert("Vui lòng chọn video nguồn phát!");
        return;
    }
    if (!rtmp) {
        alert("Vui lòng nhập RTMP URL!");
        return;
    }

    try {
        const res = await fetch('/api/cloud-streams/save', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                title: title || `Luồng ${video}`,
                video_filename: video,
                rtmp_url: rtmp,
                stream_key: key,
                mode: mode
            })
        });
        const data = await res.json();
        if (data.success) {
            closeNewStreamModal();
            loadCloudStreams(false);
            if (autoStart && data.stream) {
                startCloudStream(data.stream.stream_id);
            }
        } else {
            alert(data.message || "Lỗi lưu luồng phát sóng");
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}


// --- MODAL: XEM LOGS LUỒNG REALTIME ---

function openStreamLogsModal(streamId, title) {
    currentViewingStreamId = streamId;
    const modal = document.getElementById('modal-stream-logs');
    const titleEl = document.getElementById('stream-logs-title');
    if (titleEl) titleEl.innerText = `Nhật Ký Luồng: ${title} (${streamId})`;

    if (modal) modal.classList.remove('hidden');

    fetchStreamLogs();
    if (streamLogsPollInterval) clearInterval(streamLogsPollInterval);
    streamLogsPollInterval = setInterval(fetchStreamLogs, 2000);
}

function closeStreamLogsModal() {
    const modal = document.getElementById('modal-stream-logs');
    if (modal) modal.classList.add('hidden');
    if (streamLogsPollInterval) clearInterval(streamLogsPollInterval);
    currentViewingStreamId = null;
}

async function fetchStreamLogs() {
    if (!currentViewingStreamId) return;
    const box = document.getElementById('stream-logs-box');
    if (!box) return;

    try {
        const res = await fetch(`/api/cloud-streams/logs/${currentViewingStreamId}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.logs) {
            if (data.logs.length === 0) {
                box.innerHTML = `<span class="text-slate-600 italic">Chưa có bản ghi nhật ký...</span>`;
            } else {
                box.innerHTML = data.logs.map(l => `<div>${escapeHtml(l)}</div>`).join('');
                box.scrollTop = box.scrollHeight;
            }
        }
    } catch (e) {}
}


// --- TAB 2: KHO VIDEO CLOUD (MEDIA MANAGER) ---

async function loadCloudMedia() {
    const listEl = document.getElementById('cloud-media-list');
    const quotaBar = document.getElementById('media-quota-bar');
    const quotaText = document.getElementById('media-quota-text');

    if (!listEl) return;
    listEl.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-500 text-xs italic">Đang tải kho video từ Cloud...</td></tr>`;

    try {
        const res = await fetch('/api/media/list', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            cloudMediaList = data.files || [];
            
            if (quotaBar) quotaBar.style.width = `${Math.min(100, data.percent || 0)}%`;
            if (quotaText) {
                quotaText.innerText = `${(data.usage_mb || 0).toLocaleString()} MB / ${(data.quota_mb || 10240).toLocaleString()} MB (${data.percent || 0}%)`;
            }

            renderCloudMedia(cloudMediaList);
        }
    } catch (e) {
        listEl.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-rose-400 text-xs">Lỗi kết nối tải video: ${e.message}</td></tr>`;
    }
}

function renderCloudMedia(files) {
    const listEl = document.getElementById('cloud-media-list');
    if (!listEl) return;

    if (!files || files.length === 0) {
        listEl.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center text-slate-400 text-xs space-y-2">
                    <div class="text-3xl">📁</div>
                    <div class="font-bold text-slate-300">Kho video của bạn đang trống</div>
                    <p class="text-slate-500">Kéo thả video vào vùng tải lên phía trên để lưu trữ trên Cloud.</p>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    files.forEach(f => {
        html += `
            <tr class="border-b border-slate-800/80 hover:bg-slate-900/40 transition-all text-xs">
                <td class="py-3 px-4 font-mono font-semibold text-slate-200 flex items-center gap-2">
                    <span class="text-base">🎬</span>
                    <span class="truncate max-w-[280px]" title="${f.filename}">${f.filename}</span>
                </td>
                <td class="py-3 px-4 font-mono text-sky-400 font-bold">${f.size_mb.toLocaleString()} MB</td>
                <td class="py-3 px-4 font-mono text-slate-400 uppercase text-[11px]">${f.ext}</td>
                <td class="py-3 px-4 text-slate-400 text-[11px]">${f.modified_at}</td>
                <td class="py-3 px-4 text-right space-x-2">
                    <button onclick="quickStreamWithVideo('${f.filename}')" class="px-2.5 py-1 rounded-lg bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 text-[11px] font-bold transition-all cursor-pointer" title="Tạo luồng live với video này">
                        🚀 Phát Live
                    </button>
                    <button onclick="deleteCloudMedia('${f.filename}')" class="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-[11px] font-bold transition-all cursor-pointer" title="Xóa video khỏi Cloud">
                        🗑️ Xóa
                    </button>
                </td>
            </tr>
        `;
    });

    listEl.innerHTML = html;
}

function handleMediaUpload(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const allowed = ['.mp4', '.mkv', '.flv', '.mov', '.ts'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowed.includes(ext)) {
        alert("Chỉ hỗ trợ file video định dạng MP4, MKV, FLV, MOV, TS!");
        return;
    }

    const progressBox = document.getElementById('upload-progress-box');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');

    if (progressBox) progressBox.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload', true);
    
    const key = localStorage.getItem('hlc_api_key') || localStorage.getItem('hlc_cloud_key');
    if (key) {
        xhr.setRequestHeader('Authorization', `Bearer ${key}`);
        xhr.setRequestHeader('X-API-Key', key);
    }

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressText) progressText.innerText = `Đang tải lên: ${percent}% (${(e.loaded/(1024*1024)).toFixed(1)}MB / ${(e.total/(1024*1024)).toFixed(1)}MB)`;
        }
    };

    xhr.onload = function() {
        if (progressBox) progressBox.classList.add('hidden');
        try {
            const res = JSON.parse(xhr.responseText);
            if (res.success) {
                alert(`✅ Đã tải lên thành công: ${res.filename} (${res.size_mb} MB)`);
                loadCloudMedia();
            } else {
                alert(`❌ Lỗi: ${res.message}`);
            }
        } catch(e) {
            alert("Lỗi tải lên: " + xhr.responseText);
        }
    };

    xhr.onerror = function() {
        if (progressBox) progressBox.classList.add('hidden');
        alert("Lỗi mạng khi tải file lên server!");
    };

    xhr.send(formData);
}

async function deleteCloudMedia(filename) {
    if (!confirm(`Bạn có chắc chắn muốn XÓA video "${filename}" khỏi kho Cloud?`)) return;
    try {
        const res = await fetch('/api/media/delete', {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ filename })
        });
        const data = await res.json();
        if (data.success) {
            loadCloudMedia();
        } else {
            alert(data.message || "Không thể xóa video");
        }
    } catch (e) {
        alert("Lỗi mạng: " + e.message);
    }
}

function quickStreamWithVideo(filename) {
    switchV4Tab('cloud-streams');
    openNewStreamModal(filename);
}


// --- TAB 4: QUẢN TRỊ HỆ THỐNG & API KEYS (ADMIN PORTAL) ---

async function loadAdminPanel() {
    if (!currentUser || currentUser.role !== 'admin') return;

    try {
        // 1. Thống kê hệ thống
        const sysRes = await fetch('/api/admin/system', { headers: getAuthHeaders() });
        const sysData = await sysRes.json();
        if (sysData.success && sysData.system) {
            const sys = sysData.system;
            const cpuEl = document.getElementById('admin-cpu-val');
            const ramEl = document.getElementById('admin-ram-val');
            const diskEl = document.getElementById('admin-disk-val');
            const uptimeEl = document.getElementById('admin-uptime-val');

            if (cpuEl) cpuEl.innerText = `${sys.cpu_percent || 0}%`;
            if (ramEl) ramEl.innerText = `${sys.memory.used_gb}G / ${sys.memory.total_gb}G (${sys.memory.percent}%)`;
            if (diskEl) diskEl.innerText = `${sys.disk.used_gb}G / ${sys.disk.total_gb}G (${sys.disk.percent}%)`;
            if (uptimeEl) uptimeEl.innerText = sys.uptime || "N/A";

            renderAdminGlobalStreams(sysData.all_streams || []);
        }

        // 2. Danh sách API Keys của khách hàng
        const keysRes = await fetch('/api/admin/keys', { headers: getAuthHeaders() });
        const keysData = await keysRes.json();
        if (keysData.success && keysData.keys) {
            renderAdminKeysTable(keysData.keys);
        }
    } catch (e) {
        console.error("Admin load error:", e);
    }
}

function renderAdminKeysTable(keys) {
    const tableBody = document.getElementById('admin-keys-table');
    if (!tableBody) return;

    let html = '';
    keys.forEach(k => {
        const isAdmin = k.role === 'admin';
        const roleTag = isAdmin 
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">ADMIN MASTER</span>`
            : `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">CLIENT API</span>`;

        html += `
            <tr class="border-b border-slate-800/80 hover:bg-slate-900/40 transition-all text-xs">
                <td class="py-3 px-4 font-mono font-bold text-white flex items-center gap-2">
                    <span class="truncate max-w-[200px]" title="${k.key}">${k.key}</span>
                    <button onclick="copyToClipboard('${k.key}')" class="p-1 rounded bg-slate-800 hover:text-sky-300 text-slate-400 cursor-pointer" title="Sao chép API Key">
                        📋
                    </button>
                </td>
                <td class="py-3 px-4 text-slate-200 font-semibold">${k.name}</td>
                <td class="py-3 px-4">${roleTag}</td>
                <td class="py-3 px-4 font-mono font-bold text-sky-400">${k.active_streams || 0} / ${k.max_streams}</td>
                <td class="py-3 px-4 font-mono text-slate-300">${(k.disk_usage_mb || 0).toLocaleString()} MB / ${(k.disk_quota_mb || 0).toLocaleString()} MB</td>
                <td class="py-3 px-4">
                    <span class="text-[10px] font-bold ${k.status === 'active' ? 'text-emerald-400' : 'text-rose-400'} uppercase">
                        ${k.status === 'active' ? '● Hoạt động' : '○ Bị khóa'}
                    </span>
                </td>
                <td class="py-3 px-4 text-right space-x-2">
                    ${!isAdmin ? `
                        <button onclick="adminToggleKeyStatus('${k.key}', '${k.status}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-all cursor-pointer">
                            ${k.status === 'active' ? 'Khóa' : 'Mở'}
                        </button>
                        <button onclick="adminDeleteKey('${k.key}')" class="px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-[11px] font-bold transition-all cursor-pointer">
                            Xóa
                        </button>
                    ` : `<span class="text-slate-600 italic text-[11px]">Master Key</span>`}
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
}

function renderAdminGlobalStreams(streams) {
    const container = document.getElementById('admin-global-streams-list');
    if (!container) return;

    if (!streams || streams.length === 0) {
        container.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-500 text-xs italic">Hiện không có luồng nào đang phát trên toàn server.</td></tr>`;
        return;
    }

    let html = '';
    streams.forEach(s => {
        html += `
            <tr class="border-b border-slate-800 text-xs">
                <td class="py-2.5 px-3 font-mono font-bold text-sky-400">${s.username}</td>
                <td class="py-2.5 px-3 text-slate-200 font-semibold">${s.title}</td>
                <td class="py-2.5 px-3 font-mono text-slate-400 truncate max-w-[150px]">${s.input_file}</td>
                <td class="py-2.5 px-3">
                    <span class="text-[10px] font-mono font-bold ${s.status === 'running' ? 'text-emerald-400' : 'text-slate-500'}">
                        ${s.status.toUpperCase()}
                    </span>
                </td>
                <td class="py-2.5 px-3 font-mono text-amber-400">${s.uptime_sec ? formatUptime(s.uptime_sec) : '--'}</td>
                <td class="py-2.5 px-3 text-right">
                    ${s.status === 'running' ? `
                        <button onclick="adminKillStream('${s.stream_id}')" class="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] cursor-pointer">
                            Dừng Khẩn Cấp
                        </button>
                    ` : '--'}
                </td>
            </tr>
        `;
    });

    container.innerHTML = html;
}

function openNewKeyModal() {
    const modal = document.getElementById('modal-new-key');
    if (modal) modal.classList.remove('hidden');
}

function closeNewKeyModal() {
    const modal = document.getElementById('modal-new-key');
    if (modal) modal.classList.add('hidden');
}

async function submitCreateApiKey() {
    const name = document.getElementById('nk-name').value.trim();
    const customKey = document.getElementById('nk-custom-key').value.trim();
    const maxStreams = parseInt(document.getElementById('nk-streams').value) || 2;
    const diskMb = parseInt(document.getElementById('nk-disk').value) || 10240;

    if (!name) {
        alert("Vui lòng nhập Tên khách hàng / Tên Shop!");
        return;
    }

    try {
        const res = await fetch('/api/admin/keys', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                name,
                custom_key: customKey,
                max_streams: maxStreams,
                disk_quota_mb: diskMb
            })
        });
        const data = await res.json();
        if (data.success && data.key_data) {
            closeNewKeyModal();
            loadAdminPanel();
            const createdKey = data.key_data.key;
            alert(`🎉 CẤP API KEY THÀNH CÔNG!\n\nKhách hàng: ${name}\nMã API Key: ${createdKey}\n\n👉 Bạn hãy copy API Key này gửi cho khách hàng đăng nhập.`);
        } else {
            alert(data.message || "Không thể cấp API Key");
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

async function adminToggleKeyStatus(key, currentStatus) {
    const newStatus = (currentStatus === 'active') ? 'disabled' : 'active';
    try {
        const res = await fetch(`/api/admin/keys/${encodeURIComponent(key)}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            loadAdminPanel();
        } else {
            alert(data.message || "Lỗi cập nhật trạng thái");
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

async function adminDeleteKey(key) {
    if (!confirm(`XÁC NHẬN: Bạn có chắc chắn muốn xóa vĩnh viễn API Key "${key}"?`)) return;
    try {
        const res = await fetch(`/api/admin/keys/${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            loadAdminPanel();
        } else {
            alert(data.message || "Lỗi xóa API Key");
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

async function adminKillStream(streamId) {
    if (!confirm(`Xác nhận dừng khẩn cấp luồng "${streamId}"?`)) return;
    try {
        const res = await fetch('/api/admin/kill-stream', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ stream_id: streamId })
        });
        const data = await res.json();
        if (data.success) {
            loadAdminPanel();
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert("✅ Đã sao chép API Key vào Clipboard:\n" + text);
    }).catch(() => {
        prompt("Sao chép API Key:", text);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// Bắt đầu khởi tạo khi DOM sẵn sàng
window.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();
});
