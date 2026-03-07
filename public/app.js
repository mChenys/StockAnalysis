// AI股票分析系统前端逻辑 - 模型库扩容版 (V1.1.8)

let socket;
let currentSubscription = null;
let lastTickValue = null;
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
    // 检查是否为演示模式 token
    if (token && token.startsWith('demo-token')) {
        const demoUser = localStorage.getItem('demoUser');
        if (demoUser) {
            currentUser = JSON.parse(demoUser);
        } else {
            currentUser = {
                _id: 'demo-user',
                username: 'demo-user',
                email: 'demo@example.com',
                roles: ['user'],
                active: true
            };
        }
        loadDashboard();
        showSection('dashboard');
        showNotification('演示模式', '当前使用演示模式，数据仅存储在本地', 'info');
        return;
    }
    
    // 检查服务器是否为开发模式（无 MongoDB）
    try {
        const devRes = await fetch('/api/dev/status');
        const devData = await devRes.json();
        if (devData.devMode) {
            // 开发模式：清除旧数据，设置 dev token 和用户信息
            localStorage.clear();
            token = 'dev-mode';
            localStorage.setItem('token', token);
            // 设置开发模式的虚拟用户（管理员）
            currentUser = {
                _id: 'dev-admin',
                username: 'dev-admin',
                email: 'dev@admin.local',
                roles: ['admin'],
                active: true
            };
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

        const actionBtn = target.closest('[data-action]');
        const action = actionBtn ? actionBtn.dataset.action : null;
        const id = actionBtn ? actionBtn.dataset.id : (target.closest('[data-id]') ? target.closest('[data-id]').dataset.id : null);
        const modelBtn = target.closest('[data-model-action]');
        const modelAction = modelBtn ? modelBtn.dataset.modelAction : null;
        const modelName = modelBtn ? modelBtn.dataset.modelName : null;

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

        if (target.id === 'trendradar-reload-btn' || target.closest('#trendradar-reload-btn')) {
            const frame = document.getElementById('trendradar-frame');
            if (frame) {
                const oldStats = JSON.parse(localStorage.getItem('trendradar_last_stats') || '{"newsCount":0}');
                apiFetch('/api/trendradar/stats').then(newStats => {
                    if (newStats.success) {
                        const diff = newStats.newsCount - oldStats.newsCount;

                        // 刷新 iframe
                        const currentUrl = new URL(frame.src);
                        currentUrl.searchParams.set('t', Date.now());
                        frame.src = currentUrl.toString();

                        // 更新 UI 指示器
                        const lastCheck = document.getElementById('trendradar-last-check');
                        if (lastCheck) lastCheck.innerText = `最后检查: ${new Date().toLocaleTimeString()}`;

                        // 提示结果
                        if (diff > 0) {
                            showNotification('发现更新', `新增 ${diff} 条新闻，报告生成于 ${newStats.generatedAt}`, 'success');
                        } else {
                            showNotification('已刷新', '视图已重载，目前磁盘上暂无更多新增新闻', 'info');
                        }

                        localStorage.setItem('trendradar_last_stats', JSON.stringify(newStats));
                    }
                });
            }
        }

        if (target.id === 'trendradar-refresh-btn' || target.closest('#trendradar-refresh-btn')) {
            refreshTrendRadar();
        }

        if (target.id === 'test-push-config-btn' || target.closest('#test-push-config-btn')) {
            testPushConfig();
        }


        if (target.id === 'close-task-form-btn' || target.closest('#close-task-form-btn') ||
            target.id === 'cancel-task-form-btn' || target.closest('#cancel-task-form-btn')) {
            document.getElementById('taskFormCard').style.display = 'none';
        }

        if (target.id === 'fetch-nvidia-models-btn') fetchNvidiaModels();
        if (target.matches('.add-nvidia-model-btn')) {
            const mId = target.dataset.nvidiaModelId;
            addNvidiaModel(mId);
        }

        if (target.id === 'refresh-quant-btn' || target.closest('#refresh-quant-btn')) {
            window.loadQuantInterface();
        }

        if (target.id === 'add-strategy-btn') {
            const modal = new bootstrap.Modal(document.getElementById('strategyModal'));
            modal.show();
        }

        if (target.id === 'save-strategy-btn') {
            createStrategy();
        }

        if (target.id === 'deposit-btn' || target.closest('#deposit-btn')) {
            const amount = prompt('请输入模拟入金金额 (¥):', '100000');
            if (amount && !isNaN(amount)) {
                window.depositFunds(parseFloat(amount));
            }
        }

        if (target.id === 'run-backtest-btn' || target.closest('#run-backtest-btn')) {
            window.runBacktest();
        }
    });

    document.addEventListener('submit', async (e) => {
        const id = e.target.id;
        if (id === 'loginForm') { e.preventDefault(); await handleAuth('/api/auth/login', Object.fromEntries(new FormData(e.target))); }
        else if (id === 'registerForm') { e.preventDefault(); await handleAuth('/api/auth/register', Object.fromEntries(new FormData(e.target))); }
        else if (id === 'analysis-form') { e.preventDefault(); performAnalysis(); }
        else if (id === 'push-config-form') { e.preventDefault(); savePushConfig(); }
        else if (id === 'order-form') { e.preventDefault(); window.handleOrderSubmit(e); }
        else if (id === 'strategy-form') { e.preventDefault(); window.createStrategy(); }
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'providerSelect') updateModelOptions(e.target.value);
        if (e.target.id === 'order-gateway') window.loadQuantInterface();
    });
}

function showSection(name) {
    // 检查是否已登录（除 auth-section 外都需要登录）
    // 同时检查全局变量和 localStorage，确保异步初始化后也能正常工作
    const currentToken = token || localStorage.getItem('token');
    if (name !== 'auth-section' && !currentToken) {
        showAuthOnly();
        showNotification('提示', '请先登录后再访问该功能', 'warning');
        return;
    }

    // 隐藏所有 section - 只使用 display:none
    const sections = document.querySelectorAll('.section');
    sections.forEach(s => {
        s.style.display = 'none';
    });
    
    // 显示目标 section
    const target = document.getElementById(name);
    if (target) {
        if (name === 'trendradar' || name === 'situation') {
            target.style.display = 'flex';
        } else {
            target.style.display = 'block';
        }
        // 滚动到顶部
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    }
    
    // 更新导航状态
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(l => { 
        l.classList.remove('active'); 
        if (l.dataset.section === name) l.classList.add('active'); 
    });
    
    // 确保侧边栏显示
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.display = 'block';
    
    // 加载对应模块数据
    if (name === 'analysis') loadAnalysisInterface();
    if (name === 'models') loadModels();
    if (name === 'favorites') loadFavorites();
    if (name === 'news') loadNewsFeed();
    if (name === 'trendradar') loadTrendRadarInterface();
    if (name === 'notifications') loadPushConfig();
    if (name === 'quant') loadQuantInterface();
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
    // 重置收藏按钮状态
    if (favBtn) {
        favBtn.classList.add('d-none');
        favBtn.disabled = false;
        favBtn.innerHTML = '<i class="bi bi-star"></i> 收藏';
    }
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
    // 检查是否为 CloudBase 静态托管环境（无后端）
    const isStaticHosting = window.location.hostname.includes('tcloudbaseapp.com') || 
                            window.location.hostname.includes('tcb.qcloud.la');
    
    if (isStaticHosting) {
        // 模拟登录/注册（演示模式）
        simulateAuth(url, data);
        return;
    }
    
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const result = await res.json();
        if (result.success) { token = result.data.accessToken; localStorage.setItem('token', token); window.location.reload(); }
        else showNotification('错误', result.message, 'danger');
    } catch (e) { 
        console.error(e);
        showNotification('错误', '无法连接到服务器，切换到演示模式', 'warning');
        // 如果连接失败，也切换到演示模式
        setTimeout(() => simulateAuth(url, data), 1500);
    }
}

function simulateAuth(url, data) {
    // 演示模式：模拟登录/注册成功
    const isRegister = url.includes('register');
    const username = data.username || 'demo-user';
    
    // 创建模拟用户
    currentUser = {
        _id: 'demo-' + Date.now(),
        username: username,
        email: data.email || username + '@demo.com',
        roles: ['user'],
        active: true,
        createdAt: new Date(),
        lastLogin: new Date()
    };
    
    // 设置模拟 token
    token = 'demo-token-' + Date.now();
    localStorage.setItem('token', token);
    localStorage.setItem('demoUser', JSON.stringify(currentUser));
    
    showNotification(
        '演示模式', 
        `${isRegister ? '注册' : '登录'}成功（演示模式）\n用户名: ${username}`,
        'success'
    );
    
    setTimeout(() => window.location.reload(), 1000);
}

function logout() { localStorage.removeItem('token'); window.location.reload(); }
async function apiFetch(url, opts = {}) {
    // 演示模式：返回模拟数据
    if (token && token.startsWith('demo-token')) {
        return simulateApiResponse(url, opts);
    }
    
    opts.headers = { ...opts.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(url, opts);
    if (res.status === 401) {
        logout();
        throw new Error('Authentication failed');
    }
    if (!res.ok) {
        throw new Error(`API request failed: ${res.status}`);
    }
    return res.json();
}

function simulateApiResponse(url, opts) {
    // 演示模式下返回模拟数据
    const mockResponses = {
        '/api/dashboard': {
            success: true,
            data: {
                activeModels: 2,
                todayAnalysis: 5,
                favoritesCount: 3,
                tasksCount: 2,
                taskRunCount: 12,
                notificationTriggers: 8
            }
        },
        '/api/models': {
            success: true,
            data: [
                { 
                    name: 'GPT-4o', 
                    provider: 'OpenAI', 
                    model: 'gpt-4o', 
                    active: true,
                    baseUrl: 'https://api.openai.com/v1',
                    maxTokens: 4000,
                    temperature: 0.7
                },
                { 
                    name: 'Claude 3.5 Sonnet', 
                    provider: 'Anthropic', 
                    model: 'claude-3-5-sonnet-20240620', 
                    active: true,
                    baseUrl: 'https://api.anthropic.com',
                    maxTokens: 4000,
                    temperature: 0.7
                }
            ]
        },
        '/api/favorites': {
            success: true,
            data: [
                { _id: '1', symbol: 'AAPL', title: '苹果公司分析', content: '强势上涨', createdAt: new Date() },
                { _id: '2', symbol: 'NVDA', title: '英伟达深度研报', content: 'AI龙头', createdAt: new Date() }
            ]
        },
        '/api/news': {
            success: true,
            data: [
                { _id: '1', title: '美联储维持利率不变', source: '财经网', url: '#', publishedAt: new Date() },
                { _id: '2', title: '科技股集体上涨', source: '华尔街见闻', url: '#', publishedAt: new Date() }
            ]
        },
        '/api/tasks': {
            success: true,
            data: [
                { _id: '1', name: '每日早盘分析', type: 'market_analysis', enabled: true, cronExpression: '0 9 * * *' },
                { _id: '2', name: '热点雷达扫描', type: 'trendradar_report', enabled: true, cronExpression: '0 */6 * * *' }
            ]
        }
    };
    
    // 匹配 URL
    for (const [pattern, response] of Object.entries(mockResponses)) {
        if (url.includes(pattern)) {
            return Promise.resolve(response);
        }
    }
    
    // POST 请求默认返回成功
    if (opts.method === 'POST') {
        return Promise.resolve({ success: true, message: '演示模式：操作成功', data: {} });
    }
    
    // 默认返回空成功响应
    return Promise.resolve({ success: true, data: [], message: '演示模式：暂无数据' });
}
async function loadDashboard() {
    try {
        const data = await apiFetch('/api/dashboard');
        const activeModelsEl = document.getElementById('active-models-count');
        const todayAnalysisEl = document.getElementById('today-analysis-count');
        const favoritesEl = document.getElementById('favorites-count');
        const tasksEl = document.getElementById('tasks-count');
        const taskRunsEl = document.getElementById('task-runs-count');
        const notificationsEl = document.getElementById('notifications-count');
        if (activeModelsEl) activeModelsEl.textContent = data.activeModels ?? 0;
        if (todayAnalysisEl) todayAnalysisEl.textContent = data.todayAnalysis ?? 0;
        if (favoritesEl) favoritesEl.textContent = data.favoritesCount ?? 0;
        if (tasksEl) tasksEl.textContent = data.tasksCount ?? 0;
        if (taskRunsEl) taskRunsEl.textContent = data.taskRunCount ?? 0;
        if (notificationsEl) notificationsEl.textContent = data.notificationTriggers ?? data.messagesSent ?? 0;
    } catch (e) {}
}
async function loadModels() {
    try {
        const result = await apiFetch('/api/models');
        const container = document.getElementById('models-container');
        if (!container) return;
        
        // 处理不同格式的响应
        const models = Array.isArray(result) ? result : (result.data || []);
        
        if (models.length === 0) { 
            container.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="bi bi-cpu fs-1 d-block mb-3 opacity-25"></i>暂无AI模型配置<br><small class="mt-2 d-block">点击右上角"添加模型"按钮开始配置</small></div>'; 
            return; 
        }
        
        container.innerHTML = models.map(m => `<div class="col-lg-4 col-md-6 mb-4"><div class="card card-custom h-100"><div class="card-header bg-transparent d-flex justify-content-between align-items-center"><h6 class="mb-0 fw-bold">${m.name}</h6><div class="badge ${m.active ? 'bg-success' : 'bg-secondary'}">${m.active ? '活跃' : '停用'}</div></div><div class="card-body"><p class="small text-muted mb-3">提供商: ${m.provider}<br>模型: ${m.model}</p><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-primary" data-model-action="test" data-model-name="${m.name}">测试</button><button class="btn btn-sm btn-outline-danger" data-model-action="delete" data-model-name="${m.name}">删除</button></div></div></div></div>`).join('');
    } catch (e) {
        console.error('Load models error:', e);
        const container = document.getElementById('models-container');
        if (container) {
            container.innerHTML = '<div class="col-12 text-center py-5 text-danger"><i class="bi bi-exclamation-triangle fs-1 d-block mb-3"></i>加载模型失败<br><small class="mt-2 d-block">请检查网络连接或联系管理员</small></div>';
        }
    }
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

        // 初始化最后统计量
        apiFetch('/api/trendradar/stats').then(stats => {
            if (stats.success && !localStorage.getItem('trendradar_last_stats')) {
                localStorage.setItem('trendradar_last_stats', JSON.stringify(stats));
            }
        });
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
    if (!lastAnalysisResult) {
        showNotification('错误', '没有可收藏的研报数据，请先进行分析', 'warning');
        return;
    }
    
    const favBtn = document.getElementById('save-to-favorites-btn');
    if (favBtn.disabled) return; // 防止重复点击
    
    favBtn.disabled = true;
    favBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> 保存中...';
    
    try {
        const res = await apiFetch('/api/favorites', {
            method: 'POST',
            body: JSON.stringify({
                type: 'stock_analysis',
                symbol: lastAnalysisResult.symbol,
                title: `${lastAnalysisResult.symbol} 全维研报`,
                content: lastAnalysisResult.analysis,
                analysisData: lastAnalysisResult.rawData
            })
        });
        
        if (res.success) {
            showNotification('成功', '研报已存入收藏夹', 'success');
            favBtn.classList.add('d-none');
        } else {
            showNotification('失败', res.message || '收藏失败，请重试', 'danger');
            favBtn.disabled = false;
            favBtn.innerHTML = '<i class="bi bi-star"></i> 收藏';
        }
    } catch (e) {
        showNotification('错误', '网络请求失败: ' + e.message, 'danger');
        favBtn.disabled = false;
        favBtn.innerHTML = '<i class="bi bi-star"></i> 收藏';
    }
}

async function loadFavorites() {
    const container = document.getElementById('favorites-list-container');
    if (!container) return;
    container.innerHTML = '<div class="col-12 text-center py-5"><div class="spinner-border text-primary"></div></div>';
    try {
        const res = await apiFetch('/api/favorites');
        // Handle case where apiFetch returns undefined (e.g., on 401 redirect)
        if (!res) {
            container.innerHTML = '<div class="col-12 text-center py-5 text-muted">请重新登录</div>';
            return;
        }
        // Handle API error response
        if (!res.success) {
            container.innerHTML = `<div class="col-12 text-center py-5 text-muted">加载失败: ${res.message || '未知错误'}</div>`;
            return;
        }
        if (res.success && res.data) {
            if (res.data.length === 0) {
                container.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="bi bi-star fs-1 d-block mb-3 opacity-25"></i>暂无收藏内容</div>';
                return;
            }

            // 分组逻辑
            const stocks = res.data.filter(f => !f.type || f.type === 'stock_analysis');
            const radars = res.data.filter(f => f.type === 'trendradar');
            const newsInts = res.data.filter(f => f.type === 'news_interpretation');
            const agentChats = res.data.filter(f => f.type === 'agent_chat');

            let html = '';

            if (stocks.length > 0) {
                html += `<div class="col-12 mb-3 mt-2"><h5 class="fw-bold text-dark border-start border-4 border-primary ps-2">AI 智能研报 (${stocks.length})</h5></div>`;
                html += stocks.map(f => `
                    <div class="col-lg-4 col-md-6 mb-4">
                        <div class="card card-custom h-100 shadow-sm border-0">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <h6 class="fw-bold text-primary mb-0">${f.symbol}</h6>
                                    <span class="badge bg-light text-muted small" style="font-size: 0.7rem;">${new Date(f.createdAt).toLocaleString()}</span>
                                </div>
                                <h6 class="card-title fw-bold mb-3" style="font-size: 0.95rem;">${f.title}</h6>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-sm btn-primary flex-grow-1" data-action="view-favorite" data-id="${f._id}"><i class="bi bi-eye"></i> 查看</button>
                                    <button class="btn btn-sm btn-outline-danger" data-action="delete-favorite" data-id="${f._id}"><i class="bi bi-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }

            if (newsInts.length > 0) {
                html += `<div class="col-12 mb-3 mt-4"><h5 class="fw-bold text-dark border-start border-4 border-warning ps-2">财金新闻解读 (${newsInts.length})</h5></div>`;
                html += newsInts.map(f => `
                    <div class="col-lg-4 col-md-6 mb-4">
                        <div class="card card-custom h-100 shadow-sm border-0" style="background: linear-gradient(135deg, #ffffff 0%, #fffdf5 100%);">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <span class="badge bg-warning text-dark" style="font-size: 0.65rem;">新闻分析</span>
                                    <span class="text-muted small" style="font-size: 0.7rem;">${new Date(f.createdAt).toLocaleString()}</span>
                                </div>
                                <h6 class="card-title fw-bold mb-3" style="font-size: 0.95rem; color: #856404;">${f.title}</h6>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-sm btn-outline-warning flex-grow-1" data-action="view-favorite" data-id="${f._id}"><i class="bi bi-journal-text"></i> 阅读解读</button>
                                    <button class="btn btn-sm btn-outline-danger" data-action="delete-favorite" data-id="${f._id}"><i class="bi bi-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }

            if (radars.length > 0) {
                html += `<div class="col-12 mb-3 mt-4"><h5 class="fw-bold text-dark border-start border-4 border-info ps-2">全网热点雷达回放 (${radars.length})</h5></div>`;
                html += radars.map(f => `
                    <div class="col-lg-4 col-md-6 mb-4">
                        <div class="card card-custom h-100 shadow-sm border-0" style="background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%);">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <span class="badge bg-info text-white" style="font-size: 0.65rem;">热点雷达</span>
                                    <span class="text-muted small" style="font-size: 0.7rem;">${new Date(f.createdAt).toLocaleString()}</span>
                                </div>
                                <h6 class="card-title fw-bold mb-3" style="font-size: 0.95rem;">${f.title}</h6>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-sm btn-info text-white flex-grow-1" data-action="view-favorite" data-id="${f._id}"><i class="bi bi-play-circle"></i> 回看报告</button>
                                    <button class="btn btn-sm btn-outline-danger" data-action="delete-favorite" data-id="${f._id}"><i class="bi bi-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
            if (agentChats.length > 0) {
                html += `<div class="col-12 mb-3 mt-4"><h5 class="fw-bold text-dark border-start border-4 border-success ps-2" style="border-color: #8b5cf6 !important;">AI 股票分析 Agent (${agentChats.length})</h5></div>`;
                html += agentChats.map(f => `
                    <div class="col-lg-4 col-md-6 mb-4">
                        <div class="card card-custom h-100 shadow-sm border-0" style="background: linear-gradient(135deg, #ffffff 0%, #f9f5ff 100%);">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <span class="badge" style="background-color: #8b5cf6; color: white; font-size: 0.65rem;">Agent 分析</span>
                                    <span class="text-muted small" style="font-size: 0.7rem;">${new Date(f.createdAt).toLocaleString()}</span>
                                </div>
                                <h6 class="card-title fw-bold mb-3" style="font-size: 0.95rem; color: #5b21b6;">${f.title}</h6>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-sm text-white flex-grow-1" style="background-color: #8b5cf6;" data-action="view-favorite" data-id="${f._id}"><i class="bi bi-robot"></i> 查看对话结果</button>
                                    <button class="btn btn-sm btn-outline-danger" data-action="delete-favorite" data-id="${f._id}"><i class="bi bi-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }

            container.innerHTML = html;
        }
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">加载失败: ${e.message}</div>`;
    }
}

async function viewFavorite(id) {
    try {
        const res = await apiFetch('/api/favorites');
        const fav = res.data.find(f => f._id === id);
        if (fav) {
            document.getElementById('favorites-list-view').style.display = 'none';
            document.getElementById('favorites-detail-view').style.display = 'block';
            document.getElementById('fav-detail-title').textContent = fav.title;

            if (fav.type === 'trendradar') {
                document.getElementById('fav-detail-content').innerHTML = `<div class="p-2 bg-light border-bottom mb-3 d-flex justify-content-between align-items-center">
                    <span class="text-muted small"><i class="bi bi-clock-history"></i> 历史快照时间: ${new Date(fav.createdAt).toLocaleString()}</span>
                    <span class="badge bg-info">全网热点雷达回放</span>
                </div>
                <iframe srcdoc="${fav.content.replace(/"/g, '&quot;')}" style="width:100%; height:75vh; border:none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);"></iframe>`;
            } else if (fav.type === 'news_interpretation') {
                const raw = fav.analysisData || {};
                let headerHtml = `<div class="p-3 mb-4 rounded border bg-light">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-warning text-dark">财金新闻深度解读</span>
                        <small class="text-muted">收藏于: ${new Date(fav.createdAt).toLocaleString()}</small>
                    </div>
                    <h5 class="fw-bold mb-1">${raw.originalTitle || fav.symbol}</h5>
                    <div class="small text-muted">数据源: ${raw.source || '未知'} | <a href="${raw.newsUrl}" target="_blank" class="text-decoration-none">访问原文 🔗</a></div>
                </div>`;
                document.getElementById('fav-detail-content').innerHTML = headerHtml + `<div class="ai-report-body px-1">${parseMarkdownToHtml(fav.content)}</div>`;
            } else if (fav.type === 'agent_chat') {
                document.getElementById('fav-detail-content').innerHTML = `
                    <div class="p-3 mb-4 rounded border bg-light">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <span class="badge" style="background-color: #8b5cf6; color: white;">AI Agent 智能研判</span>
                                <small class="text-muted ms-2">分析时间: ${new Date(fav.createdAt).toLocaleString()}</small>
                            </div>
                            <div class="small">
                                <span class="text-muted">会话标的: </span><span class="badge bg-outline-secondary text-dark border">${fav.symbol}</span>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 border rounded bg-white shadow-sm agent-chat-body" style="line-height: 1.8;">
                        ${parseMarkdownToHtml(fav.content)}
                    </div>
                    <style>
                        .agent-chat-body h1, .agent-chat-body h2, .agent-chat-body h3 { color: #8b5cf6; margin-top: 1.5rem; margin-bottom: 1rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; font-size: 1.1rem; }
                        .agent-chat-body strong { color: #5b21b6; }
                        .agent-chat-body blockquote { border-left: 4px solid #8b5cf6; padding-left: 1rem; color: #666; font-style: italic; }
                    </style>
                `;
            } else {
                const raw = fav.analysisData || {};
                let headerHtml = `<div class="p-3 mb-4 rounded border bg-light d-flex justify-content-between align-items-center">
                    <div>
                        <h4 class="mb-0 fw-bold">${fav.symbol} <span class="badge bg-dark ms-2" style="font-size: 12px;">历史存档</span></h4>
                        <small class="text-muted">收藏于: ${new Date(fav.createdAt).toLocaleString()}</small>
                    </div>
                    <div class="text-end">
                        <span class="h4 mb-0 fw-bold">${raw.currentPrice || 'N/A'}</span>
                        <span class="ms-2 fw-bold ${parseFloat(raw.changePercent) >= 0 ? 'text-success' : 'text-danger'}">${raw.changePercent || '0.00'}%</span>
                    </div>
                </div>`;
                document.getElementById('fav-detail-content').innerHTML = headerHtml + `<div class="ai-report-body px-1">${parseMarkdownToHtml(fav.content)}</div>`;
            }
        }
    } catch (e) {
        showNotification('查看失败', e.message, 'danger');
    }
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
        updateNewsRefreshTime();
    } catch (e) {
        container.innerHTML = `<div class="text-center py-5 text-danger">加载失败: ${e.message}</div>`;
    }
}

function updateNewsRefreshTime() {
    const el = document.getElementById('news-refresh-time');
    if (el) {
        const now = new Date();
        el.innerHTML = `<i class="bi bi-clock-history me-1"></i>上次更新: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
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
            updateNewsRefreshTime();
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
            let html = parseMarkdownToHtml(data.response);

            // 创建收藏按钮
            const favBtn = document.createElement('button');
            favBtn.className = 'btn btn-xs btn-outline-warning fw-bold ms-2';
            favBtn.style.cssText = 'font-size: 0.75rem; padding: 2px 10px; border-radius: 20px; transition: all 0.3s; vertical-align: middle;';
            favBtn.innerHTML = '<i class="bi bi-star"></i> 收藏';

            const handleFavorite = async (btn) => {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 收藏中...';
                btn.disabled = true;
                try {
                    let favTitle = item.title;
                    const match = data.response.match(/结论：【(.*?)】/);
                    if (match) favTitle = `深度解读: ${match[1]}`;

                    const favRes = await apiFetch('/api/favorites', {
                        method: 'POST',
                        body: JSON.stringify({
                            type: 'news_interpretation',
                            symbol: 'NEWS',
                            title: favTitle,
                            content: data.response,
                            analysisData: { source: item.sourceId, newsUrl: item.url, originalTitle: item.title, timestamp: new Date().toISOString() }
                        })
                    });
                    if (favRes.success) {
                        showNotification('收藏成功', '已存入收藏夹', 'success');
                        btn.innerHTML = '<i class="bi bi-check-lg"></i> 已收藏';
                        btn.className = 'btn btn-xs btn-success fw-bold ms-2';
                        btn.disabled = true;
                    } else {
                        throw new Error(favRes.message);
                    }
                } catch (err) {
                    showNotification('收藏失败', err.message, 'danger');
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            };
            favBtn.onclick = () => handleFavorite(favBtn);

            // 直接在容器中渲染
            resContainer.innerHTML = html;

            let injected = false;
            // 查找包含“结论”的段落或首行
            const paragraphs = resContainer.querySelectorAll('div, p, h6, strong, li');
            for (let p of paragraphs) {
                const text = p.innerText.trim();
                // 确保是直接包含“结论：”文字的最小容器
                if (text.startsWith('结论：') || text.includes('结论：')) {
                    p.style.display = 'flex';
                    p.style.alignItems = 'center';
                    p.style.justifyContent = 'space-between';
                    p.style.flexWrap = 'nowrap';
                    p.style.width = '100%';
                    p.style.gap = '10px';

                    // 将文字包装，确保按钮靠右
                    const textSpan = document.createElement('span');
                    textSpan.innerHTML = p.innerHTML;
                    p.innerHTML = '';
                    p.appendChild(textSpan);
                    p.appendChild(favBtn);
                    injected = true;
                    break;
                }
            }

            if (!injected) {
                const topDiv = document.createElement('div');
                topDiv.className = 'text-end mb-2';
                topDiv.appendChild(favBtn);
                resContainer.insertBefore(topDiv, resContainer.firstChild);
            }
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
            if (iframe) {
                const url = new URL(iframe.src);
                url.searchParams.set('t', Date.now());
                iframe.src = url.toString();
                // 生成成功后同步统计量，以便后续点击“刷新视图”能准确计算差异
                apiFetch('/api/trendradar/stats').then(stats => {
                    if (stats.success) localStorage.setItem('trendradar_last_stats', JSON.stringify(stats));
                });
                // 更新显示时间
                const lastCheckEl = document.getElementById('trendradar-last-check');
                if (lastCheckEl) {
                    const now = new Date();
                    lastCheckEl.textContent = `上次更新: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                }
            }
            if (btn) btn.disabled = false;
            if (spinner) spinner.classList.add('d-none');
            if (window.loadTasks) window.loadTasks(); // 立即刷新列表状态图标
        } else if (data.type === 'progress') {
            showNotification('进度', data.message, 'info');
        } else if (data.type === 'error') {
            showNotification('失败', data.message, 'danger');
            if (btn) btn.disabled = false;
            if (spinner) spinner.classList.add('d-none');
            if (window.loadTasks) window.loadTasks(); // 立即刷新列表状态图标
        }
    });

    socket.on('task_status_updated', (data) => {
        console.log('Task status update received:', data);
        if (window.loadTasks) window.loadTasks(); // 任何任务状态改变（如开始运行/完成），都刷新列表
    });

    socket.on('analysis_result', (data) => {
        // 全维研报实时更新逻辑（可选）
        if (lastAnalysisResult && lastAnalysisResult.symbol === data.symbol) {
            console.log('Received fresh analysis for', data.symbol);
        }
    });

    // 监听来自 iframe 的消息 (如 TrendRadar 的收藏请求)
    window.addEventListener('message', async (event) => {
        if (event.data && event.data.action === 'SAVE_TO_FAVORITES') {
            const { type, title, content } = event.data;
            try {
                const res = await apiFetch('/api/favorites', {
                    method: 'POST',
                    body: JSON.stringify({
                        type,
                        symbol: 'TREND', // 默认标识
                        title,
                        content,
                        analysisData: {}
                    })
                });
                if (res.success) {
                    showNotification('收藏成功', '该热点雷达报告已存入您的收藏夹', 'success');
                }
            } catch (err) {
                showNotification('收藏失败', err.message, 'danger');
            }
        }
    });
    socket.on('quote_tick', (tick) => {
        if (window.renderMarketDepth) {
            window.renderMarketDepth(tick);
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

// ================= 定时任务调度管理逻辑 =================
function formatCronHumanReadable(cron) {
    if (!cron) return '<span class="text-muted">未设置</span>';

    // 匹配 每天 格式: "mm HH * * *" (针对 node-cron 的 5 位格式)
    const dailyMatch = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(cron.trim());
    if (dailyMatch) {
        return `<span class="badge bg-light text-dark border"><i class="bi bi-alarm me-1"></i>${dailyMatch[2].padStart(2, '0')}:${dailyMatch[1].padStart(2, '0')} (每天)</span>`;
    }

    // 匹配 间隔分钟 格式: "*/N * * * *"
    const intervalMatch = /^\*\/(\d{1,2})\s+\*\s+\*\s+\*\s+\*$/.exec(cron.trim());
    if (intervalMatch) {
        return `<span class="badge bg-light text-dark border"><i class="bi bi-arrow-repeat me-1"></i>每 ${intervalMatch[1]} 分钟 (巡航)</span>`;
    }

    return `<code class="bg-light p-1 rounded border" style="font-size: 0.85rem;">${cron}</code>`;
}

async function loadTasks() {
    try {
        const res = await apiFetch('/api/tasks');
        const tbody = document.getElementById('tasks-table-body');
        if (!tbody) return;

        if (res.success && res.data.length > 0) {
            tbody.innerHTML = res.data.map(t => {
                const statusBadge = t.active
                    ? '<span class="badge bg-success-soft text-success border border-success px-2 py-1"><i class="bi bi-play-circle-fill me-1"></i>运行中</span>'
                    : '<span class="badge bg-light text-muted border border-secondary px-2 py-1"><i class="bi bi-pause-circle-fill me-1"></i>已停止</span>';

                let lastStatusBadge = '';
                if (t.lastRunStatus === 'success') {
                    lastStatusBadge = '<span class="badge bg-success rounded-circle p-1" title="最后执行成功"><i class="bi bi-check-lg" style="font-size: 0.75rem;"></i></span>';
                } else if (t.lastRunStatus === 'error') {
                    lastStatusBadge = '<span class="badge bg-danger rounded-circle p-1" title="最近执行失败"><i class="bi bi-exclamation-triangle" style="font-size: 0.75rem;"></i></span>';
                } else if (t.lastRunStatus === 'running') {
                    lastStatusBadge = '<span class="spinner-border spinner-border-sm text-primary" role="status"></span>';
                }

                return `
                <tr data-task-id="${t._id}">
                    <td class="ps-3 py-3">
                        <div class="fw-bold text-dark mb-1">${t.name}</div>
                        <div class="small text-muted" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.description || '无描述'}</div>
                    </td>
                    <td class="py-3">
                        <span class="badge bg-indigo-soft text-indigo border border-indigo px-2 py-1" style="background: #f3f0ff; color: #5f3dc4; border-color: #d0bfff;">
                            ${t.type === 'trendradar_report' ? '资讯雷达巡航' : t.type}
                        </span>
                    </td>
                    <td class="py-3">
                        ${formatCronHumanReadable(t.cronExpression)}
                    </td>
                    <td class="py-3 text-center">
                        <div class="form-check form-switch d-flex justify-content-center align-items-center">
                            <input class="form-check-input me-2 task-active-toggle" type="checkbox" data-task-id="${t._id}" ${t.active ? 'checked' : ''}>
                            ${statusBadge}
                        </div>
                    </td>
                    <td class="py-3 text-nowrap">
                        <div class="d-flex align-items-center">
                            <span class="me-2">${lastStatusBadge}</span>
                            <div>
                                <div class="small fw-bold text-secondary">${t.lastRunAt ? new Date(t.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '从未'}</div>
                                <div class="small text-muted" style="font-size: 0.7rem;">${t.lastRunAt ? new Date(t.lastRunAt).toLocaleDateString() : '待触发'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="pe-3 py-3 text-end">
                        <div class="btn-group shadow-sm border rounded">
                            <button class="btn btn-sm btn-white border-0 task-run-btn" data-task-id="${t._id}" title="立即执行一次"><i class="bi bi-play-btn text-primary"></i></button>
                            <button class="btn btn-sm btn-white border-0 task-edit-btn" data-task-id="${t._id}" title="编辑配置"><i class="bi bi-gear text-secondary"></i></button>
                            <button class="btn btn-sm btn-white border-0 task-delete-btn" data-task-id="${t._id}" title="删除任务"><i class="bi bi-trash3 text-danger"></i></button>
                        </div>
                    </td>
                </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-3 opacity-25"></i>目前还没有配置定时任务，点击右上角创建一个。</td></tr>';
        }
    } catch (error) {
        showNotification('加载失败', '无法从服务器同步任务列表: ' + error.message, 'danger');
    }
}

async function runTaskManual(taskId) {
    if (!confirm('确定要立即在后台试运行此任务吗？这可能需要几分钟的时间。')) return;
    try {
        const res = await apiFetch(`/api/tasks/${taskId}/run`, { method: 'POST' });
        if (res.success) {
            showNotification('任务已触发', res.message, 'success');
            setTimeout(loadTasks, 2000); // 刷新一下状态
        } else {
            showNotification('触发失败', res.message, 'danger');
        }
    } catch (e) {
        showNotification('请求失败', e.message, 'danger');
    }
}

async function toggleTaskActive(taskId, active) {
    try {
        const res = await apiFetch(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ active }) });
        if (res.success) {
            showNotification('更新成功', active ? '任务已激活调度' : '任务已停止调度', 'success');
            loadTasks();
        } else {
            showNotification('更新失败', res.message, 'danger');
            loadTasks(); // 恢复状态
        }
    } catch (e) {
        showNotification('请求失败', e.message, 'danger');
        loadTasks(); // 恢复状态
    }
}

async function deleteTask(taskId) {
    if (!confirm('确定彻底删除该定时任务吗？不可恢复。')) return;
    try {
        const res = await apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
        if (res.success) {
            showNotification('删除成功', '任务已被删除', 'success');
            loadTasks();
        } else {
            showNotification('删除失败', res.message, 'danger');
        }
    } catch (e) {
        showNotification('请求失败', e.message, 'danger');
    }
}

async function editTask(taskId) {
    try {
        const res = await apiFetch('/api/tasks');
        if (res.success) {
            const task = res.data.find(t => t._id === taskId);
            if (task) {
                document.getElementById('task_id').value = task._id;
                document.getElementById('task_name').value = task.name;
                document.getElementById('task_type').value = task.type;
                document.getElementById('task_active').checked = task.active;

                const cronEx = task.cronExpression || '';
                const cronMatch = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(cronEx.trim());
                const intervalMatch = /^\*\/(\d{1,2})\s+\*\s+\*\s+\*\s+\*$/.exec(cronEx.trim());

                let evTriggerType = 'cron';
                if (cronMatch) {
                    evTriggerType = 'daily';
                    const hh = cronMatch[2].padStart(2, '0');
                    const mm = cronMatch[1].padStart(2, '0');
                    document.getElementById('task_time').value = `${hh}:${mm}`;
                } else if (intervalMatch) {
                    evTriggerType = 'interval_mins';
                    document.getElementById('task_interval').value = intervalMatch[1];
                } else {
                    document.getElementById('task_cron').value = cronEx;
                }

                document.getElementById('task_schedule_type').value = evTriggerType;
                const event = new Event('change');
                document.getElementById('task_schedule_type').dispatchEvent(event);
                document.getElementById('task_desc').value = task.description || '';

                // 处理异动盯盘专用参数加载
                if (window.updateMonitorConfigVisibility) {
                    window.updateMonitorConfigVisibility(task.type);
                }
                if (task.type === 'market_monitor' && task.parameters) {
                    const params = task.parameters;
                    if (params.price_change) document.getElementById('param_price_change').value = params.price_change;
                    if (params.monitor_window) document.getElementById('param_monitor_window').value = params.monitor_window;
                    if (params.volume_ratio) document.getElementById('param_volume_ratio').value = params.volume_ratio;
                    if (params.ma_cross !== undefined) document.getElementById('param_ma_cross').checked = params.ma_cross;
                    // 加载监控策略类型
                    const monitorType = params.monitor_type || 'intraday';
                    const monitorTypeRadio = document.querySelector(`input[name="param_monitor_type"][value="${monitorType}"]`);
                    if (monitorTypeRadio) {
                        monitorTypeRadio.checked = true;
                        // 触发 UI 更新
                        window.updateMonitorTypeUI(monitorType);
                    }
                    if (params.trigger_logic !== undefined) {
                        const tlToggle = document.getElementById('param_trigger_logic');
                        tlToggle.checked = params.trigger_logic === 'and';
                        const tlLabel = document.getElementById('trigger_logic_label');
                        if (tlLabel) tlLabel.innerText = tlToggle.checked ? '并且 (需同时满足所有条件)' : '或者 (满足其中之一即触发)';
                    }
                    if (params.scope) {
                        const scopeRadio = document.querySelector(`input[name="param_scope"][value="${params.scope}"]`);
                        if (scopeRadio) scopeRadio.checked = true;
                    }
                }


                document.getElementById('taskFormTitle').innerHTML = '<i class="bi bi-pencil-square text-success me-2"></i>编辑修改任务';
                document.getElementById('taskFormCard').style.display = 'block';
                window.scrollTo({ top: document.getElementById('taskFormCard').offsetTop, behavior: 'smooth' });
            }
        }
    } catch (e) {
        showNotification('无法加载数据', e.message, 'danger');
    }
}

window.editTask = editTask;
window.runTaskManual = runTaskManual;
window.toggleTaskActive = toggleTaskActive;
window.deleteTask = deleteTask;
window.loadTasks = loadTasks;

document.addEventListener('DOMContentLoaded', () => {
    // 监听定时任务表格中的所有操作（事件委托）
    document.addEventListener('click', (e) => {
        const runBtn = e.target.closest('.task-run-btn');
        if (runBtn) runTaskManual(runBtn.dataset.taskId);

        const editBtn = e.target.closest('.task-edit-btn');
        if (editBtn) editTask(editBtn.dataset.taskId);

        const delBtn = e.target.closest('.task-delete-btn');
        if (delBtn) deleteTask(delBtn.dataset.taskId);

        const createBtn = e.target.closest('#create-task-btn');
        if (createBtn) {
            document.getElementById('taskFormTitle').innerHTML = '<i class="bi bi-pencil-square text-success me-2"></i>配置新任务';
            document.getElementById('taskForm').reset();
            document.getElementById('task_id').value = '';
            if (window.updateMonitorConfigVisibility) {
                window.updateMonitorConfigVisibility('trendradar_report');
            }

            document.getElementById('taskFormCard').style.display = 'block';
            window.scrollTo({ top: document.getElementById('taskFormCard').offsetTop, behavior: 'smooth' });
        }

        const closeBtn = e.target.closest('#close-task-form-btn') || e.target.closest('#cancel-task-form-btn');
        if (closeBtn) {
            document.getElementById('taskFormCard').style.display = 'none';
        }
    });

    // 监听开关的变化
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('task-active-toggle')) {
            toggleTaskActive(e.target.dataset.taskId, e.target.checked);
        }
    });

    // 处理导航栏切换加载数据
    document.addEventListener('click', (e) => {
        const navLink = e.target.closest('.nav-link[data-section]');
        if (navLink) {
            const section = navLink.dataset.section;
            if (section === 'scheduler') {
                loadTasks();
            }
            if (section === 'trendradar') {
                const iframe = document.getElementById('trendradar-frame');
                if (iframe) {
                    // 使用 URL 重新加载，追加时间戳防止浏览器缓存严重导致页面不刷新
                    const currentSrc = new URL(iframe.src);
                    currentSrc.searchParams.set('t', Date.now());
                    iframe.src = currentSrc.toString();
                }
            }
            if (section === 'users') {
                loadUserProfile();
                loadUsersList();
            }
        }
    });

    const schedTypeSelect = document.getElementById('task_schedule_type');
    if (schedTypeSelect) {
        schedTypeSelect.addEventListener('change', (e) => {
            const type = e.target.value;
            document.getElementById('task_time').style.display = type === 'daily' ? 'block' : 'none';
            document.getElementById('task_interval').style.display = type === 'interval_mins' ? 'block' : 'none';
            document.getElementById('task_cron').style.display = type === 'cron' ? 'block' : 'none';

            let hint = '';
            if (type === 'daily') hint = '设置一个闹钟时间，系统将在每天的这个时刻准点击发此任务。';
            if (type === 'interval_mins') hint = '指定一个固定的分钟间隔频率连续不间断运行（适合盘中盯盘）。';
            if (type === 'cron') hint = '适合极客玩家，完全自定义的 Linux 标准 Cron 表达式。';
            document.getElementById('task_schedule_hint').innerText = hint;
        });
    }

    const taskTypeSelect = document.getElementById('task_type');
    const updateMonitorConfigVisibility = (type) => {
        const monitorConfig = document.getElementById('market_monitor_configs');
        if (!monitorConfig) return;
        if (type === 'market_monitor') {
            monitorConfig.style.setProperty('display', 'block', 'important');
        } else {
            monitorConfig.style.setProperty('display', 'none', 'important');
        }
    };

    if (taskTypeSelect) {
        taskTypeSelect.addEventListener('change', (e) => {
            updateMonitorConfigVisibility(e.target.value);
        });

        const triggerLogicToggle = document.getElementById('param_trigger_logic');
        if (triggerLogicToggle) {
            triggerLogicToggle.addEventListener('change', (e) => {
                const label = document.getElementById('trigger_logic_label');
                if (label) {
                    label.innerText = e.target.checked ? '并且 (需同时满足所有条件)' : '或者 (满足其中之一即触发)';
                }
            });
        }

        // 监控策略切换逻辑
        const monitorTypeRadios = document.querySelectorAll('input[name="param_monitor_type"]');
        monitorTypeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                window.updateMonitorTypeUI(e.target.value);
            });
        });
    }

    // 监控策略 UI 更新函数
    window.updateMonitorTypeUI = (monitorType) => {
        const windowGroup = document.getElementById('monitor_window_group');
        const volumeGroup = document.getElementById('volume_ratio_group');
        const triggerLogicRow = document.getElementById('trigger_logic_row');

        if (monitorType === 'daily') {
            // 当日涨跌模式：隐藏时间窗口和成交量相关设置
            if (windowGroup) windowGroup.style.display = 'none';
            if (volumeGroup) volumeGroup.style.display = 'none';
            if (triggerLogicRow) triggerLogicRow.style.display = 'none';
        } else {
            // 盘中异动模式：显示所有设置
            if (windowGroup) windowGroup.style.display = 'block';
            if (volumeGroup) volumeGroup.style.display = 'block';
            if (triggerLogicRow) triggerLogicRow.style.display = 'block';
        }
    };

    // 将函数暴露给 editTask 使用
    window.updateMonitorConfigVisibility = updateMonitorConfigVisibility;

    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
        taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const taskId = document.getElementById('task_id').value;

            let finalCron = document.getElementById('task_cron').value.trim();
            const schedType = document.getElementById('task_schedule_type').value;
            if (schedType === 'daily') {
                const t = document.getElementById('task_time').value; // "08:30"
                if (t) {
                    const [hh, mm] = t.split(':');
                    finalCron = `${parseInt(mm)} ${parseInt(hh)} * * *`;
                }
            } else if (schedType === 'interval_mins') {
                const interval = document.getElementById('task_interval').value || 5;
                finalCron = `*/${interval} * * * *`;
            }

            const payload = {
                name: document.getElementById('task_name').value.trim(),
                type: document.getElementById('task_type').value,
                cronExpression: finalCron,
                active: document.getElementById('task_active').checked,
                description: document.getElementById('task_desc').value.trim(),
                parameters: {}
            };

            // 如果是异动盯盘，收集额外参数
            if (payload.type === 'market_monitor') {
                payload.parameters = {
                    monitor_type: document.querySelector('input[name="param_monitor_type"]:checked')?.value || 'intraday',
                    price_change: parseFloat(document.getElementById('param_price_change').value) || 2.0,
                    monitor_window: parseInt(document.getElementById('param_monitor_window').value) || 5,
                    volume_ratio: parseFloat(document.getElementById('param_volume_ratio').value) || 1.5,
                    ma_cross: document.getElementById('param_ma_cross').checked,
                    trigger_logic: document.getElementById('param_trigger_logic').checked ? 'and' : 'or',
                    scope: document.querySelector('input[name="param_scope"]:checked')?.value || 'favorites'
                };
            }

            const isRunNow = e.submitter && e.submitter.id === 'save-run-now-btn';

            const method = taskId ? 'PATCH' : 'POST';
            const url = taskId ? `/api/tasks/${taskId}` : '/api/tasks';

            try {
                const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
                if (res.success) {
                    showNotification('成功', taskId ? '任务更新配置成功' : '任务创建成功', 'success');
                    document.getElementById('taskFormCard').style.display = 'none';
                    taskForm.reset();
                    document.getElementById('task_id').value = '';

                    const savedTaskId = taskId || res.data._id;
                    if (isRunNow && savedTaskId) {
                        showNotification('准备就绪', '正在呼叫后台引擎开始运行...', 'info');
                        runTaskManual(savedTaskId);
                    } else {
                        loadTasks();
                    }
                } else {
                    showNotification('失败', res.message, 'danger');
                }
            } catch (err) {
                showNotification('失败', err.message, 'danger');
            }
        });
    }

    // ===================== 用户管理模块 =====================

    // 加载当前用户资料
    async function loadUserProfile() {
        try {
            const res = await apiFetch('/api/users/me');
            if (res.success && res.data) {
                const user = res.data;
                document.getElementById('profile-username').value = user.username || '';
                document.getElementById('profile-email').value = user.email || '';
                document.getElementById('profile-roles').value = (user.roles || ['user']).map(r => {
                    const roleMap = { admin: '管理员', analyst: '分析师', user: '普通用户' };
                    return roleMap[r] || r;
                }).join(', ');
                document.getElementById('profile-display-name').textContent = user.username || '-';
                document.getElementById('profile-display-role').textContent = (user.roles || ['user']).map(r => {
                    const roleMap = { admin: '管理员', analyst: '分析师', user: '普通用户' };
                    return roleMap[r] || r;
                }).join(', ');
                document.getElementById('profile-created').value = user.createdAt ? new Date(user.createdAt).toLocaleString() : '-';
                document.getElementById('profile-lastlogin').value = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : '-';
            }
        } catch (err) {
            showNotification('加载失败', '无法加载用户资料: ' + err.message, 'danger');
        }
    }

    // 加载用户列表 (管理员功能)
    async function loadUsersList(page = 1, limit = 10) {
        const usersListSection = document.getElementById('users-list-section');
        if (!usersListSection) return;

        // 检查当前用户是否是管理员
        if (!currentUser || !currentUser.roles || !currentUser.roles.includes('admin')) {
            usersListSection.style.display = 'none';
            return;
        }

        usersListSection.style.display = 'block';

        try {
            const res = await apiFetch(`/api/users?page=${page}&limit=${limit}`);
            const tbody = document.getElementById('users-table-body');
            if (!tbody) return;

            if (res.success && res.data && res.data.length > 0) {
                const users = res.data;
                const pagination = res.pagination;
                document.getElementById('users-count').textContent = `${pagination.total} 用户`;

                tbody.innerHTML = users.map((u, idx) => {
                    const rolesHtml = (u.roles || ['user']).map(r => {
                        const roleClass = { admin: 'bg-danger', analyst: 'bg-info', user: 'bg-secondary' };
                        const roleLabel = { admin: '管理员', analyst: '分析师', user: '用户' };
                        return `<span class="badge ${roleClass[r] || 'bg-secondary'} me-1">${roleLabel[r] || r}</span>`;
                    }).join('');

                    const statusHtml = u.active
                        ? '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>启用</span>'
                        : '<span class="badge bg-secondary"><i class="bi bi-x-circle me-1"></i>禁用</span>';

                    return `
                    <tr>
                        <td class="ps-3">${(pagination.page - 1) * pagination.limit + idx + 1}</td>
                        <td>
                            <div class="d-flex align-items-center">
                                <div class="avatar-placeholder me-2" style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%); display: flex; align-items: center; justify-content: center;">
                                    <i class="bi bi-person-fill text-white" style="font-size: 0.9rem;"></i>
                                </div>
                                <span class="fw-medium">${u.username}</span>
                            </div>
                        </td>
                        <td><small>${u.email || '-'}</small></td>
                        <td>${rolesHtml}</td>
                        <td>${statusHtml}</td>
                        <td><small class="text-muted">${u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '从未登录'}</small></td>
                        <td class="pe-3">
                            <button class="btn btn-sm btn-outline-primary edit-user-btn" data-user-id="${u._id}" title="编辑">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </td>
                    </tr>
                    `;
                }).join('');

                // 更新分页信息
                const paginationInfo = document.getElementById('users-pagination-info');
                if (paginationInfo) {
                    const start = (pagination.page - 1) * pagination.limit + 1;
                    const end = Math.min(pagination.page * pagination.limit, pagination.total);
                    paginationInfo.textContent = `显示 ${start}-${end} 条，共 ${pagination.total} 条`;
                }

                // 更新分页按钮
                renderUsersPagination(pagination);
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">暂无用户数据</td></tr>';
            }
        } catch (err) {
            showNotification('加载失败', '无法加载用户列表: ' + err.message, 'danger');
        }
    }

    // 渲染用户列表分页
    function renderUsersPagination(pagination) {
        const paginationList = document.getElementById('users-pagination-list');
        if (!paginationList) return;

        let html = '';
        const { page, pages: totalPages } = pagination;

        // 上一页
        html += `<li class="page-item ${page <= 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${page - 1}"><i class="bi bi-chevron-left"></i></a>
        </li>`;

        // 页码
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
                html += `<li class="page-item ${i === page ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>`;
            } else if (i === page - 2 || i === page + 2) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        // 下一页
        html += `<li class="page-item ${page >= totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${page + 1}"><i class="bi bi-chevron-right"></i></a>
        </li>`;

        paginationList.innerHTML = html;

        // 绑定分页点击事件
        paginationList.querySelectorAll('.page-link[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const p = parseInt(link.dataset.page);
                if (p >= 1 && p <= totalPages) {
                    loadUsersList(p, pagination.limit);
                }
            });
        });
    }

    // 保存用户资料
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('profile-username').value.trim();
            const email = document.getElementById('profile-email').value.trim();

            if (!username) {
                showNotification('提示', '用户名不能为空', 'warning');
                return;
            }

            try {
                const res = await apiFetch('/api/users/me', {
                    method: 'PUT',
                    body: JSON.stringify({ username, email })
                });
                if (res.success) {
                    showNotification('成功', '个人资料已更新', 'success');
                    // 更新当前用户信息
                    if (currentUser) {
                        currentUser.username = username;
                        currentUser.email = email;
                    }
                    document.getElementById('profile-display-name').textContent = username;
                } else {
                    showNotification('失败', res.message || '更新失败', 'danger');
                }
            } catch (err) {
                showNotification('失败', err.message, 'danger');
            }
        });
    }

    // 修改密码
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (!currentPassword || !newPassword || !confirmPassword) {
                showNotification('提示', '请填写所有密码字段', 'warning');
                return;
            }

            if (newPassword.length < 6) {
                showNotification('提示', '新密码至少需要6个字符', 'warning');
                return;
            }

            if (newPassword !== confirmPassword) {
                showNotification('提示', '两次输入的新密码不一致', 'warning');
                return;
            }

            try {
                const res = await apiFetch('/api/users/me/password', {
                    method: 'PUT',
                    body: JSON.stringify({ currentPassword, newPassword })
                });
                if (res.success) {
                    showNotification('成功', '密码修改成功，请重新登录', 'success');
                    // 清空表单
                    passwordForm.reset();
                    // 可选：退出登录
                    setTimeout(() => logout(), 2000);
                } else {
                    showNotification('失败', res.message || '密码修改失败', 'danger');
                }
            } catch (err) {
                showNotification('失败', err.message, 'danger');
            }
        });
    }

    // 编辑用户按钮点击
    document.addEventListener('click', async (e) => {
        if (e.target.closest('.edit-user-btn')) {
            const btn = e.target.closest('.edit-user-btn');
            const userId = btn.dataset.userId;
            await openEditUserModal(userId);
        }
    });

    // 打开编辑用户弹窗
    async function openEditUserModal(userId) {
        try {
            const res = await apiFetch(`/api/users/${userId}`);
            if (res.success && res.data) {
                const user = res.data;
                document.getElementById('edit-user-id').value = user._id;
                document.getElementById('edit-username').value = user.username;
                document.getElementById('edit-email').value = user.email || '';
                document.getElementById('edit-role-admin').checked = (user.roles || []).includes('admin');
                document.getElementById('edit-role-analyst').checked = (user.roles || []).includes('analyst');
                document.getElementById('edit-role-user').checked = (user.roles || []).includes('user');
                document.getElementById('edit-active').checked = user.active !== false;

                const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
                modal.show();
            }
        } catch (err) {
            showNotification('失败', '无法获取用户信息: ' + err.message, 'danger');
        }
    }

    // 保存用户编辑
    const saveUserBtn = document.getElementById('save-user-btn');
    if (saveUserBtn) {
        saveUserBtn.addEventListener('click', async () => {
            const userId = document.getElementById('edit-user-id').value;
            const email = document.getElementById('edit-email').value.trim();
            const roles = [];
            if (document.getElementById('edit-role-admin').checked) roles.push('admin');
            if (document.getElementById('edit-role-analyst').checked) roles.push('analyst');
            if (document.getElementById('edit-role-user').checked) roles.push('user');
            if (roles.length === 0) roles.push('user'); // 至少有一个角色

            const active = document.getElementById('edit-active').checked;

            try {
                const res = await apiFetch(`/api/users/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ email, roles, active })
                });
                if (res.success) {
                    showNotification('成功', '用户信息已更新', 'success');
                    bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
                    loadUsersList();
                } else {
                    showNotification('失败', res.message || '更新失败', 'danger');
                }
            } catch (err) {
                showNotification('失败', err.message, 'danger');
            }
        });
    }

    // ===================== 量化交易模块 =====================
    async function loadQuantInterface() {
        updateVNPYStatus();
        loadAccountInfo();
        loadPositions();
        loadOrders();
        loadStrategies();
    }

    async function updateVNPYStatus() {
        const statusBadge = document.getElementById('vnpy-status');
        if (!statusBadge) return;
        try {
            const res = await apiFetch('/api/quant/status');
            if (res.success && res.available) {
                statusBadge.textContent = '服务在线';
                statusBadge.className = 'badge bg-success me-2';
            } else {
                statusBadge.textContent = '服务离线';
                statusBadge.className = 'badge bg-danger me-2';
            }
        } catch (e) {
            statusBadge.textContent = '服务错误';
            statusBadge.className = 'badge bg-warning me-2';
        }
    }

    async function loadAccountInfo() {
        const gatewayEl = document.getElementById('order-gateway');
        if (!gatewayEl) return;
        const gateway = gatewayEl.value;
        try {
            const res = await apiFetch(`/api/quant/account/${gateway}`);
            if (res.success && res.data) {
                document.getElementById('account-available').textContent = `¥${(res.data.available || 0).toLocaleString()}`;
                document.getElementById('account-market-value').textContent = `¥${(res.data.market_value || 0).toLocaleString()}`;
            }
        } catch (e) {
            console.error('Failed to load account info', e);
        }
    }

    async function loadPositions() {
        const gatewayEl = document.getElementById('order-gateway');
        if (!gatewayEl) return;
        const gateway = gatewayEl.value;
        const tbody = document.getElementById('positions-table-body');
        if (!tbody) return;
        try {
            const res = await apiFetch(`/api/quant/positions/${gateway}`);
            if (res.success && res.data && res.data.length > 0) {
                tbody.innerHTML = res.data.map(p => `
                    <tr>
                        <td class="ps-3 fw-bold">${p.symbol}</td>
                        <td>${p.volume}</td>
                        <td>${(p.avg_price || 0).toFixed(2)}</td>
                        <td>${(p.current_price || 0).toFixed(2)}</td>
                        <td class="text-end pe-3 ${p.pnl >= 0 ? 'text-success' : 'text-danger'}">${(p.pnl || 0).toFixed(2)}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">暂无持仓</td></tr>';
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-3">加载失败</td></tr>';
        }
    }

    async function loadOrders() {
        const tbody = document.getElementById('orders-table-body');
        if (!tbody) return;
        try {
            const res = await apiFetch('/api/quant/orders');
            if (res.success && res.data && res.data.length > 0) {
                tbody.innerHTML = res.data.map(o => `
                    <tr>
                        <td class="ps-3 fw-bold">${o.symbol}</td>
                        <td><span class="badge ${o.direction === 'buy' ? 'bg-success' : 'bg-danger'}">${o.direction === 'buy' ? '买入' : '卖出'}</span></td>
                        <td>${o.price} / ${o.volume}</td>
                        <td class="text-end pe-3">
                            <button class="btn btn-sm btn-outline-danger" onclick="cancelOrder('${o.gateway}', '${o.order_id}')">撤单</button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">暂无挂单</td></tr>';
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-3">加载失败</td></tr>';
        }
    }

    async function cancelOrder(gateway, orderId) {
        if (!confirm('确定要撤销此订单吗？')) return;
        try {
            const res = await apiFetch(`/api/quant/order/${gateway}/${orderId}`, { method: 'DELETE' });
            if (res.success) {
                showNotification('撤单成功', `订单 ${orderId} 已撤销`, 'success');
                loadOrders();
                addLog(`手动撤单成功: ${orderId}`);
            }
        } catch (e) {
            showNotification('撤单失败', e.message, 'danger');
        }
    }

    async function loadStrategies() {
        const tbody = document.getElementById('strategies-table-body');
        if (!tbody) return;
        try {
            const res = await apiFetch('/api/quant/strategies');
            if (res.success && res.data && res.data.length > 0) {
                tbody.innerHTML = res.data.map(s => `
                    <tr>
                        <td class="ps-3">
                            <div class="fw-bold">${s.name}</div>
                            <small class="text-muted">${s.gateway}</small>
                        </td>
                        <td>${(s.symbols || []).join(', ')}</td>
                        <td><span class="badge ${s.status === 'running' ? 'bg-success' : 'bg-secondary'}">${s.status}</span></td>
                        <td class="text-end pe-3">
                            ${s.status === 'running'
                        ? `<button class="btn btn-sm btn-outline-danger me-1" onclick="controlStrategy('${s.name}', 'stop')"><i class="bi bi-stop-fill"></i></button>`
                        : `<button class="btn btn-sm btn-outline-success me-1" onclick="controlStrategy('${s.name}', 'start')"><i class="bi bi-play-fill"></i></button>`
                    }
                            <button class="btn btn-sm btn-outline-info" onclick="viewStrategySignals('${s.name}')"><i class="bi bi-activity"></i></button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">暂无已配置策略</td></tr>';
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4">加载失败</td></tr>';
        }
    }

    async function controlStrategy(name, action) {
        try {
            showNotification('准备就绪', `正在${action === 'start' ? '启动' : '停止'}策略: ${name}...`, 'info');
            const res = await apiFetch(`/api/quant/strategies/${name}/${action}`, { method: 'POST' });
            if (res.success) {
                showNotification('成功', `策略已${action === 'start' ? '启动' : '停止'}`, 'success');
                loadStrategies();
                addLog(`策略 [${name}] 已${action === 'start' ? '启动' : '停止'}`);
            }
        } catch (e) {
            showNotification('失败', e.message, 'danger');
        }
    }

    async function viewStrategySignals(name) {
        try {
            const res = await apiFetch(`/api/quant/strategies/${name}/signals`);
            if (res.success && res.data && res.data.signals) {
                if (res.data.signals.length === 0) {
                    addLog(`策略 [${name}] 目前还没有产生交易信号`);
                } else {
                    res.data.signals.forEach(s => {
                        addLog(`信号: ${s.timestamp} | ${s.symbol} | ${s.direction} | ${s.price} | 原因是: ${s.reason}`);
                    });
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    function addLog(msg) {
        const logs = document.getElementById('strategy-logs');
        if (!logs) return;
        const div = document.createElement('div');
        div.textContent = `> [${new Date().toLocaleTimeString()}] ${msg}`;
        logs.appendChild(div);
        logs.scrollTop = logs.scrollHeight;
    }

    async function handleOrderSubmit(e) {
        e.preventDefault();

        // Client-side validation
        const gateway = document.getElementById('order-gateway').value;
        const symbol = document.getElementById('order-symbol').value.trim().toUpperCase();
        const priceStr = document.getElementById('order-price').value;
        const volumeStr = document.getElementById('order-volume').value;

        // Validate gateway
        if (!gateway || !['FUTU', 'OST'].includes(gateway.toUpperCase())) {
            showNotification('错误', '无效的交易网关', 'danger');
            return;
        }

        // Validate symbol
        if (!symbol || !/^[A-Z][A-Z0-9]{0,9}$/.test(symbol)) {
            showNotification('错误', '无效的股票代码格式', 'danger');
            return;
        }

        // Validate and parse price
        let price = 0;
        if (priceStr) {
            price = parseFloat(priceStr);
            if (isNaN(price) || price < 0 || price > 10000) {
                showNotification('错误', '价格必须是非负数且不超过10,000', 'danger');
                return;
            }
        }

        // Validate and parse volume
        let volume = parseInt(volumeStr);
        if (isNaN(volume) || volume <= 0 || volume > 1000000) {
            showNotification('错误', '数量必须是正数且不超过1,000,000', 'danger');
            return;
        }

        const data = {
            gateway: gateway,
            symbol: symbol,
            direction: document.querySelector('input[name="order-direction"]:checked').value,
            orderType: document.getElementById('order-type').value,
            price: price,
            volume: volume
        };

        try {
            const res = await apiFetch('/api/quant/order', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (res.success) {
                showNotification('订单已提交', `ID: ${res.data.vt_orderid || '已模拟'}`, 'success');
                addLog(`手动下单成功: ${data.direction} ${data.symbol} ${data.volume}股 @${data.price}`);
                setTimeout(() => {
                    loadAccountInfo();
                    loadPositions();
                }, 1000);
            } else {
                showNotification('下单失败', res.detail || res.message || '未知错误', 'danger');
                addLog(`下单被拒绝: ${data.symbol} - ${res.detail || '代码验证失败'}`);
            }
        } catch (e) {
            showNotification('网络错误', e.message, 'danger');
            addLog(`网络故障: ${e.message}`);
        }
    }

    async function createStrategy() {
        // Client-side validation
        const name = document.getElementById('strategy-name').value.trim();
        const gateway = document.getElementById('strategy-gateway').value;
        const symbolsStr = document.getElementById('strategy-symbols').value;
        const stopLossStr = document.getElementById('strategy-stoploss').value;

        // Validate name
        if (!name || name.length < 2 || name.length > 50) {
            showNotification('错误', '策略名称长度应在2-50字符之间', 'danger');
            return;
        }

        // Validate gateway
        if (!gateway || !['FUTU', 'OST'].includes(gateway.toUpperCase())) {
            showNotification('错误', '无效的交易网关', 'danger');
            return;
        }

        // Validate symbols
        const symbols = symbolsStr.split(',').map(s => s.trim()).filter(s => s);
        if (!symbols || symbols.length === 0 || symbols.length > 10) {
            showNotification('错误', '请提供1-10个交易标的', 'danger');
            return;
        }

        // Validate symbols format
        for (const symbol of symbols) {
            if (!/^[A-Z][A-Z0-9]{0,9}$/.test(symbol)) {
                showNotification('错误', `无效的股票代码格式: ${symbol}`, 'danger');
                return;
            }
        }

        // Validate stop loss
        let stop_loss = null;
        if (stopLossStr) {
            stop_loss = parseFloat(stopLossStr);
            if (isNaN(stop_loss) || stop_loss < 0 || stop_loss > 1) {
                showNotification('错误', '止损比例必须在0-1之间', 'danger');
                return;
            }
        }

        const data = {
            name: name,
            gateway: gateway,
            symbols: symbols,
            params: {
                model: document.getElementById('strategy-model').value,
                stop_loss: stop_loss
            }
        };

        try {
            const res = await apiFetch('/api/quant/strategies', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (res.success) {
                showNotification('成功', '策略创建成功', 'success');
                const modalEl = document.getElementById('strategyModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
                loadStrategies();
                addLog(`新策略 [${data.name}] 已创建`);
            }
        } catch (e) {
            showNotification('失败', e.message, 'danger');
        }
    }

    async function depositFunds() {
        const gatewayEl = document.getElementById('order-gateway');
        if (!gatewayEl) return;

        const gateway = gatewayEl.value;
        if (!gateway || !['FUTU', 'OST'].includes(gateway.toUpperCase())) {
            showNotification('错误', '无效的交易网关', 'danger');
            return;
        }

        const rawAmount = prompt('请输入模拟入金金额 (¥):', '100000');

        if (!rawAmount) return; // User cancelled

        const amount = parseFloat(rawAmount);
        if (isNaN(amount) || amount <= 0 || amount > 10000000) { // Max 10M deposit
            showNotification('错误', '请输入有效的金额（正数，不超过10,000,000）', 'danger');
            return;
        }

        try {
            const res = await apiFetch('/api/quant/account/deposit', {
                method: 'POST',
                body: JSON.stringify({ gateway, amount })
            });
            if (res.success) {
                showNotification('入金成功', `已存入 ¥${amount.toLocaleString()}`, 'success');
                loadAccountInfo();
                addLog(`模拟入金成功: ¥${amount.toLocaleString()}`);
            }
        } catch (e) {
            showNotification('入金失败', e.message, 'danger');
        }
    }

    async function runBacktest() {
        const btn = document.getElementById('run-backtest-btn');
        const container = document.getElementById('bt-results-container');
        const placeholder = document.getElementById('bt-results-placeholder');

        const params = {
            strategy_name: document.getElementById('bt-strategy').value,
            symbol: document.getElementById('bt-symbol').value,
            start_date: document.getElementById('bt-start').value,
            end_date: document.getElementById('bt-end').value,
            capital: parseFloat(document.getElementById('bt-capital').value)
        };

        if (!params.symbol) {
            showNotification('提示', '请输入回测标的', 'warning');
            return;
        }

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 正在计算...';

            const res = await apiFetch('/api/quant/backtest/run', {
                method: 'POST',
                body: JSON.stringify(params)
            });

            if (res.success) {
                placeholder.classList.add('d-none');
                container.classList.remove('d-none');

                const data = res.data;
                document.getElementById('bt-total-return').textContent = `${data.total_return}%`;
                document.getElementById('bt-annual-return').textContent = `${data.annual_return}%`;
                document.getElementById('bt-max-drawdown').textContent = `${data.max_drawdown}%`;
                document.getElementById('bt-sharpe').textContent = data.sharpe_ratio;
                document.getElementById('bt-trades').textContent = data.total_trades;
                document.getElementById('bt-profit-trades').textContent = data.profit_trades;
                document.getElementById('bt-loss-trades').textContent = data.loss_trades;

                showNotification('回测完成', '分析结果已生成', 'success');
                addLog(`策略回测完成 [${params.strategy_name}]: 收益率 ${data.total_return}%`);
            }
        } catch (e) {
            showNotification('回测失败', e.message, 'danger');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-play-circle-fill"></i> 开始回测';
        }
    }

    // 5档行情渲染与点击填充
    window.renderMarketDepth = function (tick) {
        const symbolInput = document.getElementById('order-symbol');
        if (!symbolInput || symbolInput.value.toUpperCase() !== tick.symbol) return;

        const container = document.getElementById('market-depth-container');
        if (container) container.style.display = 'block';

        const askBody = document.getElementById('ask-depth-body');
        const bidBody = document.getElementById('bid-depth-body');

        if (askBody) {
            let askHtml = '';
            for (let i = 5; i >= 1; i--) {
                const price = tick[`ask_price_${i}`];
                const volume = tick[`ask_volume_${i}`];
                if (price > 0) {
                    askHtml += `
                        <tr>
                            <td class="text-danger small py-0">卖${i}</td>
                            <td class="depth-price depth-sell py-0" onclick="fillOrderPrice(${price})">${price.toFixed(2)}</td>
                            <td class="depth-vol text-end py-0">${volume}</td>
                        </tr>`;
                }
            }
            askBody.innerHTML = askHtml;
        }

        if (bidBody) {
            let bidHtml = '';
            for (let i = 1; i <= 5; i++) {
                const price = tick[`bid_price_${i}`];
                const volume = tick[`bid_volume_${i}`];
                if (price > 0) {
                    bidHtml += `
                        <tr>
                            <td class="text-success small py-0">买${i}</td>
                            <td class="depth-price depth-buy py-0" onclick="fillOrderPrice(${price})">${price.toFixed(2)}</td>
                            <td class="depth-vol text-end py-0">${volume}</td>
                        </tr>`;
                }
            }
            bidBody.innerHTML = bidHtml;
        }

        // 自动更新价格（如果价格还是0且是市价以外）
        const priceInput = document.getElementById('order-price');
        if (priceInput && (parseFloat(priceInput.value) === 0 || !priceInput.value) && tick.last_price) {
            // 只有第一次加载时自动填入现价
            if (!lastTickValue) {
                // priceInput.value = tick.last_price;
            }
        }
        lastTickValue = tick;
    };

    window.fillOrderPrice = function (price) {
        const priceInput = document.getElementById('order-price');
        if (priceInput) {
            priceInput.value = price;
            priceInput.classList.add('bg-warning-soft');
            setTimeout(() => priceInput.classList.remove('bg-warning-soft'), 500);
        }
    };

    // 监听股票代码输入
    const symbolInput = document.getElementById('order-symbol');
    if (symbolInput) {
        let timer;
        symbolInput.addEventListener('input', (e) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const symbol = e.target.value.toUpperCase().trim();
                const gateway = document.getElementById('order-gateway').value;
                if (symbol && symbol.length >= 1 && socket) {
                    console.log('Subscribing to:', symbol);
                    socket.emit('subscribe_quote', { gateway, symbols: [symbol] });
                    currentSubscription = symbol;
                }
            }, 800);
        });
    }

    // 暴露出一些函数给 HTML 中的 onclick 使用
    window.controlStrategy = controlStrategy;
    window.viewStrategySignals = viewStrategySignals;
    window.loadQuantInterface = loadQuantInterface;
    window.cancelOrder = cancelOrder;
    window.handleOrderSubmit = handleOrderSubmit;
    window.createStrategy = createStrategy;
    window.depositFunds = depositFunds;
    window.runBacktest = runBacktest;
});
