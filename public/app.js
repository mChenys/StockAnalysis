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

window.currentNewsTags = ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'MSTR', 'COIN', 'A股'];

window.renderNewsTags = function () {
    const container = document.getElementById('news-tags-container');
    if (!container) return;
    container.innerHTML = window.currentNewsTags.map(t =>
        `<span class="badge bg-secondary d-flex align-items-center px-2 py-1" style="font-size:0.85rem;">
            ${t} <i class="bi bi-x-circle ms-1 remove-tag-btn" style="cursor:pointer;" data-tag="${t}"></i>
         </span>`
    ).join('');
};

window.removeNewsTag = function (tag) {
    window.currentNewsTags = window.currentNewsTags.filter(t => t !== tag);
    window.renderNewsTags();
    renderNewsData();
};

document.addEventListener('DOMContentLoaded', function() {
    setupGlobalEventListeners();
    window.renderNewsTags();
    checkAuth();
    if (typeof initializeSocket === 'function') {
        initializeSocket();
    }
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
        
        const newsCard = target.closest('.news-card-act');
        if (newsCard) {
            viewNewsDetail(newsCard.dataset.index);
        }

        if (target.matches('.remove-tag-btn') || target.closest('.remove-tag-btn')) {
            const btn = target.closest('.remove-tag-btn') || target;
            const tag = btn.dataset.tag;
            if (tag) window.removeNewsTag(tag);
        }

        if (target.matches('#add-tag-btn') || target.closest('#add-tag-btn')) {
            const input = document.getElementById('custom-tag-input');
            const val = input.value.trim().toUpperCase();
            if (val && !window.currentNewsTags.includes(val)) {
                window.currentNewsTags.push(val);
                input.value = '';
                window.renderNewsTags();
                fetchNewsIncremental(val);
            }
        }

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

        if (target.id === 'trendradar-refresh-btn' || target.closest('#trendradar-refresh-btn')) {
            refreshTrendRadar();
        }

        if (target.id === 'test-push-config-btn' || target.closest('#test-push-config-btn')) {
            testPushConfig();
        }

        if (target.id === 'fetch-nvidia-models-btn') fetchNvidiaModels();
        if (target.matches('.add-nvidia-model-btn')) {
            const mId = target.dataset.nvidiaModelId;
            addNvidiaModel(mId);
        }
    });

    document.addEventListener('submit', async (e) => {
        const id = e.target.id;
        if (id === 'loginForm') { e.preventDefault(); await handleAuth('/api/auth/login', Object.fromEntries(new FormData(e.target))); }
        else if (id === 'registerForm') { e.preventDefault(); await handleAuth('/api/auth/register', Object.fromEntries(new FormData(e.target))); }
        else if (id === 'analysis-form') { e.preventDefault(); performAnalysis(); }
        else if (id === 'push-config-form') { e.preventDefault(); savePushConfig(); }
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'providerSelect') updateModelOptions(e.target.value);
    });
}

function showSection(name) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(s => s.style.display = 'none');
    const target = document.getElementById(name);
    if (target) {
        if (name === 'trendradar' || name === 'situation') {
            target.style.display = 'flex';
        } else {
            target.style.display = 'block';
        }
    }
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(l => { l.classList.remove('active'); if (l.dataset.section === name) l.classList.add('active'); });
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = 'block';
    if (name === 'analysis') loadAnalysisInterface();
    if (name === 'models') loadModels();
    if (name === 'favorites') loadFavorites();
    if (name === 'news') loadNewsFeed();
    if (name === 'trendradar') loadTrendRadarInterface();
    if (name === 'notifications') loadPushConfig();
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

async function loadTrendRadarInterface() {
    const modelSelect = document.getElementById('trendradar-model-select');
    if (!modelSelect) return;
    try {
        const models = await apiFetch('/api/models');
        const activeModels = models.filter(m => m.active);
        if (activeModels.length === 0) {
            modelSelect.innerHTML = '<option value="">暂无活跃模型</option>';
            return;
        }

        // 添加“全部”选项作为默认，利用多模型并行加速
        let html = '<option value="ALL" selected>🚀 全部活跃模型 (并行加速)</option>';
        html += activeModels.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
        modelSelect.innerHTML = html;
    } catch (error) { }
}

async function refreshTrendRadar() {
    const modelName = document.getElementById('trendradar-model-select').value;
    if (!modelName) {
        showNotification('提示', '请先选择一个可用的模型节点', 'warning');
        return;
    }

    const btn = document.getElementById('trendradar-refresh-btn');
    const spinner = document.getElementById('trendradar-spinner');

    btn.disabled = true;
    spinner.classList.remove('d-none');
    showNotification('已启动', '正在后台使用选定的 AI 模型重新分析全网热点，完成后将自动刷新页面...', 'info');

    try {
        const res = await apiFetch('/api/trendradar/refresh', {
            method: 'POST',
            body: JSON.stringify({ modelName })
        });

        if (!res.success) {
            showNotification('错误', res.message || '触发失败', 'danger');
            btn.disabled = false;
            spinner.classList.add('d-none');
        }
        // 成功触发后，不再在此处等待结果，而是通过 Socket.io 监听 trendradar_status
    } catch (e) {
        showNotification('错误', '请求失败: ' + e.message, 'danger');
        btn.disabled = false;
        spinner.classList.add('d-none');
    }
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
let currentNewsList = [];
async function loadNewsFeed(query = '') {
    const container = document.getElementById('news-feed-container');
    if (!container) return;
    const activeQuery = query || window.currentNewsTags.join(',');
    try {
        container.innerHTML = '<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary mb-2"></div><br>正在获取最新资讯，请稍候...</div>';
        const url = activeQuery ? `/api/news?query=${encodeURIComponent(activeQuery)}` : '/api/news';
        const res = await apiFetch(url);
        if (!res.data || res.data.length === 0) {
            currentNewsList = [];
            renderNewsData();
            return;
        }
        currentNewsList = res.data;
        renderNewsData();
    } catch (e) {
        container.innerHTML = `<div class="text-center py-5 text-danger">加载失败: ${e.message}</div>`;
    }
}

async function fetchNewsIncremental(newTag) {
    showNotification('更新中', `正在追踪 ${newTag} 最新动态...`, 'info');
    try {
        const url = `/api/news?query=${encodeURIComponent(newTag)}`;
        const res = await apiFetch(url);
        if (res.data && res.data.length > 0) {
            const uniqueSet = new Set(currentNewsList.map(n => n.url || n.title));
            const newItems = res.data.filter(n => !uniqueSet.has(n.url || n.title));
            currentNewsList = [...newItems, ...currentNewsList];
            currentNewsList.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
            renderNewsData();
            showNotification('成功', `${newTag} 态势已并入全网雷达`, 'success');
        } else {
            showNotification('提示', `无最近 ${newTag} 的相关快讯`, 'warning');
        }
    } catch (e) {
        showNotification('失败', `${newTag} 动态追踪失败`, 'danger');
    }
}

function renderNewsData() {
    const container = document.getElementById('news-feed-container');
    if (!container) return;

    // 轻量级本地过滤，如果不包含某个移除的 tag，这里简单起见目前只要是在 currentNewsList 里就不处理
    // 但是未来如果你想要根据当前所拥有的 tags 严格过滤也行，这里维持高速平滑更新
    const aShareNews = currentNewsList.filter(item => item.market === 'A股');
    const usShareNews = currentNewsList.filter(item => item.market === '美股');

    const renderCards = (newsList) => newsList.map((item, index) => {
        const origIndex = currentNewsList.indexOf(item);
        const tagStr = item.market ? `<span class="badge ${item.market === 'A股' ? 'bg-danger' : 'bg-primary'} ms-2" style="font-size:0.75rem;">${item.market}</span>` : '';
        return `<div class="card mb-3 border-0 shadow-sm news-card-act" data-index="${origIndex}" style="cursor:pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.01)'" onmouseout="this.style.transform='scale(1)'"><div class="card-body"><div class="d-flex justify-content-between align-items-start"><h6 class="fw-bold mb-0 text-dark">${item.title || '【无标题资讯】'}${tagStr}</h6></div><p class="small text-muted mb-2 mt-2">${item.sourceId} | ${new Date(item.publishedAt).toLocaleString()}</p><p class="text-dark small mb-0">${(item.content || '').substring(0, 150)}...</p></div></div>`;
    }).join('');

    let html = '';
    if (aShareNews.length > 0 || usShareNews.length > 0) {
        html = `
            <div class="col-md-6 border-end">
                <h5 class="text-danger mb-3 border-bottom pb-2" style="font-size:1.1rem;font-weight:bold;"><i class="bi bi-graph-up-arrow"></i> A股核心电报</h5>
                ${aShareNews.length > 0 ? renderCards(aShareNews) : '<p class="text-muted">暂无A股资讯</p>'}
            </div>
            <div class="col-md-6">
                <h5 class="text-primary mb-3 border-bottom pb-2" style="font-size:1.1rem;font-weight:bold;"><i class="bi bi-globe"></i> 美股/国际热点</h5>
                ${usShareNews.length > 0 ? renderCards(usShareNews) : '<p class="text-muted">暂无美股资讯</p>'}
            </div>
        `;
    } else {
        html = '<div class="col-12"><div class="text-center py-5 text-muted">暂无符合条件的财经快讯</div></div>';
    }

    container.innerHTML = html;
}

function viewNewsDetail(index) {
    const item = currentNewsList[index];
    if (!item) return;
    document.getElementById('newsDetailTitle').textContent = item.title || '【无标题资讯】';
    document.getElementById('newsDetailSource').textContent = `${item.sourceId} | ${new Date(item.publishedAt).toLocaleString()}`;
    document.getElementById('newsDetailContent').innerHTML = (item.content || '暂无详细内容').replace(/\n/g, '<br>');
    document.getElementById('newsDetailUrl').href = item.url || '#';
    document.getElementById('newsDetailUrl').style.display = item.url ? 'inline-block' : 'none';

    document.getElementById('newsAnalysisResult').style.display = 'none';
    document.getElementById('newsAnalysisResult').innerHTML = '';

    const btn = document.getElementById('analyzeNewsBtn');
    btn.onclick = () => analyzeNewsImpact(item);

    try {
        const modalEl = document.getElementById('newsDetailModal');
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    } catch (err) {
        console.error('Modal show err', err);
    }
}

async function analyzeNewsImpact(item) {
    const resContainer = document.getElementById('newsAnalysisResult');
    resContainer.style.display = 'block';
    resContainer.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm text-success"></div> <span class="ms-2">正在由AI模型深度剖析该新闻的利多/利空面...</span></div>';

    try {
        const models = await apiFetch('/api/models');
        const activeModel = models.find(m => m.active);
        if (!activeModel) {
            resContainer.innerHTML = '<div class="alert alert-warning">未找到活跃的模型，请先前往模型管理配置。</div>';
            return;
        }

        const question = `你是一位顶级华尔街量化分析师。请针对以下新闻简短解读其对相关市场或具体哪家公司的股价是【利好】、【利空】还是【中性】，并精炼阐述核心判断理由：\n\n【新闻标题】：${item.title}\n【新闻内容】：${item.content}\n\n请直接在首行结论中明确指出受影响的【股票代码或公司名称】，**你必须尽可能提供准确的股票代码 (Ticker)**，例如：“结论：【利好 - 苹果(AAPL)】” 或 “结论：【利空 - 特斯拉(TSLA)】” 或 “结论：【中性 - 整个加密市场】”，并给出2-3条核心理由，支持基本Markdown格式。`;

        const res = await fetch('/api/agent/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ message: question, modelName: activeModel.name })
        });

        const data = await res.json();
        if (data.success && data.response) {
            resContainer.innerHTML = parseMarkdownToHtml(data.response);
        } else {
            resContainer.innerHTML = `<div class="text-danger">分析失败: ${data.message || '未知错误'}</div>`;
        }
    } catch (e) {
        resContainer.innerHTML = `<div class="text-danger">请求失败: ${e.message}</div>`;
    }
}
async function ingestNews() {
    showNotification('同步中', '正在从国际数据源提取最新资讯...', 'info');
    try {
        await loadNewsFeed();
        showNotification('成功', '实时资讯流已更新', 'success');
    } catch (e) {
        showNotification('失败', e.message, 'danger');
    }
}
async function saveModel() {
    const form = document.getElementById('addModelForm');
    const data = Object.fromEntries(new FormData(form));
    try {
        const result = await apiFetch('/api/models', { method: 'POST', body: JSON.stringify({ ...data, active: form.active.checked }) });
        if (result) { bootstrap.Modal.getInstance(document.getElementById('addModelModal')).hide(); form.reset(); loadModels(); showNotification('成功', '节点已部署', 'success'); }
    } catch (e) { showNotification('部署失败', e.message, 'danger'); }
}

async function fetchNvidiaModels() {
    const apiKey = document.getElementById('nvidia-api-key').value.trim();
    if (!apiKey) return showNotification('错误', '请输入 NVIDIA API Key', 'danger');

    document.getElementById('nvidia-search-spinner').classList.remove('d-none');
    document.getElementById('fetch-nvidia-models-btn').disabled = true;
    const container = document.getElementById('nvidia-models-container');
    container.innerHTML = '';

    try {
        const result = await apiFetch('/api/nvidia-models', { method: 'POST', body: JSON.stringify({ apiKey }) });
        if (result && result.data && Array.isArray(result.data)) {
            // 1. 智能筛选逻辑：挑选最适合金融推理与工具调用的大规模语言模型
            const targetKeywords = ['llama-3.3', 'llama-3.1', 'nemotron', 'qwen2.5', 'mixtral', 'deepseek'];

            // 2. 彻底排除视觉、音频、专门微调以及参数体量过小的边缘模型
            const excludeKeywords = ['vision', 'embed', 'audio', 'qa', 'math', 'guard', 'reward', 'tts', 'sdxl', 'steerlm', 'fuyu', '8b', '4b', 'hindi', 'code'];

            let filteredModels = result.data.filter(m => {
                const id = m.id.toLowerCase();
                if (excludeKeywords.some(ex => id.includes(ex))) return false;
                return targetKeywords.some(kw => id.includes(kw));
            });

            // 3. 算力动态打排位赛排序：按模型参数体积和官方认证深度加权排序
            filteredModels.sort((a, b) => {
                const getScore = (id) => {
                    let s = 0;

                    // a) 提取参数量（核心权重：算力即正义），例如 70B 会加 7000 分，405b 加 40500 分
                    const paramMatch = id.match(/(\d+(?:\.\d+)?)b/i);
                    if (paramMatch && paramMatch[1]) {
                        s += parseFloat(paramMatch[1]) * 100;
                    }

                    // b) "模型家族" 的优先度（辅助权重，确保同等参数下最强王者靠前）
                    if (id.includes('llama-3.3')) s += 500; // 最新的 Llama 家族有光环加成
                    if (id.includes('llama-3.1')) s += 400;
                    if (id.includes('nemotron')) s += 300;  // NVIDIA 定制护城河
                    if (id.includes('qwen2.5')) s += 200;
                    if (id.includes('mixtral')) s += 100;

                    // c) "推理能力" 的微调优先（指示这是一只聪明听话的猴子）
                    if (id.includes('instruct') || id.includes('chat')) s += 50;
                    return s;
                };
                const scoreA = getScore(a.id.toLowerCase());
                const scoreB = getScore(b.id.toLowerCase());

                if (scoreB !== scoreA) return scoreB - scoreA;
                return b.created - a.created; // 同等权重下越新的越靠前
            });

            // 以防万一，保留备用降频策略
            if (filteredModels.length < 3) {
                filteredModels = result.data.filter(m => !excludeKeywords.some(ex => m.id.toLowerCase().includes(ex)));
            }

            const models = filteredModels.slice(0, 15); // 精心挑选能力最顶尖的 15 款模型展示
            if (models.length === 0) {
                container.innerHTML = '<div class="col-12 py-3 text-muted">API Key有效但未找到可用模型</div>';
            } else {
                container.innerHTML = models.map(m => `
                    <div class="col-md-4 col-sm-6 mb-3">
                        <div class="card border border-success h-100 shadow-sm">
                            <div class="card-body p-3">
                                <h6 class="fw-bold text-success mb-1" style="font-size: 0.9rem;">${m.id}</h6>
                                <p class="small text-muted mb-3" style="font-size: 0.75rem;">所属方: ${m.owned_by}</p>
                                <button class="btn btn-sm btn-success w-100 add-nvidia-model-btn" data-nvidia-model-id="${m.id}">一键添加到系统</button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        } else {
            throw new Error(result.message || '获取模型列表失败');
        }
    } catch (e) {
        showNotification('获取失败', e.message, 'danger');
    } finally {
        document.getElementById('nvidia-search-spinner').classList.add('d-none');
        document.getElementById('fetch-nvidia-models-btn').disabled = false;
    }
}

async function addNvidiaModel(modelId) {
    const apiKey = document.getElementById('nvidia-api-key').value.trim();
    if (!apiKey) return showNotification('错误', '找不到 API Key', 'danger');

    const data = {
        name: `NIM - ${modelId.split('/').pop()}`,
        provider: 'openai',
        apiKey: apiKey,
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        model: modelId,
        maxTokens: 4000,
        temperature: 0.2,
        active: true
    };

    try {
        const result = await apiFetch('/api/models', { method: 'POST', body: JSON.stringify(data) });
        if (result) {
            loadModels();
            showNotification('成功', 'NVIDIA NIM 模型已成功添加并激活！', 'success');
        }
    } catch (e) {
        showNotification('添加失败', e.message, 'danger');
    }
}

// Socket.io 初始化逻辑
function initializeSocket() {
    if (typeof io === 'undefined') return;
    socket = io();

    socket.on('connect', () => {
        console.log('✅ Connected to WebSocket server');
    });

    // 监听 TrendRadar 状态更新
    socket.on('trendradar_status', (data) => {
        const btn = document.getElementById('trendradar-refresh-btn');
        const spinner = document.getElementById('trendradar-spinner');

        if (data.type === 'completed') {
            showNotification('成功', '全网热点 AI 分析报告已更新', 'success');
            const iframe = document.getElementById('trendradar-frame');
            if (iframe) iframe.src = iframe.src;
            if (btn) btn.disabled = false;
            if (spinner) spinner.classList.add('d-none');
        } else if (data.type === 'progress') {
            showNotification('进度', data.message, 'info');
        } else if (data.type === 'error') {
            showNotification('失败', data.message, 'danger');
            if (btn) btn.disabled = false;
            if (spinner) spinner.classList.add('d-none');
        }
    });

    socket.on('analysis_result', (data) => {
        // 全维研报实时更新逻辑（可选）
        if (lastAnalysisResult && lastAnalysisResult.symbol === data.symbol) {
            console.log('Received fresh analysis for', data.symbol);
        }
    });
}

async function loadPushConfig() {
    try {
        const res = await apiFetch('/api/push-config');
        if (res.success && res.data) {
            const form = document.forms['push-config-form'];
            if (!form) return;
            form.elements['telegram_bot_token'].value = res.data.telegram?.bot_token || '';
            form.elements['telegram_chat_id'].value = res.data.telegram?.chat_id || '';
            form.elements['dingtalk_webhook_url'].value = res.data.dingtalk?.webhook_url || '';
            form.elements['wework_webhook_url'].value = res.data.wework?.webhook_url || '';
            form.elements['bark_url'].value = res.data.bark?.url || '';
        }
    } catch (e) {
        showNotification('获取配置失败', e.message, 'danger');
    }
}

async function savePushConfig() {
    const form = document.forms['push-config-form'];
    const btn = document.getElementById('save-push-config-btn');
    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 保存中...';

    const payload = {
        telegram: {
            bot_token: form.elements['telegram_bot_token'].value.trim(),
            chat_id: form.elements['telegram_chat_id'].value.trim()
        },
        dingtalk: {
            webhook_url: form.elements['dingtalk_webhook_url'].value.trim()
        },
        wework: {
            webhook_url: form.elements['wework_webhook_url'].value.trim()
        },
        bark: {
            url: form.elements['bark_url'].value.trim()
        }
    };

    try {
        const res = await apiFetch('/api/push-config', { method: 'POST', body: JSON.stringify(payload) });
        if (res.success) {
            showNotification('成功', res.message || '推送通道配置已成功更新并将立即生效', 'success');
        } else {
            showNotification('保存失败', res.message, 'danger');
        }
    } catch (e) {
        showNotification('保存失败', e.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldText;
    }
}

async function testPushConfig() {
    const btn = document.getElementById('test-push-config-btn');
    if (!btn) return;

    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 发送测试中...';

    try {
        const res = await apiFetch('/api/push-config-test', { method: 'POST' });
        if (res.success) {
            showNotification('测试消息发送成功', '请前往您配置好的各大客户端检查消息！', 'success');
        } else {
            showNotification('测试失败', res.message || '测试过程遇到错误', 'danger');
        }
    } catch (e) {
        showNotification('测试失败', e.message || '网络连接或发生异常', 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
    }
}
window.testPushConfig = testPushConfig;
