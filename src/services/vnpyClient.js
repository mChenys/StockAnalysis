/**
 * VNPY Trading Service Client
 * Provides Node.js interface to the VNPY Python trading service.
 *
 * Features:
 * - Account and position queries
 * - Order placement and cancellation
 * - Real-time quote subscription via WebSocket
 * - Strategy management (create, start, stop)
 */

const axios = require('axios');
const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../utils/logger');

const VNPY_SERVICE_URL = process.env.VNPY_SERVICE_URL || 'http://127.0.0.1:8002';
const VNPY_WS_URL = process.env.VNPY_WS_URL || 'ws://127.0.0.1:8002';
const DEFAULT_TIMEOUT = 30000;

/**
 * VNPY Trading Client
 *
 * @example
 * const vnpy = new VNPYClient();
 *
 * // Get account info
 * const account = await vnpy.getAccount('FUTU');
 *
 * // Place order
 * const order = await vnpy.sendOrder({
 *   gateway: 'FUTU',
 *   symbol: 'AAPL',
 *   direction: 'buy',
 *   volume: 100,
 *   price: 180.0
 * });
 *
 * // Subscribe quotes
 * vnpy.subscribeQuotes('FUTU', ['AAPL', 'MSFT'], (tick) => {
 *   console.log(tick);
 * });
 */
class VNPYClient extends EventEmitter {
    constructor(options = {}) {
        super();

        this.baseUrl = options.baseUrl || VNPY_SERVICE_URL;
        this.wsUrl = options.wsUrl || VNPY_WS_URL;
        this.timeout = options.timeout || DEFAULT_TIMEOUT;

        this._ws = null;
        this._reconnectInterval = 5000;
        this._subscribedSymbols = new Set();
    }

    // ─── Health & Gateway ────────────────────────────────────────

    /**
     * Check if VNPY service is available
     */
    async isAvailable() {
        try {
            const res = await this._request('get', '/health', null, 3000);
            return res.status === 'healthy';
        } catch {
            return false;
        }
    }

    /**
     * Get service health status
     */
    async getHealth() {
        return this._request('get', '/health');
    }

    /**
     * List all gateways
     */
    async listGateways() {
        return this._request('get', '/gateway/list');
    }

    /**
     * Connect to a gateway
     * @param {string} gateway - Gateway name (FUTU, OST)
     * @param {object} config - Connection config
     */
    async connectGateway(gateway, config = {}) {
        return this._request('post', '/gateway/connect', { gateway, config });
    }

    /**
     * Disconnect from a gateway
     * @param {string} gateway - Gateway name
     */
    async disconnectGateway(gateway) {
        return this._request('post', `/gateway/disconnect/${gateway}`);
    }

    // ─── Account & Position ────────────────────────────────────────

    /**
     * Get account info
     * @param {string} gateway - Gateway name
     */
    async getAccount(gateway) {
        return this._request('get', `/api/account/${gateway}`);
    }

    /**
     * Deposit funds (simulated)
     * @param {string} gateway - Gateway name
     * @param {number} amount - Amount to deposit
     */
    async deposit(gateway, amount) {
        return this._request('post', '/api/account/deposit', { gateway, amount });
    }

    /**
     * Get positions
     * @param {string} gateway - Gateway name
     */
    async getPositions(gateway) {
        return this._request('get', `/api/account/${gateway}/positions`);
    }

    // ─── Orders ────────────────────────────────────────

    /**
     * Send an order
     * @param {object} params - Order parameters
     * @param {string} params.gateway - Gateway name (FUTU, OST)
     * @param {string} params.symbol - Stock symbol
     * @param {string} params.direction - 'buy' or 'sell'
     * @param {number} params.volume - Quantity
     * @param {number} [params.price=0] - Price (0 for market order)
     * @param {string} [params.orderType='limit'] - 'limit' or 'market'
     */
    async sendOrder(params) {
        return this._request('post', '/api/order', {
            gateway: params.gateway,
            symbol: params.symbol,
            direction: params.direction,
            volume: params.volume,
            price: params.price || 0,
            order_type: params.orderType || 'limit'
        });
    }

    /**
     * Cancel an order
     * @param {string} gateway - Gateway name
     * @param {string} orderId - Order ID
     */
    async cancelOrder(gateway, orderId) {
        return this._request('delete', `/api/order/${gateway}/${orderId}`);
    }

    /**
     * Get order info
     * @param {string} orderId - Order ID
     */
    async getOrder(orderId) {
        return this._request('get', `/api/order/${orderId}`);
    }

    /**
     * List all orders
     */
    async listOrders() {
        return this._request('get', '/api/order/list');
    }

    // ─── Quotes ────────────────────────────────────────

    /**
     * Subscribe to quotes
     * @param {string} gateway - Gateway name
     * @param {string[]} symbols - Symbols to subscribe
     * @param {function} callback - Callback for tick data
     */
    subscribeQuotes(gateway, symbols, callback) {
        // Connect WebSocket if not connected
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
            this._connectWebSocket(gateway, () => {
                this._sendSubscribe(symbols, callback);
            });
        } else {
            this._sendSubscribe(symbols, callback);
        }
    }

    /**
     * Unsubscribe from quotes
     * @param {string[]} symbols - Symbols to unsubscribe
     */
    unsubscribeQuotes(symbols) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({
                action: 'unsubscribe',
                symbols
            }));
            symbols.forEach(s => this._subscribedSymbols.delete(s));
        }
    }

    /**
     * Get mock quote (for testing)
     * @param {string} symbol - Stock symbol
     */
    async getMockQuote(symbol) {
        return this._request('get', `/api/quote/mock/${symbol}`);
    }

    // ─── Strategy Management ────────────────────────────────────────

    /**
     * Create an AI strategy
     * @param {object} params - Strategy parameters
     * @param {string} params.name - Strategy name
     * @param {string[]} params.symbols - Trading symbols
     * @param {string} params.gateway - Gateway name
     * @param {object} [params.params] - Strategy params
     */
    async createStrategy(params) {
        return this._request('post', '/strategy', {
            name: params.name,
            symbols: params.symbols,
            gateway: params.gateway,
            params: params.params || {}
        });
    }

    /**
     * List all strategies
     */
    async listStrategies() {
        return this._request('get', '/strategy/list');
    }

    /**
     * Start a strategy
     * @param {string} name - Strategy name
     */
    async startStrategy(name) {
        return this._request('post', `/strategy/${name}/start`);
    }

    /**
     * Stop a strategy
     * @param {string} name - Strategy name
     */
    async stopStrategy(name) {
        return this._request('post', `/strategy/${name}/stop`);
    }

    /**
     * Get strategy signals
     * @param {string} name - Strategy name
     */
    async getStrategySignals(name) {
        return this._request('get', `/strategy/${name}/signals`);
    }

    /**
     * Delete a strategy
     * @param {string} name - Strategy name
     */
    async deleteStrategy(name) {
        return this._request('delete', `/strategy/${name}`);
    }

    /**
     * Run a backtest
     * @param {object} params - Backtest parameters
     */
    async runBacktest(params) {
        return this._request('post', '/api/backtest/run', params);
    }

    // ─── WebSocket ────────────────────────────────────────

    _connectWebSocket(gateway, onOpen) {
        const wsUrl = `${this.wsUrl}/api/quote/ws/${gateway}`;

        this._ws = new WebSocket(wsUrl);

        this._ws.on('open', () => {
            logger.info('[VNPYClient] WebSocket connected');
            this.emit('connected');
            if (onOpen) onOpen();
        });

        this._ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());

                if (msg.type === 'tick') {
                    this.emit('tick', msg);
                } else if (msg.type === 'subscribed') {
                    logger.info(`[VNPYClient] Subscribed: ${msg.symbols.join(', ')}`);
                } else if (msg.type === 'error') {
                    logger.error(`[VNPYClient] WebSocket error: ${msg.message}`);
                }
            } catch (e) {
                logger.error(`[VNPYClient] Parse error: ${e.message}`);
            }
        });

        this._ws.on('error', (error) => {
            logger.error(`[VNPYClient] WebSocket error: ${error.message}`);
            this.emit('error', error);
        });

        this._ws.on('close', () => {
            logger.info('[VNPYClient] WebSocket disconnected');
            this.emit('disconnected');

            // Auto reconnect
            setTimeout(() => {
                if (this._subscribedSymbols.size > 0) {
                    logger.info('[VNPYClient] Attempting reconnect...');
                    this._connectWebSocket(gateway, () => {
                        this._sendSubscribe([...this._subscribedSymbols]);
                    });
                }
            }, this._reconnectInterval);
        });
    }

    _sendSubscribe(symbols, callback) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({
                action: 'subscribe',
                symbols
            }));

            symbols.forEach(s => this._subscribedSymbols.add(s));

            if (callback) {
                this.on('tick', callback);
            }
        }
    }

    /**
     * Close WebSocket connection
     */
    close() {
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
    }

    // ─── HTTP Helper ────────────────────────────────────────

    async _request(method, path, data = null, timeout = null) {
        const url = `${this.baseUrl}${path}`;
        const config = {
            method,
            url,
            timeout: timeout || this.timeout
        };

        if (data && (method === 'post' || method === 'put' || method === 'patch')) {
            config.data = data;
        }

        try {
            const res = await axios(config);
            return res.data;
        } catch (error) {
            if (error.response) {
                throw new Error(`VNPY Error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }
}

// Singleton instance
let _vnpyClient = null;

/**
 * Get the VNPY client singleton
 */
function getVNPYClient() {
    if (!_vnpyClient) {
        _vnpyClient = new VNPYClient();
    }
    return _vnpyClient;
}

module.exports = {
    VNPYClient,
    getVNPYClient,
    VNPY_SERVICE_URL,
    VNPY_WS_URL
};