const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const database = require('./database/connection');

async function createApp() {
    try {
        await database.connect();
        
        const modelManager = require('./ai/modelManager');
        const aiAnalyzer = require('./analyzer/aiAnalyzer');
        const scheduler = require('./scheduler/taskScheduler');

        const app = express();
        const server = http.createServer(app);
        const io = socketIo(server, {
            cors: { origin: "*", methods: ["GET", "POST"] }
        });

        app.use(helmet({ contentSecurityPolicy: {
            directives: {
                defaultSrc: ["*"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "*"],
                styleSrc: ["'self'", "'unsafe-inline'", "*"],
                imgSrc: ["*", "data:"],
                connectSrc: ["*"],
                fontSrc: ["*", "data:"],
            },
        } }));
        app.use(cors());
        app.use(express.json({ limit: '10mb' }));
        app.use(express.urlencoded({ extended: true }));
        app.use(express.static('public'));

        global.io = io;

        io.on('connection', (socket) => {
            logger.info(`Client connected: ${socket.id}`);
            socket.on('request_analysis', async (data) => {
                try {
                    const result = await aiAnalyzer.analyzeStock(data.symbol, data.analysisType);
                    socket.emit('analysis_result', result);
                } catch (error) {
                    socket.emit('analysis_error', { message: error.message });
                }
            });
            socket.on('subscribe_quote', async (data) => {
                try {
                    const vnpy = getVNPYClient();
                    vnpy.subscribeQuotes(data.gateway, data.symbols);
                } catch (error) {
                    logger.error(`Failed to subscribe quote: ${error.message}`);
                }
            });
        });

        app.use('/api/auth', require('./routes/auth'));
        app.use('/api/users', require('./routes/users'));
        app.use('/api/news', require('./routes/news'));
        app.use('/api/agent', require('./routes/agent'));
        app.use('/api/tasks', require('./routes/tasks'));
        app.use('/api/quant', require('./routes/quant'));
        app.use('/api', require('./routes/api'));

        // 开发模式状态接口
        app.get('/api/dev/status', (req, res) => {
            res.json({ devMode: global.isInMemory });
        });

        // 桥接 VNPY 行情到 Socket.io
        const { getVNPYClient } = require('./services/vnpyClient');
        const vnpyClient = getVNPYClient();
        vnpyClient.on('tick', (tick) => {
            if (global.io) {
                logger.info(`Emitting quote_tick for ${tick.symbol}: ${tick.last_price}`);
                global.io.emit('quote_tick', tick);
            }
        });

        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        app.get('/agent', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/agent.html'));
        });

        await modelManager.loadModels();
        // 如果不是测试环境，启动调度器
        if (process.env.NODE_ENV !== 'test') {
            scheduler.start();
            require('./services/cronManager').init();
        }

        return { app, server, database, scheduler };
    } catch (error) {
        logger.error('App creation failed:', error);
        throw error;
    }
}

// 自动启动逻辑
if (process.env.NODE_ENV !== 'test') {
    createApp().then(({ server }) => {
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            logger.info(`🚀 System started on port ${PORT} (Mode: ${global.isInMemory ? 'In-Memory' : 'MongoDB'})`);
        });

        process.on('SIGINT', async () => {
            // 我们需要获取到之前创建的实例来优雅关闭
            process.exit(0);
        });
    });
}

module.exports = createApp;
