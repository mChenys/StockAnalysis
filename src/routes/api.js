const express = require('express');
const router = express.Router();
const modelManager = require('../ai/modelManager');
const aiAnalyzer = require('../analyzer/aiAnalyzer');
const stockCrawler = require('../crawler/stockDataCrawler');
const wechatPusher = require('../pusher/wechatPusher');
const scheduler = require('../scheduler/taskScheduler');
const logger = require('../utils/logger');
const { authenticateToken, authorize } = require('../middleware/auth');

// ==== 开发模式状态（无需认证） ====
router.get('/dev/status', (req, res) => {
    res.json({
        devMode: !!global.isInMemory,
        message: global.isInMemory ? '开发模式：无需登录' : '生产模式：需要登录',
    });
});

// ==== 仪表盘API ====
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const models = modelManager.getModels();
        const activeModels = models.filter(m => m.active).length;
        const today = new Date().toDateString();
        const todayAnalyses = (global.analysisResults || []).filter(r => new Date(r.timestamp).toDateString() === today);
        res.json({ 
            activeModels, 
            todayAnalysis: todayAnalyses.length, 
            monitoredStocks: scheduler.watchList?.length || 0, 
            messagesSent: global.messagesSentCount || 0 
        });
    } catch (error) { 
        logger.error('Dashboard error:', error.message);
        res.status(500).json({ message: error.message }); 
    }
});

// ==== AI模型管理API ====
router.get('/models', authenticateToken, (req, res) => {
    res.json(modelManager.getModels());
});

router.post('/models', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const config = req.body;
        // 关键纠错：如果用户填错了NVIDIA的URL
        if (config.baseUrl && config.baseUrl.includes('build.nvidia.com/settings')) {
            throw new Error('Base URL 填写错误。NVIDIA NIM 正确的 API 地址应为: https://integrate.api.nvidia.com/v1');
        }
        await modelManager.addModel(config);
        if (global.io) global.io.emit('model_status_changed', { action: 'added', model: config.name });
        res.status(201).json({ message: 'Model added successfully' });
    } catch (error) { 
        logger.error('Add model error:', error.message);
        res.status(400).json({ message: error.message }); 
    }
});

router.post('/models/:name/test', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const testResult = await modelManager.callModel(req.params.name, "Hello! Respond with 'Connected'.");
        res.json({ message: 'Success', response: testResult });
    } catch (error) { 
        logger.error('Test model error:', error.message);
        res.status(400).json({ message: error.message }); 
    }
});

router.patch('/models/:name', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const { name } = req.params;
        const { active } = req.body;
        const ModelConfig = require('../database/models/ModelConfig');
        const updated = await ModelConfig.findOneAndUpdate({ name }, { active }, { new: true });
        if (!updated) return res.status(404).json({ message: 'Model not found' });
        await modelManager.loadModels();
        if (global.io) global.io.emit('model_status_changed', { action: 'updated', model: name, active });
        res.json({ message: `Model ${name} status updated`, data: updated });
    } catch (error) { 
        logger.error('Update model error:', error.message);
        res.status(500).json({ message: error.message }); 
    }
});

router.delete('/models/:name', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        await modelManager.removeModel(req.params.name);
        if (global.io) global.io.emit('model_status_changed', { action: 'deleted', model: req.params.name });
        res.json({ message: 'Model deleted successfully' });
    } catch (error) { 
        logger.error('Delete model error:', error.message);
        res.status(500).json({ message: error.message }); 
    }
});

router.post('/nvidia-models', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const { apiKey } = req.body;
        if (!apiKey) return res.status(400).json({ message: 'API Key is required' });

        const axios = require('axios');
        const response = await axios.get('https://integrate.api.nvidia.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            timeout: 15000
        });

        res.json(response.data);
    } catch (error) {
        logger.error('Fetch NVIDIA models error:', error.message);
        res.status(500).json({ message: 'Failed to fetch models from NVIDIA NIM' });
    }
});

// ==== 核心分析API ====
router.post('/analysis', authenticateToken, async (req, res) => {
    try {
        const { symbol, modelName } = req.body;
        if (!symbol) return res.status(400).json({ success: false, message: 'Stock symbol is required' });
        const result = await aiAnalyzer.analyzeAll(symbol, { modelName });
        if (global.io) global.io.emit('analysis_result', result);
        res.json({ success: true, ...result });
    } catch (error) {
        logger.error('Analysis API Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==== 全网热点雷达API ====
router.post('/trendradar/refresh', authenticateToken, async (req, res) => {
    try {
        let { modelName } = req.body;

        // 获取所有活跃模型
        const allModels = modelManager.getModels().filter(m => m.active);
        if (allModels.length === 0) {
            return res.status(400).json({ success: false, message: '没有活跃的 AI 模型节点' });
        }

        // 处理 "ALL" 逻辑
        let primaryModel;
        if (modelName === 'ALL') {
            primaryModel = allModels[0]; // 默认取第一个作为主汇总模型
            modelName = primaryModel.name;
        } else {
            primaryModel = allModels.find(m => m.name === modelName);
        }

        const modelConfig = modelManager.getModelConfig(modelName);
        if (!modelConfig) {
            return res.status(400).json({ success: false, message: 'Invalid model name' });
        }

        // 立即返回，通知前端任务已启动
        res.json({ success: true, message: 'TrendRadar background task started' });

        const { spawn } = require('child_process');
        const path = require('path');
        const fs = require('fs');

        const cwd = path.resolve(__dirname, '../../python_service/TrendRadar');

        // 构建模型池
        const modelsPool = allModels.map(m => modelManager.getModelConfig(m.name));

        const env = {
            ...process.env,
            AI_MODEL: modelConfig.model,
            AI_API_KEY: modelConfig.apiKey,
            AI_MODELS_POOL: JSON.stringify(modelsPool),
            PARALLEL_AI: 'true',
            TRENDRADAR_NO_BROWSER: 'true'
        };
        if (modelConfig.baseUrl) {
            env.AI_API_BASE = modelConfig.baseUrl;
        }

        let pythonCmd = 'python';
        const venvPythonPath = path.resolve(__dirname, '../../python_service/venv/bin/python');
        if (fs.existsSync(venvPythonPath)) {
            pythonCmd = venvPythonPath;
        }

        logger.info(`[TrendRadar] Background refresh triggered with model: ${modelConfig.model} (Parallel Mode: ALL Active)`);

        const child = spawn(pythonCmd, ['-m', 'trendradar'], { cwd, env });


        child.stdout.on('data', (data) => {
            const out = data.toString();
            if (out.includes('AI分析完成')) {
                if (global.io) global.io.emit('trendradar_status', { type: 'progress', message: 'AI 分析已就绪' });
            }
        });

        child.stderr.on('data', (data) => {
            logger.warn(`[TrendRadar Script] ${data}`);
        });

        child.on('close', (code) => {
            logger.info(`[TrendRadar] Process finished with code ${code}`);
            if (global.io) {
                if (code === 0) {
                    global.io.emit('trendradar_status', { type: 'completed' });
                } else {
                    global.io.emit('trendradar_status', { type: 'error', message: `生成失败 (退出码: ${code})` });
                }
            }
        });

    } catch (error) {
        logger.error('TrendRadar trigger error:', error.message);
        if (global.io) global.io.emit('trendradar_status', { type: 'error', message: error.message });
    }
});

// ==== 收藏夹管理API ====
router.get('/favorites', authenticateToken, async (req, res) => {
    try {
        const Favorite = require('../database/models/Favorite');
        const favorites = await Favorite.find({ user: req.user._id });
        res.json({ success: true, data: favorites });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/favorites', authenticateToken, async (req, res) => {
    try {
        const Favorite = require('../database/models/Favorite');
        const fav = new Favorite({ user: req.user._id, ...req.body });
        await fav.save();
        res.json({ success: true, data: fav });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.delete('/favorites/:id', authenticateToken, async (req, res) => {
    try {
        const Favorite = require('../database/models/Favorite');
        await Favorite.deleteOne({ _id: req.params.id, user: req.user._id });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ==== 其他任务/系统 API ====
router.get('/scheduler/status', authenticateToken, (req, res) => {
    res.json({ running: scheduler.running, tasks: scheduler.getTaskStatus(), watchList: scheduler.watchList });
});

router.post('/scheduler/:action', authenticateToken, authorize('admin'), (req, res) => {
    try {
        if (req.params.action === 'start') scheduler.start();
        else scheduler.stop();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

router.get('/users', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const User = require('../database/models/User');
        const users = await User.find();
        res.json({ success: true, data: users });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

router.get('/push/status', authenticateToken, (req, res) => {
    res.json(wechatPusher.getConfigStatus());
});

router.post('/push/test', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const result = await wechatPusher.testPush();
        res.json({ success: result, message: result ? 'Sent' : 'Failed' });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

// ==== TrendRadar 推送通道配置 API ====
router.get('/push-config', authenticateToken, (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const yaml = require('yaml'); // 使用 npm i yaml (保留注释版)
        const configPath = path.resolve(__dirname, '../../python_service/TrendRadar/config/config.yaml');
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ success: false, message: 'config.yaml not found' });
        }
        const fileContents = fs.readFileSync(configPath, 'utf8');
        const doc = yaml.parse(fileContents);
        const channels = doc?.notification?.channels || {};
        res.json({ success: true, data: channels });
    } catch (error) {
        logger.error('Get push-config error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/push-config', authenticateToken, authorize('admin'), (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const yaml = require('yaml');
        const newChannels = req.body;

        if (!newChannels || typeof newChannels !== 'object') {
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        const configPath = path.resolve(__dirname, '../../python_service/TrendRadar/config/config.yaml');
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ success: false, message: 'config.yaml not found' });
        }
        const fileContents = fs.readFileSync(configPath, 'utf8');

        // 使用 yaml.parseDocument 解析以保留文件原有的大量注释结构
        const doc = yaml.parseDocument(fileContents);

        const existingNotificationNode = doc.get('notification');
        if (!existingNotificationNode) {
            doc.set('notification', { channels: newChannels });
        } else {
            const channelsNode = existingNotificationNode.get('channels');
            if (!channelsNode) {
                existingNotificationNode.set('channels', newChannels);
            } else {
                for (const [channelKey, channelData] of Object.entries(newChannels)) {
                    let singleChannelNode = channelsNode.get(channelKey);
                    if (!singleChannelNode) {
                        channelsNode.set(channelKey, channelData);
                    } else {
                        for (const [propKey, propVal] of Object.entries(channelData)) {
                            // 当传入空字符串时，允许清空 (比如清空 Token)
                            singleChannelNode.set(propKey, propVal);
                        }
                    }
                }
            }
        }

        fs.writeFileSync(configPath, String(doc), 'utf8');

        res.json({ success: true, message: '推送通道配置更新成功，立即生效' });
    } catch (error) {
        logger.error('Update push-config error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/push-config-test', authenticateToken, authorize('admin'), (req, res) => {
    try {
        const path = require('path');
        const scriptPath = path.resolve(__dirname, '../../python_service/TrendRadar/test_push.py');
        const venvPythonStr = path.resolve(__dirname, '../../python_service/venv/bin/python');

        const testProcess = require('child_process').spawn(venvPythonStr, [scriptPath], {
            cwd: path.resolve(__dirname, '../../python_service/TrendRadar')
        });

        let output = '';
        testProcess.stdout.on('data', (data) => output += data.toString());
        testProcess.stderr.on('data', (data) => output += data.toString());

        testProcess.on('close', (code) => {
            if (code === 0) {
                res.json({ success: true, message: 'Test message sent successfully' });
            } else {
                logger.error(`Push test failed. Output: ${output}`);
                res.status(500).json({ success: false, message: `Execution failed. Log: ${output}` });
            }
        });
    } catch (error) {
        logger.error(`Error testing push config: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to test push configuration' });
    }
});

module.exports = router;
