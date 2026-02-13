// AI股票分析系统前端逻辑 - 高级时段感知版 (V1.1.2 - 收藏夹UX重构)

let socket;
let currentModels = [];
let currentUser = null;
let token = localStorage.getItem('token');
let lastAnalysisResult = null;

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    initializeSocket();
    setupGlobalEventListeners();
});

function toggleAuth(isLogin) {
    const title = document.getElementById('auth-title');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (title) title.textContent = isLogin ? '登录' : '注册';
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
        if (!l) return '<div style="height: 0.8rem;"></div>';
        if (l.startsWith('###')) return `<h6 class="fw-bold text-primary mt-3 mb-2 border-bottom pb-1">${l.replace(/^###\s*/, '')}</h6>`;
        if (l.startsWith('##')) return `<h5 class="fw-bold text-primary mt-4 mb-2">${l.replace(/^##\s*/, '')}</h5>`;
        if (l.startsWith('#')) return `<h4 class="fw-bold mt-4 mb-2">${l.replace(/^#\s*/, '')}</h4>`;
        l = l.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0056b3;">$1</strong>');
        if (/^\d+\.\s+/.test(l)) {
            const num = l.match(/^\d+/)[0];
            const content = l.replace(/^\d+\.\s+/, '').trim();
            return `<div class="mb-2 d-flex align-items-start"><span class="badge bg-primary me-2 mt-1" style="width: 1.5rem;">${num}</span><div class="flex-grow-1">${content}</div></div>`;
        }
        return `<div class="mb-1">${l}</div>`;
    }).join('');
}

function checkAuth() {
    if (!token) {
        showAuthOnly();
    } else {
        loadDashboard();
        loadModels();
        loadAnalysisInterface();
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
    document.getElementById('main-nav')?.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link) {
            e.preventDefault();
            const section = link.dataset.section;
            if (section) showSection(section);
        }
    });

    document.getElementById('to-register-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuth(false);
    });

    document.getElementById('to-login-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuth(true);
    });

    document.getElementById('logout-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        await handleAuth('/api/auth/login', data);
    });

    document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        await handleAuth('/api/auth/register', data);
    });

    document.getElementById('providerSelect')?.addEventListener('change', (e) => {
        updateModelOptions(e.target.value);
    });

    document.getElementById('analysis-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        performAnalysis();
    });

    document.getElementById('save-to-favorites-btn')?.addEventListener('click', () => {
        saveToFavorites();
    });

    // 收藏夹内部返回按钮
    document.getElementById('back-to-fav-list-btn')?.addEventListener('click', () => {
        document.getElementById('favorites-detail-view').style.display = 'none';
        document.getElementById('favorites-list-view').style.display = 'block';
    });

    document.body.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.matches('#ingest-news-btn') || target.closest('#ingest-news-btn')) ingestNews();
        if (target.matches('#test-notification-btn')) testNotification();
        if (target.matches('[data-action="start-scheduler"]')) controlScheduler('start');
        if (target.matches('[data-action="stop-scheduler"]')) controlScheduler('stop');
        if (target.dataset.modelAction) {
            const action = target.dataset.modelAction;
            const name = target.dataset.modelName;
            if (action === 'test') testModel(name);
            if (action === 'delete') deleteModel(name);
        }
        if (target.dataset.action === 'run-task') runTaskManual(target.dataset.taskName);
        if (target.dataset.action === 'delete-user') deleteUser(target.dataset.userId);
        if (target.id === 'save-model-btn') saveModel();
        
        // 收藏夹内部操作
        if (target.dataset.action === 'view-favorite') viewFavorite(target.dataset.id);
        if (target.dataset.action === 'delete-favorite') deleteFavorite(target.dataset.id);
    });
}

function updateModelOptions(provider) {
    const modelSelect = document.getElementById('modelSelect');
    const baseUrlInput = document.getElementById('baseUrl');
    if (!modelSelect) return;

    const modelOptions = {
        'openai': [
            { value: 'z-ai/glm4.7', text: 'NVIDIA GLM-4.7' },
            { value: 'gpt-4o', text: 'GPT-4o' }
        ],
        'claude': [
            { value: 'claude-3-opus-20240229', text: 'Claude-3 Opus' }
        ]
    };

    const defaultUrls = {
        'openai': 'https://api.openai.com',
        'claude': 'https://api.anthropic.com'
    };

    if (provider && modelOptions[provider]) {
        modelSelect.innerHTML = modelOptions[provider].map(option => 
            `<option value="${option.value}">${option.text}</option>`
        ).join('');
        if (baseUrlInput) {
            baseUrlInput.value = defaultUrls[provider] || '';
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
    resultContainer.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary spinner-border-sm" role="status"></div><span class="ms-2 fw-bold text-primary">正在分析...</span></div>';

    try {
        const response = await apiFetch('/api/analysis', {
            method: 'POST',
            body: JSON.stringify({ symbol, modelName })
        });
        
        if (response.success && response.analysis) {
            lastAnalysisResult = response;
            favBtn?.classList.remove('d-none');
            const raw = response.rawData || {};
            const session = raw.session || '实时';
            const price = raw.currentPrice || 'N/A';
            const change = raw.changePercent || '0.00';
            const colorClass = parseFloat(change) >= 0 ? 'text-success' : 'text-danger';

            let headerHtml = `<div class="mb-3 px-3 py-2 rounded border bg-white d-flex justify-content-between align-items-center shadow-sm">
                <div><span class="h5 mb-0 fw-bold me-2">${symbol}</span><span class="badge bg-dark" style="font-size: 0.7rem;">${session}</span></div>
                <div><span class="h4 mb-0 fw-bold me-2">${price}</span><span class="fw-bold ${colorClass}">${parseFloat(change) >= 0 ? '+' : ''}${change}%</span></div>
            </div>`;

            resultContainer.style.whiteSpace = 'normal';
            resultContainer.innerHTML = headerHtml + `<div class="p-1" style="font-size: 0.9rem; line-height: 1.8; color: #111;">${parseMarkdownToHtml(response.analysis)}</div>`;
        } else {
            resultContainer.innerHTML = `<div class="alert alert-warning py-2">${response.message}</div>`;
        }
    } catch (error) {
        resultContainer.innerHTML = `<div class="alert alert-danger py-2">分析失败: ${error.message}</div>`;
    } finally {
        spinner?.classList.add('d-none');
        if (btn) btn.disabled = false;
    }
}

async function saveToFavorites() {
    if (!lastAnalysisResult) return;
    try {
        const res = await apiFetch('/api/favorites', {
            method: 'POST',
            body: JSON.stringify({
                symbol: lastAnalysisResult.symbol,
                title: `${lastAnalysisResult.symbol} 深度研报 (${new Date().toLocaleDateString()})`,
                content: lastAnalysisResult.analysis,
                analysisData: lastAnalysisResult.rawData
            })
        });
        if (res.success) {
            showNotification('成功', '已存入收藏夹', 'success');
            // 收藏成功后隐藏按钮，防止重复收藏
            document.getElementById('save-to-favorites-btn')?.classList.add('d-none');
        }
    } catch (e) {
        showNotification('错误', '收藏失败', 'danger');
    }
}

async function loadFavorites() {
    const container = document.getElementById('favorites-list-container');
    if (!container) return;
    
    // 每次进入收藏夹，重置为列表视图
    document.getElementById('favorites-detail-view').style.display = 'none';
    document.getElementById('favorites-list-view').style.display = 'block';

    try {
        const res = await apiFetch('/api/favorites');
        if (res.data.length === 0) {
            container.innerHTML = '<div class="col-12 text-center py-5 text-muted"><h4>收藏夹是空的</h4></div>';
            return;
        }
        container.innerHTML = res.data.map(f => `
            <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm border-0">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <h5 class="card-title fw-bold text-primary">${f.symbol}</h5>
                            <small class="text-muted">${new Date(f.createdAt).toLocaleString()}</small>
                        </div>
                        <p class="card-text small text-truncate">${f.title}</p>
                        <div class="mt-3">
                            <button class="btn btn-sm btn-outline-primary" data-action="view-favorite" data-id="${f._id}">查看研报</button>
                            <button class="btn btn-sm btn-outline-danger" data-action="delete-favorite" data-id="${f._id}">删除</button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}

async function viewFavorite(id) {
    try {
        const res = await apiFetch('/api/favorites');
        const fav = res.data.find(i => i._id === id);
        if (fav) {
            // 切换到详情视图（不离开收藏夹模块）
            document.getElementById('favorites-list-view').style.display = 'none';
            document.getElementById('favorites-detail-view').style.display = 'block';
            
            const detailContainer = document.getElementById('fav-detail-content');
            const raw = fav.analysisData || {};
            const colorClass = parseFloat(raw.changePercent) >= 0 ? 'text-success' : 'text-danger';

            let headerHtml = `<div class="mb-3 px-3 py-2 rounded border bg-white d-flex justify-content-between align-items-center shadow-sm">
                <div><span class="h5 mb-0 fw-bold me-2">${fav.symbol}</span><span class="badge bg-secondary" style="font-size: 0.7rem;">历史快照</span></div>
                <div><span class="h4 mb-0 fw-bold me-2">${raw.currentPrice || 'N/A'}</span><span class="fw-bold ${colorClass}">${parseFloat(raw.changePercent) >= 0 ? '+' : ''}${raw.changePercent || '0.00'}%</span></div>
            </div>`;

            detailContainer.innerHTML = headerHtml + `<div class="p-1" style="font-size: 0.9rem; line-height: 1.8; color: #111;">${parseMarkdownToHtml(fav.content)}</div>`;
        }
    } catch (e) { console.error(e); }
}

async function deleteFavorite(id) {
    if (!confirm('确定删除收藏？')) return;
    try {
        await apiFetch(`/api/favorites/${id}`, { method: 'DELETE' });
        loadFavorites();
        showNotification('完成', '已移除', 'info');
    } catch (e) { console.error(e); }
}

async function loadAnalysisInterface() {
    const modelSelect = document.getElementById('analysis-model');
    if (!modelSelect) return;
    try {
        const models = await apiFetch('/api/models');
        const activeModels = models.filter(m => m.active);
        if (activeModels.length === 0) {
            modelSelect.innerHTML = '<option value="">未配置</option>';
            return;
        }
        modelSelect.innerHTML = activeModels.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    } catch (error) { console.error(error); }
}

async function handleAuth(url, data) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            token = result.data.accessToken;
            localStorage.setItem('token', token);
            window.location.reload();
        } else {
            showNotification('错误', result.message, 'danger');
        }
    } catch (error) { showNotification('错误', '验证失败', 'danger'); }
}

function logout() {
    localStorage.removeItem('token');
    window.location.reload();
}

async function apiFetch(url, options = {}) {
    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    const response = await fetch(url, options);
    if (response.status === 401) {
        logout();
        throw new Error('会话过期');
    }
    return response.json();
}

async function loadDashboard() {
    try {
        const data = await apiFetch('/api/dashboard');
        const activeCount = document.getElementById('active-models-count');
        const analysisCount = document.getElementById('today-analysis-count');
        if (activeCount) activeCount.textContent = data.activeModels || 0;
        if (analysisCount) analysisCount.textContent = data.todayAnalysis || 0;
    } catch (error) { console.error(error); }
}

function showSection(sectionName) {
    try {
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => section.style.display = 'none');
        const target = document.getElementById(sectionName);
        if (target) target.style.display = 'block';
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.section === sectionName) link.classList.add('active');
        });
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.style.display = 'block';
        
        switch(sectionName) {
            case 'models': loadModels(); break;
            case 'analysis': loadAnalysisInterface(); break;
            case 'favorites': loadFavorites(); break;
            case 'news': loadNewsFeed(); break;
            case 'scheduler': loadSchedulerInterface(); break;
            case 'notifications': loadNotificationSettings(); break;
            case 'users': loadUserManagement(); break;
        }
    } catch (e) { console.error(e); }
}

function initializeSocket() {
    if (typeof io !== 'undefined') {
        socket = io();
        socket.on('connect', () => console.log('✅ Connected'));
        socket.on('analysis_result', () => loadDashboard());
    }
}

async function loadModels() {
    try {
        const models = await apiFetch('/api/models');
        currentModels = models;
        renderModels(models);
    } catch (error) { console.error(error); }
}

function renderModels(models) {
    const container = document.getElementById('models-container');
    if (!container) return;
    if (models.length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-5"><h4>未配置</h4></div>';
        return;
    }
    container.innerHTML = models.map(model => `
        <div class="col-lg-4 col-md-6 mb-4">
            <div class="card h-100 ${model.active ? 'border-success' : 'border-secondary'}">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">${model.name}</h6>
                    <div class="badge ${model.active ? 'bg-success' : 'bg-secondary'}">${model.active ? '活跃' : '停用'}</div>
                </div>
                <div class="card-body">
                    <p class="small text-muted mb-1">提供商: ${model.provider}</p>
                    <p class="small text-muted mb-3">模型: ${model.model}</p>
                    <button class="btn btn-sm btn-outline-primary" data-model-action="test" data-model-name="${model.name}">测试</button>
                    <button class="btn btn-sm btn-outline-danger" data-model-action="delete" data-model-name="${model.name}">删除</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadNewsFeed() {
    try {
        const result = await apiFetch('/api/news');
        const container = document.getElementById('news-feed-container');
        if (!container) return;
        container.innerHTML = result.data.length === 0 ? '<div class="text-center py-5">暂无</div>' : result.data.map(item => `
            <div class="card mb-3 border-0 shadow-sm">
                <div class="card-body">
                    <h5 class="fw-bold">${item.title}</h5>
                    <p class="small text-muted mb-2">${new Date(item.publishedAt).toLocaleString()}</p>
                    <p class="mb-2">${item.content}</p>
                    <div>${item.relatedSymbols.map(s => `<span class="badge bg-info me-1">${s}</span>`).join('')}</div>
                </div>
            </div>
        `).join('');
    } catch (error) { console.error(error); }
}

async function ingestNews() {
    showNotification('正在抓取', '请稍候...', 'info');
    await apiFetch('/api/news/ingest', { method: 'POST' });
    showNotification('成功', '完成', 'success');
    loadNewsFeed();
}

async function loadSchedulerInterface() {
    const result = await apiFetch('/api/scheduler/status');
    const tbody = document.getElementById('tasks-table-body');
    if (tbody) {
        tbody.innerHTML = Object.entries(result.tasks || {}).map(([name, task]) => `
            <tr>
                <td>${name}</td>
                <td><code>${task.schedule}</code></td>
                <td><span class="badge ${result.running ? 'bg-success' : 'bg-danger'}">${result.running ? '运行中' : '停止'}</span></td>
                <td>${task.lastRun ? new Date(task.lastRun).toLocaleString() : '从人'}</td>
                <td><button class="btn btn-sm btn-link" data-action="run-task" data-task-name="${name}">执行</button></td>
            </tr>
        `).join('');
    }
}

async function loadNotificationSettings() {
    const status = await apiFetch('/api/push/status');
    const container = document.getElementById('push-status-container');
    if (container) {
        container.innerHTML = Object.entries(status).map(([key, val]) => `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <span class="fw-bold text-uppercase">${key}</span>
                <span class="badge ${val ? 'bg-success' : 'bg-danger'}">${val ? '就绪' : '未配置'}</span>
            </div>
        `).join('');
    }
}

async function loadUserManagement() {
    const result = await apiFetch('/api/users');
    const tbody = document.getElementById('users-table-body');
    if (tbody) {
        tbody.innerHTML = result.data.map(u => `
            <tr>
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td>${u.roles.join(', ')}</td>
                <td>${u.active ? '✅' : '❌'}</td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td><button class="btn btn-sm btn-danger" data-action="delete-user" data-user-id="${u._id}" ${u.username === 'admin' ? 'disabled' : ''}>删除</button></td>
            </tr>
        `).join('');
    }
}

function showNotification(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 10000; min-width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);';
    toast.innerHTML = `<strong>${title}</strong><br>${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

async function controlScheduler(action) {
    await apiFetch(`/api/scheduler/${action}`, { method: 'POST' });
    loadSchedulerInterface();
}

async function testModel(name) {
    showNotification('测试中', `发起测试: ${name}...`, 'info');
    try {
        const res = await apiFetch(`/api/models/${name}/test`, { method: 'POST' });
        showNotification('成功', `响应: ${res.response.substring(0, 100)}...`, 'success');
    } catch (e) { showNotification('失败', e.message, 'danger'); }
}

async function deleteModel(name) {
    if (confirm('删除 AI 模型？')) {
        await apiFetch(`/api/models/${name}`, { method: 'DELETE' });
        loadModels();
    }
}

async function deleteUser(id) {
    if (confirm('确定删除用户？')) {
        await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
        loadUserManagement();
    }
}

async function testNotification() {
    const res = await apiFetch('/api/push/test', { method: 'POST' });
    showNotification('结果', res.message, res.success ? 'success' : 'warning');
}

async function runTaskManual(name) {
    showNotification('执行', `触发: ${name}`, 'info');
}

async function saveModel() {
    const form = document.getElementById('addModelForm');
    const formData = new FormData(form);
    const spinner = document.getElementById('saveSpinner');
    const modelData = {
        name: formData.get('name'),
        provider: formData.get('provider'),
        apiKey: formData.get('apiKey'),
        baseUrl: formData.get('baseUrl'),
        model: formData.get('model'),
        maxTokens: parseInt(formData.get('maxTokens')) || 4000,
        temperature: parseFloat(formData.get('temperature')) || 0.7,
        active: formData.has('active')
    };
    if (spinner) spinner.classList.remove('d-none');
    try {
        const result = await apiFetch('/api/models', {
            method: 'POST',
            body: JSON.stringify(modelData)
        });
        if (result) {
            showNotification('成功', '模型已添加。', 'success');
            const modalEl = document.getElementById('addModelModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            form.reset();
            loadModels();
        }
    } catch (error) { showNotification('错误', error.message, 'danger'); }
    finally { if (spinner) spinner.classList.add('d-none'); }
}
