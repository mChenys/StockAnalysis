/**
 * 数据库连接管理
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.connection = null;
    }

    async connect() {
        try {
            const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_analysis';
            
            this.connection = await mongoose.connect(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
            });

            logger.info('MongoDB connected successfully');
            return this.connection;
            
        } catch (error) {
            // 在开发环境下，如果没开 MongoDB 是预期行为，记录为警告而非错误
            logger.warn('MongoDB not found, switching to In-Memory mode.');
            
            this.connection = { inMemory: true };
            global.isInMemory = true;
            return this.connection;
        }
    }

    async disconnect() {
        if (this.connection && !this.connection.inMemory) {
            await mongoose.disconnect();
            logger.info('MongoDB disconnected');
        }
    }

    isConnected() {
        return this.connection !== null;
    }
}

module.exports = new Database();
