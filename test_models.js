const mongoose = require('mongoose');
const ModelConfig = require('./src/database/models/ModelConfig');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stock-analysis');
    const models = await ModelConfig.find();
    console.log(JSON.stringify(models, null, 2));
    process.exit(0);
}
run().catch(console.error);
