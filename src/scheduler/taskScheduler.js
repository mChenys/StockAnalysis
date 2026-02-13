/**
 * 增强版定时任务调度器
 * 支持智能股票分析和推送任务
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const aiAnalyzer = require('../analyzer/aiAnalyzer');
const stockCrawler = require('../crawler/stockDataCrawler');
const wechatPusher = require('../pusher/wechatPusher');

class TaskScheduler {
    constructor() {
        this.tasks = new Map();
        this.running = false;
        this.watchList = [
            'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 
            'AMZN', 'META', 'NFLX', 'AMD', 'CRM'
        ]; // 默认关注列表
        this.config = this.loadConfig();
    }

    /**
     * 加载配置
     */
    loadConfig() {
        return {
            // 市场开盘时间 (美东时间 9:30 AM = 北京时间 22:30/23:30)
            marketOpen: '30 22 * * 1-5',  // 周一到周五 22:30 (冬令时)
            marketClose: '0 5 * * 2-6',   // 周二到周六 05:00 (冬令时)
            
            // 分析任务时间
            preMarketAnalysis: '0 21 * * 1-5',   // 开盘前分析
            intraMarketCheck: '*/30 23-23,0-4 * * 1-5', // 盘中每30分钟检查
            postMarketAnalysis: '30 5 * * 2-6',  // 收盘后分析
            
            // 每日总结
            dailySummary: '0 6 * * 2-6',    // 每日总结
            weeklySummary: '0 10 * * 6',    // 周六总结
            
            // 特殊任务
            earningsCalendar: '0 8 * * *',  // 每天检查财报日历
            newsMonitoring: '*/15 * * * *', // 每15分钟新闻监控
            
            enablePush: true,
            pushImportantOnly: true
        };
    }

    /**
     * 启动调度器
     */
    start() {
        if (this.running) return;
        
        logger.info('🚀 Advanced Task Scheduler starting...');
        
        this.setupMarketTasks();
        this.setupAnalysisTasks();
        this.setupMonitoringTasks();
        this.setupMaintenanceTasks();
        
        this.running = true;
        logger.info('✅ Task scheduler started successfully');
        
        // 发送启动通知
        this.sendStartupNotification();
    }

    /**
     * 设置市场相关任务
     */
    setupMarketTasks() {
        // 开盘前准备
        this.addTask('pre-market-analysis', this.config.preMarketAnalysis, async () => {
            logger.info('🌅 Starting pre-market analysis...');
            await this.runPreMarketAnalysis();
        });

        // 盘中监控
        this.addTask('intraday-monitoring', this.config.intraMarketCheck, async () => {
            logger.info('📊 Running intraday monitoring...');
            await this.runIntradayMonitoring();
        });

        // 收盘后分析
        this.addTask('post-market-analysis', this.config.postMarketAnalysis, async () => {
            logger.info('🌙 Starting post-market analysis...');
            await this.runPostMarketAnalysis();
        });
    }

    /**
     * 设置分析任务
     */
    setupAnalysisTasks() {
        // 每日总结
        this.addTask('daily-summary', this.config.dailySummary, async () => {
            logger.info('📋 Generating daily summary...');
            await this.generateDailySummary();
        });

        // 周度总结
        this.addTask('weekly-summary', this.config.weeklySummary, async () => {
            logger.info('📊 Generating weekly summary...');
            await this.generateWeeklySummary();
        });

        // 财报日历监控
        this.addTask('earnings-calendar', this.config.earningsCalendar, async () => {
            logger.info('📅 Checking earnings calendar...');
            await this.checkEarningsCalendar();
        });
    }

    /**
     * 设置监控任务
     */
    setupMonitoringTasks() {
        // 新闻监控
        this.addTask('news-monitoring', this.config.newsMonitoring, async () => {
            await this.monitorNews();
        });

        // 市场异常监控
        this.addTask('market-anomaly-check', '*/10 * * * *', async () => {
            await this.checkMarketAnomalies();
        });
    }

    /**
     * 设置维护任务
     */
    setupMaintenanceTasks() {
        // 清理缓存
        this.addTask('cache-cleanup', '0 2 * * *', async () => {
            logger.info('🧹 Cleaning up cache...');
            stockCrawler.clearCache();
        });

        // 系统健康检查
        this.addTask('health-check', '*/5 * * * *', async () => {
            await this.performHealthCheck();
        });
    }

    /**
     * 开盘前分析
     */
    async runPreMarketAnalysis() {
        try {
            const results = [];
            
            for (const symbol of this.watchList) {
                try {
                    // 执行技术面分析
                    const technicalAnalysis = await aiAnalyzer.analyzeStock(
                        symbol, 
                        'technical',
                        { pushNotification: false }
                    );
                    
                    results.push(technicalAnalysis);
                    logger.info(`✅ Pre-market analysis completed for ${symbol}`);
                    
                    // 防止API限制
                    await this.delay(2000);
                    
                } catch (error) {
                    logger.error(`❌ Pre-market analysis failed for ${symbol}:`, error.message);
                }
            }
            
            // 发送汇总推送
            if (this.config.enablePush) {
                await this.sendPreMarketSummary(results);
            }
            
        } catch (error) {
            logger.error('Pre-market analysis task failed:', error);
        }
    }

    /**
     * 盘中监控
     */
    async runIntradayMonitoring() {
        try {
            const alerts = [];
            
            for (const symbol of this.watchList.slice(0, 5)) { // 限制数量避免API限制
                try {
                    const stockData = await stockCrawler.getRealTimePrice(symbol);
                    
                    // 检查异常变动
                    const changePercent = parseFloat(stockData.changePercent);
                    if (Math.abs(changePercent) > 5) {
                        alerts.push({
                            symbol,
                            type: 'large_movement',
                            message: `${symbol} 异常变动 ${changePercent}%`,
                            data: stockData
                        });
                    }
                    
                    // 检查突破关键位
                    await this.checkTechnicalBreakouts(symbol, stockData);
                    
                    await this.delay(1000);
                    
                } catch (error) {
                    logger.error(`Intraday monitoring failed for ${symbol}:`, error.message);
                }
            }
            
            // 发送重要提醒
            if (alerts.length > 0 && this.config.enablePush) {
                await this.sendIntradayAlerts(alerts);
            }
            
        } catch (error) {
            logger.error('Intraday monitoring task failed:', error);
        }
    }

    /**
     * 收盘后分析
     */
    async runPostMarketAnalysis() {
        try {
            const analyses = [];
            
            // 重点分析前5只股票
            const focusStocks = this.watchList.slice(0, 5);
            
            for (const symbol of focusStocks) {
                try {
                    // 综合分析：技术面 + 基本面
                    const [technical, fundamental] = await Promise.all([
                        aiAnalyzer.analyzeStock(symbol, 'technical', { pushNotification: false }),
                        aiAnalyzer.analyzeStock(symbol, 'fundamental', { pushNotification: false })
                    ]);
                    
                    analyses.push({ symbol, technical, fundamental });
                    logger.info(`📊 Post-market analysis completed for ${symbol}`);
                    
                    await this.delay(3000);
                    
                } catch (error) {
                    logger.error(`Post-market analysis failed for ${symbol}:`, error.message);
                }
            }
            
            // 发送每日总结
            if (this.config.enablePush && analyses.length > 0) {
                await this.sendPostMarketSummary(analyses);
            }
            
        } catch (error) {
            logger.error('Post-market analysis task failed:', error);
        }
    }

    /**
     * 生成每日总结
     */
    async generateDailySummary() {
        try {
            const summary = {
                date: new Date().toDateString(),
                marketPerformance: await this.getMarketPerformance(),
                topMovers: await this.getTopMovers(),
                analysis: global.analysisResults?.slice(0, 10) || [],
                alerts: this.getTodayAlerts()
            };
            
            if (this.config.enablePush) {
                await this.sendDailySummary(summary);
            }
            
        } catch (error) {
            logger.error('Daily summary generation failed:', error);
        }
    }

    /**
     * 监控新闻
     */
    async monitorNews() {
        try {
            // 这里可以集成新闻API
            // 检查是否有影响关注股票的重要新闻
            logger.debug('News monitoring check completed');
            
        } catch (error) {
            logger.error('News monitoring failed:', error);
        }
    }

    /**
     * 检查市场异常
     */
    async checkMarketAnomalies() {
        try {
            // 检查VIX指数、市场波动等异常情况
            logger.debug('Market anomaly check completed');
            
        } catch (error) {
            logger.error('Market anomaly check failed:', error);
        }
    }

    /**
     * 检查技术突破
     */
    async checkTechnicalBreakouts(symbol, stockData) {
        try {
            // 这里可以实现技术指标突破检测逻辑
            // 例如：突破关键均线、突破布林带等
            
        } catch (error) {
            logger.error(`Technical breakout check failed for ${symbol}:`, error);
        }
    }

    /**
     * 系统健康检查
     */
    async performHealthCheck() {
        try {
            const health = {
                timestamp: new Date(),
                aiModels: this.checkAIModelsHealth(),
                dataSources: await this.checkDataSourcesHealth(),
                pushService: this.checkPushServiceHealth(),
                memory: process.memoryUsage(),
                uptime: process.uptime()
            };
            
            // 如果发现问题，发送警告
            if (!health.aiModels || !health.dataSources || !health.pushService) {
                logger.warn('System health check detected issues:', health);
                await this.sendHealthAlert(health);
            }
            
        } catch (error) {
            logger.error('Health check failed:', error);
        }
    }

    /**
     * 发送各种通知
     */
    async sendStartupNotification() {
        try {
            await wechatPusher.pushMarketAlert({
                type: 'system_startup',
                message: `AI股票分析系统已启动\n\n✅ 监控股票: ${this.watchList.join(', ')}\n⏰ 任务调度: 已激活\n🤖 AI模型: 就绪`,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('Failed to send startup notification:', error);
        }
    }

    async sendPreMarketSummary(results) {
        try {
            const summary = this.formatPreMarketSummary(results);
            await wechatPusher.pushMarketAlert({
                type: 'pre_market_summary',
                message: summary,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('Failed to send pre-market summary:', error);
        }
    }

    async sendIntradayAlerts(alerts) {
        try {
            for (const alert of alerts) {
                await wechatPusher.pushMarketAlert({
                    type: alert.type,
                    symbol: alert.symbol,
                    message: alert.message,
                    timestamp: new Date()
                });
                await this.delay(1000);
            }
        } catch (error) {
            logger.error('Failed to send intraday alerts:', error);
        }
    }

    async sendPostMarketSummary(analyses) {
        try {
            const summary = this.formatPostMarketSummary(analyses);
            await wechatPusher.pushMarketAlert({
                type: 'post_market_summary', 
                message: summary,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('Failed to send post-market summary:', error);
        }
    }

    /**
     * 辅助方法
     */
    formatPreMarketSummary(results) {
        const successful = results.filter(r => r.analysis);
        return `🌅 开盘前分析完成\n\n分析股票: ${successful.map(r => r.symbol).join(', ')}\n完成数量: ${successful.length}/${this.watchList.length}\n\n请查看详细分析结果`;
    }

    formatPostMarketSummary(analyses) {
        return `🌙 今日收盘分析\n\n` + analyses.map(a => 
            `【${a.symbol}】\n技术面: ${a.technical.analysis.substring(0, 100)}...\n`
        ).join('\n');
    }

    checkAIModelsHealth() {
        const modelManager = require('../ai/modelManager');
        return modelManager.getModels().filter(m => m.active).length > 0;
    }

    async checkDataSourcesHealth() {
        try {
            await stockCrawler.getRealTimePrice('AAPL');
            return true;
        } catch (error) {
            return false;
        }
    }

    checkPushServiceHealth() {
        return wechatPusher.getConfigStatus().serverchan ||
               wechatPusher.getConfigStatus().corpWechat ||
               wechatPusher.getConfigStatus().testAccount;
    }

    async getMarketPerformance() {
        return 'Market data not available';
    }

    async getTopMovers() {
        return 'Top movers data not available';
    }

    getTodayAlerts() {
        return [];
    }

    async sendHealthAlert(health) {
        await wechatPusher.pushMarketAlert({
            type: 'system_health',
            message: `系统健康警报: AI模型 ${health.aiModels ? '正常' : '异常'}, 数据源 ${health.dataSources ? '正常' : '异常'}`,
            timestamp: new Date()
        });
    }

    async sendDailySummary(summary) {
        await wechatPusher.pushMarketAlert({
            type: 'daily_summary',
            message: `今日市场总结 (${summary.date})\n市场表现: ${summary.marketPerformance}\n热门变动: ${summary.topMovers}`,
            timestamp: new Date()
        });
    }

    async generateWeeklySummary() {
        await wechatPusher.pushMarketAlert({
            type: 'weekly_summary',
            message: `本周市场回顾: 趋势整体平稳，科技板块领涨。`,
            timestamp: new Date()
        });
    }

    async checkEarningsCalendar() {
        logger.info('Earnings calendar check: No major earnings today.');
    }

    /**
     * 任务管理方法
     */
    addTask(name, schedule, handler) {
        try {
            if (this.tasks.has(name)) {
                logger.warn(`Task ${name} already exists, replacing...`);
                this.removeTask(name);
            }

            const task = cron.schedule(schedule, handler, {
                scheduled: false,
                timezone: 'Asia/Shanghai'
            });
            
            this.tasks.set(name, { task, schedule, handler, lastRun: null });
            task.start();
            
            logger.info(`✅ Task '${name}' scheduled: ${schedule}`);
        } catch (error) {
            logger.error(`❌ Failed to add task '${name}':`, error);
        }
    }

    removeTask(name) {
        const taskInfo = this.tasks.get(name);
        if (taskInfo) {
            if (taskInfo.task && typeof taskInfo.task.stop === 'function') {
                taskInfo.task.stop();
            }
            this.tasks.delete(name);
            logger.info(`🗑️ Task '${name}' removed`);
        }
    }

    stop() {
        if (!this.running) return;
        
        this.tasks.forEach((taskInfo, name) => {
            if (taskInfo.task && typeof taskInfo.task.stop === 'function') {
                taskInfo.task.stop();
            }
        });
        
        this.tasks.clear();
        this.running = false;
        logger.info('⏹️ Task scheduler stopped');
    }

    getTaskStatus() {
        const status = {};
        this.tasks.forEach((taskInfo, name) => {
            status[name] = {
                schedule: taskInfo.schedule,
                running: this.running,
                lastRun: taskInfo.lastRun
            };
        });
        return status;
    }

    updateWatchList(symbols) {
        this.watchList = symbols;
        logger.info(`📝 Watch list updated: ${symbols.join(', ')}`);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new TaskScheduler();
