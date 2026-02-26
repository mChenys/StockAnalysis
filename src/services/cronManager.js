const cron = require('node-cron');
const Task = require('../database/models/Task');
const logger = require('../utils/logger');
const { spawn } = require('child_process');
const path = require('path');
const Favorite = require('../database/models/Favorite');
const pythonClient = require('./pythonClient');
const axios = require('axios');


class CronManager {
    constructor() {
        this.jobs = new Map(); // Store cron.schedule objects
        // Store symbol -> [{ price, volume, timestamp }, ...] (历史状态数组，按时间排序)
        this.priceHistory = new Map();
        // 保留最近60分钟的历史数据
        this.maxHistoryMinutes = 60;
    }

    async init() {
        try {
            if (global.isInMemory) {
                // Ignore DB loading if in memory, tasks are empty initially until user creates them.
                logger.info(`In-Memory mode bypass: skipping task loading from DB.`);
                return;
            }
            const tasks = await Task.find({ active: true });
            logger.info(`Found ${tasks.length} active scheduled tasks. Loading...`);
            tasks.forEach(task => this.scheduleTask(task));
        } catch (error) {
            logger.error(`Error initializing cron manager: ${error.message}`);
        }
    }

    scheduleTask(task) {
        if (!cron.validate(task.cronExpression)) {
            logger.error(`Invalid cron expression for task ${task._id}: ${task.cronExpression}`);
            return false;
        }

        // 停止之前的同名任务
        this.stopTask(task._id.toString());

        const job = cron.schedule(task.cronExpression, async () => {
            logger.info(`Running task: ${task.name} (${task.type})`);
            await this.executeTask(task);
        }, {
            scheduled: true,
            timezone: "Asia/Shanghai" // 这里目前为了中国区的时间
        });

        this.jobs.set(task._id.toString(), job);
        logger.info(`Scheduled task [${task.name}] at [${task.cronExpression}]`);
        return true;
    }

    stopTask(taskId) {
        const existingJob = this.jobs.get(taskId);
        if (existingJob) {
            existingJob.stop();
            this.jobs.delete(taskId);
            logger.info(`Successfully stopped previous job instances for task ${taskId}`);
        }
    }

    async executeTask(task) {
        try {
            if (!global.isInMemory) {
                await Task.findByIdAndUpdate(task._id, {
                    $set: { lastRunStatus: 'running', lastRunAt: new Date() },
                    $inc: { totalRunCount: 1 }
                });
            } else {
                task.lastRunStatus = 'running';
                task.lastRunAt = new Date();
                task.totalRunCount = (task.totalRunCount || 0) + 1;
            }
            if (global.io) global.io.emit('task_status_updated', { taskId: task._id.toString(), status: 'running' });

            // 1. 全网热点早晚报
            if (task.type === 'trendradar_report') {
                await this.runTrendRadarScript(task._id.toString());
            }

            // 下方预留其他类型的扩展示例
            else if (task.type === 'market_monitor') {
                logger.info(`Starting market monitor check for task: ${task.name}`);
                await this.runMarketMonitor(task);
            }
            else if (task.type === 'weekly_summary') {
                logger.info('Running weekly summary report...');
                // ... 调长文生成逻辑 ...
            }
            else if (task.type === 'model_health') {
                logger.info('Health checking LLMs...');
            }
            else if (task.type === 'data_cleanup') {
                logger.info('Cleaning up database...');
            }

            if (!global.isInMemory) {
                await Task.findByIdAndUpdate(task._id, {
                    lastRunStatus: 'success',
                    lastRunMessage: 'Task executed successfully at ' + new Date().toLocaleString()
                });
            } else {
                task.lastRunStatus = 'success';
                task.lastRunMessage = 'Task executed successfully at ' + new Date().toLocaleString();
            }
            if (global.io) global.io.emit('task_status_updated', { taskId: task._id.toString(), status: 'success' });

        } catch (error) {
            logger.error(`Error executing task ${task.name}: ${error.message}`);
            if (!global.isInMemory) {
                await Task.findByIdAndUpdate(task._id, {
                    lastRunStatus: 'error',
                    lastRunMessage: error.message
                });
            } else {
                task.lastRunStatus = 'error';
                task.lastRunMessage = error.message;
            }
            if (global.io) global.io.emit('task_status_updated', { taskId: task._id.toString(), status: 'error' });
        }
    }

    runTrendRadarScript(taskId) {
        return new Promise((resolve, reject) => {
            const scriptPath = path.resolve(process.cwd(), 'python_service', 'TrendRadar', 'trendradar', '__main__.py');
            const venvPythonPath = path.resolve(process.cwd(), 'python_service', 'venv', 'bin', 'python');

            const nimApiKey = process.env.NVIDIA_NIM_API_KEY || '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';

            logger.info(`TrendRadar Cron Triggering: ${venvPythonPath} ${scriptPath}`);
            const pythonProcess = spawn(venvPythonPath, ['-m', 'trendradar'], {
                cwd: path.resolve(process.cwd(), 'python_service', 'TrendRadar'),
                env: {
                    ...process.env,
                    TRENDRADAR_NO_BROWSER: 'true',
                    AI_API_KEY: nimApiKey
                }
            });

            let out = '';
            pythonProcess.stdout.on('data', data => {
                const chunk = data.toString();
                out += chunk;
                if (chunk.includes('AI分析完成') && global.io) {
                    global.io.emit('trendradar_status', { type: 'progress', message: 'AI 分析已就绪' });
                }
            });
            pythonProcess.stderr.on('data', data => out += data.toString());

            pythonProcess.on('close', code => {
                if (code === 0) {
                    logger.info(`TrendRadar executed successfully by cron.`);
                    if (global.io) global.io.emit('trendradar_status', { type: 'completed' });
                    resolve(out);
                } else {
                    logger.error(`TrendRadar executed with error. Code: ${code} Log: ${out}`);
                    if (global.io) global.io.emit('trendradar_status', { type: 'error', message: `后台任务运行失败 (代码 ${code})` });
                    reject(new Error(`Exit code ${code}. Log excerpt: ${out.substring(0, 500)}`));
                }
            });
        });
    }

    async runMarketMonitor(task) {
        const params = task.parameters || {};
        const priceThreshold = params.price_change || 2.0;
        const volumeThreshold = params.volume_ratio || 1.5;
        const triggerLogic = params.trigger_logic || 'or';
        const scope = params.scope || 'favorites';
        const monitorWindow = params.monitor_window || 5; // 监控时间窗口（分钟）
        const monitorType = params.monitor_type || 'intraday'; // 监控类型: intraday(盘中异动) 或 daily(当日涨跌)

        // 1. 获取监控代码列表
        let symbols = [];
        if (scope === 'favorites' || scope === 'both') {
            const favs = await Favorite.find({ user: task.user });
            symbols = [...new Set(favs.map(f => f.symbol))];
        }
        if (scope === 'sectors' || scope === 'both') {
            const sectors = ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLI', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'SMH', '^VIX', 'GC=F', 'CL=F'];
            symbols = [...new Set([...symbols, ...sectors])];
        }

        if (symbols.length === 0) {
            logger.info('No symbols found to monitor.');
            return;
        }

        const typeLabel = monitorType === 'daily' ? '当日涨跌' : `盘中异动(${monitorWindow}min)`;
        logger.info(`Monitoring ${symbols.length} symbols for task ${task.name} (Type: ${typeLabel}, Logic: ${triggerLogic.toUpperCase()})`);

        const alerts = [];
        for (const symbol of symbols) {
            try {
                const data = await pythonClient.getStockPrice(symbol);
                if (!data) continue;

                const currentState = {
                    price: data.currentPrice,
                    change: data.changePercent, // 当日涨跌幅
                    previousClose: data.previousClose,
                    session: data.session,
                    volume: data.volume,
                    timestamp: Date.now()
                };

                let priceDiff = 0;
                let volumeRatio = 1;
                let comparisonBase = null;

                if (monitorType === 'daily') {
                    // 当日涨跌模式：直接使用 API 返回的涨跌幅
                    priceDiff = Math.abs(currentState.change);
                    volumeRatio = 1; // 当日模式不比较成交量变化
                    comparisonBase = { price: currentState.previousClose, source: '昨日收盘价' };
                } else {
                    // 盘中异动模式：比较 N 分钟前的价格
                    comparisonBase = this.getStateNMinutesAgo(symbol, monitorWindow);
                    if (comparisonBase) {
                        priceDiff = Math.abs(currentState.price - comparisonBase.price) / comparisonBase.price * 100;
                        volumeRatio = (currentState.volume && comparisonBase.volume)
                            ? currentState.volume / comparisonBase.volume
                            : 1;
                    }
                }

                if (comparisonBase) {
                    const matches = [];
                    const status = {
                        price: priceDiff >= priceThreshold,
                        volume: monitorType === 'intraday' && volumeRatio >= volumeThreshold,
                        ma: false
                    };

                    if (status.price) {
                        if (monitorType === 'daily') {
                            const direction = currentState.change > 0 ? '📈 上涨' : '📉 下跌';
                            matches.push(`${direction} (${Math.abs(currentState.change).toFixed(2)}%)`);
                        } else {
                            const direction = currentState.price > comparisonBase.price ? '🚀 快速拉升' : '📉 快速砸盘';
                            matches.push(`${direction} (${priceDiff.toFixed(2)}%)`);
                        }
                    }
                    if (status.volume) {
                        matches.push(`🔊 成交量激增 (${volumeRatio.toFixed(1)}倍)`);
                    }

                    // 检查均线交叉 (如果开启)
                    if (params.ma_cross) {
                        const maData = await pythonClient.getMACross(symbol);
                        if (maData && maData.cross) {
                            status.ma = true;
                            const crossText = maData.cross === 'golden_cross' ? '🌟 金叉 (MA5上穿MA20)' : '💀 死叉 (MA5下穿MA20)';
                            matches.push(crossText);
                        }
                    }

                    // 逻辑判定
                    let isTriggered = false;
                    if (monitorType === 'daily') {
                        // 当日模式：只判断价格涨跌幅和均线
                        isTriggered = status.price || (params.ma_cross && status.ma);
                    } else if (triggerLogic === 'and') {
                        // AND 逻辑：所有启用的主要阈值必须同时满足 (MA如果开启也必须满足)
                        isTriggered = status.price && status.volume;
                        if (params.ma_cross) isTriggered = isTriggered && status.ma;
                    } else {
                        // OR 逻辑：满足任一条件即触发
                        isTriggered = status.price || status.volume || (params.ma_cross && status.ma);
                    }

                    if (isTriggered) {
                        const reason = matches.join(' + ');
                        const changeInfo = monitorType === 'daily'
                            ? `当日涨跌: ${currentState.change.toFixed(2)}%`
                            : `${monitorWindow}分钟变化: ${priceDiff.toFixed(2)}%`;
                        alerts.push(`【监控触发】${symbol}\n原因: ${reason}\n当前价格: ${currentState.price}\n${changeInfo}\n市场状态: ${currentState.session}`);
                    }
                }

                // 保存当前状态到历史记录 (盘中异动模式需要)
                if (monitorType === 'intraday') {
                    this.addPriceHistory(symbol, currentState);
                }
            } catch (err) {
                logger.error(`Error monitoring ${symbol}: ${err.message}`);
            }
        }

        // 2. 发送汇总警报
        if (alerts.length > 0) {
            const message = `🔔 【异动盯盘警报】\n任务: ${task.name}\n检测到 ${alerts.length} 个标的出现异动：\n\n${alerts.join('\n---\n')}`;
            logger.info(`Sending ${alerts.length} alerts...`);

            // 调用推送接口 (复用 routes/api.js 里的 Python 推送逻辑)
            try {
                this.sendPushNotification(message);
            } catch (pushErr) {
                logger.error(`Failed to send push notification: ${pushErr.message}`);
            }

            if (global.io) {
                global.io.emit('task_notification', {
                    taskId: task._id.toString(),
                    title: '异动盯盘警报',
                    message: `${alerts.length} 个标的异动`,
                    type: 'warning'
                });
            }
        }
    }

    /**
     * 添加价格历史记录
     * @param {string} symbol - 股票代码
     * @param {object} state - { price, volume, timestamp, ... }
     */
    addPriceHistory(symbol, state) {
        if (!this.priceHistory.has(symbol)) {
            this.priceHistory.set(symbol, []);
        }
        const history = this.priceHistory.get(symbol);
        history.push(state);

        // 清理超过 maxHistoryMinutes 的旧数据
        const cutoff = Date.now() - this.maxHistoryMinutes * 60 * 1000;
        while (history.length > 0 && history[0].timestamp < cutoff) {
            history.shift();
        }
    }

    /**
     * 获取 N 分钟前的状态
     * @param {string} symbol - 股票代码
     * @param {number} minutes - 分钟数
     * @returns {object|null} - 历史状态或 null
     */
    getStateNMinutesAgo(symbol, minutes) {
        const history = this.priceHistory.get(symbol);
        if (!history || history.length === 0) {
            return null;
        }

        const targetTime = Date.now() - minutes * 60 * 1000;

        // 找到最接近目标时间的历史记录（不晚于目标时间）
        let closest = null;
        let minDiff = Infinity;

        for (const state of history) {
            if (state.timestamp <= targetTime) {
                const diff = targetTime - state.timestamp;
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = state;
                }
            }
        }

        return closest;
    }

    async sendPushNotification(message) {
        const scriptPath = path.resolve(process.cwd(), 'python_service', 'TrendRadar', 'push_monitor.py');
        const venvPythonStr = path.resolve(process.cwd(), 'python_service', 'venv', 'bin', 'python');

        // 调用专用的通用推送脚本
        spawn(venvPythonStr, [scriptPath], {
            cwd: path.resolve(process.cwd(), 'python_service', 'TrendRadar'),
            env: { ...process.env, PUSH_MESSAGE: message }
        });
    }
}

module.exports = new CronManager();
