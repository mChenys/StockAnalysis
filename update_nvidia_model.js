const mongoose = require('mongoose');
const ModelConfig = require('./src/database/models/ModelConfig');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stock_analysis');
        
        let models = await ModelConfig.find();
        console.log('Current models:', JSON.stringify(models, null, 2));

        const targetModelName = 'NIM - llama-3.1-nemotron-70b-instruct';
        let model = await ModelConfig.findOne({ name: targetModelName });
        
        if (model) {
            model.apiKey = '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';
            model.provider = 'openai';
            model.baseUrl = 'https://integrate.api.nvidia.com/v1';
            model.model = 'nvidia/llama-3.1-nemotron-70b-instruct';
            await model.save();
            console.log('Updated model:', model.name);
        } else {
            console.log('Model not found, creating new one...');
            model = new ModelConfig({
                name: targetModelName,
                provider: 'openai',
                apiKey: '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',
                baseUrl: 'https://integrate.api.nvidia.com/v1',
                model: 'nvidia/llama-3.1-nemotron-70b-instruct',
                maxTokens: 4096,
                temperature: 0.7,
                active: true
            });
            await model.save();
            console.log('Created model:', model.name);
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
