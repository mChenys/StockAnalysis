/**
 * AI模型管理器
 * 支持多种AI服务提供商：OpenAI、Claude、Gemini、智谱等
 */

const axios = require('axios');
const logger = require('../utils/logger');

class AIModelManager {
    constructor() {
        this.models = new Map(); // 存储配置的AI模型
        // 不要在这里自动加载，由 app.js 显式调用
    }

    /**
     * 加载已配置的AI模型
     */
    async loadModels() {
        try {
            const ModelConfig = require('../database/models/ModelConfig');
            
            // 只有非内存模式才去尝试数据库查询
            const configs = await ModelConfig.find({ active: true });
            
            if (configs && configs.length > 0) {
                configs.forEach(config => {
                    this.models.set(config.name, {
                        provider: config.provider,
                        apiKey: config.apiKey,
                        baseUrl: config.baseUrl,
                        model: config.model,
                        maxTokens: config.maxTokens || 4000,
                        temperature: config.temperature || 0.7,
                        active: config.active
                    });
                });
            }
            
            logger.info(`Loaded ${this.models.size} AI models`);
        } catch (error) {
            logger.error('Failed to load AI models:', error);
        }
    }

    /**
     * 添加AI模型配置
     */
    async addModel(config) {
        const { name, provider, apiKey, model } = config;
        
        if (!name || !provider || (!apiKey && provider !== 'mock') || !model) {
            throw new Error('Missing required model configuration');
        }

        const isValid = await this.testModelConnection(config);
        if (!isValid) {
            throw new Error('Model connection test failed');
        }

        const ModelConfig = require('../database/models/ModelConfig');
        const modelConfig = new ModelConfig(config);
        await modelConfig.save();

        this.models.set(name, {
            ...config,
            active: config.active !== undefined ? config.active : true
        });
        
        logger.info(`AI model ${name} added successfully`);
        return true;
    }

    /**
     * 测试模型连接
     */
    async testModelConnection(config) {
        if (config.provider === 'mock') return true;
        try {
            const response = await this.callModel(config, "Hello, this is a test message.");
            return response && response.length > 0;
        } catch (error) {
            logger.error(`Model connection test failed for ${config.name}:`, error.message);
            return false;
        }
    }

    /**
     * 调用AI模型
     */
    async callModel(modelName, prompt, options = {}) {
        const config = typeof modelName === 'string' ? this.models.get(modelName) : modelName;
        
        if (!config) {
            throw new Error(`Model ${modelName} not found`);
        }

        try {
            switch (config.provider.toLowerCase()) {
                case 'openai':
                    return await this.callOpenAI(config, prompt, options);
                case 'claude':
                    return await this.callClaude(config, prompt, options);
                case 'gemini':
                    return await this.callGemini(config, prompt, options);
                case 'zhipu':
                    return await this.callZhipu(config, prompt, options);
                case 'mock':
                    return await this.callMock(config, prompt, options);
                default:
                    throw new Error(`Unsupported provider: ${config.provider}`);
            }
        } catch (error) {
            logger.error(`AI model call failed:`, error.message);
            throw error;
        }
    }

    /**
     * 调用OpenAI API
     */
    async callOpenAI(config, prompt, options) {
        const baseUrl = config.baseUrl || 'https://api.openai.com';
        const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
        
        try {
            const response = await axios.post(endpoint, {
                model: config.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: options.maxTokens || config.maxTokens,
                temperature: options.temperature || config.temperature
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            if (error.response) {
                logger.error(`OpenAI API Error (${endpoint}):`, {
                    status: error.response.status,
                    data: error.response.data
                });
            } else {
                logger.error(`OpenAI Request Failed (${endpoint}):`, error.message);
            }
            throw error;
        }
    }

    /**
     * 调用Claude API
     */
    async callClaude(config, prompt, options) {
        const response = await axios.post(`${config.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
            model: config.model,
            max_tokens: options.maxTokens || config.maxTokens,
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'x-api-key': config.apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            },
            timeout: 60000
        });

        return response.data.content[0].text;
    }

    /**
     * 调用Gemini API
     */
    async callGemini(config, prompt, options) {
        const response = await axios.post(`${config.baseUrl || 'https://generativelanguage.googleapis.com'}/v1/models/${config.model}:generateContent?key=${config.apiKey}`, {
            contents: [{
                parts: [{ text: prompt }]
            }]
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });

        return response.data.candidates[0].content.parts[0].text;
    }

    /**
     * 调用智谱API
     */
    async callZhipu(config, prompt, options) {
        const response = await axios.post(`${config.baseUrl || 'https://open.bigmodel.cn'}/api/paas/v4/chat/completions`, {
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.maxTokens || config.maxTokens,
            temperature: options.temperature || config.temperature
        }, {
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });

        return response.data.choices[0].message.content;
    }

    /**
     * Mock 调用，用于在缺失外部 API 时快速验证端到端流程。
     */
    async callMock(config, prompt, options) {
        const snippet = prompt ? prompt.substring(0, 120) : 'mock';
        return `Mock analysis result for prompt: ${snippet} ...`;
    }

    /**
     * 获取所有模型列表
     */
    getModels() {
        return Array.from(this.models.entries()).map(([name, config]) => ({
            name,
            provider: config.provider,
            model: config.model,
            active: config.active
        }));
    }

    /**
     * 删除模型
     */
    async removeModel(modelName) {
        const ModelConfig = require('../database/models/ModelConfig');
        await ModelConfig.deleteOne({ name: modelName });
        this.models.delete(modelName);
        logger.info(`AI model ${modelName} removed`);
    }
}

module.exports = new AIModelManager();
