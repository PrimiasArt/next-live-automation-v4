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
    const adminMobileBtn = document.getElementById('v4-tab-btn-admin-mobile');
    const isAdmin = currentUser && currentUser.role === 'admin';
    if (adminTabBtn) {
        if (isAdmin) {
            adminTabBtn.classList.remove('hidden');
            adminTabBtn.classList.add('flex');
        } else {
            adminTabBtn.classList.add('hidden');
            adminTabBtn.classList.remove('flex');
        }
    }
    if (adminMobileBtn) {
        if (isAdmin) {
            adminMobileBtn.classList.remove('hidden');
        } else {
            adminMobileBtn.classList.add('hidden');
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
    const streamsEl = document.getElementById('v4-quota-streams');
    const diskEl = document.getElementById('v4-quota-disk');

    const usedMb = currentUser.disk_usage_mb || 0;
    const totalMb = currentUser.disk_quota_mb || 10240;
    const pct = Math.min(100, Math.round((usedMb / Math.max(1, totalMb)) * 100));
    const totalFormatted = totalMb >= 1024 ? (totalMb / 1024).toFixed(0) + ' GB' : totalMb + ' MB';

    if (nameEl) nameEl.innerText = currentUser.name || currentUser.id;
    if (streamsEl) streamsEl.innerText = `${currentUser.active_streams || 0}/${currentUser.max_streams || 20}`;
    if (diskEl) diskEl.innerText = `${usedMb.toLocaleString()} MB / ${totalFormatted}`;

    const heroActive = document.getElementById('v4-hero-active-streams');
    const heroMax = document.getElementById('v4-hero-max-streams');
    if (heroActive) heroActive.innerText = currentUser.active_streams || 0;
    if (heroMax) heroMax.innerText = currentUser.max_streams || 20;

    const heroDiskVal = document.getElementById('v4-hero-disk-val');
    const heroDiskPct = document.getElementById('v4-hero-disk-pct');
    const heroDiskBar = document.getElementById('v4-hero-disk-bar');
    if (heroDiskVal) heroDiskVal.innerText = `${usedMb.toLocaleString()} MB / ${totalFormatted}`;
    if (heroDiskPct) heroDiskPct.innerText = `${pct}%`;
    if (heroDiskBar) heroDiskBar.style.width = `${pct}%`;

    // Cập nhật số dư AI Credits
    const credits = (currentUser.quota_remaining !== undefined) ? currentUser.quota_remaining : 0;
    const quotaCreditsEl = document.getElementById('v4-quota-credits');
    const csHeroCreditsEl = document.getElementById('cs-hero-credits');
    const csFormBalanceEl = document.getElementById('cs-form-balance');
    if (quotaCreditsEl) quotaCreditsEl.innerText = credits.toLocaleString();
    if (csHeroCreditsEl) csHeroCreditsEl.innerText = credits.toLocaleString();
    if (csFormBalanceEl) csFormBalanceEl.innerText = credits.toLocaleString();
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
    if (!confirm("Bạn có muốn đổi mã khóa truy cập khác?")) return;
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
        { id: 'v4-tab-btn-streams', tab: 'cloud-streams', activeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-sm shadow-sky-500/20' },
        { id: 'v4-tab-btn-content-studio', tab: 'content-studio', activeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-sm shadow-purple-500/20' },
        { id: 'v4-tab-btn-media', tab: 'cloud-media', activeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20' },
        { id: 'v4-tab-btn-processor', tab: 'processor-studio', activeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/20' },
        { id: 'v4-tab-btn-admin', tab: 'admin-panel', activeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-sm shadow-purple-500/20' }
    ];

    tabBtns.forEach(btnInfo => {
        const el = document.getElementById(btnInfo.id);
        if (!el) return;
        if (btnInfo.tab === tabId) {
            el.className = `px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all cursor-pointer whitespace-nowrap ${btnInfo.activeClass}`;
        } else {
            el.className = `px-3.5 py-1.5 rounded-xl font-medium text-xs flex items-center gap-2 border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all cursor-pointer whitespace-nowrap`;
        }
    });

    if (tabId === 'cloud-streams') {
        loadCloudStreams(true);
    } else if (tabId === 'content-studio') {
        loadContentStudio();
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
                quotaStreams.innerText = `${data.active_count || 0}/${data.max_streams || currentUser.max_streams || 20}`;
            }

            const heroActive = document.getElementById('v4-hero-active-streams');
            if (heroActive) heroActive.innerText = data.active_count || 0;

            const heroMax = document.getElementById('v4-hero-max-streams');
            if (heroMax) heroMax.innerText = data.max_streams || (currentUser ? currentUser.max_streams : 20);

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
            <div class="glass p-12 rounded-3xl text-center border border-dashed border-slate-800 relative overflow-hidden group">
                <div class="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-sky-500/15 transition-all"></div>
                <div class="relative z-10 max-w-lg mx-auto space-y-4">
                    <div class="inline-flex p-4 rounded-2xl bg-gradient-to-br from-sky-500/20 to-indigo-500/10 border border-sky-500/30 text-sky-400 shadow-xl shadow-sky-500/10">
                        <svg class="w-10 h-10 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg>
                    </div>
                    <div>
                        <h4 class="text-lg font-bold text-white tracking-tight">Chưa Có Luồng Phát Sóng Nào Hoạt Động</h4>
                        <p class="text-xs text-slate-400 mt-1 leading-relaxed">
                            Khởi tạo luồng phát mới từ kho video Cloud để phát 24/7 với đường truyền 1 Gbps độc lập — máy tính tắt luồng vẫn duy trì liên tục.
                        </p>
                    </div>
                    <div class="flex flex-wrap justify-center gap-2 pt-1 text-[11px] text-slate-300">
                        <span class="px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">⚡ <b>1% CPU</b> (Direct Copy)</span>
                        <span class="px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">🔄 <b>Tự động Loop</b> 24/7</span>
                        <span class="px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">🛡️ <b>0% Gián Đoạn</b></span>
                    </div>
                    <div class="pt-2">
                        <button onclick="openNewStreamModal()" class="px-6 py-3 bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-xl shadow-sky-600/30 uppercase tracking-wider transition-all transform hover:-translate-y-0.5 cursor-pointer">
                            ➕ Khởi Tạo Luồng Live Đầu Tiên
                        </button>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    let html = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;

    streams.forEach(s => {
        const isRunning = s.status === 'running';
        const isStarting = s.status === 'starting';
        const isError = s.status === 'error';

        let statusBadge = `<span class="px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono bg-slate-900 text-slate-400 border border-slate-800">🔴 ĐÃ DỪNG</span>`;
        let cardBorder = "border-slate-800/80 hover:border-slate-700";
        if (isRunning) {
            statusBadge = `<span class="px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm shadow-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>🟢 ĐANG LIVE 24/7</span>`;
            cardBorder = "border-emerald-500/40 shadow-lg shadow-emerald-950/20";
        } else if (isStarting) {
            statusBadge = `<span class="px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono bg-amber-950/80 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">🟡 ĐANG KẾT NỐI...</span>`;
            cardBorder = "border-amber-500/40";
        } else if (isError) {
            statusBadge = `<span class="px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono bg-rose-950/80 text-rose-300 border border-rose-500/40 flex items-center gap-1.5">⚠️ LỖI KẾT NỐI</span>`;
            cardBorder = "border-rose-500/40";
        }

        const uptimeStr = s.uptime_sec ? formatUptime(s.uptime_sec) : "--:--:--";
        const modeBadge = s.mode === 'direct' 
            ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-sky-950/60 text-sky-400 border border-sky-800/60 font-mono font-bold" title="Stream Copy - Tiết kiệm CPU">⚡ DIRECT COPY</span>`
            : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-400 border border-purple-800/60 font-mono font-bold">⚙️ TRANSCODE x264</span>`;

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
            const totalMb = data.quota_mb || (currentUser ? currentUser.disk_quota_mb : 10240);
            const totalFormatted = totalMb >= 1024 ? (totalMb / 1024).toFixed(0) + ' GB' : totalMb + ' MB';
            const pct = Math.min(100, data.percent || 0);

            if (quotaText) {
                quotaText.innerText = `${(data.usage_mb || 0).toLocaleString()} MB / ${(data.quota_mb || 10240).toLocaleString()} MB (${pct}%)`;
            }

            const heroDiskVal = document.getElementById('v4-hero-disk-val');
            const heroDiskPct = document.getElementById('v4-hero-disk-pct');
            const heroDiskBar = document.getElementById('v4-hero-disk-bar');
            if (heroDiskVal) heroDiskVal.innerText = `${(data.usage_mb || 0).toLocaleString()} MB / ${totalFormatted}`;
            if (heroDiskPct) heroDiskPct.innerText = `${pct}%`;
            if (heroDiskBar) heroDiskBar.style.width = `${pct}%`;

            const diskEl = document.getElementById('v4-quota-disk');
            if (diskEl) diskEl.innerText = `${(data.usage_mb || 0).toLocaleString()} MB / ${totalFormatted}`;

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


// --- TAB 4: QUẢN LÝ KHÓA PHÁT SÓNG (LICENSE KEYS) ---

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

        // 3. Cấu hình Nền Tảng & AI Studio
        loadPlatformConfigs();
    } catch (e) {
        console.error("Admin load error:", e);
    }
}

function renderAdminKeysTable(keys) {
    const tableBody = document.getElementById('admin-keys-table');
    if (!tableBody) return;

    let html = '';
    keys.forEach(k => {
        const isMaster = k.role === 'admin' || k.key === 'hlc-live-automation-admin-12354-4856464-4687-438137-68817-46871-31587169-187146-001';
        const isActive = k.status === 'active';

        html += `
            <tr class="border-b border-slate-800/80 hover:bg-slate-900/40 transition-all text-xs">
                <td class="py-3 px-4 font-mono font-bold text-white">
                    <div class="flex items-center gap-2">
                        <span class="truncate max-w-[210px] text-purple-300 select-all" title="${k.key}">${k.key}</span>
                        <button onclick="copyKeyToClipboard('${k.key}')" class="p-1 rounded bg-slate-800 hover:bg-purple-600 hover:text-white text-slate-400 cursor-pointer transition-all" title="Sao chép Mã Khóa">
                            📋
                        </button>
                    </div>
                </td>
                <td class="py-3 px-4 text-slate-200 font-semibold">${escapeHtml(k.name)}</td>
                <td class="py-3 px-4 font-mono font-bold text-sky-400">${k.active_streams || 0} / ${k.max_streams}</td>
                <td class="py-3 px-4 font-mono text-slate-300">${(k.disk_usage_mb || 0).toLocaleString()} MB / ${(k.disk_quota_mb || 0).toLocaleString()} MB</td>
                <td class="py-3 px-4 font-mono font-bold text-purple-300">
                    <span>${(k.quota_remaining !== undefined ? k.quota_remaining : 0).toLocaleString()} Credits</span>
                </td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}">
                            ${isActive ? '● Hoạt động' : '○ Tạm khóa'}
                        </span>
                        ${k.synced_supabase ? `<span class="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[9px] font-mono">☁️ Cloud</span>` : ''}
                    </div>
                </td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    ${!isMaster ? `
                        <button onclick="toggleKeyStatus('${k.key}', '${isActive ? 'revoked' : 'active'}')" class="px-2 py-1 rounded ${isActive ? 'bg-rose-600/20 hover:bg-rose-600 text-rose-300 border-rose-500/40' : 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 border-emerald-500/40'} hover:text-white border text-[11px] font-bold transition-all cursor-pointer" title="${isActive ? 'Tạm khóa (Tắt) mã API này ngay lập tức' : 'Kích hoạt (Mở) mã API này'}">
                            ${isActive ? '🔒 Khóa' : '🔓 Mở'}
                        </button>
                        <button onclick="openTopupModal('${k.key}', '${escapeHtml(k.name)}')" class="px-2 py-1 rounded bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/40 text-[11px] font-bold transition-all cursor-pointer" title="Nạp thêm Credits gói AI">
                            ✨ + Nạp
                        </button>
                        <button onclick="copyKeyToClipboard('${k.key}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-all cursor-pointer" title="Sao chép mã API">
                            📋 Copy
                        </button>
                        <button onclick="adminDeleteKey('${k.key}')" class="px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-[11px] font-bold transition-all cursor-pointer" title="Xóa mã này">
                            Xóa
                        </button>
                    ` : `<span class="text-amber-400 font-semibold text-[11px]">Khóa Gốc (Vô Hạn)</span>`}
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
                <td class="py-2.5 px-3 font-mono font-bold text-sky-400">${s.username || s.name || 'Kênh'}</td>
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

async function generateNewKeyCode() {
    const keyInput = document.getElementById('nk-key');
    if (!keyInput) return;
    keyInput.value = "Đang sinh mã chuẩn...";
    try {
        const res = await fetch('/api/admin/keys/generate-code', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.key) {
            keyInput.value = data.key;
        } else {
            keyInput.value = `hlc-live-automation-${Math.floor(1000+Math.random()*9000)}-${Math.floor(100+Math.random()*900)}-${Math.floor(100000+Math.random()*900000)}-${Math.floor(10000+Math.random()*90000)}-${Math.floor(10000+Math.random()*90000)}-${Math.floor(100000+Math.random()*900000)}-${Math.floor(10+Math.random()*90)}-${Math.floor(10000000+Math.random()*90000000)}-${Math.floor(1000+Math.random()*9000)}-0`;
        }
    } catch (e) {
        keyInput.value = `hlc-live-automation-${Math.floor(1000+Math.random()*9000)}-${Math.floor(100+Math.random()*900)}-${Math.floor(100000+Math.random()*900000)}-${Math.floor(10000+Math.random()*90000)}-${Math.floor(10000+Math.random()*90000)}-${Math.floor(100000+Math.random()*900000)}-${Math.floor(10+Math.random()*90)}-${Math.floor(10000000+Math.random()*90000000)}-${Math.floor(1000+Math.random()*9000)}-0`;
    }
}

function openNewKeyModal() {
    const modal = document.getElementById('modal-new-key');
    if (modal) {
        modal.classList.remove('hidden');
        const nameInput = document.getElementById('nk-name');
        if (nameInput) {
            nameInput.value = '';
            setTimeout(() => nameInput.focus(), 100);
        }
        const creditsInput = document.getElementById('nk-credits');
        if (creditsInput) creditsInput.value = '500';
        const streamsInput = document.getElementById('nk-streams');
        if (streamsInput) streamsInput.value = '2';
        const diskInput = document.getElementById('nk-disk');
        if (diskInput) diskInput.value = '10240';
        const durationSelect = document.getElementById('nk-duration');
        if (durationSelect) durationSelect.value = '0';
        const pushCheck = document.getElementById('nk-push-supabase');
        if (pushCheck) pushCheck.checked = true;
        generateNewKeyCode();
    }
}

function closeNewKeyModal() {
    const modal = document.getElementById('modal-new-key');
    if (modal) modal.classList.add('hidden');
}

async function submitCreateApiKey() {
    const name = document.getElementById('nk-name').value.trim();
    const customKey = document.getElementById('nk-key').value.trim();
    const maxStreams = parseInt(document.getElementById('nk-streams').value) || 2;
    const diskMb = parseInt(document.getElementById('nk-disk').value) || 10240;
    const initialCredits = parseInt(document.getElementById('nk-credits') ? document.getElementById('nk-credits').value : 500) || 500;
    const durationDays = parseInt(document.getElementById('nk-duration') ? document.getElementById('nk-duration').value : 0) || 0;
    const pushSupabase = document.getElementById('nk-push-supabase') ? document.getElementById('nk-push-supabase').checked : true;

    if (!name) {
        alert("Vui lòng nhập Tên Kênh / Tên Shop!");
        document.getElementById('nk-name').focus();
        return;
    }
    if (!customKey) {
        alert("Vui lòng sinh hoặc nhập Mã API Key!");
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
                disk_quota_mb: diskMb,
                quota_remaining: initialCredits,
                push_supabase: pushSupabase,
                expires_days: durationDays > 0 ? durationDays : null
            })
        });
        const data = await res.json();
        if (data.success && data.key_data) {
            closeNewKeyModal();
            loadAdminPanel();
            openKeySuccessModal(data.api_key || customKey, name, initialCredits);
        } else {
            alert(data.message || "Không thể cấp Mã Khóa");
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

function openKeySuccessModal(key, name, credits) {
    const modal = document.getElementById('modal-key-created-success');
    if (!modal) return;
    const nameEl = document.getElementById('created-key-name');
    const creditsEl = document.getElementById('created-key-credits');
    const displayEl = document.getElementById('created-key-display');
    const textEl = document.getElementById('created-key-copy-text');
    const iconEl = document.getElementById('created-key-copy-icon');

    if (nameEl) nameEl.innerText = name;
    if (creditsEl) creditsEl.innerText = `${credits.toLocaleString()} Credits`;
    if (displayEl) displayEl.innerText = key;
    if (textEl) textEl.innerText = "Sao Chép Mã Key Gửi Khách";
    if (iconEl) iconEl.innerText = "📋";

    modal.classList.remove('hidden');
}

function closeKeySuccessModal() {
    const modal = document.getElementById('modal-key-created-success');
    if (modal) modal.classList.add('hidden');
}

function copyCreatedKey() {
    const key = document.getElementById('created-key-display').innerText.trim();
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
        const textEl = document.getElementById('created-key-copy-text');
        const iconEl = document.getElementById('created-key-copy-icon');
        if (textEl) textEl.innerText = "Đã Sao Chép Thành Công!";
        if (iconEl) iconEl.innerText = "✅";
        setTimeout(() => {
            if (textEl) textEl.innerText = "Sao Chép Mã Key Gửi Khách";
            if (iconEl) iconEl.innerText = "📋";
        }, 2500);
    });
}

function copyKeyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert(`📋 Đã sao chép Mã API Key vào Clipboard:\n\n${text}`);
    });
}

async function toggleKeyStatus(key, targetStatus) {
    try {
        const res = await fetch(`/api/admin/keys/${encodeURIComponent(key)}/toggle`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: targetStatus })
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

async function syncKeysFromSupabase() {
    try {
        const res = await fetch('/api/admin/keys/sync-supabase', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            alert(`🎉 ĐỒNG BỘ SUPABASE CLOUD THÀNH CÔNG!\n\nĐã đồng bộ ${data.count} khóa từ Supabase Cloud (Tổng Cloud: ${data.total_cloud} keys).`);
            loadAdminPanel();
        } else {
            alert(data.message || "Lỗi đồng bộ Supabase Cloud");
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

async function adminDeleteKey(key) {
    if (!confirm(`XÁC NHẬN: Bạn có chắc chắn muốn xóa vĩnh viễn Mã Khóa "${key}" trên cả máy chủ và Supabase Cloud?`)) return;
    try {
        const res = await fetch(`/api/admin/keys/${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            loadAdminPanel();
        } else {
            alert(data.message || "Lỗi xóa Mã Khóa");
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
        alert("✅ Đã sao chép Mã Khóa vào Clipboard:\n" + text);
    }).catch(() => {
        prompt("Sao chép Mã Khóa:", text);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// =========================================================================
// TAB: CONTENT STUDIO (AI SCRIPT, VOICE, AVATAR & OBS INJECTION)
// =========================================================================

let csVoicesList = [];
let csAvatarsList = [];
let csSelectedVoiceId = '21m00Tcm4TlvDq8ikWAM';
let csSelectedAvatarId = 'Daisy-inskirt-20220818';
let csVoicesList = [];
let csVoiceFilter = 'all';
let csVoiceSearchQuery = '';
let csSelectedVoiceId = '21m00Tcm4TlvDq8ikWAM';

let csAvatarsData = { avatars: [], system_avatars: [], user_avatars: [], quota: { used: 0, max: 3, can_upload: true } };
let csSelectedAvatarId = 'Daisy-inskirt-20220818';
let csAvatarFilter = 'all';
let csUploadIsSystem = false;

let csActivePollInterval = null;
let csAudioPreviewObj = null;
let csCurrentGeneratedVideo = null;

async function loadContentStudio() {
    loadUserCredits();
    loadVoices();
    loadAvatars();
    csLoadRecentTasks();
}

async function loadUserCredits() {
    try {
        const res = await fetch('/api/content-studio/credits', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            const credits = data.credits || 0;
            const heroCredits = document.getElementById('cs-hero-credits');
            const formBal = document.getElementById('cs-form-balance');
            const topCredits = document.getElementById('v4-quota-credits');
            if (heroCredits) heroCredits.innerText = credits.toLocaleString();
            if (formBal) formBal.innerText = credits.toLocaleString();
            if (topCredits) topCredits.innerText = credits.toLocaleString();
        }
    } catch (e) {}
}

async function loadVoices() {
    const listEl = document.getElementById('cs-voice-list');
    if (!listEl) return;
    if (csVoicesList.length === 0) {
        listEl.innerHTML = `<div class="text-slate-500 text-xs italic py-3 col-span-2 text-center">Đang nạp danh sách giọng đọc AI bản quyền...</div>`;
    }
    try {
        const res = await fetch('/api/content-studio/voices', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.voices) {
            csVoicesList = data.voices;
            filterAndRenderVoices();
        }
    } catch (e) {
        console.error("Load voices error:", e);
    }
}

function csFilterVoices(filter) {
    csVoiceFilter = filter;
    const filters = ['all', 'custom', 'female', 'male'];
    filters.forEach(f => {
        const btn = document.getElementById(`cs-vfilter-${f}`);
        if (!btn) return;
        if (f === filter) {
            btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-600/30 text-purple-200 border border-purple-500/40 cursor-pointer transition-all shadow-sm';
        } else {
            btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 cursor-pointer transition-all';
        }
    });
    filterAndRenderVoices();
}

function csSearchVoices(q) {
    csVoiceSearchQuery = (q || '').trim().toLowerCase();
    filterAndRenderVoices();
}

function filterAndRenderVoices() {
    const listEl = document.getElementById('cs-voice-list');
    if (!listEl) return;

    let filtered = csVoicesList.filter(v => {
        if (csVoiceFilter === 'custom' && !v.is_custom) return false;
        if (csVoiceFilter === 'female' && (v.gender || '').toLowerCase() !== 'female') return false;
        if (csVoiceFilter === 'male' && (v.gender || '').toLowerCase() !== 'male') return false;

        if (csVoiceSearchQuery) {
            const name = (v.name || '').toLowerCase();
            const style = (v.style || '').toLowerCase();
            const lang = (v.language || '').toLowerCase();
            if (!name.includes(csVoiceSearchQuery) && !style.includes(csVoiceSearchQuery) && !lang.includes(csVoiceSearchQuery)) {
                return false;
            }
        }
        return true;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="text-slate-500 text-xs italic py-4 col-span-2 text-center">Không tìm thấy giọng đọc phù hợp với tiêu chí lọc</div>`;
        return;
    }

    let html = '';
    filtered.forEach(v => {
        const isSel = (v.id === csSelectedVoiceId);
        const borderCls = isSel ? 'border-purple-500 bg-purple-950/40 shadow-sm shadow-purple-500/20 ring-1 ring-purple-500/40' : 'border-slate-800 bg-slate-950/80 hover:border-slate-700';
        html += `
            <div onclick="csSelectVoice('${v.id}')" class="p-2.5 rounded-xl border ${borderCls} cursor-pointer transition-all flex items-center justify-between gap-2 text-xs group relative">
                <div class="space-y-1 truncate flex-grow">
                    <div class="font-bold text-slate-100 flex items-center gap-1.5 truncate">
                        <span class="w-1.5 h-1.5 rounded-full ${isSel ? 'bg-purple-400' : 'bg-slate-600'}"></span>
                        <span class="truncate">${escapeHtml(v.name)}</span>
                        ${v.is_custom ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shrink-0">🌟 Custom</span>` : ''}
                    </div>
                    <div class="flex items-center gap-2 text-[10px] text-slate-400 truncate">
                        <span class="px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">${(v.gender === 'female' ? 'Nữ' : (v.gender === 'male' ? 'Nam' : 'AI'))}</span>
                        <span class="truncate">${escapeHtml(v.style || v.language)}</span>
                    </div>
                </div>
                ${v.preview_url ? `
                    <button type="button" onclick="event.stopPropagation(); csPlayVoiceSample('${v.preview_url}')" class="px-2 py-1 bg-slate-800 hover:bg-purple-600 hover:text-white rounded-lg text-slate-300 text-[10px] font-bold transition-all flex items-center gap-1 shrink-0" title="Nghe thử giọng">
                        <span>▶️</span>
                    </button>
                ` : ''}
            </div>
        `;
    });
    listEl.innerHTML = html;
}

function csSelectVoice(voiceId) {
    csSelectedVoiceId = voiceId;
    filterAndRenderVoices();
}

function csPlayVoiceSample(url) {
    if (csAudioPreviewObj) {
        csAudioPreviewObj.pause();
        csAudioPreviewObj = null;
    }
    if (!url) return;
    csAudioPreviewObj = new Audio(url);
    csAudioPreviewObj.play().catch(e => console.log("Audio play blocked:", e));
}

async function loadAvatars() {
    const listEl = document.getElementById('cs-avatar-list');
    if (!listEl) return;
    if (!csAvatarsData.avatars || csAvatarsData.avatars.length === 0) {
        listEl.innerHTML = `<div class="text-slate-500 text-xs italic py-3 col-span-6 text-center">Đang tải danh sách người mẫu...</div>`;
    }
    try {
        const res = await fetch('/api/content-studio/avatars', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            csAvatarsData = data;
            
            // Cập nhật huy hiệu hạn mức (Quota)
            const quotaBadge = document.getElementById('cs-avatar-quota-badge');
            if (quotaBadge && data.quota) {
                if (data.quota.is_admin) {
                    quotaBadge.innerText = 'Mẫu: Vô Hạn (Admin)';
                    quotaBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-800/60';
                } else {
                    const isFull = !data.quota.can_upload;
                    quotaBadge.innerText = `Mẫu của bạn: ${data.quota.used} / ${data.quota.max}`;
                    quotaBadge.className = isFull 
                        ? 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-800/60 font-bold'
                        : 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/60';
                }
            }

            filterAndRenderAvatars();
            renderAdminSystemAvatars();
        }
    } catch (e) {
        console.error("Load avatars error:", e);
    }
}

function csFilterAvatars(filter) {
    csAvatarFilter = filter;
    const filters = ['all', 'custom', 'system', 'female', 'male'];
    filters.forEach(f => {
        const btn = document.getElementById(`cs-afilter-${f}`);
        if (!btn) return;
        if (f === filter) {
            btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-600/30 text-purple-200 border border-purple-500/40 cursor-pointer transition-all shadow-sm';
        } else {
            btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 cursor-pointer transition-all';
        }
    });
    filterAndRenderAvatars();
}

function filterAndRenderAvatars() {
    const listEl = document.getElementById('cs-avatar-list');
    if (!listEl) return;

    const avatars = csAvatarsData.avatars || [];
    let filtered = avatars.filter(a => {
        if (csAvatarFilter === 'custom' && a.is_system) return false;
        if (csAvatarFilter === 'system' && !a.is_system) return false;
        if (csAvatarFilter === 'female' && (a.gender || '').toLowerCase() !== 'female') return false;
        if (csAvatarFilter === 'male' && (a.gender || '').toLowerCase() !== 'male') return false;
        return true;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="text-slate-500 text-xs italic py-4 col-span-6 text-center">Chưa có người mẫu nào thuộc danh mục này</div>`;
        return;
    }

    let html = '';
    filtered.forEach(a => {
        const isSel = (a.id === csSelectedAvatarId);
        const borderCls = isSel ? 'border-purple-500 ring-2 ring-purple-500/40 shadow-lg shadow-purple-500/20' : 'border-slate-800 hover:border-slate-700';
        html += `
            <div onclick="csSelectAvatar('${a.id}')" class="rounded-xl border ${borderCls} overflow-hidden cursor-pointer transition-all bg-slate-950 flex flex-col text-center group relative">
                <div class="w-full aspect-square bg-slate-900 relative overflow-hidden">
                    <img src="${a.preview_img || '/api/content-studio/avatars/image/sys_daisy.png'}" alt="${escapeHtml(a.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" onerror="this.src='/api/content-studio/avatars/image/sys_daisy.png'">
                    ${isSel ? `<div class="absolute top-1 right-1 w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-bold shadow">✓</div>` : ''}
                    ${!a.is_system ? `
                        <button type="button" onclick="event.stopPropagation(); deleteAvatar('${a.id}')" class="absolute top-1 left-1 w-5 h-5 rounded-lg bg-rose-950/80 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-800/80 flex items-center justify-center text-[10px] transition-all opacity-0 group-hover:opacity-100 cursor-pointer" title="Xóa mẫu này để giải phóng dung lượng">
                            🗑️
                        </button>
                    ` : ''}
                    <div class="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                        ${a.is_system 
                            ? `<span class="px-1 py-0.2 rounded text-[8px] bg-sky-950/80 text-sky-300 border border-sky-800/60 font-mono font-bold">Hệ Thống</span>`
                            : `<span class="px-1 py-0.2 rounded text-[8px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-mono font-bold">Mẫu Của Bạn</span>`
                        }
                    </div>
                </div>
                <div class="p-1.5">
                    <div class="text-[10px] font-bold text-slate-200 truncate" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
                    <div class="text-[9px] text-slate-400 truncate">${escapeHtml(a.style || '')}</div>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

function csSelectAvatar(avatarId) {
    csSelectedAvatarId = avatarId;
    filterAndRenderAvatars();
}

function renderAdminSystemAvatars() {
    const grid = document.getElementById('admin-system-avatars-grid');
    const countEl = document.getElementById('admin-sys-avatar-count');
    if (!grid) return;

    const sysAvatars = csAvatarsData.system_avatars || [];
    if (countEl) countEl.innerText = `${sysAvatars.length} Mẫu`;

    if (sysAvatars.length === 0) {
        grid.innerHTML = `<div class="text-slate-500 text-xs italic py-6 col-span-6 text-center">Chưa có người mẫu hệ thống nào. Bấm '➕ Thêm Người Mẫu Hệ Thống' để tải lên mẫu đầu tiên.</div>`;
        return;
    }

    let html = '';
    sysAvatars.forEach(a => {
        html += `
            <div class="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden flex flex-col group relative">
                <div class="w-full aspect-square bg-slate-900 relative overflow-hidden">
                    <img src="${a.preview_img || '/api/content-studio/avatars/image/sys_daisy.png'}" alt="${escapeHtml(a.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" onerror="this.src='/api/content-studio/avatars/image/sys_daisy.png'">
                    <button onclick="adminDeleteSystemAvatar('${a.id}')" class="absolute top-1 right-1 w-6 h-6 rounded-lg bg-rose-950/80 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-800 flex items-center justify-center text-xs transition-all opacity-0 group-hover:opacity-100 cursor-pointer" title="Xóa mẫu hệ thống này">
                        🗑️
                    </button>
                    <span class="absolute bottom-1 left-1 px-1.5 py-0.2 rounded text-[9px] bg-slate-950/80 text-purple-300 border border-purple-800/60 font-mono font-bold">${a.gender === 'female' ? 'Nữ' : 'Nam'}</span>
                </div>
                <div class="p-2 space-y-0.5">
                    <div class="text-xs font-bold text-slate-200 truncate" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
                    <div class="text-[10px] text-slate-400 truncate">${escapeHtml(a.style || 'MC Bán Hàng')}</div>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

function openUploadAvatarModal(isSystem = false) {
    csUploadIsSystem = isSystem;
    const isClient = (currentUserRole !== 'admin');

    if (!isSystem && isClient && csAvatarsData.quota && !csAvatarsData.quota.can_upload) {
        alert(`⚠️ Bạn đã đạt giới hạn tối đa ${csAvatarsData.quota.max} mẫu tải lên!\nVui lòng xóa bớt mẫu cũ của bạn để tải thêm mẫu mới, hoặc liên hệ Admin.`);
        return;
    }

    const modal = document.getElementById('modal-upload-avatar');
    const titleEl = document.getElementById('modal-upload-avatar-title');
    const adminOpt = document.getElementById('avatar-admin-option');
    const isSysCheck = document.getElementById('avatar-is-system-check');
    const quotaText = document.getElementById('avatar-quota-text');

    if (titleEl) {
        titleEl.innerHTML = isSystem 
            ? `<span>🎭</span> Tải Lên Mẫu Hệ Thống Mới (Toàn Hệ Thống)`
            : `<span>📸</span> Tải Lên Hình Ảnh Người Mẫu Mới Của Bạn`;
    }

    if (adminOpt) {
        if (currentUserRole === 'admin') {
            adminOpt.classList.remove('hidden');
            if (isSysCheck) isSysCheck.checked = isSystem;
        } else {
            adminOpt.classList.add('hidden');
            if (isSysCheck) isSysCheck.checked = false;
        }
    }

    if (quotaText && csAvatarsData.quota) {
        if (currentUserRole === 'admin') {
            quotaText.innerText = "Tài khoản Quản trị viên (Admin) không bị giới hạn hạn mức người mẫu tải lên.";
        } else {
            quotaText.innerText = `Hạn mức tài khoản: ${csAvatarsData.quota.used} / ${csAvatarsData.quota.max} mẫu. Bạn có thể xóa mẫu cũ bất kỳ lúc nào để giải phóng dung lượng.`;
        }
    }

    // Reset Form
    const fileInput = document.getElementById('avatar-file-input');
    const nameInput = document.getElementById('avatar-name-input');
    const styleInput = document.getElementById('avatar-style-input');
    const previewImg = document.getElementById('avatar-preview-img');
    const placeholderBox = document.getElementById('avatar-placeholder-box');

    if (fileInput) fileInput.value = '';
    if (nameInput) nameInput.value = '';
    if (styleInput) styleInput.value = '';
    if (previewImg) { previewImg.src = ''; previewImg.classList.add('hidden'); }
    if (placeholderBox) placeholderBox.classList.remove('hidden');

    if (modal) modal.classList.remove('hidden');
}

function closeUploadAvatarModal() {
    const modal = document.getElementById('modal-upload-avatar');
    if (modal) modal.classList.add('hidden');
}

function previewAvatarImage(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewImg = document.getElementById('avatar-preview-img');
            const placeholderBox = document.getElementById('avatar-placeholder-box');
            if (previewImg) {
                previewImg.src = e.target.result;
                previewImg.classList.remove('hidden');
            }
            if (placeholderBox) placeholderBox.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
}

async function submitUploadAvatar(e) {
    if (e) e.preventDefault();
    const fileInput = document.getElementById('avatar-file-input');
    const nameInput = document.getElementById('avatar-name-input');
    const genderSelect = document.getElementById('avatar-gender-select');
    const styleInput = document.getElementById('avatar-style-input');
    const isSysCheck = document.getElementById('avatar-is-system-check');
    const btn = document.getElementById('btn-submit-upload-avatar');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Vui lòng chọn một file hình ảnh người mẫu (PNG, JPG, WEBP)!");
        return;
    }

    const file = fileInput.files[0];
    const name = nameInput ? nameInput.value.trim() : '';
    const gender = genderSelect ? genderSelect.value : 'female';
    const style = styleInput ? styleInput.value.trim() : '';
    const isSystem = (isSysCheck && isSysCheck.checked) || csUploadIsSystem;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('gender', gender);
    formData.append('style', style);
    formData.append('is_system', isSystem ? 'true' : 'false');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>⏳</span> Đang tải lên...`;
    }

    try {
        const headers = getAuthHeaders();
        delete headers['Content-Type']; // Để browser tự động gắn multipart boundary

        const res = await fetch('/api/content-studio/avatars/upload', {
            method: 'POST',
            headers: headers,
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            alert("🎉 Tải lên hình ảnh người mẫu thành công!");
            closeUploadAvatarModal();
            await loadAvatars();
            if (data.avatar && data.avatar.id) {
                csSelectedAvatarId = data.avatar.id;
                filterAndRenderAvatars();
            }
        } else {
            alert(data.message || "Lỗi tải lên hình ảnh");
        }
    } catch (err) {
        alert("Lỗi kết nối khi tải lên: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>🚀</span> Tải Lên Mẫu`;
        }
    }
}

async function deleteAvatar(avatarId) {
    if (!confirm("Bạn có chắc chắn muốn xóa người mẫu này? Thao tác này sẽ giải phóng 1 slot trong hạn mức tải lên của bạn.")) {
        return;
    }
    try {
        const res = await fetch(`/api/content-studio/avatars/${avatarId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            alert("✅ Đã xóa người mẫu thành công!");
            if (csSelectedAvatarId === avatarId) {
                csSelectedAvatarId = 'Daisy-inskirt-20220818';
            }
            await loadAvatars();
        } else {
            alert(data.message || "Lỗi xóa người mẫu");
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

async function adminDeleteSystemAvatar(avatarId) {
    if (!confirm("⚠️ Bạn có chắc chắn muốn xóa người mẫu hệ thống này? Tất cả khách hàng sẽ không còn thấy mẫu này nữa.")) {
        return;
    }
    await deleteAvatar(avatarId);
}

function csUpdateCharCount() {
    const input = document.getElementById('cs-script-input');
    const label = document.getElementById('cs-char-count');
    if (!input || !label) return;
    const len = input.value.length;
    const estSec = Math.max(1, Math.round(len / 15));
    label.innerText = `${len} ký tự (~${estSec}s)`;
}

function csApplyTemplate(type) {
    const titleInput = document.getElementById('cs-title-input');
    const scriptInput = document.getElementById('cs-script-input');
    if (!scriptInput) return;

    if (type === 'flashsale') {
        if (titleInput) titleInput.value = "Flash Sale Giảm Giá 50%";
        scriptInput.value = "Chào cả nhà! Chỉ duy nhất trong phiên live ngày hôm nay, bên em đang có chương trình Flash Sale giảm sốc lên đến 50%. Số lượng có hạn, các bạn bấm ngay vào giỏ hàng góc trái màn hình để săn deal hời nhé!";
    } else if (type === 'intro') {
        if (titleInput) titleInput.value = "Giới Thiệu Sản Phẩm Mới";
        scriptInput.value = "Hôm nay em xin giới thiệu đến mọi người dòng sản phẩm mới nhất vừa cập bến. Chất liệu cao cấp, bảo hành chính hãng và có rất nhiều voucher độc quyền đang chờ mọi người chốt đơn!";
    } else if (type === 'welcome') {
        if (titleInput) titleInput.value = "Lời Chào Livestream & Tặng Quà";
        scriptInput.value = "Dạ xin chào tất cả các anh chị đang theo dõi buổi phát sóng trực tiếp! Mọi người vào live thả tim và để lại bình luận để nhận ngay voucher giảm 20k cho đơn hàng đầu tiên nha!";
    } else if (type === 'calltoaction') {
        if (titleInput) titleInput.value = "Kêu Gọi Chốt Đơn Gấp";
        scriptInput.value = "Mã giảm giá chỉ còn đúng 5 suất cuối cùng thôi ạ! Bạn nào chưa kịp đặt thì nhanh tay bấm mua ngay bây giờ kẻo hết nhé. Em xin cảm ơn và hẹn gặp lại!";
    }
    csUpdateCharCount();
}

async function submitGenerateAIVideo() {
    const title = (document.getElementById('cs-title-input') ? document.getElementById('cs-title-input').value.trim() : '') || "Video MC Bán Hàng";
    const script = document.getElementById('cs-script-input') ? document.getElementById('cs-script-input').value.trim() : '';
    const aspectRadio = document.querySelector('input[name="cs-aspect"]:checked');
    const aspect = aspectRadio ? aspectRadio.value : '9:16';

    if (!script) {
        alert("Vui lòng nhập nội dung kịch bản MC cần nói!");
        return;
    }

    const btn = document.getElementById('cs-btn-generate');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    try {
        const res = await fetch('/api/content-studio/generate', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                title: title,
                script: script,
                voice_id: csSelectedVoiceId,
                avatar_id: csSelectedAvatarId,
                aspect_ratio: aspect
            })
        });

        const data = await res.json();
        if (data.success && data.task) {
            loadUserCredits();
            showTaskProgress(data.task);
            csStartTaskPolling(data.task.task_id);
            alert("✨ Tác vụ tạo Video AI đã được kích hoạt! Hệ thống đang xử lý render...");
        } else {
            alert(data.message || "Không thể tạo video!");
        }
    } catch (e) {
        alert("Lỗi kết nối máy chủ: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

function showTaskProgress(task) {
    const card = document.getElementById('cs-task-card');
    const pct = document.getElementById('cs-task-pct');
    const bar = document.getElementById('cs-task-bar');
    const step = document.getElementById('cs-task-step');
    if (!card) return;

    card.classList.remove('hidden');
    if (pct) pct.innerText = `${task.progress_pct || 5}%`;
    if (bar) bar.style.width = `${task.progress_pct || 5}%`;
    if (step) step.innerText = task.current_step || "Đang xử lý...";
}

function csStartTaskPolling(taskId) {
    if (csActivePollInterval) clearInterval(csActivePollInterval);
    csActivePollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/content-studio/task/${taskId}`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success && data.task) {
                const t = data.task;
                showTaskProgress(t);
                if (t.status === 'completed') {
                    clearInterval(csActivePollInterval);
                    csActivePollInterval = null;
                    onAIVideoCompleted(t);
                } else if (t.status === 'failed') {
                    clearInterval(csActivePollInterval);
                    csActivePollInterval = null;
                    alert("❌ Render video thất bại: " + (t.error || "Lỗi không xác định"));
                }
            }
        } catch (e) {}
    }, 2000);
}

function onAIVideoCompleted(task) {
    csCurrentGeneratedVideo = task.video_filename;
    loadUserCredits();
    csLoadRecentTasks();

    const player = document.getElementById('cs-video-player');
    const placeholder = document.getElementById('cs-video-placeholder');
    const badge = document.getElementById('cs-preview-badge');
    const actions = document.getElementById('cs-video-actions');
    const dlLink = document.getElementById('cs-download-link');

    if (player && task.video_filename) {
        player.src = `/api/media/file/${encodeURIComponent(task.video_filename)}`;
        player.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
        player.load();
        player.play().catch(e => {});
    }

    if (badge) {
        badge.className = "text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40";
        badge.innerText = "HOÀN TẤT";
    }

    if (actions) actions.classList.remove('hidden');
    if (dlLink && task.video_filename) {
        dlLink.href = `/api/media/file/${encodeURIComponent(task.video_filename)}`;
    }
}

async function csLoadRecentTasks() {
    const listEl = document.getElementById('cs-recent-tasks-list');
    if (!listEl) return;
    try {
        const res = await fetch('/api/content-studio/tasks', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.tasks) {
            if (data.tasks.length === 0) {
                listEl.innerHTML = `<div class="text-slate-500 text-center py-4 italic">Chưa có video nào trong phiên làm việc.</div>`;
                return;
            }
            let html = '';
            data.tasks.slice(0, 5).forEach(t => {
                const isDone = (t.status === 'completed');
                html += `
                    <div class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/70 hover:border-slate-700 transition-all flex items-center justify-between gap-2">
                        <div class="truncate space-y-0.5">
                            <div class="font-bold text-slate-200 truncate flex items-center gap-1.5">
                                <span>${isDone ? '🎬' : '⏳'}</span>
                                <span class="truncate">${escapeHtml(t.title)}</span>
                            </div>
                            <div class="text-[10px] text-slate-500 font-mono">${t.created_at}</div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            ${isDone && t.video_filename ? `
                                <button onclick="csPreviewVideo('${t.video_filename}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] cursor-pointer">
                                    ▶️ Xem
                                </button>
                                <button onclick="pushVideoToOBSDirect('${t.video_filename}')" class="px-2 py-1 rounded bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 font-bold text-[10px] cursor-pointer" title="Nạp vào OBS">
                                    🎛️ OBS
                                </button>
                            ` : `<span class="text-[10px] text-amber-400 font-mono">Đang render</span>`}
                        </div>
                    </div>
                `;
            });
            listEl.innerHTML = html;
        }
    } catch (e) {}
}

function csPreviewVideo(filename) {
    onAIVideoCompleted({ video_filename: filename });
}

async function pushCurrentAIVideoToOBS() {
    if (!csCurrentGeneratedVideo) {
        alert("Chưa có video AI nào được chọn để nạp vào OBS!");
        return;
    }
    await pushVideoToOBSDirect(csCurrentGeneratedVideo);
}

async function pushVideoToOBSDirect(filename) {
    try {
        const res = await fetch('/api/content-studio/push-obs', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                video_filename: filename,
                source_name: "MC_AI_Live"
            })
        });
        const data = await res.json();
        if (data.success) {
            alert(`🎉 NẠP OBS THÀNH CÔNG!\n\n${data.message}`);
        } else {
            alert(`⚠️ Không thể nạp vào OBS:\n\n${data.message}`);
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

function streamCurrentAIVideoCloud() {
    if (!csCurrentGeneratedVideo) {
        alert("Chưa có video AI nào được chọn!");
        return;
    }
    switchV4Tab('cloud-streams');
    openNewStreamModal(csCurrentGeneratedVideo);
}


// --- ADMIN AI CONFIG & TOP-UP CREDITS ---

// --- ADMIN PLATFORM CONFIG & BALANCE CHECKERS ---

function toggleInputVisibility(id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function loadPlatformConfigs() {
    try {
        const res = await fetch('/api/admin/platforms/config', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            const elStatus = document.getElementById('admin-ai-el-status');
            const hgStatus = document.getElementById('admin-ai-hg-status');
            const supaStatus = document.getElementById('admin-ai-supa-status');
            const supaUrl = document.getElementById('admin-ai-supa-url');
            const costVoice = document.getElementById('admin-ai-cost-voice');
            const costVideo = document.getElementById('admin-ai-cost-video');

            if (elStatus) {
                elStatus.innerText = data.has_elevenlabs ? `Đã có: ${data.elevenlabs_masked}` : "Chưa có key";
                elStatus.className = `text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${data.has_elevenlabs ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-400'}`;
            }
            if (hgStatus) {
                hgStatus.innerText = data.has_heygen ? `Đã có: ${data.heygen_masked}` : "Chưa có key";
                hgStatus.className = `text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${data.has_heygen ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-400'}`;
            }
            if (supaUrl && data.supabase_url) supaUrl.value = data.supabase_url;
            if (supaStatus) {
                supaStatus.innerText = data.supabase_anon_masked ? `Key: ${data.supabase_anon_masked}` : "Chưa có key";
                supaStatus.className = `text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${data.supabase_anon_masked ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`;
            }
            if (costVoice && data.cost_per_voice) costVoice.value = data.cost_per_voice;
            if (costVideo && data.cost_per_video) costVideo.value = data.cost_per_video;
            const maxAvatarsInput = document.getElementById('admin-ai-max-avatars');
            if (maxAvatarsInput && data.max_user_custom_avatars) maxAvatarsInput.value = data.max_user_custom_avatars;
            loadAvatars();
        }
    } catch (e) {
        console.error("loadPlatformConfigs error:", e);
    }
}

const loadAdminAIConfig = loadPlatformConfigs;

async function savePlatformConfigs() {
    const elInput = document.getElementById('admin-ai-el-key');
    const hgInput = document.getElementById('admin-ai-hg-key');
    const supaUrlInput = document.getElementById('admin-ai-supa-url');
    const supaKeyInput = document.getElementById('admin-ai-supa-key');
    const costVoice = document.getElementById('admin-ai-cost-voice');
    const costVideo = document.getElementById('admin-ai-cost-video');
    const maxAvatarsInput = document.getElementById('admin-ai-max-avatars');

    const payload = {};
    if (elInput && elInput.value.trim()) payload.elevenlabs_api_key = elInput.value.trim();
    if (hgInput && hgInput.value.trim()) payload.heygen_api_key = hgInput.value.trim();
    if (supaUrlInput && supaUrlInput.value.trim()) payload.supabase_url = supaUrlInput.value.trim();
    if (supaKeyInput && supaKeyInput.value.trim()) payload.supabase_anon_key = supaKeyInput.value.trim();
    if (costVoice) payload.cost_per_voice = parseInt(costVoice.value) || 2;
    if (costVideo) payload.cost_per_video = parseInt(costVideo.value) || 10;
    if (maxAvatarsInput) payload.max_user_custom_avatars = parseInt(maxAvatarsInput.value) || 3;

    try {
        const res = await fetch('/api/admin/platforms/config', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            alert("🎉 ĐÃ LƯU CẤU HÌNH API CÁC NỀN TẢNG THÀNH CÔNG!");
            if (elInput) elInput.value = '';
            if (hgInput) hgInput.value = '';
            if (supaKeyInput) supaKeyInput.value = '';
            loadPlatformConfigs();
        } else {
            alert(data.message || "Lỗi lưu cấu hình");
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

const saveAdminAIConfig = savePlatformConfigs;

async function checkElevenlabsCredits() {
    const elInput = document.getElementById('admin-ai-el-key');
    const key = elInput ? elInput.value.trim() : '';
    const resBox = document.getElementById('admin-ai-el-result');
    const statusBadge = document.getElementById('admin-ai-el-status');

    if (statusBadge) {
        statusBadge.innerText = 'Đang check...';
        statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold animate-pulse';
    }
    if (resBox) {
        resBox.classList.remove('hidden');
        resBox.innerHTML = '<span class="text-slate-400">⏳ Đang kết nối ElevenLabs Subscription API...</span>';
    }

    try {
        const res = await fetch('/api/admin/platforms/check-elevenlabs', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ api_key: key || undefined })
        });
        const data = await res.json();
        if (data.success) {
            if (statusBadge) {
                statusBadge.innerText = '🟢 Hoạt động';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold';
            }
            if (resBox) {
                resBox.innerHTML = `
                    <div class="text-emerald-400 font-bold flex items-center gap-1.5">
                        <span>✅</span> Kết Nối ElevenLabs OK!
                    </div>
                    <div class="mt-1 text-slate-300">Gói Dịch Vụ: <span class="font-bold uppercase text-purple-300">${data.tier}</span> (${data.status})</div>
                    <div class="text-slate-300">Ký Tự Còn Lại: <span class="font-mono font-bold text-amber-400 text-xs">${data.remaining_characters.toLocaleString()}</span> / ${data.character_limit.toLocaleString()}</div>
                    <div class="text-slate-400 text-[10px] mt-0.5">Ngày Reset Hạn Mức: ${data.reset_date}</div>
                `;
            }
        } else {
            if (statusBadge) {
                statusBadge.innerText = '🔴 Lỗi';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-mono font-bold';
            }
            if (resBox) {
                resBox.innerHTML = `<span class="text-rose-400 font-medium">❌ ${escapeHtml(data.message)}</span>`;
            }
        }
    } catch (e) {
        if (resBox) resBox.innerHTML = `<span class="text-rose-400">❌ Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
    }
}

async function checkHeygenCredits() {
    const hgInput = document.getElementById('admin-ai-hg-key');
    const key = hgInput ? hgInput.value.trim() : '';
    const resBox = document.getElementById('admin-ai-hg-result');
    const statusBadge = document.getElementById('admin-ai-hg-status');

    if (statusBadge) {
        statusBadge.innerText = 'Đang check...';
        statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold animate-pulse';
    }
    if (resBox) {
        resBox.classList.remove('hidden');
        resBox.innerHTML = '<span class="text-slate-400">⏳ Đang kết nối HeyGen Quota API...</span>';
    }

    try {
        const res = await fetch('/api/admin/platforms/check-heygen', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ api_key: key || undefined })
        });
        const data = await res.json();
        if (data.success) {
            if (statusBadge) {
                statusBadge.innerText = '🟢 Hoạt động';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold';
            }
            if (resBox) {
                resBox.innerHTML = `
                    <div class="text-sky-400 font-bold flex items-center gap-1.5">
                        <span>✅</span> Kết Nối HeyGen OK!
                    </div>
                    <div class="mt-1 text-slate-300">Credits Khả Dụng: <span class="font-mono font-black text-amber-400 text-sm">${data.remaining_quota}</span> Video Credits</div>
                    <div class="text-slate-400 text-[10px]">(Dùng chung qua Master Key)</div>
                `;
            }
        } else {
            if (statusBadge) {
                statusBadge.innerText = '🔴 Lỗi';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-mono font-bold';
            }
            if (resBox) {
                resBox.innerHTML = `<span class="text-rose-400 font-medium">❌ ${escapeHtml(data.message)}</span>`;
            }
        }
    } catch (e) {
        if (resBox) resBox.innerHTML = `<span class="text-rose-400">❌ Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
    }
}

async function checkSupabaseConnection() {
    const supaUrl = document.getElementById('admin-ai-supa-url') ? document.getElementById('admin-ai-supa-url').value.trim() : '';
    const supaKey = document.getElementById('admin-ai-supa-key') ? document.getElementById('admin-ai-supa-key').value.trim() : '';
    const resBox = document.getElementById('admin-ai-supa-result');
    const statusBadge = document.getElementById('admin-ai-supa-status');

    if (statusBadge) {
        statusBadge.innerText = 'Đang check...';
        statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold animate-pulse';
    }
    if (resBox) {
        resBox.classList.remove('hidden');
        resBox.innerHTML = '<span class="text-slate-400">⏳ Đang kiểm tra Supabase Cloud Database...</span>';
    }

    try {
        const res = await fetch('/api/admin/platforms/check-supabase', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                supabase_url: supaUrl || undefined,
                supabase_anon_key: supaKey || undefined
            })
        });
        const data = await res.json();
        if (data.success) {
            if (statusBadge) {
                statusBadge.innerText = '🟢 Hoạt động';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold';
            }
            if (resBox) {
                resBox.innerHTML = `
                    <div class="text-emerald-400 font-bold flex items-center gap-1.5">
                        <span>✅</span> Kết Nối Supabase Cloud OK!
                    </div>
                    <div class="mt-1 text-slate-300">Tổng Keys Trên Cloud: <span class="font-mono font-bold text-sky-400">${data.total_keys}</span> (${data.active_keys} Active)</div>
                    <div class="text-slate-300">Tổng Quota Cấp Phát: <span class="font-mono font-bold text-purple-300">${data.total_quota.toLocaleString()}</span> Credits</div>
                `;
            }
        } else {
            if (statusBadge) {
                statusBadge.innerText = '🔴 Lỗi';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-mono font-bold';
            }
            if (resBox) {
                resBox.innerHTML = `<span class="text-rose-400 font-medium">❌ ${escapeHtml(data.message)}</span>`;
            }
        }
    } catch (e) {
        if (resBox) resBox.innerHTML = `<span class="text-rose-400">❌ Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
    }
}

function openTopupModal(apiKey, clientName) {
    const modal = document.getElementById('modal-topup-credits');
    const label = document.getElementById('topup-client-label');
    const keyInput = document.getElementById('topup-api-key');
    if (!modal) return;
    if (label) label.innerText = `${clientName} (${apiKey})`;
    if (keyInput) keyInput.value = apiKey;
    modal.classList.remove('hidden');
}

function closeTopupModal() {
    const modal = document.getElementById('modal-topup-credits');
    if (modal) modal.classList.add('hidden');
}

async function submitTopupCredits() {
    const key = document.getElementById('topup-api-key').value;
    const amount = parseInt(document.getElementById('topup-amount').value) || 0;

    if (!key || amount <= 0) {
        alert("Vui lòng nhập số lượng Credits hợp lệ (> 0)!");
        return;
    }

    try {
        const res = await fetch('/api/content-studio/admin/topup', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ api_key: key, amount: amount })
        });
        const data = await res.json();
        if (data.success) {
            closeTopupModal();
            loadAdminPanel();
            alert(`🎉 NẠP CREDITS THÀNH CÔNG!\n\nĐã cộng +${amount} Credits vào tài khoản khách hàng.`);
        } else {
            alert(data.message || "Lỗi nạp Credits");
        }
    } catch (e) {
        alert("Lỗi kết nối: " + e.message);
    }
}

// Bắt đầu khởi tạo khi DOM sẵn sàng
window.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();
});
