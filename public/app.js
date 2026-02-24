// AI股票分析系统前端逻辑 - 模型库扩容版 (V1.1.8)

let socket;
let currentModels = [];
let currentUser = null;
let token = localStorage.getItem('token');
// Robustness: clear token if it's explicitly the string "null" or "undefined"
if (token === 'null' || token === 'undefined') {
    localStorage.removeItem('token');
    token = null;
}
let lastAnalysisResult = null;

function toggleAuth(isLogin) {
    const title = document.getElementById('auth-title');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (title) title.textContent = isLogin ? '欢迎回来' : '注册新账号';
    if (loginForm) loginForm.style.display = isLogin ? 'block' : 'none';
    if (registerForm) registerForm.style.display = isLogin ? 'none' : 'block';
}
window.toggleAuth = toggleAuth;

function parseMarkdownToHtml(text) {
    if (!text) return '';
    const cleanText = text.replace(/\t/g, '').trim();
    const lines = cleanText.split('\n');
    return lines.map(line => {
        let l = line.trim();
        if (!l) return '<div style="height: 10px;"></div>';
        if (l.startsWith('###')) return `<h6 class="fw-bold text-primary mt-3 mb-2 border-bottom pb-1">${l.replace(/^###\s*/, '')}</h6>`;
        if (l.startsWith('##')) return `<h5 class="fw-bold text-primary mt-4 mb-2">${l.replace(/^##\s*/, '')}</h5>`;
        if (l.startsWith('#')) return `<h4 class="fw-bold mt-4 mb-2">${l.replace(/^#\s*/, '')}</h4>`;
        l = l.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0d6efd;">$1</strong>');
        if (/^\d+\.\s+/.test(l)) {
            const num = l.match(/^\d+/)[0];
            const content = l.replace(/^\d+\.\s+/, '').trim();
            return `<div class="mb-2 d-flex align-items-start"><span class="badge bg-primary me-2 mt-1" style="min-width: 20px;">${num}</span><div class="flex-grow-1">${content}</div></div>`;
        }
        return `<div class="mb-1">${l}</div>`;
    }).join('');
}

document.addEventListener('DOMContentLoaded', function() {
    setupGlobalEventListeners();
    checkAuth();
    initializeSocket();
});

async function checkAuth() {
    // 检查服务器是否为开发模式（无 MongoDB）
    try {
        const devRes = await fetch('/api/dev/status');
        const devData = await devRes.json();
        if (devData.devMode) {
            // 开发模式：跳过登录，设置 dev token
            token = 'dev-mode';
            localStorage.setItem('token', token);
            loadDashboard();
            showSection('dashboard');
            return;
        }
    } catch (e) {
        // 如果无法获取 dev 状态，继续正常流程
    }

    if (!token) {
        showAuthOnly();
    } else {
        loadDashboard();
        showSection('dashboard');
    }
}

function showAuthOnly() {
    const sections = document.querySelectorAll('.section');
    sections.forEach(s => s.style.display = 'none');
    document.getElementById('auth-section').style.display = 'block';
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = 'none';
}

function setupGlobalEventListeners() {
    document.body.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.id === 'to-register-link') { e.preventDefault(); toggleAuth(false); return; }
        if (target.id === 'to-login-link') { e.preventDefault(); toggleAuth(true); return; }
        const navLink = target.closest('.nav-link');
        if (navLink && navLink.dataset.section) { e.preventDefault(); showSection(navLink.dataset.section); return; }
        if (target.id === 'logout-btn') { e.preventDefault(); logout(); return; }
        if (target.matches('#ingest-news-btn') || target.closest('#ingest-news-btn')) ingestNews();
        if (target.matches('#test-notification-btn')) testNotification();
        if (target.matches('[data-action="start-scheduler"]')) controlScheduler('start');
        if (target.matches('[data-action="stop-scheduler"]')) controlScheduler('stop');
        
        const action = target.dataset.action;
        const id = target.dataset.id;
        const modelAction = target.dataset.modelAction;
        const modelName = target.dataset.modelName;

        if (modelAction === 'test') testModel(modelName);
        if (modelAction === 'delete') deleteModel(modelName);
        if (action === 'view-favorite') viewFavorite(id);
        if (action === 'delete-favorite') deleteFavorite(id);
        if (action === 'run-task') runTaskManual(target.dataset.taskName);
        if (action === 'delete-user') deleteUser(target.dataset.userId);

        if (target.id === 'save-model-btn') saveModel();
        if (target.id === 'save-to-favorites-btn') saveToFavorites();
        if (target.id === 'back-to-fav-list-btn') {
            document.getElementById('favorites-detail-view').style.display = 'none';
            document.getElementById('favorites-list-view').style.display = 'block';
        }
    });

    document.addEventListener('submit', async (e) => {
        const id = e.target.id;
        if (id === 'loginForm') { e.preventDefault(); await handleAuth('/api/auth/login', Object.fromEntries(new FormData(e.target))); }
        else if (id === 'registerForm') { e.preventDefault(); await handleAuth('/api/auth/register', Object.fromEntries(new FormData(e.target))); }
        else if (id === 'analysis-form') { e.preventDefault(); performAnalysis(); }
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'providerSelect') updateModelOptions(e.target.value);
    });
}

function showSection(name) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(s => s.style.display = 'none');
    if (document.getElementById(name)) document.getElementById(name).style.display = 'block';
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(l => { l.classList.remove('active'); if (l.dataset.section === name) l.classList.add('active'); });
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = 'block';
    if (name === 'analysis') loadAnalysisInterface();
    if (name === 'models') loadModels();
    if (name === 'favorites') loadFavorites();
    if (name === 'news') loadNewsFeed();
}

function updateModelOptions(provider) {
    const modelSelect = document.getElementById('modelSelect');
    const baseUrlInput = document.getElementById('baseUrl');
    if (!modelSelect) return;
    
    // 内置常用模型选项
    const modelOptions = {
        'openai': [
            { value: 'gemini-2.5-flash', text: 'Google - Gemini 2.5 Flash (推荐)' },
            { value: 'gemini-1.5-pro', text: 'Google - Gemini 1.5 Pro' },
            { value: 'google/gemma-3-27b-it', text: 'NVIDIA - Gemma-3-27B' },
            { value: 'gpt-4o', text: 'OpenAI - GPT-4o' },
            { value: 'custom', text: '--- 自定义输入 ---' }
        ],
        'claude': [
            { value: 'claude-3-5-sonnet-20240620', text: 'Claude 3.5 Sonnet' },
            { value: 'custom', text: '--- 自定义输入 ---' }
        ]
    };
    
    if (provider && modelOptions[provider]) {
        modelSelect.innerHTML = modelOptions[provider].map(option => `<option value="${option.value}">${option.text}</option>`).join('');

        // 监听自定义输入逻辑
        modelSelect.onchange = function () {
            if (this.value === 'custom') {
                const customModel = prompt('请输入自定义模型 ID (例如: deepseek-chat):');
                if (customModel) {
                    const opt = document.createElement('option');
                    opt.value = customModel;
                    opt.text = customModel;
                    opt.selected = true;
                    this.add(opt, this.firstChild);
                } else {
                    this.selectedIndex = 0;
                }
            }
        };

        if (baseUrlInput) {
            if (provider === 'openai') {
                baseUrlInput.value = 'https://generativelanguage.googleapis.com/v1beta/openai/';
            } else {
                baseUrlInput.value = '';
            }
        }
    } else {
        modelSelect.innerHTML = '<option value="">请选择...</option>';
    }
}

async function performAnalysis() {
    const symbol = document.getElementById('analysis-symbol').value.toUpperCase();
    const modelName = document.getElementById('analysis-model').value;
    const resultContainer = document.getElementById('analysis-result-content');
    const spinner = document.getElementById('analysis-spinner');
    const btn = document.getElementById('start-analysis-btn');
    const favBtn = document.getElementById('save-to-favorites-btn');
    if (!symbol || !modelName) return;
    spinner?.classList.remove('d-none');
    if (btn) btn.disabled = true;
    favBtn?.classList.add('d-none');
    resultContainer.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-3 fw-bold">正在拉取多维实时数据并生成深度研报...</p></div>';
    try {
        const response = await apiFetch('/api/analysis', { method: 'POST', body: JSON.stringify({ symbol, modelName }) });
        if (response.success && response.analysis) {
            lastAnalysisResult = response;
            favBtn?.classList.remove('d-none');
            const raw = response.rawData || {};
            let headerHtml = `<div class="p-3 mb-4 rounded border bg-light d-flex justify-content-between align-items-center"><div><h4 class="mb-0 fw-bold">${symbol} <span class="badge bg-dark ms-2" style="font-size: 12px;">${raw.session || '实时'}</span></h4></div><div class="text-end"><span class="h4 mb-0 fw-bold">${raw.currentPrice || 'N/A'}</span><span class="ms-2 fw-bold ${parseFloat(raw.changePercent) >= 0 ? 'text-success' : 'text-danger'}">${raw.changePercent || '0.00'}%</span></div></div>`;
            resultContainer.innerHTML = headerHtml + `<div class="ai-report-body px-1">${parseMarkdownToHtml(response.analysis)}</div>`;
        }
    } catch (e) { resultContainer.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
    finally { spinner?.classList.add('d-none'); if (btn) btn.disabled = false; }
}

async function handleAuth(url, data) {
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const result = await res.json();
        if (result.success) { token = result.data.accessToken; localStorage.setItem('token', token); window.location.reload(); }
        else showNotification('错误', result.message, 'danger');
    } catch (e) { console.error(e); }
}

function logout() { localStorage.removeItem('token'); window.location.reload(); }
async function apiFetch(url, opts = {}) {
    opts.headers = { ...opts.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(url, opts);
    if (res.status === 401) logout();
    return res.json();
}
async function loadDashboard() { try { const data = await apiFetch('/api/dashboard'); document.getElementById('active-models-count').textContent = data.activeModels; document.getElementById('today-analysis-count').textContent = data.todayAnalysis; } catch (e) {} }
async function loadModels() {
    try {
        const models = await apiFetch('/api/models');
        const container = document.getElementById('models-container');
        if (!container) return;
        if (models.length === 0) { container.innerHTML = '<div class="col-12 text-center py-5">未配置AI模型</div>'; return; }
        container.innerHTML = models.map(m => `<div class="col-lg-4 col-md-6 mb-4"><div class="card card-custom h-100"><div class="card-header bg-transparent d-flex justify-content-between align-items-center"><h6 class="mb-0 fw-bold">${m.name}</h6><div class="badge ${m.active ? 'bg-success' : 'bg-secondary'}">${m.active ? '活跃' : '停用'}</div></div><div class="card-body"><p class="small text-muted mb-3">提供商: ${m.provider}<br>模型: ${m.model}</p><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-primary" data-model-action="test" data-model-name="${m.name}">测试</button><button class="btn btn-sm btn-outline-danger" data-model-action="delete" data-model-name="${m.name}">删除</button></div></div></div></div>`).join('');
    } catch (e) {}
}
async function loadAnalysisInterface() {
    const modelSelect = document.getElementById('analysis-model');
    if (!modelSelect) return;
    try {
        const models = await apiFetch('/api/models');
        const activeModels = models.filter(m => m.active);
        if (activeModels.length === 0) { modelSelect.innerHTML = '<option value="">暂无节点</option>'; return; }
        modelSelect.innerHTML = activeModels.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    } catch (error) {}
}
async function saveToFavorites() {
    if (!lastAnalysisResult) return;
    const res = await apiFetch('/api/favorites', { method: 'POST', body: JSON.stringify({ symbol: lastAnalysisResult.symbol, title: `${lastAnalysisResult.symbol} 全维研报`, content: lastAnalysisResult.analysis, analysisData: lastAnalysisResult.rawData }) });
    if (res.success) { showNotification('成功', '研报已存入收藏夹', 'success'); document.getElementById('save-to-favorites-btn').classList.add('d-none'); }
}
async function testModel(name) { try { const res = await apiFetch(`/api/models/${name}/test`, { method: 'POST' }); showNotification('成功', `响应正常`, 'success'); } catch (e) { showNotification('失败', e.message, 'danger'); } }
async function deleteModel(name) { if (confirm('确定删除此模型？')) { await apiFetch(`/api/models/${name}`, { method: 'DELETE' }); loadModels(); } }
async function deleteUser(id) { if (confirm('确定删除用户？')) { await apiFetch(`/api/users/${id}`, { method: 'DELETE' }); } }
async function deleteFavorite(id) { if (confirm('确定移除收藏？')) { await apiFetch(`/api/favorites/${id}`, { method: 'DELETE' }); loadFavorites(); } }
function showNotification(t, m, type) { const toast = document.createElement('div'); toast.className = `alert alert-${type} alert-dismissible fade show position-fixed`; toast.style.cssText = 'top: 20px; right: 20px; z-index: 10000; min-width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);'; toast.innerHTML = `<strong>${t}</strong><br>${m}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`; document.body.appendChild(toast); setTimeout(() => toast.remove(), 5000); }
async function loadNewsFeed() {
    const container = document.getElementById('news-feed-container');
    if (!container) return;
    try {
        const res = await apiFetch('/api/news');
        if (res.data.length === 0) { container.innerHTML = '<div class="text-center py-5 text-muted">暂无财经快讯</div>'; return; }
        container.innerHTML = res.data.map(item => `<div class="card mb-3 border-0 shadow-sm"><div class="card-body"><div class="d-flex justify-content-between align-items-start"><h6 class="fw-bold mb-0 text-dark">${item.title}</h6></div><p class="small text-muted mb-2">${item.sourceId} | ${new Date(item.publishedAt).toLocaleString()}</p><p class="text-dark small mb-0">${item.content}</p></div></div>`).join('');
    } catch (e) {}
}
async function ingestNews() {
    showNotification('同步中', '正在抓取资讯...', 'info');
    try { const res = await apiFetch('/api/news/ingest', { method: 'POST' }); showNotification('成功', `已录入 ${res.stats.savedCount} 条讯息`, 'success'); loadNewsFeed(); } catch (e) {}
}
async function saveModel() {
    const form = document.getElementById('addModelForm');
    const data = Object.fromEntries(new FormData(form));
    try {
        const result = await apiFetch('/api/models', { method: 'POST', body: JSON.stringify({ ...data, active: form.active.checked }) });
        if (result) { bootstrap.Modal.getInstance(document.getElementById('addModelModal')).hide(); form.reset(); loadModels(); showNotification('成功', '节点已部署', 'success'); }
    } catch (e) { showNotification('部署失败', e.message, 'danger'); }
}
