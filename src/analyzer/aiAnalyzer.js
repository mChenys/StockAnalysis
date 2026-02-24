const modelManager = require('../ai/modelManager');
const stockCrawler = require('../crawler/stockDataCrawler');
const wechatPusher = require('../pusher/wechatPusher');
const logger = require('../utils/logger');

class AIStockAnalyzer {
    constructor() {
        this.analysisTemplates = {
            technical: `标的：{symbol} | 现价：{currentPrice} ({marketSession})
技术面结论：
- 支撑/阻力：{bollingerLower} / {bollingerUpper}
- 均线状态：SMA20({sma20})与SMA50({sma50})形态
- 指标状态：RSI({rsi})及MACD({macd})信号
- 核心趋势：[直接给出趋势定调]`,

            fundamental: `标的：{symbol} | 现价：{currentPrice}
基本面结论：
- 估值定位：[严重低估/合理/溢价]
- 盈利能力：[极强/稳健/堪忧]
- 核心壁垒：[基于该股真实业务的竞争优势]`,

            sentiment: `标的：{symbol} | 现价：{currentPrice}
市场情绪：
- 资金流向：[主力进场/主力流出/散户观望]
- 舆情热度：[High/Medium/Low]
- 恐慌贪婪度：[结论]`,

            risk: `标的：{symbol} | 风险偏好指数：Beta({portfolioBeta})
核心风险点：
1. [基于现价的估值风险级别]
2. [宏观及行业层面的具体威胁]`,

            macro: `宏观研判结论：
- 货币政策冲击：[对现价的利好/利空程度]
- 宏观综合得分：[x/10分] (10分为极度利好)`,

            competition: `竞争格局分析：
- 护城河等级：[极宽/宽/窄/无]
- 行业地位：[该股票在所属行业的真实排名与攻守状态]`,

            shortTerm: `短期预测 (1-5 交易日)：
- 波动区间：[必须基于 {currentPrice} 给出具体的低点-高点]
- 运行方向：[看涨/看跌/震荡]`,

            longTerm: `长期预测 (6-12 个月)：
- 目标价位参考：[基准价位/乐观价位/悲观价位]
- 价值回归预期：[结论]`,

            advice: `专业操盘建议：
- 投资评级：[强力买入/增持/持有/减持/卖出]
- 入场参考区间：[必须在 {currentPrice} 附近]
- 止盈/止损位：[基于现价提供的精准价位]`
        };
    }

    async analyzeAll(symbol, options = {}) {
        try {
            logger.info(`Starting Restoration 9-D analysis for ${symbol}`);
            const stockData = await this.getStockData(symbol);
            
            const types = ['technical', 'fundamental', 'sentiment', 'risk', 'macro', 'competition', 'shortTerm', 'longTerm', 'advice'];
            const analysisPromises = types.map(async (type) => {
                try {
                    const data = await this.prepareAnalysisData(symbol, type, stockData);
                    const content = await this.performAIAnalysis(symbol, type, data, options.modelName);
                    return { type, content: content.trim() };
                } catch (err) {
                    console.error(`[AIAnalyzer] Task ${type} failed for ${symbol}: ${err.message}`);
                    logger.error(`[AIAnalyzer] Task ${type} failed for ${symbol}: ${err.message}`);
                    return { type, content: `[APP DEBUG FALLBACK]` };
                }
            });

            const results = await Promise.all(analysisPromises);
            
            let fullReport = `# ${symbol} 深度研判快报 (全维结果版)\n\n`;
            const titleMap = {
                technical: '一、技术指标深度分析',
                fundamental: '二、基本面核心价值评估',
                sentiment: '三、市场情绪与资金动向',
                risk: '四、风险敞口及黑天鹅评估',
                macro: '五、宏观环境及政策催化',
                competition: '六、行业护城河与竞争态势',
                shortTerm: '七、短期趋势博弈预测',
                longTerm: '八、中长期价值增长预测',
                advice: '九、操盘策略与交易建议'
            };

            results.forEach(res => {
                // 强制滤除所有废话，保留硬核结构
                const cleanContent = res.content
                    .replace(/^(好的|当然|根据|针对|我是).*?[:：\n]/g, '')
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
            const ind = await stockCrawler.getTechnicalIndicators(symbol);
            return { ...data, indicators: ind };
        } catch (error) {
            return { symbol, currentPrice: 'N/A', session: '未知' };
        }
    }

    async prepareAnalysisData(symbol, type, stockData) {
        return {
            symbol,
            currentPrice: stockData.currentPrice || 'N/A',
            marketSession: stockData.session || '实时',
            changePercent: stockData.changePercent || '0.00',
            sma20: stockData.indicators?.sma20 || 'N/A',
            sma50: stockData.indicators?.sma50 || 'N/A',
            rsi: stockData.indicators?.rsi || 'N/A',
            macd: stockData.indicators?.macd?.macd || 'N/A',
            bollingerUpper: stockData.indicators?.bollinger?.upper || 'N/A',
            bollingerLower: stockData.indicators?.bollinger?.lower || 'N/A',
            portfolioBeta: '1.1',
            maxDrawdown: '10%',
            interestRate: '5.25%',
            inflationRate: '3.1%'
        };
    }

    async performAIAnalysis(symbol, type, data, preferredModel) {
        const template = this.analysisTemplates[type];
        const prompt = this.fillTemplate(template, data);
        let modelName = preferredModel;
        const allModels = modelManager.getModels();
        const exists = allModels.find(m => m.name === modelName && m.active);
        if (!exists) modelName = allModels.filter(m => m.active)[0]?.name;
        if (!modelName) throw new Error('No AI');
        
        // 终极布局指令：强制使用 Markdown 列表
        const finalPrompt = `${prompt}\n\n[核心约束：禁止分析过程，禁止客套话。必须严格按照上述列表格式输出结果，每一项使用 '-' 开头。当前股价真实值为 ${data.currentPrice}，所有预测必须以此为基准。直接给出结果。]`;
        return await modelManager.callModel(modelName, finalPrompt);
    }

    fillTemplate(template, data) {
        let filled = template;
        Object.keys(data).forEach(key => {
            filled = filled.replace(new RegExp(`{${key}}`, 'g'), data[key] || 'N/A');
        });
        return filled;
    }

    async saveAnalysis(result) {
        if (!global.analysisResults) global.analysisResults = [];
        global.analysisResults.unshift(result);
    }
}

module.exports = new AIStockAnalyzer();
