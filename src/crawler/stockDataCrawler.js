/**
 * 股票数据爬虫
 * 支持多个数据源：Alpha Vantage、Yahoo Finance、新浪财经等
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

class StockDataCrawler {
    constructor() {
        this.dataSources = {
            alphavantage: {
                baseUrl: 'https://www.alphavantage.co/query',
                apiKey: process.env.ALPHA_VANTAGE_API_KEY
            },
            yahoo: {
                baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart'
            },
            sina: {
                baseUrl: 'https://hq.sinajs.cn/list='
            },
            eastmoney: {
                baseUrl: 'https://push2.eastmoney.com/api/qt/stock/get'
            }
        };
        
        this.cache = new Map(); // 简单缓存机制
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
    }

    /**
     * 获取股票实时价格（自动多源降级）
     */
    async getRealTimePrice(symbol, source = 'auto') {
        const cacheKey = `price_${symbol}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        // 定义数据源优先级（自动降级）
        const sources = source === 'auto'
            ? ['yfinance', 'yahoo', 'yahoo_v2', 'sina', 'eastmoney']
            : [source];

        const errors = [];
        for (const src of sources) {
            try {
                let data;
                switch (src) {
                    case 'yfinance': data = await this.getYfinancePrice(symbol); break;
                    case 'yahoo': data = await this.getYahooPrice(symbol); break;
                    case 'yahoo_v2': data = await this.getYahooPriceV2(symbol); break;
                    case 'sina': data = await this.getSinaPrice(symbol); break;
                    case 'eastmoney': data = await this.getEastMoneyPrice(symbol); break;
                    default: data = await this.getYahooPrice(symbol);
                }
                if (data) {
                    logger.info(`[Crawler] Got price for ${symbol} via ${src}`);
                    this.setCache(cacheKey, data);
                    return data;
                } else {
                    throw new Error(`Provider ${src} returned empty data`);
                }
            } catch (err) {
                errors.push(`${src}: ${err.message}`);
                logger.warn(`[Crawler] ${src} failed for ${symbol}: ${err.message}, trying next source...`);
            }
        }

        throw new Error(`所有数据源均无法获取 ${symbol} 的价格数据: ${errors.join('; ')}`);
    }

    /**
     * 从本地 Python 服务获取价格 (yfinance)
     */
    async getYfinancePrice(symbol) {
        const yfSymbol = this.convertToYfinanceSymbol(symbol);
        const response = await axios.post(
            `http://localhost:8000/api/stock/price`,
            { symbol: yfSymbol },
            { timeout: 15000 }
        );
        if (!response.data || !response.data.success) {
            throw new Error("Python yfinance service returned failure");
        }
        const data = response.data.data;
        if (!data.currentPrice) {
            throw new Error("yfinance returned empty price");
        }

        let changePercent = '0.00';
        if (data.previousClose && data.currentPrice) {
            changePercent = (((data.currentPrice - data.previousClose) / data.previousClose) * 100).toFixed(2);
        }

        return {
            symbol: data.symbol,
            currentPrice: data.currentPrice,
            session: this.getMarketSession({}),
            previousClose: data.previousClose,
            changePercent: changePercent,
            volume: data.volume,
            marketCap: data.marketCap,
            high: data.currentPrice, // Simplified
            low: data.currentPrice,  // Simplified
            timestamp: new Date(),
            source: 'yfinance_direct'
        };
    }

    /**
     * 根据美东时间精准判定当前市场时段
     */
    getMarketSession(meta) {
        const now = new Date();
        // 获取美东当前小时和分钟
        const etString = now.toLocaleString("en-US", {timeZone: "America/New_York", hour12: false});
        const [date, time] = etString.split(', ');
        const [hour, min] = time.split(':').map(Number);
        const timeVal = hour * 100 + min; // 转换为 0-2400 格式

        // 基础时段判定逻辑 (美东时间)
        if (timeVal >= 400 && timeVal < 930) return '盘前';
        if (timeVal >= 930 && timeVal < 1600) return '盘中';
        if (timeVal >= 1600 && timeVal < 2000) return '盘后';
        if (timeVal >= 2000 || timeVal < 400) return '夜盘';

        return '常规';
    }

    async getYahooPrice(symbol) {
        const response = await axios.get(
            `${this.dataSources.yahoo.baseUrl}/${symbol}`,
            {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'application/json,text/html,*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate',
                    'Origin': 'https://finance.yahoo.com',
                    'Referer': 'https://finance.yahoo.com/'
                }
            }
        );

        const result = response.data.chart.result[0];
        const meta = result.meta;
        const quote = result.indicators.quote[0];

        const session = this.getMarketSession(meta);

        let currentPrice = meta.regularMarketPrice;
        if (session === '盘前') currentPrice = meta.preMarketPrice || currentPrice;
        if (session === '盘后' || session === '夜盘') currentPrice = meta.postMarketPrice || meta.extendedMarketPrice || currentPrice;

        let changePercent = '0.00';
        if (meta.previousClose) {
            changePercent = ((currentPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2);
        }

        return {
            symbol, currentPrice, session,
            previousClose: meta.previousClose,
            changePercent,
            volume: quote.volume ? quote.volume[quote.volume.length - 1] : 0,
            marketCap: meta.marketCap,
            high: meta.regularMarketDayHigh,
            low: meta.regularMarketDayLow,
            timestamp: new Date(),
            source: 'yahoo_v8'
        };
    }

    /**
     * Yahoo Finance 备用方案：使用 quote summary API
     */
    async getYahooPriceV2(symbol) {
        const response = await axios.get(
            `https://query1.finance.yahoo.com/v6/finance/quote`,
            {
                params: {
                    symbols: symbol,
                    lang: 'en-US',
                    region: 'US'
                },
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Origin': 'https://finance.yahoo.com',
                    'Referer': 'https://finance.yahoo.com/'
                }
            }
        );

        const quote = response.data?.quoteResponse?.result?.[0];
        if (!quote) throw new Error(`No data returned for ${symbol}`);

        const session = this.getMarketSession({});

        let currentPrice = quote.regularMarketPrice;
        if (session === '盘前') currentPrice = quote.preMarketPrice || currentPrice;
        if (session === '盘后' || session === '夜盘') currentPrice = quote.postMarketPrice || currentPrice;

        let changePercent = '0.00';
        if (quote.regularMarketPreviousClose) {
            changePercent = ((currentPrice - quote.regularMarketPreviousClose) / quote.regularMarketPreviousClose * 100).toFixed(2);
        }

        return {
            symbol,
            currentPrice,
            session,
            previousClose: quote.regularMarketPreviousClose,
            changePercent,
            volume: quote.regularMarketVolume || 0,
            marketCap: quote.marketCap,
            high: quote.regularMarketDayHigh,
            low: quote.regularMarketDayLow,
            timestamp: new Date(),
            source: 'yahoo_v6'
        };
    }

    /**
     * 从新浪财经获取数据
     */
    async getSinaPrice(symbol) {
        try {
            // 转换符号格式 (AAPL -> us_aapl)
            const sinaSymbol = this.convertToSinaSymbol(symbol);
            
            const response = await axios.get(
                `${this.dataSources.sina.baseUrl}${sinaSymbol}`,
                {
                    timeout: 10000,
                    headers: {
                        'Referer': 'https://finance.sina.com.cn'
                    },
                    responseType: 'text'
                }
            );

            const data = response.data;
            const match = data.match(/="([^"]+)"/);
            
            // 如果没匹配到，检查是不是该符号在新浪接口不存在（比如美股格式不对）
            if (!match || match[1].length < 10) {
                logger.debug(`[Crawler] Sina response for ${symbol} empty or invalid`);
                return null; // 返回 null 让系统尝试下一个数据源
            }

            const parts = match[1].split(',');
            
            return {
                symbol: symbol,
                currentPrice: parseFloat(parts[1]),
                previousClose: parseFloat(parts[2]),
                change: parseFloat(parts[1]) - parseFloat(parts[2]),
                changePercent: (((parseFloat(parts[1]) - parseFloat(parts[2])) / parseFloat(parts[2])) * 100).toFixed(2),
                high: parseFloat(parts[4]),
                low: parseFloat(parts[5]),
                volume: parseInt(parts[8]),
                timestamp: new Date(),
                source: 'sina'
            };

        } catch (error) {
            logger.error(`Sina Finance API error for ${symbol}:`, error);
            throw new Error(`Failed to fetch Sina data for ${symbol}`);
        }
    }

    /**
     * 从东方财富获取数据
     */
    async getEastMoneyPrice(symbol) {
        try {
            const response = await axios.get(this.dataSources.eastmoney.baseUrl, {
                params: {
                    secid: this.convertToEastMoneySecId(symbol),
                    fields: 'f58,f734,f107,f57,f43,f169,f170,f46,f44,f60,f45,f52'
                },
                timeout: 10000
            });

            const data = response.data.data;
            
            return {
                symbol: symbol,
                currentPrice: data.f43 / 100, // 东方财富价格需要除以100
                previousClose: data.f60 / 100,
                change: (data.f43 - data.f60) / 100,
                changePercent: data.f170,
                high: data.f44 / 100,
                low: data.f45 / 100,
                volume: data.f47,
                timestamp: new Date(),
                source: 'eastmoney'
            };

        } catch (error) {
            logger.error(`East Money API error for ${symbol}:`, error);
            throw new Error(`Failed to fetch East Money data for ${symbol}`);
        }
    }

    /**
     * 获取历史数据
     */
    async getHistoricalData(symbol, period = '1y', interval = '1d') {
        try {
            const cacheKey = `history_${symbol}_${period}_${interval}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            // 调用本地 Python yfinance 服务，绕过 Yahoo 速率限制
            const yfSymbol = this.convertToYfinanceSymbol(symbol);
            const response = await axios.post(
                `http://localhost:8000/api/stock/history`,
                { symbol: yfSymbol, period, interval },
                { timeout: 30000 }
            );

            if (!response.data || !response.data.success) {
                throw new Error("Python yfinance service returned failure");
            }

            const historicalData = response.data.data.map(item => ({
                date: new Date(item.date),
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.close,
                volume: item.volume
            }));

            this.setCache(cacheKey, historicalData, 30 * 60 * 1000); // 30分钟缓存
            return historicalData;

        } catch (error) {
            logger.error(`Failed to get historical data for ${symbol}:`, error);
            throw error;
        }
    }

    /**
     * 获取技术指标
     */
    async getTechnicalIndicators(symbol, period = '1y') {
        try {
            const historicalData = await this.getHistoricalData(symbol, period);
            
            return {
                sma20: this.calculateSMA(historicalData, 20),
                sma50: this.calculateSMA(historicalData, 50),
                ema12: this.calculateEMA(historicalData, 12),
                ema26: this.calculateEMA(historicalData, 26),
                rsi: this.calculateRSI(historicalData, 14),
                macd: this.calculateMACD(historicalData),
                bollinger: this.calculateBollingerBands(historicalData, 20, 2)
            };

        } catch (error) {
            logger.error(`Failed to calculate technical indicators for ${symbol}:`, error);
            throw error;
        }
    }

    /**
     * 计算简单移动平均线 (SMA)
     */
    calculateSMA(data, period) {
        if (data.length < period) return null;
        
        const recent = data.slice(-period);
        const sum = recent.reduce((acc, item) => acc + item.close, 0);
        return (sum / period).toFixed(2);
    }

    /**
     * 计算指数移动平均线 (EMA)
     */
    calculateEMA(data, period) {
        if (data.length < period) return null;
        
        const multiplier = 2 / (period + 1);
        let ema = data[0].close;
        
        for (let i = 1; i < data.length; i++) {
            ema = (data[i].close * multiplier) + (ema * (1 - multiplier));
        }
        
        return ema.toFixed(2);
    }

    /**
     * 计算RSI
     */
    calculateRSI(data, period = 14) {
        if (data.length < period + 1) return null;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = 1; i <= period; i++) {
            const change = data[i].close - data[i - 1].close;
            if (change > 0) {
                gains += change;
            } else {
                losses -= change;
            }
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        return rsi.toFixed(2);
    }

    /**
     * 计算MACD
     */
    calculateMACD(data) {
        const ema12 = this.calculateEMAArray(data, 12);
        const ema26 = this.calculateEMAArray(data, 26);
        
        if (!ema12 || !ema26) return null;
        
        const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
        
        return {
            macd: macdLine.toFixed(2),
            signal: 'N/A', // 简化版本
            histogram: 'N/A'
        };
    }

    /**
     * 计算布林带
     */
    calculateBollingerBands(data, period = 20, stdDev = 2) {
        if (data.length < period) return null;
        
        const sma = parseFloat(this.calculateSMA(data, period));
        const recent = data.slice(-period);
        
        const variance = recent.reduce((acc, item) => {
            return acc + Math.pow(item.close - sma, 2);
        }, 0) / period;
        
        const standardDeviation = Math.sqrt(variance);
        
        return {
            upper: (sma + (stdDev * standardDeviation)).toFixed(2),
            middle: sma.toFixed(2),
            lower: (sma - (stdDev * standardDeviation)).toFixed(2)
        };
    }

    /**
     * 批量获取股票数据
     */
    async getBatchStockData(symbols, source = 'yahoo') {
        const results = [];
        
        for (const symbol of symbols) {
            try {
                const data = await this.getRealTimePrice(symbol, source);
                results.push(data);
                
                // 避免API限制
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                logger.error(`Batch fetch failed for ${symbol}:`, error);
                results.push({
                    symbol,
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }
        
        return results;
    }

    /**
     * 工具方法
     */
    convertToYfinanceSymbol(symbol) {
        // 如果是纯6位数字，则判定为A股
        if (/^\d{6}$/.test(symbol)) {
            if (symbol.startsWith('6')) {
                return `${symbol}.SS`; // 沪市
            } else if (symbol.startsWith('0') || symbol.startsWith('3')) {
                return `${symbol}.SZ`; // 深市/创业板
            } else if (symbol.startsWith('8') || symbol.startsWith('4')) {
                return `${symbol}.BJ`; // 北交所
            }
        }
        return symbol; // 非6位纯数字，或者不符合上述规则，则原样返回
    }
    convertToSinaSymbol(symbol) {
        // 美股转换为新浪格式
        return `us_${symbol.toLowerCase()}`;
    }

    convertToEastMoneySecId(symbol) {
        // 简化版本，实际需要更复杂的映射
        return `105.${symbol}`;
    }

    calculateEMAArray(data, period) {
        if (data.length < period) return null;
        
        const emaArray = [];
        const multiplier = 2 / (period + 1);
        let ema = data[0].close;
        emaArray.push(ema);
        
        for (let i = 1; i < data.length; i++) {
            ema = (data[i].close * multiplier) + (ema * (1 - multiplier));
            emaArray.push(ema);
        }
        
        return emaArray;
    }

    getStartTime(period, endTime) {
        const periods = {
            '1d': 1 * 24 * 60 * 60,
            '1w': 7 * 24 * 60 * 60,
            '1m': 30 * 24 * 60 * 60,
            '3m': 90 * 24 * 60 * 60,
            '1y': 365 * 24 * 60 * 60,
            '5y': 5 * 365 * 24 * 60 * 60
        };
        
        return endTime - (periods[period] || periods['1y']);
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data, timeout = null) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            timeout: timeout || this.cacheTimeout
        });
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = new StockDataCrawler();
