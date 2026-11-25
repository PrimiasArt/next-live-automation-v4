/**
 * NEXT LIVE AUTOMATION v4 — LATE-2026 SAAS BROADCAST ENGINE CONTROLLER
 * Pre-App Auth Gate, Adaptive Dark/Light Theme, Toast/Dialog UX,
 * Multi-Tenant Cloud Streams, AI Content Studio, Media Vault, Billing & Admin Portal
 */

let currentUser = null;
let cloudStreamsList = [];
let cloudMediaList = [];
let adminKeysList = [];
let cloudStreamsPollInterval = null;
let streamLogsPollInterval = null;
let currentViewingStreamId = null;

let cloudStreamFilter = 'all';
let cloudStreamSearchQuery = '';
let mediaViewMode = 'table';
let mediaSearchQuery = '';
let adminKeysSearchQuery = '';
let billingCycle = 'monthly';

// =========================================================================
// 1. THEME, TOAST NOTIFICATIONS & CUSTOM CONFIRM / PROMPT DIALOGS
// =========================================================================

function initTheme() {
    const saved = localStorage.getItem('hlc_theme') || 'dark';
    const html = document.documentElement;
    if (saved === 'light') {
        html.classList.remove('dark');
    } else {
        html.classList.add('dark');
    }
    updateThemeToggleUI();
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    if (isDark) {
        html.classList.remove('dark');
        localStorage.setItem('hlc_theme', 'light');
        showToast('Đã chuyển sang giao diện Sáng (Light Mode)', 'info');
    } else {
        html.classList.add('dark');
        localStorage.setItem('hlc_theme', 'dark');
        showToast('Đã chuyển sang giao diện Tối (Obsidian Dark)', 'info');
    }
    updateThemeToggleUI();
}

function updateThemeToggleUI() {
    const isDark = document.documentElement.classList.contains('dark');
    const iconEl = document.getElementById('theme-toggle-icon');
    const authIconEl = document.getElementById('theme-toggle-icon-auth');
    const labelEl = document.getElementById('theme-toggle-label');
    if (iconEl) iconEl.textContent = isDark ? '☀️' : '🌙';
    if (authIconEl) authIconEl.textContent = isDark ? '☀️' : '🌙';
    if (labelEl) labelEl.textContent = isDark ? 'Light' : 'Dark';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('v4-toast-container');
    if (!container) return;

    const styles = {
        success: {
            border: 'border-emerald-500/40',
            badgeBg: 'bg-emerald-500/15 text-emerald-400',
            icon: '✓'
        },
        error: {
            border: 'border-rose-500/40',
            badgeBg: 'bg-rose-500/15 text-rose-400',
            icon: '!'
        },
        warning: {
            border: 'border-amber-500/40',
            badgeBg: 'bg-amber-500/15 text-amber-400',
            icon: '⚠'
        },
        info: {
            border: 'border-sky-500/40',
            badgeBg: 'bg-sky-500/15 text-sky-400',
            icon: 'i'
        }
    };
    const cfg = styles[type] || styles.info;

    const toast = document.createElement('div');
    toast.className = `saas-card ${cfg.border} rounded-2xl px-4 py-3 shadow-2xl flex items-start gap-3 text-xs transition-all duration-200 pointer-events-auto max-w-sm`;
    toast.innerHTML = `
        <span class="w-6 h-6 rounded-full ${cfg.badgeBg} flex items-center justify-center font-bold shrink-0 mt-0.5">${cfg.icon}</span>
        <div class="flex-1 text-[var(--text-main)] leading-relaxed font-medium">${escapeHtml(String(message || ''))}</div>
        <button type="button" class="text-[var(--text-muted)] hover:text-[var(--text-main)] font-bold px-1 cursor-pointer" aria-label="Đóng">✕</button>
    `;
    toast.querySelector('button').onclick = () => toast.remove();
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        setTimeout(() => toast.remove(), 220);
    }, 4000);
}

let __dialogResolve = null;

function uiConfirm(message, title = 'Xác nhận thao tác', danger = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-ui-dialog');
        if (!modal) {
            resolve(window.confirm(message));
            return;
        }
        __dialogResolve = resolve;
        document.getElementById('ui-dialog-title').textContent = title;
        document.getElementById('ui-dialog-message').textContent = message;

        const inputWrap = document.getElementById('ui-dialog-input-wrap');
        if (inputWrap) inputWrap.classList.add('hidden');

        const confirmBtn = document.getElementById('ui-dialog-confirm-btn');
        confirmBtn.textContent = danger ? 'Xác nhận thực hiện' : 'Đồng ý';
        confirmBtn.className = danger
            ? 'px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer transition-all shadow-sm'
            : 'px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer transition-all shadow-sm';

        modal.classList.remove('hidden');
        setTimeout(() => confirmBtn.focus(), 50);
    });
}

function uiPrompt(message, defaultValue = '', title = 'Nhập thông tin') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-ui-dialog');
        if (!modal) {
            resolve(window.prompt(message, defaultValue));
            return;
        }
        __dialogResolve = (ok) => {
            if (!ok) {
                resolve(null);
            } else {
                const inp = document.getElementById('ui-dialog-input');
                resolve(inp ? inp.value : '');
            }
        };

        document.getElementById('ui-dialog-title').textContent = title;
        document.getElementById('ui-dialog-message').textContent = message;

        const inputWrap = document.getElementById('ui-dialog-input-wrap');
        const inputEl = document.getElementById('ui-dialog-input');
        if (inputWrap && inputEl) {
            inputWrap.classList.remove('hidden');
            inputEl.value = defaultValue || '';
        }

        const confirmBtn = document.getElementById('ui-dialog-confirm-btn');
        confirmBtn.textContent = 'Lưu thay đổi';
        confirmBtn.className = 'px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer transition-all shadow-sm';

        modal.classList.remove('hidden');
        if (inputEl) setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);
    });
}

function closeUiDialog(confirmed) {
    const modal = document.getElementById('modal-ui-dialog');
    if (modal) modal.classList.add('hidden');
    if (typeof __dialogResolve === 'function') {
        const fn = __dialogResolve;
        __dialogResolve = null;
        fn(Boolean(confirmed));
    }
}

// =========================================================================
// 2. PRE-APP AUTH GATE & SESSION MANAGEMENT
// =========================================================================

function getAuthHeaders() {
    const key = localStorage.getItem('hlc_api_key') || localStorage.getItem('hlc_cloud_key') || '';
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'X-API-Key': key
    };
}

function switchAuthMode(mode) {
    const keyForm = document.getElementById('auth-form-key');
    const accForm = document.getElementById('auth-form-account');
    const keyBtn = document.getElementById('auth-mode-key-btn');
    const accBtn = document.getElementById('auth-mode-user-btn');

    if (mode === 'account') {
        if (keyForm) keyForm.classList.add('hidden');
        if (accForm) accForm.classList.remove('hidden');
        if (accBtn) accBtn.className = 'py-2 px-3 rounded-lg text-xs font-semibold bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] shadow-sm cursor-pointer transition-all';
        if (keyBtn) keyBtn.className = 'py-2 px-3 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer transition-all';
    } else {
        if (accForm) accForm.classList.add('hidden');
        if (keyForm) keyForm.classList.remove('hidden');
        if (keyBtn) keyBtn.className = 'py-2 px-3 rounded-lg text-xs font-semibold bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] shadow-sm cursor-pointer transition-all';
        if (accBtn) accBtn.className = 'py-2 px-3 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer transition-all';
    }
}

function toggleKeyMask() {
    const input = document.getElementById('key-input');
    const btn = document.getElementById('toggle-key-mask-btn');
    if (!input) return;
    const isPwd = input.type === 'password';
    input.type = isPwd ? 'text' : 'password';
    if (btn) btn.textContent = isPwd ? 'Ẩn mã' : 'Hiện mã';
}

async function pasteApiKeyFromClipboard() {
    try {
        const txt = await navigator.clipboard.readText();
        const input = document.getElementById('key-input');
        if (input && txt) {
            input.value = txt.trim();
            showToast('Đã dán mã License Key từ Clipboard', 'info');
        }
    } catch (e) {
        showToast('Trình duyệt chưa cấp quyền đọc Clipboard. Vui lòng dán bằng Ctrl+V.', 'warning');
    }
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
        if (res.ok && data.success && data.user) {
            currentUser = data.user;
            onLoginSuccess();
        } else {
            localStorage.removeItem('hlc_api_key');
            localStorage.removeItem('hlc_cloud_key');
            showAuthModal();
        }
    } catch (e) {
        console.error('Auth check failed:', e);
        showAuthModal();
    }
}

function showAuthModal() {
    const authEl = document.getElementById('auth');
    const appShell = document.getElementById('app-shell');
    if (authEl) authEl.classList.remove('hidden');
    if (appShell) appShell.classList.add('hidden');
    if (cloudStreamsPollInterval) {
        clearInterval(cloudStreamsPollInterval);
        cloudStreamsPollInterval = null;
    }
}

function hideAuthModal() {
    const authEl = document.getElementById('auth');
    const appShell = document.getElementById('app-shell');
    if (authEl) authEl.classList.add('hidden');
    if (appShell) appShell.classList.remove('hidden');
}

function onLoginSuccess() {
    hideAuthModal();
    updateUserHeaderUI();

    const isAdmin = currentUser && currentUser.role === 'admin';
    const adminTabBtn = document.getElementById('v4-tab-btn-admin');
    const adminMobileBtn = document.getElementById('v4-tab-btn-admin-mobile');

    if (adminTabBtn) {
        adminTabBtn.classList.toggle('hidden', !isAdmin);
        adminTabBtn.classList.toggle('flex', isAdmin);
    }
    if (adminMobileBtn) {
        adminMobileBtn.classList.toggle('hidden', !isAdmin);
    }

    switchV4Tab('cloud-streams');

    if (typeof initProcessorStudio === 'function') {
        initProcessorStudio();
    }

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
    const isAdmin = currentUser.role === 'admin';
    const nameEl = document.getElementById('v4-user-name');
    const streamsEl = document.getElementById('v4-quota-streams');
    const diskEl = document.getElementById('v4-quota-disk');
    const planBadge = document.getElementById('sidebar-plan-badge');

    const activeStreams = currentUser.active_streams || 0;
    const maxStreams = currentUser.max_streams || (isAdmin ? 20 : 2);
    const usedMb = currentUser.disk_usage_mb || 0;
    const totalMb = currentUser.disk_quota_mb || 10240;
    const diskPct = Math.min(100, Math.round((usedMb / Math.max(1, totalMb)) * 100));
    const streamPct = Math.min(100, Math.round((activeStreams / Math.max(1, maxStreams)) * 100));
    const totalFormatted = totalMb >= 1024 ? (totalMb / 1024).toFixed(0) + ' GB' : totalMb + ' MB';
    const usedFormatted = usedMb >= 1024 ? (usedMb / 1024).toFixed(1) + ' GB' : usedMb.toLocaleString() + ' MB';

    if (nameEl) nameEl.innerText = currentUser.name || currentUser.id;
    if (planBadge) {
        planBadge.innerText = isAdmin ? 'Master Key • Admin' : `Gói SaaS • ${maxStreams} Luồng`;
    }
    if (streamsEl) streamsEl.innerText = `${activeStreams}/${maxStreams}`;
    if (diskEl) diskEl.innerText = `${usedFormatted} / ${totalFormatted}`;

    const heroActive = document.getElementById('v4-hero-active-streams');
    const heroMax = document.getElementById('v4-hero-max-streams');
    if (heroActive) heroActive.innerText = activeStreams;
    if (heroMax) heroMax.innerText = maxStreams;

    const heroDiskVal = document.getElementById('v4-hero-disk-val');
    const heroDiskPct = document.getElementById('v4-hero-disk-pct');
    const heroDiskBar = document.getElementById('v4-hero-disk-bar');
    if (heroDiskVal) heroDiskVal.innerText = `${usedFormatted} / ${totalFormatted}`;
    if (heroDiskPct) heroDiskPct.innerText = `${diskPct}%`;
    if (heroDiskBar) heroDiskBar.style.width = `${diskPct}%`;

    const credits = (currentUser.quota_remaining !== undefined) ? currentUser.quota_remaining : 0;
    const quotaCreditsEl = document.getElementById('v4-quota-credits');
    const csHeroCreditsEl = document.getElementById('cs-hero-credits');
    const csFormBalanceEl = document.getElementById('cs-form-balance');
    const heroCreditsStreams = document.getElementById('v4-hero-credits-streams');

    if (quotaCreditsEl) quotaCreditsEl.innerText = credits.toLocaleString();
    if (csHeroCreditsEl) csHeroCreditsEl.innerText = credits.toLocaleString();
    if (csFormBalanceEl) csFormBalanceEl.innerText = credits.toLocaleString();
    if (heroCreditsStreams) heroCreditsStreams.innerText = `${credits.toLocaleString()} Credits`;

    // Sidebar quota card
    const sbCredits = document.getElementById('sidebar-credits-text');
    const sbStreamsQuota = document.getElementById('sidebar-streams-quota');
    const sbStreamsBar = document.getElementById('sidebar-streams-bar');
    const sbDiskQuota = document.getElementById('sidebar-disk-quota');
    const sbDiskBar = document.getElementById('sidebar-disk-bar');
    if (sbCredits) sbCredits.innerText = `${credits.toLocaleString()} Credits`;
    if (sbStreamsQuota) sbStreamsQuota.innerText = `${activeStreams} / ${maxStreams}`;
    if (sbStreamsBar) sbStreamsBar.style.width = `${streamPct}%`;
    if (sbDiskQuota) sbDiskQuota.innerText = `${usedFormatted} / ${totalFormatted}`;
    if (sbDiskBar) sbDiskBar.style.width = `${diskPct}%`;
}

async function validateCloudKey() {
    const keyInput = document.getElementById('key-input');
    const errEl = document.getElementById('error-msg');
    const submitBtn = document.getElementById('btn-auth-key-submit');
    const apiKey = keyInput ? keyInput.value.trim() : '';

    if (!apiKey) {
        if (errEl) {
            errEl.innerText = 'Vui lòng nhập mã License / API Key!';
            errEl.classList.remove('hidden');
        }
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'ĐANG XÁC THỰC...';
    }

    let data = null;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey })
        });
        data = await res.json().catch(() => null);
        if (res.ok && data && data.success && data.user) {
            localStorage.setItem('hlc_api_key', apiKey);
            localStorage.setItem('hlc_cloud_key', apiKey);
            currentUser = data.user;
            if (errEl) errEl.classList.add('hidden');
            onLoginSuccess();
            showToast(`Chào mừng ${currentUser.name || currentUser.id} quay trở lại!`, 'success');
            return;
        }
    } catch (e) {
        if (errEl) {
            errEl.innerText = 'Không thể kết nối tới máy chủ xác thực!';
            errEl.classList.remove('hidden');
        }
        return;
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'KÍCH HOẠT & VÀO WORKSPACE';
        }
    }

    if (errEl) {
        errEl.innerText = (data && data.message) ? data.message : 'API Key không hợp lệ hoặc đã hết hạn!';
        errEl.classList.remove('hidden');
    }
}

async function submitAccountLogin(e) {
    if (e) e.preventDefault();
    const userEl = document.getElementById('account-username');
    const passEl = document.getElementById('account-password');
    const errEl = document.getElementById('account-error-msg');
    const btn = document.getElementById('btn-auth-account-submit');

    const username = userEl ? userEl.value.trim() : '';
    const password = passEl ? passEl.value : '';

    if (!username || !password) {
        if (errEl) {
            errEl.innerText = 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!';
            errEl.classList.remove('hidden');
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'ĐANG ĐĂNG NHẬP...';
    }

    try {
        const res = await fetch('/api/auth/account-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success && data.user) {
            localStorage.setItem('hlc_api_key', data.token);
            localStorage.setItem('hlc_cloud_key', data.token);
            currentUser = data.user;
            if (errEl) errEl.classList.add('hidden');
            onLoginSuccess();
            showToast(`Đăng nhập tài khoản ${currentUser.name} thành công!`, 'success');
        } else {
            if (errEl) {
                errEl.innerText = (data && data.message) ? data.message : 'Thông tin đăng nhập không chính xác!';
                errEl.classList.remove('hidden');
            }
        }
    } catch (err) {
        if (errEl) {
            errEl.innerText = 'Lỗi kết nối máy chủ: ' + err.message;
            errEl.classList.remove('hidden');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'ĐĂNG NHẬP WORKSPACE';
        }
    }
}

async function logoutV4() {
    const ok = await uiConfirm('Bạn có muốn khóa phiên hiện tại và quay lại màn hình đăng nhập?', 'Đăng xuất Workspace');
    if (!ok) return;
    try {
        await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() });
    } catch (e) {}
    localStorage.removeItem('hlc_api_key');
    localStorage.removeItem('hlc_cloud_key');
    currentUser = null;
    if (typeof stopProcessorStudio === 'function') {
        stopProcessorStudio();
    }
    showAuthModal();
    showToast('Đã đăng xuất khỏi Workspace.', 'info');
}

// =========================================================================
// 3. NAVIGATION, MOBILE SIDEBAR & COMMAND PALETTE (⌘K)
// =========================================================================

const V4_TAB_META = {
    'cloud-streams': { btn: 'v4-tab-btn-streams', title: 'Trung Tâm Luồng Live Cloud 24/7' },
    'content-studio': { btn: 'v4-tab-btn-content-studio', title: 'Content Studio AI — Tạo MC Ảo & Voice' },
    'cloud-media': { btn: 'v4-tab-btn-media', title: 'Kho Video Lưu Trữ Cloud' },
    'processor-studio': { btn: 'v4-tab-btn-processor', title: 'Bàn Điều Khiển Studio (OBS WebSocket v5)' },
    'billing-panel': { btn: 'v4-tab-btn-billing', title: 'Gói Cước Dịch Vụ & Hạn Mức Credits' },
    'admin-panel': { btn: 'v4-tab-btn-admin', title: 'Cổng Quản Trị Server & License Keys' }
};

function toggleMobileSidebar(forceState) {
    const sb = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    if (!sb) return;
    const isHidden = sb.classList.contains('-translate-x-full');
    const shouldOpen = typeof forceState === 'boolean' ? forceState : isHidden;
    if (shouldOpen) {
        sb.classList.remove('-translate-x-full');
        if (backdrop) backdrop.classList.remove('hidden');
    } else {
        sb.classList.add('-translate-x-full');
        if (backdrop) backdrop.classList.add('hidden');
    }
}

function switchV4Tab(tabId) {
    const panels = document.querySelectorAll('.v4-panel');
    panels.forEach(p => p.classList.add('hidden'));

    const targetPanel = document.getElementById(`panel-${tabId}`);
    if (targetPanel) targetPanel.classList.remove('hidden');

    const titleEl = document.getElementById('v4-page-title');
    if (titleEl && V4_TAB_META[tabId]) {
        titleEl.innerText = V4_TAB_META[tabId].title;
    }

    const isAdmin = currentUser && currentUser.role === 'admin';
    Object.entries(V4_TAB_META).forEach(([tab, meta]) => {
        const el = document.getElementById(meta.btn);
        if (!el) return;
        const hiddenAdmin = (tab === 'admin-panel' && !isAdmin);
        if (tab === tabId) {
            el.className = `${hiddenAdmin ? 'hidden' : 'flex'} w-full items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold bg-sky-500 text-white shadow-sm shadow-sky-500/20 transition-all cursor-pointer`;
        } else {
            const textCls = tab === 'admin-panel'
                ? 'text-purple-400 hover:bg-purple-500/10'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-elevated)]';
            el.className = `${hiddenAdmin ? 'hidden' : 'flex'} w-full items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium ${textCls} transition-all cursor-pointer`;
        }
    });

    toggleMobileSidebar(false);

    if (tabId === 'cloud-streams') {
        loadCloudStreams(true);
    } else if (tabId === 'content-studio') {
        loadContentStudio();
    } else if (tabId === 'cloud-media') {
        loadCloudMedia();
    } else if (tabId === 'billing-panel') {
        loadBillingPanel();
    } else if (tabId === 'admin-panel') {
        loadAdminPanel();
    }
}

function openCommandPalette() {
    const modal = document.getElementById('modal-command-palette');
    const input = document.getElementById('cmd-search-input');
    if (!modal) return;
    modal.classList.remove('hidden');
    if (input) {
        input.value = '';
        renderCommandItems('');
        setTimeout(() => input.focus(), 40);
    }
}

function closeCommandPalette() {
    const modal = document.getElementById('modal-command-palette');
    if (modal) modal.classList.add('hidden');
}

function renderCommandItems(query) {
    const q = (query || '').trim().toLowerCase();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const cmds = [
        { label: '📡 Chuyển tới Cloud Streams 24/7', action: () => switchV4Tab('cloud-streams') },
        { label: '✨ Chuyển tới Content Studio AI', action: () => switchV4Tab('content-studio') },
        { label: '📁 Mở Kho Video Media', action: () => switchV4Tab('cloud-media') },
        { label: '🎛️ Mở Bàn Điều Khiển Studio (OBS)', action: () => switchV4Tab('processor-studio') },
        { label: '💳 Xem Gói Cước & Hạn Mức Credits', action: () => switchV4Tab('billing-panel') },
        { label: '➕ Khởi Tạo Luồng Live Mới', action: () => openNewStreamModal() },
        { label: '🌗 Đổi Giao Diện Sáng / Tối', action: () => toggleTheme() },
        { label: '🔑 Đổi Mã Khóa / Đăng Xuất', action: () => logoutV4() }
    ];
    if (isAdmin) {
        cmds.splice(5, 0, { label: '🛡️ Mở Cổng Quản Trị Admin Portal', action: () => switchV4Tab('admin-panel') });
        cmds.splice(6, 0, { label: '➕ Cấp License Key Khách Hàng Mới', action: () => { switchV4Tab('admin-panel'); openNewKeyModal(); } });
    }
    const filtered = cmds.filter(c => !q || c.label.toLowerCase().includes(q));
    window.__v4CmdList = filtered;
    const box = document.getElementById('cmd-items-list');
    if (!box) return;
    if (filtered.length === 0) {
        box.innerHTML = `<div class="p-4 text-center text-xs text-[var(--text-muted)]">Không tìm thấy lệnh phù hợp.</div>`;
        return;
    }
    box.innerHTML = filtered.map((c, idx) => `
        <button type="button" onclick="runCommandIndex(${idx})" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[var(--bg-elevated)] text-[var(--text-main)] text-xs font-medium transition-all cursor-pointer flex items-center justify-between">
            <span>${c.label}</span>
            <span class="text-[var(--text-muted)]">↵</span>
        </button>
    `).join('');
}

function runCommandIndex(idx) {
    closeCommandPalette();
    if (window.__v4CmdList && window.__v4CmdList[idx]) {
        window.__v4CmdList[idx].action();
    }
}

window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const appShell = document.getElementById('app-shell');
        if (appShell && !appShell.classList.contains('hidden')) {
            e.preventDefault();
            openCommandPalette();
        }
    } else if (e.key === 'Escape') {
        closeCommandPalette();
    }
});

// =========================================================================
// 4. TAB 1: CLOUD STREAMS CONTROLLER
// =========================================================================

function filterCloudStreams(status) {
    cloudStreamFilter = status;
    ['all', 'running', 'stopped'].forEach(k => {
        const btn = document.getElementById(`stream-filter-${k}`);
        if (!btn) return;
        btn.className = (k === status)
            ? 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-500 text-white cursor-pointer transition-all shadow-sm'
            : 'px-3 py-1.5 rounded-xl text-xs font-medium saas-surface text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer transition-all';
    });
    renderCloudStreams(cloudStreamsList);
}

function searchCloudStreams(q) {
    cloudStreamSearchQuery = (q || '').trim().toLowerCase();
    renderCloudStreams(cloudStreamsList);
}

async function loadCloudStreams(showLoading = false) {
    const container = document.getElementById('cloud-streams-list');
    if (!container) return;

    if (showLoading && container.innerHTML.trim() === '') {
        container.innerHTML = `<div class="text-[var(--text-muted)] text-xs italic py-8 text-center">Đang tải danh sách luồng phát sóng...</div>`;
    }

    try {
        const res = await fetch('/api/cloud-streams', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            cloudStreamsList = data.streams || [];
            if (currentUser) {
                currentUser.active_streams = data.active_count || 0;
                currentUser.max_streams = data.max_streams || currentUser.max_streams;
            }

            const badge = document.getElementById('v4-active-streams-badge');
            if (badge) badge.innerText = data.active_count || 0;

            updateUserHeaderUI();
            renderCloudStreams(cloudStreamsList);
        }
    } catch (e) {
        console.error('Load cloud streams error:', e);
    }
}

function renderCloudStreams(streams) {
    const container = document.getElementById('cloud-streams-list');
    if (!container) return;

    if (!streams || streams.length === 0) {
        container.innerHTML = `
            <div class="saas-card p-8 sm:p-12 rounded-3xl text-center border-dashed space-y-5">
                <div class="inline-flex p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                    <svg class="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg>
                </div>
                <div class="max-w-lg mx-auto space-y-2">
                    <h4 class="text-lg font-bold text-[var(--text-main)]">Chưa có luồng phát sóng 24/7 nào</h4>
                    <p class="text-xs text-[var(--text-muted)] leading-relaxed">
                        Hoàn tất 3 bước đơn giản để phát sóng liên tục trên Cloud Server ngay cả khi tắt máy tính:
                    </p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left text-xs">
                    <div class="saas-surface p-3.5 rounded-xl space-y-1">
                        <div class="font-bold text-[var(--text-main)]">1. Tải Video lên Cloud</div>
                        <div class="text-[var(--text-muted)]">Upload MP4/MKV tại Kho Video Media hoặc tạo MC AI.</div>
                    </div>
                    <div class="saas-surface p-3.5 rounded-xl space-y-1">
                        <div class="font-bold text-[var(--text-main)]">2. Gắn RTMP &amp; Stream Key</div>
                        <div class="text-[var(--text-muted)]">Chọn preset TikTok, Shopee, Facebook hoặc YouTube.</div>
                    </div>
                    <div class="saas-surface p-3.5 rounded-xl space-y-1">
                        <div class="font-bold text-[var(--text-main)]">3. Bấm Phát Live 24/7</div>
                        <div class="text-[var(--text-muted)]">Direct Copy ~1% CPU, Watchdog tự nối lại khi rớt mạng.</div>
                    </div>
                </div>
                <div class="flex flex-wrap justify-center gap-3 pt-1">
                    <button type="button" onclick="openNewStreamModal()" class="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition-all cursor-pointer">
                        ➕ Khởi Tạo Luồng Live Đầu Tiên
                    </button>
                    <button type="button" onclick="switchV4Tab('cloud-media')" class="px-4 py-2.5 saas-surface hover:bg-[var(--bg-elevated)] text-[var(--text-main)] font-semibold text-xs rounded-xl transition-all cursor-pointer">
                        📁 Mở Kho Video Media
                    </button>
                </div>
            </div>
        `;
        return;
    }

    const filtered = streams.filter(s => {
        if (cloudStreamFilter === 'running' && s.status !== 'running' && s.status !== 'starting' && s.status !== 'restarting') return false;
        if (cloudStreamFilter === 'stopped' && (s.status === 'running' || s.status === 'starting' || s.status === 'restarting')) return false;
        if (cloudStreamSearchQuery) {
            const hay = `${s.title || ''} ${s.input_file || ''} ${s.rtmp_url || ''} ${s.stream_id || ''}`.toLowerCase();
            if (!hay.includes(cloudStreamSearchQuery)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="saas-card p-10 rounded-2xl text-center text-xs text-[var(--text-muted)]">Không có luồng nào khớp với bộ lọc hiện tại.</div>`;
        return;
    }

    let html = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;

    filtered.forEach(s => {
        const isRunning = s.status === 'running';
        const isStarting = s.status === 'starting' || s.status === 'restarting';
        const isError = s.status === 'error';

        let statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold saas-surface text-[var(--text-muted)]">○ Đã dừng</span>`;
        let cardBorder = '';
        if (isRunning) {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>Đang Live 24/7</span>`;
            cardBorder = 'border-emerald-500/40';
        } else if (isStarting) {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Đang kết nối...</span>`;
            cardBorder = 'border-amber-500/40';
        } else if (isError) {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">⚠ Lỗi kết nối</span>`;
            cardBorder = 'border-rose-500/40';
        }

        const uptimeStr = s.uptime_sec ? formatUptime(s.uptime_sec) : '--:--:--';
        const modeBadge = s.mode === 'direct'
            ? `<span class="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-mono font-semibold">Direct Copy</span>`
            : `<span class="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-mono font-semibold">Transcode x264</span>`;

        const safeId = escapeHtml(s.stream_id);
        const safeTitle = escapeHtml(s.title);

        html += `
            <div class="saas-card ${cardBorder} p-5 rounded-2xl flex flex-col justify-between space-y-4">
                <div class="space-y-3">
                    <div class="flex justify-between items-start gap-2">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h4 class="font-bold text-[var(--text-main)] text-sm truncate">${safeTitle}</h4>
                                ${modeBadge}
                            </div>
                            <span class="text-xs text-[var(--text-muted)] font-mono">ID: ${safeId}</span>
                        </div>
                        <div class="shrink-0">${statusBadge}</div>
                    </div>

                    <div class="saas-surface p-3.5 rounded-xl space-y-1.5 text-xs font-mono">
                        <div class="flex justify-between gap-2 text-[var(--text-muted)]">
                            <span>🎬 Video loop:</span>
                            <span class="text-[var(--text-main)] truncate max-w-[220px]" title="${escapeHtml(s.input_file)}">${escapeHtml(s.input_file)}</span>
                        </div>
                        <div class="flex justify-between gap-2 text-[var(--text-muted)]">
                            <span>🌐 RTMP:</span>
                            <span class="text-sky-400 truncate max-w-[220px]" title="${escapeHtml(s.rtmp_url)}">${escapeHtml(s.rtmp_url)}</span>
                        </div>
                        <div class="flex justify-between gap-2 text-[var(--text-muted)]">
                            <span>🔑 Stream Key:</span>
                            <span class="text-[var(--text-main)] font-semibold">${escapeHtml(s.stream_key_masked)}</span>
                        </div>
                        <div class="flex justify-between gap-2 text-[var(--text-muted)] pt-1.5 border-t border-[var(--border-subtle)]">
                            <span>⏱️ Thời gian live:</span>
                            <span class="text-amber-400 font-bold tabular-nums">${uptimeStr}</span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <div class="flex items-center gap-1.5">
                        <button type="button" data-sid="${safeId}" data-title="${safeTitle}" onclick="openStreamLogsModal(this.dataset.sid, this.dataset.title)" class="px-3 py-1.5 rounded-xl saas-surface hover:bg-[var(--bg-elevated)] text-[var(--text-main)] text-xs font-semibold transition-all cursor-pointer">
                            📜 Logs
                        </button>
                        <button type="button" data-sid="${safeId}" onclick="deleteCloudStream(this.dataset.sid)" class="p-2 rounded-xl text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer" title="Xóa luồng">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>

                    <div>
                        ${isRunning ? `
                            <button type="button" data-sid="${safeId}" onclick="stopCloudStream(this.dataset.sid)" class="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all cursor-pointer">
                                ⏹ Dừng Live
                            </button>
                        ` : `
                            <button type="button" data-sid="${safeId}" onclick="startCloudStream(this.dataset.sid)" class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all cursor-pointer">
                                ▶ Bắt Đầu Live
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
            showToast(data.message || 'Đã khởi chạy luồng live!', 'success');
            loadCloudStreams(false);
        } else {
            showToast(data.message || 'Không thể bắt đầu luồng live', 'error');
        }
    } catch (e) {
        showToast('Lỗi mạng: ' + e.message, 'error');
    }
}

async function stopCloudStream(streamId) {
    const ok = await uiConfirm('Bạn có chắc chắn muốn DỪNG phát sóng luồng live này?', 'Dừng luồng Live', true);
    if (!ok) return;
    try {
        const res = await fetch('/api/cloud-streams/stop', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ stream_id: streamId })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Đã dừng luồng phát sóng.', 'info');
            loadCloudStreams(false);
        } else {
            showToast(data.message || 'Không thể dừng luồng live', 'error');
        }
    } catch (e) {
        showToast('Lỗi mạng: ' + e.message, 'error');
    }
}

async function deleteCloudStream(streamId) {
    const ok = await uiConfirm('Bạn có chắc chắn muốn xóa cấu hình luồng live này?', 'Xóa cấu hình luồng', true);
    if (!ok) return;
    try {
        const res = await fetch('/api/cloud-streams/delete', {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ stream_id: streamId })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Đã xóa cấu hình luồng.', 'success');
            loadCloudStreams(false);
        } else {
            showToast(data.message || 'Không thể xóa luồng', 'error');
        }
    } catch (e) {
        showToast('Lỗi mạng: ' + e.message, 'error');
    }
}

// --- MODAL: KHỞI TẠO LUỒNG LIVE MỚI ---

async function openNewStreamModal(preselectedVideo = '') {
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
                    videoSelect.innerHTML = `<option value="">⚠️ Chưa có video nào! Vui lòng tải lên ở Kho Video Media.</option>`;
                } else {
                    let optHtml = `<option value="">-- Chọn video phát sóng --</option>`;
                    cloudMediaList.forEach(v => {
                        const isSel = (v.filename === preselectedVideo) ? 'selected' : '';
                        optHtml += `<option value="${escapeHtml(v.filename)}" ${isSel}>${escapeHtml(v.filename)} (${v.size_mb} MB)</option>`;
                    });
                    videoSelect.innerHTML = optHtml;
                }
            }
        } catch (e) {
            videoSelect.innerHTML = `<option value="">Lỗi tải danh sách video</option>`;
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
        urlInput.value = 'rtmp://live-push.tiktok.com/live/';
    } else if (platform === 'shopee') {
        urlInput.value = 'rtmp://live.shopee.vn/live/';
    } else if (platform === 'facebook') {
        urlInput.value = 'rtmps://live-api-s.facebook.com:443/rtmp/';
    } else if (platform === 'youtube') {
        urlInput.value = 'rtmp://a.rtmp.youtube.com/live2';
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
        showToast('Vui lòng chọn video nguồn phát!', 'warning');
        return;
    }
    if (!rtmp) {
        showToast('Vui lòng nhập RTMP Server URL!', 'warning');
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
            showToast('Đã lưu cấu hình luồng mới!', 'success');
            loadCloudStreams(false);
            if (autoStart && data.stream) {
                startCloudStream(data.stream.stream_id);
            }
        } else {
            showToast(data.message || 'Lỗi lưu luồng phát sóng', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
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
                box.innerHTML = `<span class="text-slate-500 italic">Chưa có bản ghi nhật ký...</span>`;
            } else {
                box.innerHTML = data.logs.map(l => `<div>${escapeHtml(l)}</div>`).join('');
                box.scrollTop = box.scrollHeight;
            }
        }
    } catch (e) {}
}

// =========================================================================
// 5. TAB 3: KHO VIDEO CLOUD (MEDIA VAULT + DRAG-DROP + GRID/TABLE)
// =========================================================================

function setMediaViewMode(mode) {
    mediaViewMode = mode;
    const tableBtn = document.getElementById('media-view-table-btn');
    const gridBtn = document.getElementById('media-view-grid-btn');
    const tableWrap = document.getElementById('media-table-wrap');
    const gridWrap = document.getElementById('cloud-media-grid');

    if (tableBtn) {
        tableBtn.className = (mode === 'table')
            ? 'px-3 py-1.5 rounded-xl bg-sky-500 text-white text-xs font-semibold cursor-pointer'
            : 'px-3 py-1.5 rounded-xl saas-surface text-[var(--text-muted)] text-xs font-medium cursor-pointer';
    }
    if (gridBtn) {
        gridBtn.className = (mode === 'grid')
            ? 'px-3 py-1.5 rounded-xl bg-sky-500 text-white text-xs font-semibold cursor-pointer'
            : 'px-3 py-1.5 rounded-xl saas-surface text-[var(--text-muted)] text-xs font-medium cursor-pointer';
    }
    if (tableWrap) tableWrap.classList.toggle('hidden', mode !== 'table');
    if (gridWrap) gridWrap.classList.toggle('hidden', mode !== 'grid');
    renderCloudMedia(cloudMediaList);
}

function searchCloudMedia(q) {
    mediaSearchQuery = (q || '').trim().toLowerCase();
    renderCloudMedia(cloudMediaList);
}

async function loadCloudMedia() {
    const listEl = document.getElementById('cloud-media-list');
    const quotaBar = document.getElementById('media-quota-bar');
    const quotaText = document.getElementById('media-quota-text');
    const quotaWarn = document.getElementById('media-quota-warning');

    if (!listEl) return;
    listEl.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-[var(--text-muted)] text-xs italic">Đang tải kho video từ Cloud...</td></tr>`;

    try {
        const res = await fetch('/api/media/list', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            cloudMediaList = data.files || [];
            const pct = Math.min(100, data.percent || 0);
            const totalMb = data.quota_mb || (currentUser ? currentUser.disk_quota_mb : 10240);
            if (currentUser) {
                currentUser.disk_usage_mb = data.usage_mb || 0;
                currentUser.disk_quota_mb = totalMb;
            }

            if (quotaBar) {
                quotaBar.style.width = `${pct}%`;
                quotaBar.className = pct >= 80
                    ? 'bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full transition-all duration-300'
                    : 'bg-gradient-to-r from-sky-500 to-emerald-500 h-full rounded-full transition-all duration-300';
            }
            if (quotaWarn) quotaWarn.classList.toggle('hidden', pct < 80);
            if (quotaText) {
                quotaText.innerText = `${(data.usage_mb || 0).toLocaleString()} MB / ${totalMb.toLocaleString()} MB (${pct}%)`;
            }

            updateUserHeaderUI();
            renderCloudMedia(cloudMediaList);
        }
    } catch (e) {
        listEl.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-rose-400 text-xs">Lỗi kết nối tải video: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function renderCloudMedia(files) {
    const listEl = document.getElementById('cloud-media-list');
    const gridEl = document.getElementById('cloud-media-grid');
    if (!listEl) return;

    const filtered = (files || []).filter(f => !mediaSearchQuery || (f.filename || '').toLowerCase().includes(mediaSearchQuery));

    if (filtered.length === 0) {
        const emptyMsg = mediaSearchQuery
            ? 'Không tìm thấy video nào khớp từ khóa tìm kiếm.'
            : 'Kho video của bạn đang trống. Kéo thả video vào vùng tải lên phía trên để lưu trữ trên Cloud.';
        listEl.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center text-[var(--text-muted)] text-xs space-y-2">
                    <div class="text-3xl">📁</div>
                    <div class="font-bold text-[var(--text-main)]">${emptyMsg}</div>
                </td>
            </tr>
        `;
        if (gridEl) {
            gridEl.innerHTML = `<div class="col-span-full py-10 text-center text-xs text-[var(--text-muted)]">${emptyMsg}</div>`;
        }
        return;
    }

    let tableHtml = '';
    let gridHtml = '';
    filtered.forEach(f => {
        const safeName = escapeHtml(f.filename);
        const safeExt = escapeHtml(f.ext);
        const safeDate = escapeHtml(f.modified_at);

        tableHtml += `
            <tr class="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]/40 transition-all text-xs">
                <td class="py-3 px-4 font-mono font-semibold text-[var(--text-main)] flex items-center gap-2">
                    <span class="text-base">🎬</span>
                    <span class="truncate max-w-[280px]" title="${safeName}">${safeName}</span>
                </td>
                <td class="py-3 px-4 font-mono text-sky-400 font-bold tabular-nums">${f.size_mb.toLocaleString()} MB</td>
                <td class="py-3 px-4 font-mono text-[var(--text-muted)] uppercase">${safeExt}</td>
                <td class="py-3 px-4 text-[var(--text-muted)] tabular-nums">${safeDate}</td>
                <td class="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                    <button type="button" data-fname="${safeName}" onclick="quickStreamWithVideo(this.dataset.fname)" class="px-3 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500 text-sky-400 hover:text-white border border-sky-500/30 text-xs font-semibold transition-all cursor-pointer">
                        🚀 Phát Live
                    </button>
                    <button type="button" data-fname="${safeName}" onclick="deleteCloudMedia(this.dataset.fname)" class="px-3 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer">
                        🗑️ Xóa
                    </button>
                </td>
            </tr>
        `;

        gridHtml += `
            <div class="saas-surface p-4 rounded-2xl space-y-3 flex flex-col justify-between">
                <div class="space-y-1.5">
                    <div class="flex items-start justify-between gap-2">
                        <span class="text-xl">🎬</span>
                        <span class="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] font-mono text-xs uppercase text-[var(--text-muted)]">${safeExt}</span>
                    </div>
                    <div class="font-mono text-xs font-bold text-[var(--text-main)] truncate" title="${safeName}">${safeName}</div>
                    <div class="text-xs text-[var(--text-muted)] tabular-nums">${f.size_mb.toLocaleString()} MB • ${safeDate}</div>
                </div>
                <div class="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <button type="button" data-fname="${safeName}" onclick="quickStreamWithVideo(this.dataset.fname)" class="flex-1 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold cursor-pointer">
                        🚀 Phát Live
                    </button>
                    <button type="button" data-fname="${safeName}" onclick="deleteCloudMedia(this.dataset.fname)" class="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white text-xs font-semibold cursor-pointer">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });

    listEl.innerHTML = tableHtml;
    if (gridEl) gridEl.innerHTML = gridHtml;
}

function handleMediaDrop(event) {
    event.preventDefault();
    const zone = document.getElementById('media-dropzone');
    if (zone) zone.classList.remove('ring-2', 'ring-sky-500');
    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        handleMediaUpload(event.dataTransfer.files);
    }
}

function handleMediaUpload(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const allowed = ['.mp4', '.mkv', '.flv', '.mov', '.avi', '.ts'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!allowed.includes(ext)) {
        showToast('Chỉ hỗ trợ định dạng video MP4, MKV, FLV, MOV, AVI, TS!', 'error');
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

    xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressText) progressText.innerText = `Đang tải lên: ${percent}% (${(e.loaded / (1024 * 1024)).toFixed(1)}MB / ${(e.total / (1024 * 1024)).toFixed(1)}MB)`;
        }
    };

    xhr.onload = function () {
        if (progressBox) progressBox.classList.add('hidden');
        try {
            const res = JSON.parse(xhr.responseText);
            if (res.success) {
                showToast(`Đã tải lên thành công: ${res.filename} (${res.size_mb} MB)`, 'success');
                loadCloudMedia();
            } else {
                showToast(res.message || 'Lỗi tải lên file', 'error');
            }
        } catch (e) {
            showToast('Lỗi tải lên: ' + xhr.responseText, 'error');
        }
    };

    xhr.onerror = function () {
        if (progressBox) progressBox.classList.add('hidden');
        showToast('Lỗi mạng khi tải file lên server!', 'error');
    };

    xhr.send(formData);
}

async function deleteCloudMedia(filename) {
    const ok = await uiConfirm(`Bạn có chắc chắn muốn XÓA video "${filename}" khỏi kho Cloud?`, 'Xóa video Cloud', true);
    if (!ok) return;
    try {
        const res = await fetch('/api/media/delete', {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ filename })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Đã xóa video "${filename}".`, 'success');
            loadCloudMedia();
        } else {
            showToast(data.message || 'Không thể xóa video', 'error');
        }
    } catch (e) {
        showToast('Lỗi mạng: ' + e.message, 'error');
    }
}

function quickStreamWithVideo(filename) {
    switchV4Tab('cloud-streams');
    openNewStreamModal(filename);
}

// =========================================================================
// 6. TAB 5: GÓI CƯỚC & HẠN MỨC CREDITS (SAAS BILLING)
// =========================================================================

function loadBillingPanel() {
    if (!currentUser) return;
    const isAdmin = currentUser.role === 'admin';
    const planTitle = document.getElementById('billing-current-plan');
    const planDesc = document.getElementById('billing-current-desc');
    const planExpiry = document.getElementById('billing-current-expiry');
    const maxStreams = currentUser.max_streams || (isAdmin ? 20 : 2);
    const totalMb = currentUser.disk_quota_mb || 10240;
    const totalGb = totalMb >= 1024 ? `${(totalMb / 1024).toFixed(0)} GB` : `${totalMb} MB`;
    const credits = (currentUser.quota_remaining !== undefined) ? currentUser.quota_remaining : 0;

    if (planTitle) {
        planTitle.innerText = isAdmin ? 'Master Station Plan (Admin)' : (maxStreams >= 10 ? 'Enterprise Agency Plan' : (maxStreams >= 4 ? 'Growth Studio Plan' : 'Starter Cloud Plan'));
    }
    if (planDesc) {
        planDesc.innerText = `Hạn mức hiện tại: Tối đa ${maxStreams} luồng 24/7 • ${totalGb} NVMe • Còn ${credits.toLocaleString()} AI Credits`;
    }
    if (planExpiry) {
        planExpiry.innerText = currentUser.expires_at ? `Hết hạn: ${currentUser.expires_at.slice(0, 10)}` : 'Thời hạn: Không giới hạn (Active)';
    }

    renderPricingTiers();
}

function setBillingCycle(cycle) {
    billingCycle = cycle;
    const mBtn = document.getElementById('bill-monthly-btn');
    const yBtn = document.getElementById('bill-yearly-btn');
    if (mBtn) {
        mBtn.className = (cycle === 'monthly')
            ? 'px-3.5 py-1.5 rounded-lg bg-[var(--bg-card)] text-[var(--text-main)] font-semibold shadow-sm cursor-pointer'
            : 'px-3.5 py-1.5 rounded-lg text-[var(--text-muted)] cursor-pointer';
    }
    if (yBtn) {
        yBtn.className = (cycle === 'yearly')
            ? 'px-3.5 py-1.5 rounded-lg bg-[var(--bg-card)] text-[var(--text-main)] font-semibold shadow-sm cursor-pointer'
            : 'px-3.5 py-1.5 rounded-lg text-[var(--text-muted)] cursor-pointer';
    }
    renderPricingTiers();
}

function renderPricingTiers() {
    const container = document.getElementById('billing-pricing-grid');
    if (!container) return;
    const mult = billingCycle === 'yearly' ? 0.8 : 1;
    const maxStreams = currentUser ? (currentUser.max_streams || 2) : 2;

    const tiers = [
        {
            id: 'starter',
            name: 'Starter Cloud',
            price: Math.round(299000 * mult),
            desc: 'Phù hợp shop mới khởi chạy livestream tự động',
            features: ['2 luồng Live 24/7 song song', '10 GB Cloud Storage NVMe', '200 AI Studio Credits / tháng', 'Watchdog tự nối lại RTMP'],
            isCurrent: maxStreams <= 2
        },
        {
            id: 'growth',
            name: 'Growth Studio',
            price: Math.round(599000 * mult),
            desc: 'Tối ưu cho shop bán đa sàn TikTok & Shopee',
            features: ['5 luồng Live 24/7 song song', '25 GB Cloud Storage NVMe', '600 AI Studio Credits / tháng', 'Hỗ trợ AI MC Lip-sync 60fps'],
            isCurrent: maxStreams > 2 && maxStreams <= 8,
            recommended: true
        },
        {
            id: 'agency',
            name: 'Enterprise Agency',
            price: Math.round(1490000 * mult),
            desc: 'Dành cho MCN / Agency vận hành nhiều nhãn hàng',
            features: ['20 luồng Live 24/7 song song', '100 GB Cloud Storage NVMe', '2.500 AI Studio Credits / tháng', 'Ưu tiên luồng & Hỗ trợ kỹ thuật 1:1'],
            isCurrent: maxStreams > 8
        }
    ];

    container.innerHTML = tiers.map(t => `
        <div class="saas-card ${t.recommended ? 'border-sky-500/60 ring-1 ring-sky-500/30' : ''} p-6 rounded-2xl flex flex-col justify-between space-y-5">
            <div class="space-y-3">
                <div class="flex items-center justify-between gap-2">
                    <h4 class="text-base font-bold text-[var(--text-main)]">${t.name}</h4>
                    ${t.isCurrent
                        ? `<span class="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">Đang dùng</span>`
                        : (t.recommended ? `<span class="px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 text-xs font-semibold">Phổ biến</span>` : '')}
                </div>
                <p class="text-xs text-[var(--text-muted)]">${t.desc}</p>
                <div class="text-2xl font-black font-mono tabular-nums text-[var(--text-main)]">
                    ${t.price.toLocaleString()}đ <span class="text-xs font-sans font-normal text-[var(--text-muted)]">/ tháng</span>
                </div>
                <ul class="space-y-2 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-main)]">
                    ${t.features.map(f => `<li class="flex items-center gap-2"><span class="text-emerald-400">✓</span><span>${f}</span></li>`).join('')}
                </ul>
            </div>
            <button type="button" onclick="requestUpgradePlan('${t.name}')" class="w-full py-2.5 rounded-xl ${t.isCurrent ? 'saas-surface text-[var(--text-main)] hover:bg-[var(--bg-elevated)]' : 'bg-sky-500 hover:bg-sky-400 text-white'} text-xs font-semibold transition-all cursor-pointer">
                ${t.isCurrent ? 'Gia hạn gói hiện tại' : 'Gửi yêu cầu nâng cấp'}
            </button>
        </div>
    `).join('');
}

async function requestUpgradePlan(planName) {
    const uid = currentUser ? (currentUser.name || currentUser.id) : 'Khách hàng';
    if (currentUser && currentUser.role === 'admin') {
        switchV4Tab('admin-panel');
        showToast('Bạn đang dùng Master Admin Key — có thể chỉnh hạn mức trực tiếp tại Admin Portal.', 'info');
        return;
    }
    await uiConfirm(
        `Yêu cầu nâng cấp / gia hạn gói "${planName}" cho Workspace "${uid}". Vui lòng gửi mã License Key của bạn cho Quản trị viên để kích hoạt hạn mức ngay lập tức.`,
        'Yêu cầu nâng cấp dịch vụ'
    );
    showToast(`Đã ghi nhận yêu cầu gói ${planName}. Liên hệ Admin để kích hoạt!`, 'success');
}

async function requestCreditTopup(amount, priceLabel) {
    const uid = currentUser ? (currentUser.name || currentUser.id) : 'Khách hàng';
    if (currentUser && currentUser.role === 'admin') {
        switchV4Tab('admin-panel');
        showToast('Tài khoản Admin có thể nạp Credits trực tiếp trong bảng License Keys.', 'info');
        return;
    }
    await uiConfirm(
        `Gói nạp +${amount.toLocaleString()} AI Credits (${priceLabel}) cho "${uid}". Vui lòng liên hệ Quản trị viên kèm mã License Key để cộng Credits vào tài khoản.`,
        'Nạp AI Studio Credits'
    );
    showToast(`Vui lòng liên hệ Admin để cộng +${amount.toLocaleString()} Credits.`, 'info');
}

// =========================================================================
// 7. TAB 6: ADMIN PORTAL (LICENSE KEYS, SYSTEM TELEMETRY & PLATFORMS)
// =========================================================================

function filterAdminKeys(q) {
    adminKeysSearchQuery = (q || '').trim().toLowerCase();
    renderAdminKeysTable(adminKeysList);
}

async function loadAdminPanel() {
    if (!currentUser || currentUser.role !== 'admin') return;

    try {
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
            if (uptimeEl) uptimeEl.innerText = sys.uptime || 'N/A';

            renderAdminGlobalStreams(sysData.all_streams || []);
        }

        const keysRes = await fetch('/api/admin/keys', { headers: getAuthHeaders() });
        const keysData = await keysRes.json();
        if (keysData.success && keysData.keys) {
            adminKeysList = keysData.keys;
            renderAdminKeysTable(adminKeysList);
        }

        loadPlatformConfigs();
    } catch (e) {
        console.error('Admin load error:', e);
    }
}

function renderAdminKeysTable(keys) {
    const tableBody = document.getElementById('admin-keys-table');
    if (!tableBody) return;

    const filtered = (keys || []).filter(k => {
        if (!adminKeysSearchQuery) return true;
        return `${k.name || ''} ${k.key || ''} ${k.id || ''}`.toLowerCase().includes(adminKeysSearchQuery);
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-xs text-[var(--text-muted)]">Không tìm thấy License Key nào phù hợp.</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(k => {
        const isMaster = k.role === 'admin';
        const isActive = k.status === 'active';
        const safeKey = escapeHtml(k.key);
        const safeName = escapeHtml(k.name);

        html += `
            <tr class="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]/40 transition-all text-xs">
                <td class="py-3 px-4 font-mono font-bold">
                    <div class="flex items-center gap-2">
                        <span class="truncate max-w-[200px] text-purple-400 select-all" title="${safeKey}">${safeKey}</span>
                        <button type="button" data-key="${safeKey}" onclick="copyKeyToClipboard(this.dataset.key)" class="p-1.5 rounded-lg saas-surface hover:bg-purple-600 hover:text-white text-[var(--text-muted)] cursor-pointer transition-all" title="Sao chép Mã Khóa">
                            📋
                        </button>
                    </div>
                </td>
                <td class="py-3 px-4 text-[var(--text-main)] font-semibold">${safeName}</td>
                <td class="py-3 px-4 font-mono font-bold text-sky-400 tabular-nums">${k.active_streams || 0} / ${k.max_streams}</td>
                <td class="py-3 px-4 font-mono text-[var(--text-muted)] tabular-nums">${(k.disk_usage_mb || 0).toLocaleString()} MB / ${(k.disk_quota_mb || 0).toLocaleString()} MB</td>
                <td class="py-3 px-4 font-mono font-bold text-purple-400 tabular-nums">
                    ${(k.quota_remaining !== undefined ? k.quota_remaining : 0).toLocaleString()} Credits
                </td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${isActive ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'}">
                            ${isActive ? '● Hoạt động' : '○ Tạm khóa'}
                        </span>
                        ${k.synced_supabase ? `<span class="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 text-xs font-mono">Cloud</span>` : ''}
                    </div>
                </td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    ${!isMaster ? `
                        <button type="button" data-key="${safeKey}" data-target="${isActive ? 'revoked' : 'active'}" onclick="toggleKeyStatus(this.dataset.key, this.dataset.target)" class="px-2.5 py-1 rounded-lg ${isActive ? 'bg-rose-500/15 hover:bg-rose-600 text-rose-400 border-rose-500/30' : 'bg-emerald-500/15 hover:bg-emerald-600 text-emerald-400 border-emerald-500/30'} hover:text-white border text-xs font-semibold transition-all cursor-pointer">
                            ${isActive ? '🔒 Khóa' : '🔓 Mở'}
                        </button>
                        <button type="button" data-key="${safeKey}" data-name="${safeName}" onclick="openTopupModal(this.dataset.key, this.dataset.name)" class="px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-600 text-purple-400 hover:text-white border border-purple-500/30 text-xs font-semibold transition-all cursor-pointer">
                            ✨ + Nạp
                        </button>
                        <button type="button" data-key="${safeKey}" onclick="adminDeleteKey(this.dataset.key)" class="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer">
                            Xóa
                        </button>
                    ` : `<span class="text-amber-400 font-semibold text-xs">Khóa Gốc (Vô Hạn)</span>`}
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
        container.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-[var(--text-muted)] text-xs italic">Hiện không có luồng nào đang phát trên toàn server.</td></tr>`;
        return;
    }

    let html = '';
    streams.forEach(s => {
        const safeId = escapeHtml(s.stream_id);
        html += `
            <tr class="border-b border-[var(--border-subtle)] text-xs">
                <td class="py-2.5 px-3 font-mono font-bold text-sky-400">${escapeHtml(s.username || s.name || 'Kênh')}</td>
                <td class="py-2.5 px-3 text-[var(--text-main)] font-semibold">${escapeHtml(s.title)}</td>
                <td class="py-2.5 px-3 font-mono text-[var(--text-muted)] truncate max-w-[160px]">${escapeHtml(s.input_file)}</td>
                <td class="py-2.5 px-3">
                    <span class="text-xs font-mono font-bold ${s.status === 'running' ? 'text-emerald-400' : 'text-[var(--text-muted)]'}">
                        ${escapeHtml(s.status).toUpperCase()}
                    </span>
                </td>
                <td class="py-2.5 px-3 font-mono text-amber-400 tabular-nums">${s.uptime_sec ? formatUptime(s.uptime_sec) : '--'}</td>
                <td class="py-2.5 px-3 text-right">
                    ${s.status === 'running' ? `
                        <button type="button" data-sid="${safeId}" onclick="adminKillStream(this.dataset.sid)" class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs cursor-pointer">
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
    keyInput.value = 'Đang sinh mã chuẩn...';
    try {
        const res = await fetch('/api/admin/keys/generate-code', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.key) {
            keyInput.value = data.key;
        }
    } catch (e) {
        keyInput.value = '';
    }
}

function openNewKeyModal() {
    const modal = document.getElementById('modal-new-key');
    if (modal) {
        modal.classList.remove('hidden');
        const nameInput = document.getElementById('nk-name');
        if (nameInput) {
            nameInput.value = '';
            setTimeout(() => nameInput.focus(), 80);
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
    const maxStreams = parseInt(document.getElementById('nk-streams').value, 10) || 2;
    const diskMb = parseInt(document.getElementById('nk-disk').value, 10) || 10240;
    const initialCredits = parseInt(document.getElementById('nk-credits')?.value || '500', 10) || 500;
    const durationDays = parseInt(document.getElementById('nk-duration')?.value || '0', 10) || 0;
    const pushSupabase = document.getElementById('nk-push-supabase') ? document.getElementById('nk-push-supabase').checked : true;

    if (!name) {
        showToast('Vui lòng nhập Tên Kênh / Tên Shop!', 'warning');
        document.getElementById('nk-name').focus();
        return;
    }
    if (!customKey) {
        showToast('Vui lòng sinh hoặc nhập Mã API Key!', 'warning');
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
            showToast(data.message || 'Không thể cấp Mã Khóa', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
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
    if (textEl) textEl.innerText = 'Sao Chép Mã Key Gửi Khách';
    if (iconEl) iconEl.innerText = '📋';

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
        if (textEl) textEl.innerText = 'Đã Sao Chép Thành Công!';
        if (iconEl) iconEl.innerText = '✅';
        showToast('Đã sao chép Mã Key vào Clipboard!', 'success');
        setTimeout(() => {
            if (textEl) textEl.innerText = 'Sao Chép Mã Key Gửi Khách';
            if (iconEl) iconEl.innerText = '📋';
        }, 2500);
    }).catch(() => {
        showToast('Không thể truy cập Clipboard trình duyệt.', 'warning');
    });
}

function copyKeyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Đã sao chép Mã API Key vào Clipboard!', 'success');
    }).catch(() => {
        showToast('Không thể truy cập Clipboard trình duyệt.', 'warning');
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
            showToast(data.message || 'Đã cập nhật trạng thái Key.', 'success');
            loadAdminPanel();
        } else {
            showToast(data.message || 'Lỗi cập nhật trạng thái', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
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
            showToast(`Đồng bộ thành công ${data.count} khóa từ Supabase Cloud!`, 'success');
            loadAdminPanel();
        } else {
            showToast(data.message || 'Lỗi đồng bộ Supabase Cloud', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
    }
}

async function adminDeleteKey(key) {
    const ok = await uiConfirm(`Bạn có chắc chắn muốn xóa vĩnh viễn Mã Khóa "${key}" trên máy chủ?`, 'Xóa License Key', true);
    if (!ok) return;
    try {
        const res = await fetch(`/api/admin/keys/${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            showToast('Đã xóa API Key thành công.', 'success');
            loadAdminPanel();
        } else {
            showToast(data.message || 'Lỗi xóa Mã Khóa', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
    }
}

async function adminKillStream(streamId) {
    const ok = await uiConfirm(`Xác nhận dừng khẩn cấp luồng "${streamId}"?`, 'Dừng luồng khẩn cấp', true);
    if (!ok) return;
    try {
        const res = await fetch('/api/admin/kill-stream', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ stream_id: streamId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Đã dừng khẩn cấp luồng ${streamId}.`, 'info');
            loadAdminPanel();
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Đã sao chép Mã Khóa vào Clipboard!', 'success');
    }).catch(() => {
        showToast('Không thể sao chép tự động.', 'warning');
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text == null ? '' : String(text);
    return div.innerHTML;
}

// =========================================================================
// 8. TAB 2: CONTENT STUDIO (AI SCRIPT, VOICE, AVATAR & OBS INJECTION)
// =========================================================================

let csVoicesList = [];
let csLibraryVoicesList = [];
let csLibraryMeta = { authenticated: false, requires_api_key: true };
let csAvatarsList = [];
let csVoiceFilter = 'all';
let csVoiceSearchQuery = '';
let csSelectedVoiceId = '';

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
            if (currentUser) currentUser.quota_remaining = credits;
            const heroCredits = document.getElementById('cs-hero-credits');
            const formBal = document.getElementById('cs-form-balance');
            const topCredits = document.getElementById('v4-quota-credits');
            const sbCredits = document.getElementById('sidebar-credits-text');
            if (heroCredits) heroCredits.innerText = credits.toLocaleString();
            if (formBal) formBal.innerText = credits.toLocaleString();
            if (topCredits) topCredits.innerText = credits.toLocaleString();
            if (sbCredits) sbCredits.innerText = `${credits.toLocaleString()} Credits`;
        }
    } catch (e) {}
}

async function loadVoices(forceRefresh = false) {
    const listEl = document.getElementById('cs-voice-list');
    const badgeEl = document.getElementById('cs-voice-source-badge');
    const syncBtn = document.getElementById('cs-btn-sync-voices');
    if (!listEl) return;

    if (csVoicesList.length === 0 || forceRefresh) {
        listEl.innerHTML = `<div class="text-[var(--text-muted)] text-xs italic py-4 col-span-2 text-center">⏳ Đang cào trực tiếp giọng đọc từ ElevenLabs API...</div>`;
    }
    if (syncBtn) syncBtn.disabled = true;

    try {
        const res = await fetch(`/api/content-studio/voices${forceRefresh ? '?refresh=1' : ''}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && Array.isArray(data.voices)) {
            csVoicesList = data.voices;
            if (csVoicesList.length > 0 && !csVoicesList.some(v => v.id === csSelectedVoiceId)) {
                csSelectedVoiceId = csVoicesList[0].id;
            }
            if (badgeEl) {
                const srcText = data.authenticated
                    ? `🔐 ElevenLabs Account • ${csVoicesList.length} giọng`
                    : `⚡ ElevenLabs API (Public) • ${csVoicesList.length} giọng`;
                badgeEl.innerText = srcText;
                badgeEl.className = data.authenticated
                    ? 'text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30';
                badgeEl.title = data.synced_at ? `Đồng bộ lúc ${data.synced_at}` : '';
            }
            if (forceRefresh) {
                showToast(`Đã đồng bộ ${csVoicesList.length} giọng đọc thật từ ElevenLabs API`, 'success');
            }
            if (csVoiceFilter !== 'library') {
                filterAndRenderVoices();
            }
        } else {
            csVoicesList = [];
            if (badgeEl) {
                badgeEl.innerText = '❌ Lỗi kết nối ElevenLabs API';
                badgeEl.className = 'text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30';
            }
            listEl.innerHTML = `
                <div class="col-span-2 p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 text-center space-y-2">
                    <div class="text-xs font-semibold text-rose-400">${escapeHtml(data.message || 'Không thể lấy giọng đọc từ ElevenLabs API')}</div>
                    <button type="button" onclick="loadVoices(true)" class="px-3 py-1 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 cursor-pointer">🔄 Thử Cào Lại</button>
                </div>
            `;
        }
    } catch (e) {
        console.error('Load voices error:', e);
        if (badgeEl) {
            badgeEl.innerText = '❌ Mất kết nối API';
            badgeEl.className = 'text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30';
        }
        listEl.innerHTML = `<div class="text-rose-400 text-xs py-4 col-span-2 text-center">Lỗi kết nối ElevenLabs API: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (syncBtn) syncBtn.disabled = false;
    }
}

function csFilterVoices(filter) {
    csVoiceFilter = filter;
    const filters = ['all', 'custom', 'female', 'male', 'library'];
    filters.forEach(f => {
        const btn = document.getElementById(`cs-vfilter-${f}`);
        if (!btn) return;
        if (f === filter) {
            const activeCol = f === 'library' ? 'bg-sky-600/25 text-sky-300 border-sky-500/40' : 'bg-purple-600/25 text-purple-300 border-purple-500/40';
            btn.className = `px-2.5 py-1 rounded-lg text-xs font-semibold border ${activeCol} cursor-pointer transition-all`;
        } else {
            const textCol = f === 'custom' ? 'text-amber-400' : (f === 'library' ? 'text-sky-400' : 'text-[var(--text-muted)]');
            btn.className = `px-2.5 py-1 rounded-lg text-xs font-medium saas-surface ${textCol} hover:text-[var(--text-main)] cursor-pointer transition-all`;
        }
    });

    const langSelect = document.getElementById('cs-library-lang');
    const libSearchBtn = document.getElementById('cs-library-search-btn');
    if (filter === 'library') {
        if (langSelect) langSelect.classList.remove('hidden');
        if (libSearchBtn) libSearchBtn.classList.remove('hidden');
        searchElevenLabsLibrary();
    } else {
        if (langSelect) langSelect.classList.add('hidden');
        if (libSearchBtn) libSearchBtn.classList.add('hidden');
        filterAndRenderVoices();
    }
}

function csSearchVoices(q) {
    csVoiceSearchQuery = (q || '').trim().toLowerCase();
    if (csVoiceFilter !== 'library') {
        filterAndRenderVoices();
    }
}

async function searchElevenLabsLibrary() {
    const listEl = document.getElementById('cs-voice-list');
    if (!listEl) return;
    const search = (document.getElementById('cs-voice-search')?.value || '').trim();
    const lang = document.getElementById('cs-library-lang')?.value || '';
    listEl.innerHTML = `<div class="text-[var(--text-muted)] text-xs italic py-4 col-span-2 text-center">⏳ Đang tìm kiếm trên ElevenLabs Shared Voice Library...</div>`;

    try {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (lang) params.set('language', lang);
        const res = await fetch(`/api/content-studio/voices/library?${params.toString()}`, { headers: getAuthHeaders() });
        const data = await res.json();
        csLibraryMeta = { authenticated: !!data.authenticated, requires_api_key: !!data.requires_api_key };
        if (!data.success) {
            listEl.innerHTML = `<div class="col-span-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-300 text-center">${escapeHtml(data.message || 'Không truy vấn được ElevenLabs Voice Library')}</div>`;
            return;
        }
        csLibraryVoicesList = data.voices || [];
        renderLibraryVoices();
    } catch (e) {
        listEl.innerHTML = `<div class="text-rose-400 text-xs py-4 col-span-2 text-center">Lỗi truy vấn ElevenLabs Library: ${escapeHtml(e.message)}</div>`;
    }
}

function renderLibraryVoices() {
    const listEl = document.getElementById('cs-voice-list');
    if (!listEl) return;

    let html = '';
    if (csLibraryMeta.requires_api_key) {
        html += `
            <div class="col-span-2 p-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 text-[11px] text-sky-300 flex items-center justify-between gap-2">
                <span>ℹ️ Chưa gắn ElevenLabs API Key nên ElevenLabs giới hạn xem trước tối đa 3 giọng Library. Gắn Key ở <b>Admin → API Platforms</b> để cào không giới hạn &amp; thêm giọng vào tài khoản.</span>
            </div>
        `;
    }
    if (csLibraryVoicesList.length === 0) {
        listEl.innerHTML = html + `<div class="text-[var(--text-muted)] text-xs italic py-4 col-span-2 text-center">Không tìm thấy giọng phù hợp trên ElevenLabs Voice Library</div>`;
        return;
    }

    const isAdmin = Boolean(currentUser && currentUser.role === 'admin');
    csLibraryVoicesList.forEach(v => {
        const safeId = escapeHtml(v.id);
        const safeOwner = escapeHtml(v.public_owner_id || '');
        const safeName = escapeHtml(v.name || '');
        const safeUrl = escapeHtml(v.preview_url || '');
        html += `
            <div class="p-3 rounded-xl border saas-surface hover:border-sky-500/40 transition-all flex items-center justify-between gap-2 text-xs">
                <div class="space-y-1 truncate flex-grow">
                    <div class="font-bold text-[var(--text-main)] flex items-center gap-1.5 truncate">
                        <span class="w-2 h-2 rounded-full bg-sky-400 shrink-0"></span>
                        <span class="truncate">${safeName}</span>
                        <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-sky-500/15 text-sky-400 font-mono shrink-0">${escapeHtml(v.language || 'MULTI')}</span>
                    </div>
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                        <span>${v.gender === 'female' ? 'Nữ' : (v.gender === 'male' ? 'Nam' : (v.gender || 'AI'))}</span>
                        <span>•</span>
                        <span class="truncate">${escapeHtml(v.style || v.description || 'ElevenLabs Shared Voice')}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    ${v.preview_url ? `
                        <button type="button" data-url="${safeUrl}" onclick="event.stopPropagation(); csPlayVoiceSample(this.dataset.url)" class="px-2 py-1 saas-card hover:bg-sky-600 hover:text-white rounded-lg text-[var(--text-main)] text-xs font-semibold transition-all cursor-pointer" title="Nghe thử">▶</button>
                    ` : ''}
                    ${isAdmin && !csLibraryMeta.requires_api_key && safeOwner ? `
                        <button type="button" data-owner="${safeOwner}" data-vid="${safeId}" data-name="${safeName}" onclick="csAddLibraryVoice(this.dataset.owner, this.dataset.vid, this.dataset.name)" class="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-semibold cursor-pointer" title="Thêm vào tài khoản ElevenLabs">➕ Thêm</button>
                    ` : ''}
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

async function csAddLibraryVoice(ownerId, voiceId, name) {
    try {
        const res = await fetch('/api/content-studio/voices/library/add', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ public_owner_id: ownerId, voice_id: voiceId, name })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Đã thêm giọng vào tài khoản ElevenLabs!', 'success');
            csSelectedVoiceId = data.voice_id || voiceId;
            await loadVoices(true);
            csFilterVoices('all');
        } else {
            showToast(data.message || 'Không thể thêm giọng', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
    }
}

function filterAndRenderVoices() {
    const listEl = document.getElementById('cs-voice-list');
    if (!listEl) return;

    const filtered = csVoicesList.filter(v => {
        if (csVoiceFilter === 'custom' && !v.is_custom) return false;
        if (csVoiceFilter === 'female' && (v.gender || '').toLowerCase() !== 'female') return false;
        if (csVoiceFilter === 'male' && (v.gender || '').toLowerCase() !== 'male') return false;

        if (csVoiceSearchQuery) {
            const name = (v.name || '').toLowerCase();
            const style = (v.style || '').toLowerCase();
            const desc = (v.description || '').toLowerCase();
            const lang = (v.language || '').toLowerCase();
            if (!name.includes(csVoiceSearchQuery) && !style.includes(csVoiceSearchQuery) && !desc.includes(csVoiceSearchQuery) && !lang.includes(csVoiceSearchQuery)) {
                return false;
            }
        }
        return true;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="text-[var(--text-muted)] text-xs italic py-4 col-span-2 text-center">Không tìm thấy giọng đọc phù hợp</div>`;
        return;
    }

    let html = '';
    filtered.forEach(v => {
        const isSel = (v.id === csSelectedVoiceId);
        const borderCls = isSel
            ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/40'
            : 'saas-surface hover:border-purple-500/40';
        const safeId = escapeHtml(v.id);
        const safeUrl = escapeHtml(v.preview_url || '');
        const genderLabel = v.gender === 'female' ? 'Nữ' : (v.gender === 'male' ? 'Nam' : (v.gender || 'AI'));
        html += `
            <div data-vid="${safeId}" onclick="csSelectVoice(this.dataset.vid)" class="p-3 rounded-xl border ${borderCls} cursor-pointer transition-all flex items-center justify-between gap-2 text-xs">
                <div class="space-y-1 truncate flex-grow">
                    <div class="font-bold text-[var(--text-main)] flex items-center gap-1.5 truncate">
                        <span class="w-2 h-2 rounded-full ${isSel ? 'bg-purple-400' : 'bg-slate-500'} shrink-0"></span>
                        <span class="truncate">${escapeHtml(v.name)}</span>
                        ${v.is_custom ? `<span class="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-400 font-semibold shrink-0">${escapeHtml(v.raw_category || 'custom')}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                        <span>${escapeHtml(genderLabel)}</span>
                        <span>•</span>
                        <span class="font-mono text-purple-300/90 shrink-0">${escapeHtml(v.language || 'MULTI')}</span>
                        <span>•</span>
                        <span class="truncate" title="${escapeHtml(v.description || v.style || '')}">${escapeHtml(v.style || v.description || 'ElevenLabs')}</span>
                    </div>
                </div>
                ${v.preview_url ? `
                    <button type="button" data-url="${safeUrl}" onclick="event.stopPropagation(); csPlayVoiceSample(this.dataset.url)" class="px-2.5 py-1 saas-card hover:bg-purple-600 hover:text-white rounded-lg text-[var(--text-main)] text-xs font-semibold transition-all shrink-0 cursor-pointer" title="Nghe thử giọng từ ElevenLabs">
                        ▶ Nghe
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
    csAudioPreviewObj.play().catch(e => showToast('Không thể phát âm thanh mẫu: ' + e.message, 'warning'));
}

async function loadAvatars() {
    const listEl = document.getElementById('cs-avatar-list');
    if (!listEl) return;
    if (!csAvatarsData.avatars || csAvatarsData.avatars.length === 0) {
        listEl.innerHTML = `<div class="text-[var(--text-muted)] text-xs italic py-3 col-span-6 text-center">Đang tải danh sách người mẫu...</div>`;
    }
    try {
        const res = await fetch('/api/content-studio/avatars', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            csAvatarsData = data;
            const quotaBadge = document.getElementById('cs-avatar-quota-badge');
            if (quotaBadge && data.quota) {
                if (data.quota.is_admin) {
                    quotaBadge.innerText = 'Mẫu: Vô Hạn (Admin)';
                    quotaBadge.className = 'text-xs font-mono px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30';
                } else {
                    const isFull = !data.quota.can_upload;
                    quotaBadge.innerText = `Mẫu của bạn: ${data.quota.used} / ${data.quota.max}`;
                    quotaBadge.className = isFull
                        ? 'text-xs font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold'
                        : 'text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
                }
            }

            filterAndRenderAvatars();
            renderAdminSystemAvatars();
        }
    } catch (e) {
        console.error('Load avatars error:', e);
    }
}

function csFilterAvatars(filter) {
    csAvatarFilter = filter;
    const filters = ['all', 'custom', 'system', 'female', 'male'];
    filters.forEach(f => {
        const btn = document.getElementById(`cs-afilter-${f}`);
        if (!btn) return;
        if (f === filter) {
            btn.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-600/25 text-purple-300 border border-purple-500/40 cursor-pointer transition-all';
        } else {
            btn.className = 'px-2.5 py-1 rounded-lg text-xs font-medium saas-surface text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer transition-all';
        }
    });
    filterAndRenderAvatars();
}

function filterAndRenderAvatars() {
    const listEl = document.getElementById('cs-avatar-list');
    if (!listEl) return;

    const avatars = csAvatarsData.avatars || [];
    const filtered = avatars.filter(a => {
        if (csAvatarFilter === 'custom' && a.is_system) return false;
        if (csAvatarFilter === 'system' && !a.is_system) return false;
        if (csAvatarFilter === 'female' && (a.gender || '').toLowerCase() !== 'female') return false;
        if (csAvatarFilter === 'male' && (a.gender || '').toLowerCase() !== 'male') return false;
        return true;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="text-[var(--text-muted)] text-xs italic py-4 col-span-6 text-center">Chưa có người mẫu nào thuộc danh mục này</div>`;
        return;
    }

    let html = '';
    filtered.forEach(a => {
        const isSel = (a.id === csSelectedAvatarId);
        const borderCls = isSel ? 'border-purple-500 ring-2 ring-purple-500/40' : 'border-[var(--border-subtle)] hover:border-purple-500/40';
        const safeId = escapeHtml(a.id);
        html += `
            <div data-aid="${safeId}" onclick="csSelectAvatar(this.dataset.aid)" class="rounded-xl border ${borderCls} overflow-hidden cursor-pointer transition-all saas-surface flex flex-col text-center group relative">
                <div class="w-full aspect-square bg-slate-900 relative overflow-hidden">
                    <img src="${escapeHtml(a.preview_img || '/api/content-studio/avatars/image/sys_daisy.png')}" alt="${escapeHtml(a.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" onerror="this.src='/api/content-studio/avatars/image/sys_daisy.png'">
                    ${isSel ? `<div class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold shadow">✓</div>` : ''}
                    ${!a.is_system ? `
                        <button type="button" data-aid="${safeId}" onclick="event.stopPropagation(); deleteAvatar(this.dataset.aid)" class="absolute top-1.5 left-1.5 w-6 h-6 rounded-lg bg-rose-600/90 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all cursor-pointer" title="Xóa mẫu này">
                            🗑️
                        </button>
                    ` : ''}
                </div>
                <div class="p-2">
                    <div class="text-xs font-bold text-[var(--text-main)] truncate" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
                    <div class="text-xs text-[var(--text-muted)] truncate">${a.is_system ? 'Hệ thống' : 'Mẫu riêng'}</div>
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
        grid.innerHTML = `<div class="text-[var(--text-muted)] text-xs italic py-6 col-span-6 text-center">Chưa có người mẫu hệ thống nào.</div>`;
        return;
    }

    let html = '';
    sysAvatars.forEach(a => {
        const safeId = escapeHtml(a.id);
        html += `
            <div class="rounded-xl border border-[var(--border-subtle)] saas-surface overflow-hidden flex flex-col group relative">
                <div class="w-full aspect-square bg-slate-900 relative overflow-hidden">
                    <img src="${escapeHtml(a.preview_img || '/api/content-studio/avatars/image/sys_daisy.png')}" alt="${escapeHtml(a.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" onerror="this.src='/api/content-studio/avatars/image/sys_daisy.png'">
                    <button type="button" data-aid="${safeId}" onclick="adminDeleteSystemAvatar(this.dataset.aid)" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center text-xs transition-all opacity-0 group-hover:opacity-100 cursor-pointer" title="Xóa mẫu hệ thống này">
                        🗑️
                    </button>
                </div>
                <div class="p-2 space-y-0.5">
                    <div class="text-xs font-bold text-[var(--text-main)] truncate" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
                    <div class="text-xs text-[var(--text-muted)] truncate">${a.gender === 'female' ? 'Nữ' : 'Nam'} • ${escapeHtml(a.style || 'MC Bán Hàng')}</div>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

function openUploadAvatarModal(isSystem = false) {
    csUploadIsSystem = isSystem;
    const currentUserRole = (currentUser && currentUser.role) ? currentUser.role : 'client';
    const isClient = (currentUserRole !== 'admin');

    if (!isSystem && isClient && csAvatarsData.quota && !csAvatarsData.quota.can_upload) {
        showToast(`Bạn đã đạt giới hạn tối đa ${csAvatarsData.quota.max} mẫu tải lên! Vui lòng xóa bớt mẫu cũ.`, 'warning');
        return;
    }

    const modal = document.getElementById('modal-upload-avatar');
    const titleEl = document.getElementById('modal-upload-avatar-title');
    const adminOpt = document.getElementById('avatar-admin-option');
    const isSysCheck = document.getElementById('avatar-is-system-check');
    const quotaText = document.getElementById('avatar-quota-text');

    if (titleEl) {
        titleEl.innerHTML = isSystem
            ? `<span>🎭</span> Tải Lên Mẫu Hệ Thống Mới`
            : `<span>📸</span> Tải Lên Hình Ảnh Người Mẫu Mới`;
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
            quotaText.innerText = 'Tài khoản Quản trị viên (Admin) không bị giới hạn số lượng người mẫu tải lên.';
        } else {
            quotaText.innerText = `Hạn mức tài khoản: ${csAvatarsData.quota.used} / ${csAvatarsData.quota.max} mẫu. Có thể xóa mẫu cũ bất kỳ lúc nào.`;
        }
    }

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
        const reader = new FileReader();
        reader.onload = function (e) {
            const previewImg = document.getElementById('avatar-preview-img');
            const placeholderBox = document.getElementById('avatar-placeholder-box');
            if (previewImg) {
                previewImg.src = e.target.result;
                previewImg.classList.remove('hidden');
            }
            if (placeholderBox) placeholderBox.classList.add('hidden');
        };
        reader.readAsDataURL(input.files[0]);
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
        showToast('Vui lòng chọn một file hình ảnh người mẫu (PNG, JPG, WEBP)!', 'warning');
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
        delete headers['Content-Type'];

        const res = await fetch('/api/content-studio/avatars/upload', {
            method: 'POST',
            headers: headers,
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast('Tải lên hình ảnh người mẫu thành công!', 'success');
            closeUploadAvatarModal();
            await loadAvatars();
            if (data.avatar && data.avatar.id) {
                csSelectedAvatarId = data.avatar.id;
                filterAndRenderAvatars();
            }
        } else {
            showToast(data.message || 'Lỗi tải lên hình ảnh', 'error');
        }
    } catch (err) {
        showToast('Lỗi kết nối khi tải lên: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>🚀</span> Tải Lên Mẫu`;
        }
    }
}

async function deleteAvatar(avatarId) {
    const ok = await uiConfirm('Bạn có chắc chắn muốn xóa người mẫu này để giải phóng slot tải lên?', 'Xóa người mẫu', true);
    if (!ok) return;
    try {
        const res = await fetch(`/api/content-studio/avatars/${encodeURIComponent(avatarId)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            showToast('Đã xóa người mẫu thành công!', 'success');
            if (csSelectedAvatarId === avatarId) {
                csSelectedAvatarId = 'Daisy-inskirt-20220818';
            }
            await loadAvatars();
        } else {
            showToast(data.message || 'Lỗi xóa người mẫu', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
    }
}

async function adminDeleteSystemAvatar(avatarId) {
    const ok = await uiConfirm('Xóa người mẫu hệ thống này? Tất cả khách hàng sẽ không còn thấy mẫu này.', 'Xóa mẫu hệ thống', true);
    if (!ok) return;
    try {
        const res = await fetch(`/api/content-studio/avatars/${encodeURIComponent(avatarId)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            showToast('Đã xóa người mẫu hệ thống.', 'success');
            await loadAvatars();
        } else {
            showToast(data.message || 'Lỗi xóa người mẫu', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
    }
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
        if (titleInput) titleInput.value = 'Flash Sale Giảm Giá 50%';
        scriptInput.value = 'Chào cả nhà! Chỉ duy nhất trong phiên live ngày hôm nay, bên em đang có chương trình Flash Sale giảm sốc lên đến 50%. Số lượng có hạn, các bạn bấm ngay vào giỏ hàng góc trái màn hình để săn deal hời nhé!';
    } else if (type === 'intro') {
        if (titleInput) titleInput.value = 'Giới Thiệu Sản Phẩm Mới';
        scriptInput.value = 'Hôm nay em xin giới thiệu đến mọi người dòng sản phẩm mới nhất vừa cập bến. Chất liệu cao cấp, bảo hành chính hãng và có rất nhiều voucher độc quyền đang chờ mọi người chốt đơn!';
    } else if (type === 'welcome') {
        if (titleInput) titleInput.value = 'Lời Chào Livestream & Tặng Quà';
        scriptInput.value = 'Dạ xin chào tất cả các anh chị đang theo dõi buổi phát sóng trực tiếp! Mọi người vào live thả tim và để lại bình luận để nhận ngay voucher giảm 20k cho đơn hàng đầu tiên nha!';
    } else if (type === 'calltoaction') {
        if (titleInput) titleInput.value = 'Kêu Gọi Chốt Đơn Gấp';
        scriptInput.value = 'Mã giảm giá chỉ còn đúng 5 suất cuối cùng thôi ạ! Bạn nào chưa kịp đặt thì nhanh tay bấm mua ngay bây giờ kẻo hết nhé. Em xin cảm ơn và hẹn gặp lại!';
    }
    csUpdateCharCount();
}

async function submitGenerateAIVideo() {
    const title = (document.getElementById('cs-title-input') ? document.getElementById('cs-title-input').value.trim() : '') || 'Video MC Bán Hàng';
    const script = document.getElementById('cs-script-input') ? document.getElementById('cs-script-input').value.trim() : '';
    const aspectRadio = document.querySelector('input[name="cs-aspect"]:checked');
    const aspect = aspectRadio ? aspectRadio.value : '9:16';

    if (!script) {
        showToast('Vui lòng nhập nội dung kịch bản MC cần nói!', 'warning');
        return;
    }
    if (!csSelectedVoiceId) {
        showToast('Vui lòng chọn giọng đọc từ ElevenLabs API!', 'warning');
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
            showToast('Tác vụ tạo Video AI đã kích hoạt! Đang render...', 'success');
        } else {
            showToast(data.message || 'Không thể tạo video!', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối máy chủ: ' + e.message, 'error');
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
    if (step) step.innerText = task.current_step || 'Đang xử lý...';
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
                    showToast('Render video thất bại: ' + (t.error || 'Lỗi không xác định'), 'error');
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

    const apiKey = encodeURIComponent(localStorage.getItem('hlc_api_key') || localStorage.getItem('hlc_cloud_key') || '');
    const mediaUrl = task.video_filename
        ? `/api/media/file/${encodeURIComponent(task.video_filename)}?api_key=${apiKey}`
        : '';

    if (player && mediaUrl) {
        player.src = mediaUrl;
        player.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
        player.load();
        player.play().catch(() => {});
    }

    if (badge) {
        badge.className = 'text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
        badge.innerText = 'HOÀN TẤT';
    }

    if (actions) actions.classList.remove('hidden');
    if (dlLink && mediaUrl) {
        dlLink.href = mediaUrl;
    }
    showToast(`Video "${task.video_filename}" đã hoàn tất và lưu vào Kho Media!`, 'success');
}

async function csLoadRecentTasks() {
    const listEl = document.getElementById('cs-recent-tasks-list');
    if (!listEl) return;
    try {
        const res = await fetch('/api/content-studio/tasks', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && data.tasks) {
            if (data.tasks.length === 0) {
                listEl.innerHTML = `<div class="text-[var(--text-muted)] text-center py-4 italic">Chưa có video nào trong phiên làm việc.</div>`;
                return;
            }
            let html = '';
            data.tasks.slice(0, 5).forEach(t => {
                const isDone = (t.status === 'completed');
                const safeFname = escapeHtml(t.video_filename || '');
                html += `
                    <div class="p-3 rounded-xl border border-[var(--border-subtle)] saas-surface flex items-center justify-between gap-2">
                        <div class="truncate space-y-0.5">
                            <div class="font-bold text-[var(--text-main)] truncate flex items-center gap-1.5">
                                <span>${isDone ? '🎬' : '⏳'}</span>
                                <span class="truncate">${escapeHtml(t.title)}</span>
                            </div>
                            <div class="text-xs text-[var(--text-muted)] font-mono tabular-nums">${escapeHtml(t.created_at)}</div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            ${isDone && t.video_filename ? `
                                <button type="button" data-fname="${safeFname}" onclick="csPreviewVideo(this.dataset.fname)" class="px-2.5 py-1 rounded-lg saas-card hover:bg-[var(--bg-elevated)] text-[var(--text-main)] font-semibold text-xs cursor-pointer">
                                    ▶ Xem
                                </button>
                                <button type="button" data-fname="${safeFname}" onclick="pushVideoToOBSDirect(this.dataset.fname)" class="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500 text-sky-400 hover:text-white border border-sky-500/30 font-semibold text-xs cursor-pointer" title="Nạp vào OBS">
                                    🎛️ OBS
                                </button>
                            ` : `<span class="text-xs text-amber-400 font-mono">Đang render</span>`}
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
        showToast('Chưa có video AI nào được chọn để nạp vào OBS!', 'warning');
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
                source_name: 'MC_AI_Live'
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Đã nạp video vào OBS Studio!', 'success');
        } else {
            showToast(data.message || 'Không thể nạp vào OBS', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
    }
}

function streamCurrentAIVideoCloud() {
    if (!csCurrentGeneratedVideo) {
        showToast('Chưa có video AI nào được chọn!', 'warning');
        return;
    }
    switchV4Tab('cloud-streams');
    openNewStreamModal(csCurrentGeneratedVideo);
}

// =========================================================================
// 9. ADMIN PLATFORM CONFIG & BALANCE CHECKERS
// =========================================================================

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
                elStatus.innerText = data.has_elevenlabs ? `Đã có: ${data.elevenlabs_masked}` : 'Chưa có key';
                elStatus.className = `text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold ${data.has_elevenlabs ? 'bg-purple-500/15 text-purple-400' : 'saas-surface text-[var(--text-muted)]'}`;
            }
            if (hgStatus) {
                hgStatus.innerText = data.has_heygen ? `Đã có: ${data.heygen_masked}` : 'Chưa có key';
                hgStatus.className = `text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold ${data.has_heygen ? 'bg-sky-500/15 text-sky-400' : 'saas-surface text-[var(--text-muted)]'}`;
            }
            if (supaUrl && data.supabase_url) supaUrl.value = data.supabase_url;
            if (supaStatus) {
                supaStatus.innerText = data.supabase_anon_masked ? `Key: ${data.supabase_anon_masked}` : 'Chưa có key';
                supaStatus.className = `text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold ${data.supabase_anon_masked ? 'bg-emerald-500/15 text-emerald-400' : 'saas-surface text-[var(--text-muted)]'}`;
            }
            if (costVoice && data.cost_per_voice) costVoice.value = data.cost_per_voice;
            if (costVideo && data.cost_per_video) costVideo.value = data.cost_per_video;
            const maxAvatarsInput = document.getElementById('admin-ai-max-avatars');
            if (maxAvatarsInput && data.max_user_custom_avatars) maxAvatarsInput.value = data.max_user_custom_avatars;
            loadAvatars();
        }
    } catch (e) {
        console.error('loadPlatformConfigs error:', e);
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
    if (costVoice) payload.cost_per_voice = parseInt(costVoice.value, 10) || 2;
    if (costVideo) payload.cost_per_video = parseInt(costVideo.value, 10) || 10;
    if (maxAvatarsInput) payload.max_user_custom_avatars = parseInt(maxAvatarsInput.value, 10) || 3;

    try {
        const res = await fetch('/api/admin/platforms/config', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('Đã lưu cấu hình API các nền tảng thành công!', 'success');
            if (elInput) elInput.value = '';
            if (hgInput) hgInput.value = '';
            if (supaKeyInput) supaKeyInput.value = '';
            loadPlatformConfigs();
            loadVoices(true);
        } else {
            showToast(data.message || 'Lỗi lưu cấu hình', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
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
        statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono font-semibold animate-pulse';
    }
    if (resBox) {
        resBox.classList.remove('hidden');
        resBox.innerHTML = '<span class="text-[var(--text-muted)]">⏳ Đang kết nối ElevenLabs Subscription API...</span>';
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
                statusBadge.innerText = '● Hoạt động';
                statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono font-semibold';
            }
            if (resBox) {
                resBox.innerHTML = `
                    <div class="text-emerald-400 font-bold">✅ Kết Nối ElevenLabs OK!</div>
                    <div class="mt-1 text-[var(--text-main)]">Gói: <span class="font-bold uppercase text-purple-400">${escapeHtml(data.tier)}</span> (${escapeHtml(data.status)})</div>
                    <div class="text-[var(--text-main)]">Ký Tự Còn Lại: <span class="font-mono font-bold text-amber-400">${data.remaining_characters.toLocaleString()}</span> / ${data.character_limit.toLocaleString()}</div>
                    <div class="text-[var(--text-muted)] text-xs mt-0.5">Reset: ${escapeHtml(data.reset_date)}</div>
                `;
            }
        } else {
            if (statusBadge) {
                statusBadge.innerText = '● Lỗi';
                statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-mono font-semibold';
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
        statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono font-semibold animate-pulse';
    }
    if (resBox) {
        resBox.classList.remove('hidden');
        resBox.innerHTML = '<span class="text-[var(--text-muted)]">⏳ Đang kết nối HeyGen Quota API...</span>';
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
                statusBadge.innerText = '● Hoạt động';
                statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono font-semibold';
            }
            if (resBox) {
                const balLabel = escapeHtml(data.display_balance || `${data.remaining_quota} Credits`);
                const acctInfo = data.account ? `<div class="text-[var(--text-muted)] text-xs mt-0.5">Tài khoản: ${escapeHtml(data.account)} (${escapeHtml(data.billing_type || 'v3')})</div>` : '';
                resBox.innerHTML = `
                    <div class="text-sky-400 font-bold">✅ Kết Nối HeyGen API v3 OK!</div>
                    <div class="mt-1 text-[var(--text-main)]">Số Dư Khả Dụng: <span class="font-mono font-bold text-amber-400">${balLabel}</span></div>
                    ${acctInfo}
                `;
            }
        } else {
            if (statusBadge) {
                statusBadge.innerText = '● Lỗi';
                statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-mono font-semibold';
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
        statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono font-semibold animate-pulse';
    }
    if (resBox) {
        resBox.classList.remove('hidden');
        resBox.innerHTML = '<span class="text-[var(--text-muted)]">⏳ Đang kiểm tra Supabase Cloud Database...</span>';
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
                statusBadge.innerText = '● Hoạt động';
                statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono font-semibold';
            }
            if (resBox) {
                resBox.innerHTML = `
                    <div class="text-emerald-400 font-bold">✅ Kết Nối Supabase Cloud OK!</div>
                    <div class="mt-1 text-[var(--text-main)]">Tổng Keys: <span class="font-mono font-bold text-sky-400">${data.total_keys}</span> (${data.active_keys} Active)</div>
                    <div class="text-[var(--text-main)]">Tổng Quota: <span class="font-mono font-bold text-purple-400">${data.total_quota.toLocaleString()}</span> Credits</div>
                `;
            }
        } else {
            if (statusBadge) {
                statusBadge.innerText = '● Lỗi';
                statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-mono font-semibold';
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
    const amount = parseInt(document.getElementById('topup-amount').value, 10) || 0;

    if (!key || amount <= 0) {
        showToast('Vui lòng nhập số lượng Credits hợp lệ (> 0)!', 'warning');
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
            showToast(`Đã cộng +${amount.toLocaleString()} Credits vào tài khoản khách hàng!`, 'success');
        } else {
            showToast(data.message || 'Lỗi nạp Credits', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối: ' + e.message, 'error');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkAuthSession();
});
