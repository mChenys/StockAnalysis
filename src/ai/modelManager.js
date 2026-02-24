const axios = require('axios');
const logger = require('../utils/logger');

class AIModelManager {
    constructor() {
        this.models = new Map();
    }

    /**
     * 强制从存储同步所有模型到内存
     */
    async loadModels() {
        try {
            const ModelConfig = require('../database/models/ModelConfig');
            // 加载所有模型，不在此处过滤 active: true，以便管理界面能显示全部
            let configs = await ModelConfig.find();
            
            this.models.clear();

            if (configs && configs.length > 0) {
                configs.forEach(config => {
                    this.models.set(config.name, {
                        name: config.name,
                        provider: config.provider,
                        apiKey: config.apiKey,
                        baseUrl: config.baseUrl,
                        model: config.model,
                        maxTokens: config.maxTokens || 4000,
                        temperature: config.temperature || 0.7,
                        active: config.active !== false // 默认为 true
                    });
                });
            }

            // Always ensure NVIDIA NIM model is present
            this.models.set('NIM - llama-3.1-nemotron-70b-instruct', {
                name: 'NIM - llama-3.1-nemotron-70b-instruct',
                provider: 'openai',
                apiKey: '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',
                baseUrl: 'https://integrate.api.nvidia.com/v1',
                model: 'meta/llama-3.1-70b-instruct',
                maxTokens: 4096,
                temperature: 0.7,
                active: true
            });

            logger.info(`✅ System synchronized ${this.models.size} AI nodes.`);
        } catch (error) {
            logger.error('Sync failed:', error.message);
        }
    }

    async addModel(config) {
        const { name, provider, apiKey, model } = config;
        if (!name || !provider || !model) {
            throw new Error('缺少必填字段: name, provider, model 为必填项');
        }
        if (provider !== 'mock' && !apiKey) {
            throw new Error('缺少 API Key，非 mock 模式下 API Key 为必填');
        }

        if (config.baseUrl) config.baseUrl = config.baseUrl.trim();

        // 连接测试（可跳过，用户可以后续手动测试）
        if (config.skipTest !== true && provider !== 'mock') {
            try {
                const isValid = await this.testModelConnection(config);
                if (!isValid) {
                    logger.warn(`模型 ${name} 连接测试未通过，但仍会保存配置。请稍后手动测试。`);
                }
            } catch (testError) {
                logger.warn(`模型 ${name} 连接测试异常: ${testError.message}，配置仍会保存。`);
            }
        }

        // 持久化到存储
        const ModelConfig = require('../database/models/ModelConfig');
        const modelConfig = new ModelConfig({
            ...config,
            active: config.active !== false
        });
        await modelConfig.save();

        // 3. 立即热更新内存
        await this.loadModels();
        
        return true;
    }

    async testModelConnection(config) {
        if (config.provider === 'mock') return true;
        try {
            // 注意：测试时直接传入配置对象，避开内存 Map 还没更新的问题
            const response = await this.callModel(config, "Connection Test");
            return response && response.length > 0;
        } catch (error) {
            logger.error(`Test failed for ${config.name}:`, error.message);
            return false;
        }
    }

    async callModel(modelIdentifier, prompt, options = {}) {
        // 支持传入名称(string)或直接传入配置对象(object)
        const config = typeof modelIdentifier === 'string' ? this.models.get(modelIdentifier) : modelIdentifier;
        
        if (!config) throw new Error(`Model not found or inactive`);
        if (typeof modelIdentifier === 'string' && config.active === false) {
            throw new Error(`Model ${modelIdentifier} is currently disabled`);
        }

        try {
            switch (config.provider.toLowerCase()) {
                case 'openai': return await this.callOpenAI(config, prompt, options);
                case 'mock': return "Mock Success";
                default: throw new Error(`Provider ${config.provider} not supported`);
            }
        } catch (error) {
            logger.error(`AI Engine Error:`, error.message);
            throw error;
        }
    }

    async callOpenAI(config, prompt, options) {
        logger.info(`[ModelManager] Config info: name=${config.name}, baseUrl=${config.baseUrl}, model=${config.model}`);
        let baseUrl = (config.baseUrl || 'https://api.openai.com/v1').trim();
        // Remove trailing slash for consistency
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.substring(0, baseUrl.length - 1);
        }

        // Determine the final endpoint
        let endpoint;
        if (baseUrl.includes('/chat/completions')) {
            endpoint = baseUrl;
        } else if (baseUrl.endsWith('/v1') || baseUrl.includes('openai')) {
            // Already has v1 or is an openai-compatible path that likely just needs chat/completions
            endpoint = `${baseUrl}/chat/completions`;
        } else {
            // Default to appending v1
            endpoint = `${baseUrl}/v1/chat/completions`;
        }

        logger.info(`[ModelManager] Calling AI endpoint: ${endpoint} for model: ${config.model}`);

        const response = await axios.post(endpoint, {
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.maxTokens || config.maxTokens,
            temperature: options.temperature || config.temperature
        }, {
            headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
            timeout: 120000
        });

        return response.data.choices[0].message.content;
    }

    getModels() {
        return Array.from(this.models.values()).map(m => ({
            name: m.name,
            provider: m.provider,
            model: m.model,
            active: m.active
        }));
    }

    /**
     * Get full model configuration by name (including apiKey, baseUrl).
     * Used by Agno Agent integration to pass credentials to Python service.
     */
    getModelConfig(modelName) {
        const model = this.models.get(modelName);
        if (!model) return null;
        return {
            name: model.name,
            provider: model.provider,
            apiKey: model.apiKey,
            baseUrl: model.baseUrl,
            model: model.model,
            temperature: model.temperature || 0.7,
            maxTokens: model.maxTokens || 4096,
            active: model.active,
        };
    }

    async removeModel(modelName) {
        const ModelConfig = require('../database/models/ModelConfig');
        await ModelConfig.deleteOne({ name: modelName });
        await this.loadModels(); // 重新同步
    }
}

module.exports = new AIModelManager();
