/**
 * Agent API Routes
 * 
 * Exposes the Stock Agent's capabilities through REST endpoints.
 * Supports both regular request/response and SSE streaming.
 */

const express = require('express');
const router = express.Router();
const stockAgent = require('../agent/stockAgent');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

/**
 * POST /api/agent/chat
 * 
 * Send a message to the AI Stock Agent and receive a response.
 * Body: { message, sessionId?, modelName? }
 */
router.post('/chat', authenticateToken, async (req, res) => {
    try {
        const { message, sessionId, modelName } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '请输入有效的消息内容'
            });
        }

        // Use user's ID + provided sessionId or generate one
        const sid = sessionId || `${req.user._id}_${Date.now()}`;

        const result = await stockAgent.chat(sid, message.trim(), modelName);

        res.json({
            success: true,
            sessionId: sid,
            response: result.response,
            toolsUsed: result.toolsUsed,
            dataCollected: result.dataCollected,
            elapsed: result.elapsed
        });
    } catch (error) {
        logger.error('[Agent Route] Chat error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/agent/chat/stream
 * 
 * SSE streaming version — streams real-time events from the Agno Agent:
 * tool calls, reasoning/thinking, content deltas, completion.
 * Falls back to manual agent stream when Python service is unavailable.
 * Body: { message, sessionId?, modelName? }
 */
router.post('/chat/stream', authenticateToken, async (req, res) => {
    try {
        const { message, sessionId, modelName } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '请输入有效的消息内容'
            });
        }

        const sid = sessionId || `${req.user._id}_${Date.now()}`;

        // Configure SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        // Send session ID as the first event
        res.write(`data: ${JSON.stringify({ type: 'session', sessionId: sid })}\n\n`);

        const pythonClient = require('../services/pythonClient');
        const modelManager = require('../ai/modelManager');

        // ─── Strategy 1: Stream from Python Agno Agent (preferred) ───
        if (await pythonClient.isPythonServiceAvailable()) {
            const modelConfig = modelManager.getModelConfig(modelName);
            if (modelConfig) {
                try {
                    logger.info(`[Agent Stream] Using Agno Agent stream with model ${modelConfig.model}`);

                    // Get conversation history
                    const history = stockAgent.getHistory(sid);

                    // Store user message in history
                    if (!stockAgent.conversations) stockAgent.conversations = new Map();
                    if (!stockAgent.conversations.has(sid)) stockAgent.conversations.set(sid, []);
                    stockAgent.conversations.get(sid).push({ role: 'user', content: message.trim() });

                    const pythonStream = await pythonClient.runAgentChatStream(
                        message.trim(),
                        {
                            apiKey: modelConfig.apiKey,
                            baseUrl: modelConfig.baseUrl,
                            model: modelConfig.model,
                            temperature: modelConfig.temperature || 0.7,
                            maxTokens: modelConfig.maxTokens || 4096,
                        },
                        history.slice(-10)
                    );

                    // Pipe SSE events from Python to the client
                    let fullContent = '';
                    const decoder = new TextDecoder();
                    let buffer = '';

                    for await (const chunk of pythonStream) {
                        buffer += decoder.decode(chunk, { stream: true });

                        // Process complete SSE lines from buffer
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || ''; // Keep incomplete line in buffer

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const dataStr = line.slice(6);
                                try {
                                    const data = JSON.parse(dataStr);

                                    // Track full content for history
                                    if (data.type === 'content' && data.delta) {
                                        fullContent += data.delta;
                                    }
                                    if (data.type === 'done' && data.content) {
                                        fullContent = data.content;
                                    }
                                } catch (_) {
                                    // JSON parse error, just forward as-is
                                }

                                // Forward every SSE event to the client
                                res.write(`data: ${dataStr}\n\n`);
                            }
                        }
                    }

                    // Save complete response to conversation history
                    if (fullContent) {
                        stockAgent.conversations.get(sid)?.push({ role: 'assistant', content: fullContent });
                    }

                    res.end();
                    return;
                } catch (err) {
                    logger.warn(`[Agent Stream] Agno stream failed: ${err.message}, falling back to manual flow`);
                    // Continue to fallback strategy below
                    res.write(`data: ${JSON.stringify({ type: 'status', content: '⚠️ Agno 流式失败，切换到备用方案...' })}\n\n`);
                }
            }
        }

        // ─── Strategy 2: Manual tool-calling stream (fallback) ───────
        for await (const event of stockAgent.chatStream(sid, message.trim(), modelName)) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    } catch (error) {
        logger.error('[Agent Route] Stream error:', error.message);
        // If headers already sent, try to send error as SSE event
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
            res.end();
        } else {
            res.status(500).json({ success: false, message: error.message });
        }
    }
});

/**
 * GET /api/agent/history/:sessionId
 * 
 * Retrieve conversation history for a session.
 */
router.get('/history/:sessionId', authenticateToken, (req, res) => {
    const history = stockAgent.getHistory(req.params.sessionId);
    res.json({
        success: true,
        sessionId: req.params.sessionId,
        messages: history
    });
});

/**
 * DELETE /api/agent/history/:sessionId
 * 
 * Clear conversation history for a session.
 */
router.delete('/history/:sessionId', authenticateToken, (req, res) => {
    stockAgent.clearSession(req.params.sessionId);
    res.json({
        success: true,
        message: '对话历史已清除'
    });
});

/**
 * GET /api/agent/suggestions
 * 
 * Get suggested prompts for the UI.
 */
router.get('/suggestions', (req, res) => {
    res.json({
        success: true,
        suggestions: stockAgent.getSuggestions()
    });
});

module.exports = router;
