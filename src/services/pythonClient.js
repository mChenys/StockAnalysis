/**
 * Python Agno Agent Client
 * Calls the Python Agno Agent service for stock analysis.
 * The Python service handles LLM calls + tool execution (YFinance, DuckDuckGo) automatically.
 */

const axios = require('axios');
const logger = require('../utils/logger');

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';
const AGENT_TIMEOUT = 120000; // 120s — agent may need multiple LLM + tool calls

let _pythonAvailable = null;
let _lastCheck = 0;
const CHECK_INTERVAL = 30000;

/**
 * Check if the Python Agno Agent service is up
 */
async function isPythonServiceAvailable() {
    const now = Date.now();
    if (_pythonAvailable !== null && now - _lastCheck < CHECK_INTERVAL) {
        return _pythonAvailable;
    }
    try {
        const res = await axios.get(`${PYTHON_SERVICE_URL}/health`, { timeout: 3000 });
        _pythonAvailable = res.data?.status === 'ok';
    } catch {
        _pythonAvailable = false;
    }
    _lastCheck = now;
    logger.info(`[PythonClient] Agno Agent available: ${_pythonAvailable}`);
    return _pythonAvailable;
}

/**
 * Run the Agno Agent with a question and model config.
 * The Agno Agent handles everything: LLM reasoning, tool calls (YFinance, DuckDuckGo), analysis.
 * 
 * @param {string} question - User's question
 * @param {object} modelConfig - { apiKey, baseUrl, model, temperature?, maxTokens? }
 * @param {Array} conversationHistory - Previous messages [{role, content}]
 * @returns {object} { response, model, source }
 */
async function runAgentChat(question, modelConfig, conversationHistory = []) {
    const url = `${PYTHON_SERVICE_URL}/api/agent/chat`;
    logger.info(`[PythonClient] Running Agno Agent: "${question.substring(0, 50)}..." with model ${modelConfig.model}`);

    const res = await axios.post(url, {
        question,
        modelConfig: {
            apiKey: modelConfig.apiKey,
            baseUrl: modelConfig.baseUrl,
            model: modelConfig.model,
            temperature: modelConfig.temperature || 0.7,
            maxTokens: modelConfig.maxTokens || 4096,
        },
        conversationHistory,
    }, {
        timeout: AGENT_TIMEOUT,
    });

    if (res.data?.success) {
        return res.data.data;
    }
    throw new Error(res.data?.detail || 'Agno Agent returned unsuccessful response');
}

/**
 * Run the Agno Agent with SSE streaming.
 * Returns a readable stream of SSE events from the Python service.
 * 
 * @param {string} question - User's question
 * @param {object} modelConfig - { apiKey, baseUrl, model, temperature?, maxTokens? }
 * @param {Array} conversationHistory - Previous messages [{role, content}]
 * @returns {ReadableStream} SSE event stream
 */
async function runAgentChatStream(question, modelConfig, conversationHistory = []) {
    const url = `${PYTHON_SERVICE_URL}/api/agent/chat/stream`;
    logger.info(`[PythonClient] Running Agno Agent (stream): "${question.substring(0, 50)}..." with model ${modelConfig.model}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question,
            modelConfig: {
                apiKey: modelConfig.apiKey,
                baseUrl: modelConfig.baseUrl,
                model: modelConfig.model,
                temperature: modelConfig.temperature || 0.7,
                maxTokens: modelConfig.maxTokens || 4096,
            },
            conversationHistory,
        }),
        signal: AbortSignal.timeout(AGENT_TIMEOUT),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Python stream request failed: ${response.status} ${text}`);
    }

    return response.body;
}

/**
 * Direct stock price lookup via Python (no LLM needed)
 */
async function getStockPrice(symbol) {
    const res = await axios.post(`${PYTHON_SERVICE_URL}/api/stock/price`, { symbol }, { timeout: 30000 });
    if (res.data?.success) return res.data.data;
    throw new Error('Failed to get stock price');
}

module.exports = {
    isPythonServiceAvailable,
    runAgentChat,
    runAgentChatStream,
    getStockPrice,
    PYTHON_SERVICE_URL,
};
