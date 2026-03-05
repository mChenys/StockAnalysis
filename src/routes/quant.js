const express = require('express');
const router = express.Router();
const { getVNPYClient } = require('../services/vnpyClient');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const {
    validateDepositRequest,
    validateOrderRequest,
    validateStrategyRequest,
    validateGatewayParam,
    validateOrderIdParam,
    validateStrategyNameParam
} = require('../middleware/quantValidation');

// 获取 VNPY 客户端
const vnpy = getVNPYClient();

/**
 * 检查 VNPY 服务状态
 */
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const available = await vnpy.isAvailable();
        const health = available ? await vnpy.getHealth() : { status: 'offline' };
        res.json({ success: true, available, health });
    } catch (error) {
        logger.error('VNPY status check error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check VNPY service status'
        });
    }
});

/**
 * 获取账户信息
 */
router.get('/account/:gateway', authenticateToken, validateGatewayParam, async (req, res) => {
    try {
        const account = await vnpy.getAccount(req.params.gateway);
        res.json({ success: true, data: account });
    } catch (error) {
        logger.error('Get account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve account information'
        });
    }
});

/**
 * 模拟入金
 */
router.post('/account/deposit', authenticateToken, validateDepositRequest, async (req, res) => {
    try {
        const { gateway, amount } = req.body;
        const result = await vnpy.deposit(gateway, amount);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Deposit error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process deposit'
        });
    }
});

/**
 * 获取持仓信息
 */
router.get('/positions/:gateway', authenticateToken, validateGatewayParam, async (req, res) => {
    try {
        const positions = await vnpy.getPositions(req.params.gateway);
        res.json({ success: true, data: positions });
    } catch (error) {
        logger.error('Get positions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve positions'
        });
    }
});

/**
 * 下单
 */
router.post('/order', authenticateToken, validateOrderRequest, async (req, res) => {
    try {
        const order = await vnpy.sendOrder(req.body);
        res.json({ success: true, data: order });
    } catch (error) {
        logger.error('Send order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit order'
        });
    }
});

/**
 * 撤单
 */
router.delete('/order/:gateway/:orderId', authenticateToken, [validateGatewayParam, validateOrderIdParam], async (req, res) => {
    try {
        const result = await vnpy.cancelOrder(req.params.gateway, req.params.orderId);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Cancel order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order'
        });
    }
});

/**
 * 列出所有订单
 */
router.get('/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await vnpy.listOrders();
        res.json({ success: true, data: orders });
    } catch (error) {
        logger.error('List orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve orders'
        });
    }
});

/**
 * 策略列表
 */
router.get('/strategies', authenticateToken, async (req, res) => {
    try {
        const strategies = await vnpy.listStrategies();
        res.json({ success: true, data: strategies });
    } catch (error) {
        logger.error('List strategies error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve strategies'
        });
    }
});

/**
 * 创建策略
 */
router.post('/strategies', authenticateToken, validateStrategyRequest, async (req, res) => {
    try {
        const strategy = await vnpy.createStrategy(req.body);
        res.json({ success: true, data: strategy });
    } catch (error) {
        logger.error('Create strategy error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create strategy'
        });
    }
});

/**
 * 启动策略
 */
router.post('/strategies/:name/start', authenticateToken, validateStrategyNameParam, async (req, res) => {
    try {
        const result = await vnpy.startStrategy(req.params.name);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Start strategy error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start strategy'
        });
    }
});

/**
 * 停止策略
 */
router.post('/strategies/:name/stop', authenticateToken, validateStrategyNameParam, async (req, res) => {
    try {
        const result = await vnpy.stopStrategy(req.params.name);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Stop strategy error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop strategy'
        });
    }
});

/**
 * 获取策略信号
 */
router.get('/strategies/:name/signals', authenticateToken, validateStrategyNameParam, async (req, res) => {
    try {
        const signals = await vnpy.getStrategySignals(req.params.name);
        res.json({ success: true, data: signals });
    } catch (error) {
        logger.error('Get strategy signals error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve strategy signals'
        });
    }
});

/**
 * 运行回测
 */
router.post('/backtest/run', authenticateToken, async (req, res) => {
    try {
        // Add basic validation for backtest parameters
        const { strategy_name, symbol, start_date, end_date, capital } = req.body;

        if (!strategy_name || typeof strategy_name !== 'string' || strategy_name.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Invalid strategy name'
            });
        }

        if (!symbol || typeof symbol !== 'string' || !/^[A-Z][A-Z0-9]{0,9}$/.test(symbol)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid symbol format'
            });
        }

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start and end dates are required'
            });
        }

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format'
            });
        }

        if (startDate > endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date must be before end date'
            });
        }

        if (!capital || typeof capital !== 'number' || capital <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid capital amount'
            });
        }

        const result = await vnpy.runBacktest(req.body);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Run backtest error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to run backtest'
        });
    }
});

module.exports = router;
