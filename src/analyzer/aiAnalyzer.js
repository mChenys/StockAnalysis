const modelManager = require('../ai/modelManager');
const stockCrawler = require('../crawler/stockDataCrawler');
const wechatPusher = require('../pusher/wechatPusher');
const logger = require('../utils/logger');

class AIStockAnalyzer {
    constructor() {
        this.analysisTemplates = {
            technical: `【系统指令：仅输出结论】
标的：{symbol} | 现价：{currentPrice} ({marketSession})
技术面结果：
- 支撑/阻力：{bollingerLower} / {bollingerUpper}
- 均线状态：SMA20({sma20})与SMA50({sma50})形态(多头/空头/交织)
- 指标状态：RSI({rsi})及MACD({macd})背离/超买/超卖情况
- 核心趋势：[一句话结论]`,

            fundamental: `【系统指令：直接给结果】
标的：{symbol} | PE:{peRatio} | ROE:{roe} | 营收增长:{revenueGrowth}
基本面研判：
- 估值定位：[严重低估/合理/溢价]
- 盈利能力：[极强/稳健/堪忧]
- 财务安全性：[资产负债状况结论]
- 核心壁垒：[该股在{sector}的核心优势]`,

            sentiment: `【系统指令：严禁过程，直给数据】
标的：{symbol} | VIX:{vixLevel} | 情绪得分:{newsSentiment}
市场情绪：
- 资金流向：[机构进场/主力流出/散户观望]
- 舆情热度：{socialHeat}
- 恐慌贪婪度：[结论]
- 近期驱动：{newsHeadlines}`,

            risk: `【系统指令：只列风险项】
标的：{symbol} | Beta:{portfolioBeta} | 回撤:{maxDrawdown}
核心风险：
1. [监管/宏观风险点及等级]
2. [个股/财务风险点及等级]
3. [流动性/市场风险点及等级]`,

            macro: `【系统指令：直接研判政策冲击】
环境：利率{interestRate} | 通胀{inflationRate}
宏观结论：
- 货币政策：[对该股的利好/利空程度]
- 行业政策：[具体利好/利空点]
- 宏观综合得分：[x/10分] (10分为极度利好，1分为极度利空)`,

            competition: `【系统指令：直接研判护城河】
行业：{sector}
竞争研判：
- 护城河等级：[极宽/宽/窄/无]
- 核心壁垒：[技术/成本/生态/品牌]
- 行业地位：[相对于对手的优势结论]
- 竞争壁垒分：[x/10分] (10分为垄断地位)`,

            shortTerm: `【系统指令：只给区间和方向】
标的：{symbol}
短期预测 (1-5 交易日)：
- 波动区间：[具体的低点-高点]
- 运行方向：[看涨/看跌/震荡]
- 关键触发位：[突破或跌破某位]`,

            longTerm: `【系统指令：直给目标价】
标的：{symbol}
长期预测 (6-12 个月)：
- 价值回归点：[预期的平衡价位]
- 目标价位参考：[悲观/基准/乐观三档价位]
- 增长逻辑：[核心增长引擎点名]`,

            advice: `【系统指令：只给评级与位，严禁解释】
标的：{symbol}
操作建议：
- 投资评级：[强力买入/持有/减持]
- 入场参考区间：[具体价位]
- 止盈/止损位：[具体价位]
- 仓位建议：[百分比]`
        };
    }

    async analyzeAll(symbol, options = {}) {
        try {
            logger.info(`Starting Ultra-Concise 9-Dimensional analysis for ${symbol}`);
            const stockData = await this.getStockData(symbol);
            
            const types = ['technical', 'fundamental', 'sentiment', 'risk', 'macro', 'competition', 'shortTerm', 'longTerm', 'advice'];
            const analysisPromises = types.map(async (type) => {
                try {
                    const data = await this.prepareAnalysisData(symbol, type, stockData);
                    // 强制在每个 prompt 前注入绝对约束
                    const content = await this.performAIAnalysis(symbol, type, data, options.modelName);
                    return { type, content: content.trim() };
                } catch (err) {
                    return { type, content: `[超时或受限]` };
                }
            });

            const results = await Promise.all(analysisPromises);
            
            let fullReport = `# ${symbol} 深度研判快报 (全维结果版)\n\n`;
            const titleMap = {
                technical: '一、技术指标',
                fundamental: '二、基本面',
                sentiment: '三、市场情绪',
                risk: '四、风险评估',
                macro: '五、宏观催化',
                competition: '六、护城河',
                shortTerm: '七、短期预测',
                longTerm: '八、长期预测',
                advice: '九、交易建议'
            };

            results.forEach(res => {
                // 彻底过滤掉 AI 可能会吐出的“好的、我是专家、根据数据...”等废话前缀
                const cleanContent = res.content
                    .replace(/^(好的|当然|根据|我为您|针对|我是).*?[:：\n]/g, '')
                    .trim();
                fullReport += `## ${titleMap[res.type]}\n${cleanContent}\n\n`;
            });

            const finalResult = {
                symbol,
                analysisType: 'comprehensive',
                analysis: fullReport,
                rawData: stockData,
                timestamp: new Date()
            };

            await this.saveAnalysis(finalResult);
            return finalResult;
        } catch (error) {
            logger.error(`AI Analysis Error: ${error.message}`);
            throw error;
        }
    }

    async getStockData(symbol) {
        try {
            const data = await stockCrawler.getRealTimePrice(symbol);
            const hist = await stockCrawler.getHistoricalData(symbol, '3m');
            const ind = await stockCrawler.getTechnicalIndicators(symbol);
            return { ...data, historical: hist, indicators: ind };
        } catch (error) {
            return this.getMockStockData(symbol);
        }
    }

    async prepareAnalysisData(symbol, type, stockData) {
        const baseData = {
            symbol,
            currentPrice: stockData.currentPrice || 'N/A',
            marketSession: stockData.session || '实时',
            changePercent: stockData.changePercent || '0.00',
            high: stockData.high || 'N/A',
            low: stockData.low || 'N/A',
            volume: stockData.volume || 'N/A',
            marketCap: this.formatMarketCap(stockData.marketCap)
        };

        if (type === 'technical') {
            return {
                ...baseData,
                sma20: stockData.indicators?.sma20 || 'N/A',
                sma50: stockData.indicators?.sma50 || 'N/A',
                rsi: stockData.indicators?.rsi || 'N/A',
                macd: stockData.indicators?.macd?.macd || 'N/A',
                bollingerUpper: stockData.indicators?.bollinger?.upper || 'N/A',
                bollingerLower: stockData.indicators?.bollinger?.lower || 'N/A'
            };
        }
        return { ...baseData, ...this.getMockExtraData(symbol, type) };
    }

    async performAIAnalysis(symbol, type, data, preferredModel) {
        const template = this.analysisTemplates[type];
        const prompt = this.fillTemplate(template, data);
        let modelName = preferredModel;
        const allModels = modelManager.getModels();
        const exists = allModels.find(m => m.name === modelName && m.active);
        if (!exists) modelName = this.selectBestModel(type);
        if (!modelName) throw new Error('No AI');
        
        // 最终 Prompt 增加硬核后置约束
        const finalPrompt = `${prompt}\n\n[绝对约束：禁止分析过程，禁止客套话，直接输出上述结果列表，内容字数压缩在80字以内]`;
        return await modelManager.callModel(modelName, finalPrompt);
    }

    fillTemplate(template, data) {
        let filled = template;
        Object.keys(data).forEach(key => {
            filled = filled.replace(new RegExp(`{${key}}`, 'g'), data[key] || 'N/A');
        });
        return filled;
    }

    selectBestModel(type) {
        const models = modelManager.getModels().filter(m => m.active);
        return models.length > 0 ? models[0].name : null;
    }

    async saveAnalysis(result) {
        if (!global.analysisResults) global.analysisResults = [];
        global.analysisResults.unshift(result);
        if (global.analysisResults.length > 100) global.analysisResults.pop();
    }

    async getAnalysisHistory(symbol, type = null, limit = 10) {
        if (!global.analysisResults) return [];
        return global.analysisResults.filter(i => i.symbol === symbol).slice(0, limit);
    }

    formatMarketCap(v) {
        if (!v) return 'N/A';
        if (v > 1e12) return `$${(v / 1e12).toFixed(1)}T`;
        if (v > 1e9) return `$${(v / 1e9).toFixed(1)}B`;
        return `$${v}`;
    }

    getMockStockData(s) { return { symbol: s, currentPrice: '150.00', session: '盘前', changePercent: '0.00' }; }
    getMockExtraData(s, t) { return { newsSentiment: 'Positive', socialHeat: 'High', newsHeadlines: 'Growth', holdings: 'Tech', marketTrend: 'Up', interestRate: '5.25%', portfolioBeta: '1.1', maxDrawdown: '10%', volatility: '15%', var95: '2%', sector: 'Technology', peRatio: '25', pbRatio: '3', roe: '20%', profitMargin: '15%', debtToEquity: '0.5', revenueGrowth: '10%', inflationRate: '3.1%' }; }
}

module.exports = new AIStockAnalyzer();
