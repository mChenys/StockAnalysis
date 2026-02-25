/**
 * Stock Analysis AI Agent
 * 
 * An intelligent agent that analyzes stocks through natural language conversation.
 * It determines which tools to call based on user intent, gathers real-time data,
 * and produces comprehensive investment insights using LLM reasoning.
 */

const modelManager = require('../ai/modelManager');
const stockCrawler = require('../crawler/stockDataCrawler');
const newsCrawler = require('../crawler/newsCrawler');
const pythonClient = require('../services/pythonClient');
const logger = require('../utils/logger');
const AgentSession = require('../database/models/AgentSession');

class StockAgent {
    constructor() {
        // Tool definitions that the agent can leverage
        this.tools = {
            get_stock_price: {
                description: '获取股票实时价格和基本行情数据',
                parameters: ['symbol'],
                execute: this.toolGetStockPrice.bind(this)
            },
            get_technical_indicators: {
                description: '获取股票技术指标(SMA、EMA、RSI、MACD、布林带)',
                parameters: ['symbol'],
                execute: this.toolGetTechnicalIndicators.bind(this)
            },
            get_historical_data: {
                description: '获取股票历史K线数据',
                parameters: ['symbol', 'period'],
                execute: this.toolGetHistoricalData.bind(this)
            },
            compare_stocks: {
                description: '对比多只股票的行情和技术指标',
                parameters: ['symbols'],
                execute: this.toolCompareStocks.bind(this)
            },
            analyze_portfolio: {
                description: '分析投资组合的风险和收益',
                parameters: ['holdings'],
                execute: this.toolAnalyzePortfolio.bind(this)
            },
            search_news: {
                description: '搜索与股票相关的最新财经新闻',
                parameters: ['keyword'],
                execute: this.toolSearchNews.bind(this)
            }
        };

        // Persistent conversation store settings (DB & fallback Map)
        this.conversations = new Map();
        this.maxHistoryLength = 20; // Keep last 20 turns (40 messages) per session
    }

    /**
     * Build the system prompt for the agent, including all available tool descriptions.
     */
    buildSystemPrompt() {
        const toolDescriptions = Object.entries(this.tools)
            .map(([name, tool]) => `  - ${name}(${tool.parameters.join(', ')}): ${tool.description}`)
            .join('\n');

        return `你是一位顶级华尔街量化分析师 AI Agent，拥有以下专业工具：

${toolDescriptions}

## 工作流程
1. 分析用户意图，决定需要调用哪些工具
2. 输出工具调用指令（格式见下方）
3. 系统会执行工具并返回数据，你再基于真实数据给出专业分析

## 【重要】工具调用格式
当你需要获取实时数据时，你的回复中必须且只包含以下格式的 JSON，不要附加任何其他文字：

TOOL_CALL_START
[{"tool": "工具名", "args": {"参数名": "参数值"}}]
TOOL_CALL_END

### 示例1：查询单只股票
TOOL_CALL_START
[{"tool": "get_stock_price", "args": {"symbol": "AAPL"}}]
TOOL_CALL_END

### 示例2：同时调用多个工具
TOOL_CALL_START
[{"tool": "get_stock_price", "args": {"symbol": "NVDA"}}, {"tool": "get_technical_indicators", "args": {"symbol": "NVDA"}}, {"tool": "search_news", "args": {"keyword": "NVDA"}}]
TOOL_CALL_END

## 关键规则
- 当需要调用工具时，你的整个回复只输出 TOOL_CALL_START...TOOL_CALL_END 块，不要输出其他文字
- 不要把工具调用放在 markdown 代码块里，直接用 TOOL_CALL_START 和 TOOL_CALL_END 包裹
- 必须基于工具返回的真实数据进行分析，严禁编造数据
- 如果用户的问题不需要实时数据（如概念解释），可直接回答，不需要调用工具
- 分析输出使用 Markdown 格式，重要数据加粗
- 涨跌：📈 表示上涨，📉 表示下跌
- 所有分析最后附上风险提示
- 使用中文回答

## 你的分析风格
- 结论先行，数据支撑
- 技术面和基本面结合
- 明确给出操作建议（买入/持有/卖出区间）
- 量化风险等级（1-10）`;
    }

    /**
     * Main entry point: process user message and return agent response.
     * 
     * @param {string} sessionId - Unique conversation session ID
     * @param {string} userMessage - User's natural language input
     * @param {string} modelName - Name of the AI model to use
     * @returns {Object} { response, toolsUsed, dataCollected }
     */
    async chat(userId, sessionId, userMessage, modelName) {
        const startTime = Date.now();
        logger.info(`[Agent] Session ${sessionId}: "${userMessage.substring(0, 50)}..."`);

        // Retrieve conversation history
        const history = await this.getHistory(sessionId);
        history.push({ role: 'user', content: userMessage });

        let response;

        // ─── Strategy 1: Try Python Agno Agent (preferred) ───────────
        if (await pythonClient.isPythonServiceAvailable()) {
            try {
                // Get model config from modelManager to pass to Python
                const modelConfig = modelManager.getModelConfig(modelName);
                if (modelConfig) {
                    logger.info(`[Agent] Using Agno Agent with model ${modelConfig.model}`);

                    const agnoResult = await pythonClient.runAgentChat(
                        userMessage,
                        {
                            apiKey: modelConfig.apiKey,
                            baseUrl: modelConfig.baseUrl,
                            model: modelConfig.model,
                            temperature: modelConfig.temperature || 0.7,
                            maxTokens: modelConfig.maxTokens || 4096,
                        },
                        history.slice(-10) // Last 10 messages for context
                    );

                    const cleanResp = agnoResult.response || '';

                    // 核心逻辑：拦截 Google/OpenAI 的 API 错误并触发自动降级
                    if (cleanResp.includes('"error"') || cleanResp.includes('Invalid JSON') || cleanResp.includes('INVALID_ARGUMENT')) {
                        throw new Error(`AI Provider API Error: ${cleanResp.substring(0, 100)}...`);
                    }

                    history.push({ role: 'assistant', content: cleanResp });

                    await this.saveHistory(userId, sessionId, history);

                    const elapsed = Date.now() - startTime;
                    logger.info(`[Agent] Agno Agent response in ${elapsed}ms`);

                    return {
                        response: cleanResp,
                        toolsUsed: ['agno_yfinance', 'agno_duckduckgo'],
                        dataCollected: {},
                        elapsed,
                        source: 'agno_agent'
                    };
                }
            } catch (err) {
                logger.warn(`[Agent] Agno Agent failed: ${err.message}, falling back to manual flow`);
            }
        }

        // ─── Strategy 2: Manual tool-calling flow (fallback) ────────
        const systemPrompt = this.buildSystemPrompt();
        const conversationContext = this.buildConversationContext(history);
        const fullPrompt = `${systemPrompt}\n\n## 对话历史\n${conversationContext}\n\n请根据用户最新的消息进行分析。如果需要实时数据，先调用工具。`;

        let llmResponse = await this.callLLM(modelName, fullPrompt);
        const toolsUsed = [];
        const dataCollected = {};

        const toolCalls = this.parseToolCalls(llmResponse);

        if (toolCalls.length > 0) {
            logger.info(`[Agent] Detected ${toolCalls.length} tool call(s)`);

            const toolResults = await Promise.all(
                toolCalls.map(async (call) => {
                    try {
                        const tool = this.tools[call.tool];
                        if (!tool) {
                            return { tool: call.tool, error: `未知工具: ${call.tool}` };
                        }
                        const result = await tool.execute(call.args);
                        toolsUsed.push(call.tool);
                        dataCollected[call.tool] = result;
                        return { tool: call.tool, result };
                    } catch (error) {
                        logger.error(`[Agent] Tool ${call.tool} failed:`, error.message);
                        return { tool: call.tool, error: error.message };
                    }
                })
            );

            const toolResultsText = toolResults.map(tr => {
                if (tr.error) return `### 工具 ${tr.tool} 执行失败\n错误: ${tr.error}`;
                return `### 工具 ${tr.tool} 返回数据\n\`\`\`json\n${JSON.stringify(tr.result, null, 2)}\n\`\`\``;
            }).join('\n\n');

            const analysisPrompt = `${systemPrompt}\n\n## 对话历史\n${conversationContext}\n\n## 工具返回的实时数据\n${toolResultsText}\n\n请基于以上真实数据，对用户的问题给出专业的投资分析。格式清晰，结论明确。不要再输出 TOOL_CALL_START/TOOL_CALL_END 或任何工具调用指令，直接输出分析内容。`;

            llmResponse = await this.callLLM(modelName, analysisPrompt);
        }

        const cleanResp = this.cleanResponse(llmResponse);
        history.push({ role: 'assistant', content: cleanResp });

        await this.saveHistory(userId, sessionId, history);

        const elapsed = Date.now() - startTime;
        logger.info(`[Agent] Response generated in ${elapsed}ms, tools used: ${toolsUsed.join(', ') || 'none'}`);

        return {
            response: cleanResp,
            toolsUsed,
            dataCollected,
            elapsed,
            source: 'manual_agent'
        };
    }

    /**
     * Stream version of chat - returns an async generator for SSE streaming
     */
    async *chatStream(userId, sessionId, userMessage, modelName) {
        // Yield status updates as the agent works
        yield { type: 'status', content: '🔍 正在分析您的意图...' };

        const history = await this.getHistory(sessionId);
        history.push({ role: 'user', content: userMessage });

        const systemPrompt = this.buildSystemPrompt();
        const conversationContext = this.buildConversationContext(history);
        const fullPrompt = `${systemPrompt}\n\n## 对话历史\n${conversationContext}\n\n请根据用户最新的消息进行分析。如果需要实时数据，先调用工具。`;

        yield { type: 'status', content: '🤖 AI 思考中...' };
        let llmResponse = await this.callLLM(modelName, fullPrompt);

        const toolCalls = this.parseToolCalls(llmResponse);
        const toolsUsed = [];
        const dataCollected = {};

        if (toolCalls.length > 0) {
            for (const call of toolCalls) {
                yield { type: 'tool', content: `🔧 调用工具: ${call.tool}(${JSON.stringify(call.args)})` };
            }

            const toolResults = await Promise.all(
                toolCalls.map(async (call) => {
                    try {
                        const tool = this.tools[call.tool];
                        if (!tool) return { tool: call.tool, error: `未知工具: ${call.tool}` };
                        const result = await tool.execute(call.args);
                        toolsUsed.push(call.tool);
                        dataCollected[call.tool] = result;
                        return { tool: call.tool, result };
                    } catch (error) {
                        return { tool: call.tool, error: error.message };
                    }
                })
            );

            yield { type: 'status', content: '📊 数据已获取，正在生成分析报告...' };

            const toolResultsText = toolResults.map(tr => {
                if (tr.error) return `### 工具 ${tr.tool} 执行失败\n错误: ${tr.error}`;
                return `### 工具 ${tr.tool} 返回数据\n\`\`\`json\n${JSON.stringify(tr.result, null, 2)}\n\`\`\``;
            }).join('\n\n');

            const analysisPrompt = `${systemPrompt}\n\n## 对话历史\n${conversationContext}\n\n## 工具返回的实时数据\n${toolResultsText}\n\n请基于以上真实数据，对用户的问题给出专业的投资分析。格式清晰，结论明确。不要再输出 TOOL_CALL_START/TOOL_CALL_END 或任何工具调用指令，直接输出分析内容。`;

            llmResponse = await this.callLLM(modelName, analysisPrompt);
        }

        const cleanResponse = this.cleanResponse(llmResponse);
        history.push({ role: 'assistant', content: cleanResponse });

        await this.saveHistory(userId, sessionId, history);

        yield { type: 'response', content: cleanResponse, toolsUsed, dataCollected };
    }

    // ==================== Tool Implementations ====================

    async toolGetStockPrice({ symbol }) {
        // Try Python service first (yfinance = more reliable)
        if (await pythonClient.isPythonServiceAvailable()) {
            try {
                const data = await pythonClient.getStockPrice(symbol);
                logger.info(`[Agent] Got price for ${symbol} via Python service`);
                return data;
            } catch (err) {
                logger.warn(`[Agent] Python price failed for ${symbol}: ${err.message}, falling back to JS crawler`);
            }
        }
        // Fallback to JS crawler
        const data = await stockCrawler.getRealTimePrice(symbol);
        return {
            symbol: data.symbol,
            currentPrice: data.currentPrice,
            previousClose: data.previousClose,
            changePercent: data.changePercent,
            session: data.session,
            high: data.high,
            low: data.low,
            volume: data.volume,
            timestamp: data.timestamp,
            source: 'js_crawler'
        };
    }

    async toolGetTechnicalIndicators({ symbol }) {
        if (await pythonClient.isPythonServiceAvailable()) {
            try {
                const data = await pythonClient.getTechnicalIndicators(symbol);
                logger.info(`[Agent] Got indicators for ${symbol} via Python service`);
                return data;
            } catch (err) {
                logger.warn(`[Agent] Python indicators failed for ${symbol}: ${err.message}, falling back`);
            }
        }
        const indicators = await stockCrawler.getTechnicalIndicators(symbol);
        return {
            symbol,
            sma20: indicators.sma20,
            sma50: indicators.sma50,
            ema12: indicators.ema12,
            ema26: indicators.ema26,
            rsi: indicators.rsi,
            macd: indicators.macd,
            bollinger: indicators.bollinger
        };
    }

    async toolGetHistoricalData({ symbol, period = '3m' }) {
        // Map period format: Node uses '3m', Python uses '3mo'
        const pyPeriod = period.endsWith('m') && !period.endsWith('mo') ? period + 'o' : period;

        if (await pythonClient.isPythonServiceAvailable()) {
            try {
                const data = await pythonClient.getHistoricalData(symbol, pyPeriod);
                logger.info(`[Agent] Got historical data for ${symbol} via Python service`);
                return data;
            } catch (err) {
                logger.warn(`[Agent] Python historical failed for ${symbol}: ${err.message}, falling back`);
            }
        }
        const data = await stockCrawler.getHistoricalData(symbol, period);
        const recent = data.slice(-30);
        return {
            symbol,
            period,
            dataPoints: recent.length,
            data: recent.map(d => ({
                date: d.date,
                open: d.open?.toFixed(2),
                high: d.high?.toFixed(2),
                low: d.low?.toFixed(2),
                close: d.close?.toFixed(2),
                volume: d.volume
            }))
        };
    }

    async toolCompareStocks({ symbols }) {
        const symbolList = Array.isArray(symbols) ? symbols : symbols.split(',').map(s => s.trim());

        if (await pythonClient.isPythonServiceAvailable()) {
            try {
                const data = await pythonClient.compareStocks(symbolList);
                logger.info(`[Agent] Compared stocks via Python service`);
                return data;
            } catch (err) {
                logger.warn(`[Agent] Python compare failed: ${err.message}, falling back`);
            }
        }

        const results = await Promise.all(
            symbolList.map(async (symbol) => {
                try {
                    const [price, indicators] = await Promise.all([
                        stockCrawler.getRealTimePrice(symbol),
                        stockCrawler.getTechnicalIndicators(symbol).catch(() => null)
                    ]);
                    return {
                        symbol,
                        currentPrice: price.currentPrice,
                        changePercent: price.changePercent,
                        session: price.session,
                        volume: price.volume,
                        rsi: indicators?.rsi || 'N/A',
                        sma20: indicators?.sma20 || 'N/A',
                        sma50: indicators?.sma50 || 'N/A',
                        macd: indicators?.macd?.macd || 'N/A'
                    };
                } catch (error) {
                    return { symbol, error: error.message };
                }
            })
        );
        return { comparison: results };
    }

    async toolAnalyzePortfolio({ holdings }) {
        let holdingsList;
        if (typeof holdings === 'string') {
            try { holdingsList = JSON.parse(holdings); } catch { holdingsList = []; }
        } else {
            holdingsList = holdings;
        }

        if (!Array.isArray(holdingsList) || holdingsList.length === 0) {
            return { error: '请提供有效的持仓信息，格式: [{"symbol":"AAPL","shares":100,"avgCost":150}]' };
        }

        if (await pythonClient.isPythonServiceAvailable()) {
            try {
                const data = await pythonClient.analyzePortfolio(holdingsList);
                logger.info(`[Agent] Analyzed portfolio via Python service`);
                return data;
            } catch (err) {
                logger.warn(`[Agent] Python portfolio failed: ${err.message}, falling back`);
            }
        }

        const portfolioData = await Promise.all(
            holdingsList.map(async (h) => {
                try {
                    const price = await stockCrawler.getRealTimePrice(h.symbol);
                    const currentValue = price.currentPrice * h.shares;
                    const costBasis = h.avgCost * h.shares;
                    const pnl = currentValue - costBasis;
                    const pnlPercent = ((pnl / costBasis) * 100).toFixed(2);
                    return {
                        symbol: h.symbol,
                        shares: h.shares,
                        avgCost: h.avgCost,
                        currentPrice: price.currentPrice,
                        currentValue: currentValue.toFixed(2),
                        costBasis: costBasis.toFixed(2),
                        pnl: pnl.toFixed(2),
                        pnlPercent,
                        changeToday: price.changePercent
                    };
                } catch (error) {
                    return { symbol: h.symbol, error: error.message };
                }
            })
        );

        const totalValue = portfolioData.reduce((sum, h) => sum + (parseFloat(h.currentValue) || 0), 0);
        const totalCost = portfolioData.reduce((sum, h) => sum + (parseFloat(h.costBasis) || 0), 0);
        const totalPnl = totalValue - totalCost;

        return {
            holdings: portfolioData,
            summary: {
                totalValue: totalValue.toFixed(2),
                totalCost: totalCost.toFixed(2),
                totalPnl: totalPnl.toFixed(2),
                totalPnlPercent: ((totalPnl / totalCost) * 100).toFixed(2),
                positionCount: portfolioData.length
            }
        };
    }

    async toolSearchNews({ keyword }) {
        // Try Python service first (yfinance provides ticker news)
        if (await pythonClient.isPythonServiceAvailable()) {
            try {
                const data = await pythonClient.searchNews(keyword);
                if (data.count > 0) {
                    logger.info(`[Agent] Got ${data.count} news for ${keyword} via Python service`);
                    return data;
                }
            } catch (err) {
                logger.warn(`[Agent] Python news failed for ${keyword}: ${err.message}`);
            }
        }

        // Fallback to database search
        try {
            const NewsItem = require('../database/models/NewsItem');
            let news = await NewsItem.find({
                $or: [
                    { title: { $regex: keyword, $options: 'i' } },
                    { content: { $regex: keyword, $options: 'i' } },
                    { relatedSymbols: keyword.toUpperCase() }
                ]
            }).sort({ publishedAt: -1 }).limit(10).lean();

            if (!news || news.length === 0) {
                return {
                    keyword,
                    count: 0,
                    news: [],
                    message: '暂无相关新闻。若 Python 服务已启动，可提供 yfinance 来源的新闻。'
                };
            }

            return {
                keyword,
                count: news.length,
                news: news.map(n => ({
                    title: n.title,
                    content: n.content?.substring(0, 200),
                    source: n.sourceId,
                    publishedAt: n.publishedAt,
                    sentiment: n.sentimentScore || 0
                }))
            };
        } catch (error) {
            return { keyword, count: 0, news: [], message: '新闻搜索暂不可用' };
        }
    }

    // ==================== Helper Methods ====================

    /**
     * Parse tool calls from LLM response.
     * Supports multiple formats since different LLMs output differently:
     *   1. TOOL_CALL_START ... TOOL_CALL_END markers
     *   2. <tool_call> ... </tool_call> XML tags
     *   3. Markdown code blocks containing tool call JSON
     *   4. Standalone JSON arrays with {tool, args} shape
     */
    parseToolCalls(response) {
        const toolCalls = [];

        const tryParseJsonArray = (jsonStr) => {
            try {
                const parsed = JSON.parse(jsonStr.trim());
                const calls = Array.isArray(parsed) ? parsed : [parsed];
                calls.forEach(call => {
                    if (call.tool && call.args) {
                        toolCalls.push(call);
                    }
                });
                return true;
            } catch {
                return false;
            }
        };

        // Strategy 1: TOOL_CALL_START ... TOOL_CALL_END
        const markerRegex = /TOOL_CALL_START\s*([\s\S]*?)\s*TOOL_CALL_END/g;
        let match;
        while ((match = markerRegex.exec(response)) !== null) {
            tryParseJsonArray(match[1]);
        }
        if (toolCalls.length > 0) { logger.info(`[Agent] Parsed ${toolCalls.length} tool call(s) via TOOL_CALL markers`); return toolCalls; }

        // Strategy 2: <tool_call> ... </tool_call>
        const xmlRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
        while ((match = xmlRegex.exec(response)) !== null) {
            tryParseJsonArray(match[1]);
        }
        if (toolCalls.length > 0) { logger.info(`[Agent] Parsed ${toolCalls.length} tool call(s) via XML tags`); return toolCalls; }

        // Strategy 3: Markdown code blocks (```json ... ``` or ``` ... ```)
        const codeBlockRegex = /```(?:json)?\s*\n?(\[\s*\{[\s\S]*?\}\s*\])\s*\n?```/g;
        while ((match = codeBlockRegex.exec(response)) !== null) {
            tryParseJsonArray(match[1]);
        }
        if (toolCalls.length > 0) { logger.info(`[Agent] Parsed ${toolCalls.length} tool call(s) via code block`); return toolCalls; }

        // Strategy 4: Standalone JSON array with tool+args pattern (last resort)
        const jsonArrayRegex = /\[\s*\{\s*"tool"\s*:\s*"[\w]+"\s*,\s*"args"\s*:[\s\S]*?\}\s*(?:,\s*\{\s*"tool"\s*:\s*"[\w]+"\s*,\s*"args"\s*:[\s\S]*?\}\s*)*\]/g;
        while ((match = jsonArrayRegex.exec(response)) !== null) {
            tryParseJsonArray(match[0]);
        }
        if (toolCalls.length > 0) { logger.info(`[Agent] Parsed ${toolCalls.length} tool call(s) via raw JSON`); return toolCalls; }

        return toolCalls;
    }

    /**
     * Build conversation context string from history array
     */
    buildConversationContext(history) {
        // Take last 10 turns to avoid overflowing context window
        const recent = history.slice(-10);
        return recent.map(msg => {
            const role = msg.role === 'user' ? '用户' : 'AI助手';
            return `**${role}**: ${msg.content}`;
        }).join('\n\n');
    }

    /**
     * Remove residual tool_call tags/markers and clean up the response
     */
    cleanResponse(response) {
        return response
            // Remove TOOL_CALL markers
            .replace(/TOOL_CALL_START[\s\S]*?TOOL_CALL_END/g, '')
            // Remove XML tags
            .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
            // Remove markdown code blocks that contain tool call JSON
            .replace(/```(?:json)?\s*\n?\[\s*\{\s*"tool"[\s\S]*?\]\s*\n?```/g, '')
            // Remove standalone tool call JSON arrays
            .replace(/\[\s*\{\s*"tool"\s*:\s*"[\w]+"\s*,\s*"args"\s*:[\s\S]*?\}\s*(?:,\s*\{\s*"tool"\s*:\s*"[\w]+"\s*,\s*"args"\s*:[\s\S]*?\}\s*)*\]/g, '')
            .replace(/^\s*\n/gm, '\n')
            .trim();
    }

    /**
     * Call the LLM via modelManager
     */
    async callLLM(modelName, prompt) {
        const allModels = modelManager.getModels();
        let targetModel = modelName;

        // Find the specified model, fallback to first active model
        const exists = allModels.find(m => m.name === targetModel && m.active);
        if (!exists) {
            targetModel = allModels.filter(m => m.active)[0]?.name;
        }
        if (!targetModel) {
            throw new Error('没有可用的 AI 模型，请先在"模型管理"页面配置一个模型。');
        }

        return await modelManager.callModel(targetModel, prompt, {
            maxTokens: 8000,
            temperature: 0.3 // Lower temperature for more factual analysis
        });
    }

    /**
     * Clear conversation history for a session
     */
    async clearSession(sessionId) {
        if (global.isInMemory) {
            this.conversations.delete(sessionId);
            return;
        }
        await AgentSession.deleteOne({ sessionId });
    }

    /**
     * Get conversation history for a session
     */
    async getHistory(sessionId) {
        if (global.isInMemory) {
            return this.conversations.get(sessionId) || [];
        }
        const session = await AgentSession.findOne({ sessionId }).lean();
        if (!session || !session.messages) return [];
        return session.messages.map(m => ({ role: m.role, content: m.content }));
    }

    /**
     * Save conversation history to the database
     */
    async saveHistory(userId, sessionId, messages) {
        // Take the last maxHistoryLength * 2 messages to prevent document size growing too large
        const recentMessages = messages.slice(-this.maxHistoryLength * 2);

        if (global.isInMemory) {
            this.conversations.set(sessionId, recentMessages);
            return;
        }

        let session = await AgentSession.findOne({ sessionId });
        if (!session) {
            let title = '新对话';
            const firstUserMsg = messages.find(m => m.role === 'user');
            if (firstUserMsg) {
                title = firstUserMsg.content.length > 25 ? firstUserMsg.content.substring(0, 25) + '...' : firstUserMsg.content;
            }
            session = new AgentSession({
                sessionId,
                userId,
                title,
                messages: []
            });
        }

        session.messages = recentMessages;
        await session.save();
    }

    /**
     * Get all active sessions with a brief summary
     */
    async getAllSessions(userId) {
        if (global.isInMemory) {
            const summaries = [];
            for (const [id, messages] of this.conversations.entries()) {
                if (messages.length === 0) continue;
                const firstUserMsg = messages.find(m => m.role === 'user');
                const title = firstUserMsg ? (firstUserMsg.content.length > 25 ? firstUserMsg.content.substring(0, 25) + '...' : firstUserMsg.content) : '新对话';
                summaries.push({ id, title, messageCount: messages.length, updatedAt: Date.now() });
            }
            return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
        }

        const sessions = await AgentSession.find({ userId }).sort({ updatedAt: -1 }).lean();
        return sessions.map(s => ({
            id: s.sessionId,
            title: s.title,
            messageCount: s.messages ? s.messages.length : 0,
            updatedAt: s.updatedAt ? s.updatedAt.getTime() : Date.now()
        }));
    }

    /**
     * Get quick suggestion prompts for the UI
     */
    getSuggestions() {
        return [
            { icon: '📈', text: '分析一下 NVDA 英伟达的当前走势' },
            { icon: '⚖️', text: '对比 AAPL 和 MSFT 哪个更值得买入' },
            { icon: '📊', text: '帮我分析一下 TSLA 的技术指标' },
            { icon: '💼', text: '评估我的持仓: AAPL 100股均价180, NVDA 50股均价500' },
            { icon: '📰', text: '最近有什么关于 AI 芯片的重要新闻' },
            { icon: '🎯', text: 'RSI 超买是什么意思？应该怎么操作？' }
        ];
    }
}

module.exports = new StockAgent();
