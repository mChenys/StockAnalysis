/**
 * Markets API - Fetch market data from Finnhub
 *
 * Get your free API key at: https://finnhub.io/
 * Free tier: 60 calls/minute
 */

import { INDICES, SECTORS, COMMODITIES, CRYPTO } from '$lib/config/markets';
import type { MarketItem, SectorPerformance, CryptoItem } from '$lib/types';
import { logger, FINNHUB_API_KEY, FINNHUB_BASE_URL } from '$lib/config/api';
import { markets } from '$lib/stores/markets';
import { get } from 'svelte/store';

interface FinnhubQuote {
	c: number; // Current price
	d: number; // Change
	dp: number; // Percent change
	h: number; // High price of the day
	l: number; // Low price of the day
	o: number; // Open price of the day
	pc: number; // Previous close price
	t: number; // Timestamp
}

/**
 * Check if Finnhub API key is configured
 */
export function hasFinnhubApiKey(): boolean {
	return Boolean(FINNHUB_API_KEY && FINNHUB_API_KEY.length > 0);
}

/**
 * Create an empty market item (used for error/missing data states)
 */
function createEmptyMarketItem<T extends 'index' | 'commodity'>(
	symbol: string,
	name: string,
	type: T
): MarketItem {
	return { symbol, name, price: NaN, change: NaN, changePercent: NaN, type };
}

/**
 * Create an empty sector performance item
 */
function createEmptySectorItem(symbol: string, name: string): SectorPerformance {
	return { symbol, name, price: NaN, change: NaN, changePercent: NaN };
}


/**
 * Fetch a quote from Finnhub
 */
export async function fetchFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
	const CACHE_KEY = `finnhub_quote_${symbol}`;
	const CACHE_TTL = 60 * 1000; // 1 minute
	let staleData: FinnhubQuote | null = null;

	try {
        if (typeof window !== 'undefined') {
            const cachedStr = localStorage.getItem(CACHE_KEY);
            if (cachedStr) {
                const { data, timestamp } = JSON.parse(cachedStr);
                staleData = data;
                if (Date.now() - timestamp < CACHE_TTL) {
                    return data;
                }
            }
        }

		const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
		const response = await fetch(url);

		if (!response.ok) {
            if (response.status === 429 && staleData) {
                logger.warn('Markets API', `Rate limited for ${symbol}, using stale cache.`);
                return staleData;
            }
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data: FinnhubQuote = await response.json();

		// Finnhub returns all zeros when symbol not found
		if (data.c === 0 && data.pc === 0) {
			return staleData || null; // fall back to stale or give up
		}

        if (typeof window !== 'undefined') {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
        }

		return data;
	} catch (error) {
		logger.error('Markets API', `Error fetching quote for ${symbol}:`, error);
		return staleData || null;
	}
}

/**
 * Fetch crypto prices from Finnhub (formerly CoinGecko)
 */
export async function fetchCryptoPrices(): Promise<CryptoItem[]> {
	if (!hasFinnhubApiKey()) {
		logger.warn('Markets API', 'Finnhub API key not configured for Crypto');
		return CRYPTO.map((c) => ({
			id: c.id,
			symbol: c.symbol,
			name: c.name,
			current_price: NaN,
			price_change_24h: NaN,
			price_change_percentage_24h: NaN
		}));
	}

	try {
		logger.log('Markets API', 'Fetching crypto from Finnhub');
		
		const quotes = await Promise.all(
			CRYPTO.map(async (crypto) => {
				const finnhubSymbol = `BINANCE:${crypto.symbol}USDT`;
				const quote = await fetchFinnhubQuote(finnhubSymbol);
				return { crypto, quote };
			})
		);

		return quotes.map(({ crypto, quote }) => {
			return {
				id: crypto.id,
				symbol: crypto.symbol,
				name: crypto.name,
				current_price: quote?.c || 0,
				price_change_24h: quote?.d || 0,
				price_change_percentage_24h: quote?.dp || 0
			};
		});
	} catch (error) {
		logger.error('Markets API', 'Error fetching crypto:', error);
		return CRYPTO.map((c) => ({
			id: c.id,
			symbol: c.symbol,
			name: c.name,
			current_price: NaN,
			price_change_24h: NaN,
			price_change_percentage_24h: NaN
		}));
	}
}

/**
 * Fetch market indices from Finnhub
 */
export async function fetchIndices(): Promise<MarketItem[]> {
	const createEmptyIndices = () =>
		INDICES.map((i) => createEmptyMarketItem(i.symbol, i.name, 'index'));

	if (!hasFinnhubApiKey()) {
		logger.warn('Markets API', 'Finnhub API key not configured. Add VITE_FINNHUB_API_KEY to .env');
		return createEmptyIndices();
	}

	try {
		logger.log('Markets API', 'Fetching indices from Finnhub');

		const quotes = await Promise.all(
			INDICES.map(async (index) => {
				const quote = await fetchFinnhubQuote(index.symbol);
				return { index, quote };
			})
		);

		return quotes.map(({ index, quote }) => ({
			symbol: index.symbol,
			name: index.name,
			price: quote?.c ?? NaN,
			change: quote?.d ?? NaN,
			changePercent: quote?.dp ?? NaN,
			type: 'index' as const
		}));
	} catch (error) {
		logger.error('Markets API', 'Error fetching indices:', error);
		return createEmptyIndices();
	}
}

/**
 * Fetch sector performance from Finnhub (using sector ETFs)
 */
export async function fetchSectorPerformance(): Promise<SectorPerformance[]> {
	const createEmptySectors = () =>
		SECTORS.map((s) => createEmptySectorItem(s.symbol, s.name));

	if (!hasFinnhubApiKey()) {
		logger.warn('Markets API', 'Finnhub API key not configured');
		return createEmptySectors();
	}

	try {
		logger.log('Markets API', 'Fetching sector performance from Finnhub');

		const quotes = await Promise.all(
			SECTORS.map(async (sector) => {
				const quote = await fetchFinnhubQuote(sector.symbol);
				return { sector, quote };
			})
		);

		return quotes.map(({ sector, quote }) => ({
			symbol: sector.symbol,
			name: sector.name,
			price: quote?.c ?? NaN,
			change: quote?.d ?? NaN,
			changePercent: quote?.dp ?? NaN
		}));
	} catch (error) {
		logger.error('Markets API', 'Error fetching sectors:', error);
		return createEmptySectors();
	}
}

// Finnhub commodity ETF proxies (free tier doesn't support direct commodities)
const COMMODITY_SYMBOL_MAP: Record<string, string> = {
	'^VIX': 'VIXY', // VIX -> ProShares VIX Short-Term Futures ETF
	'GC=F': 'GLD', // Gold -> SPDR Gold Shares
	'CL=F': 'USO', // Crude Oil -> United States Oil Fund
	'NG=F': 'UNG', // Natural Gas -> United States Natural Gas Fund
	'SI=F': 'SLV', // Silver -> iShares Silver Trust
	'HG=F': 'CPER' // Copper -> United States Copper Index Fund
};

/**
 * Fetch commodities from Finnhub
 */
export async function fetchCommodities(): Promise<MarketItem[]> {
	const createEmptyCommodities = () =>
		COMMODITIES.map((c) => createEmptyMarketItem(c.symbol, c.name, 'commodity'));

	if (!hasFinnhubApiKey()) {
		logger.warn('Markets API', 'Finnhub API key not configured');
		return createEmptyCommodities();
	}

	try {
		logger.log('Markets API', 'Fetching commodities from Finnhub');

		const quotes = await Promise.all(
			COMMODITIES.map(async (commodity) => {
				const finnhubSymbol = COMMODITY_SYMBOL_MAP[commodity.symbol] || commodity.symbol;
				const quote = await fetchFinnhubQuote(finnhubSymbol);
				return { commodity, quote };
			})
		);

		return quotes.map(({ commodity, quote }) => ({
			symbol: commodity.symbol,
			name: commodity.name,
			price: quote?.c ?? NaN,
			change: quote?.d ?? NaN,
			changePercent: quote?.dp ?? NaN,
			type: 'commodity' as const
		}));
	} catch (error) {
		logger.error('Markets API', 'Error fetching commodities:', error);
		return createEmptyCommodities();
	}
}

interface AllMarketsData {
	crypto: CryptoItem[];
	indices: MarketItem[];
	sectors: SectorPerformance[];
	commodities: MarketItem[];
}

/**
 * Fetch all market data
 */
export async function fetchAllMarkets(): Promise<AllMarketsData> {
	const [crypto, indices, sectors, commodities] = await Promise.all([
		fetchCryptoPrices(),
		fetchIndices(),
		fetchSectorPerformance(),
		fetchCommodities()
	]);

	return { crypto, indices, sectors, commodities };
}

/**
 * Initialize WebSockets for real-time market updates
 * 1. Finnhub: Fast tick-by-tick for Crypto
 * 2. Local Python Service: Reliable yfinance polling for Stocks/Commodities/Sectors
 */
export function startMarketWebSockets() {
	if (typeof window === 'undefined') return;

	const state = {
		finnhub: null as WebSocket | null,
		local: null as WebSocket | null
	};

	const processTradeData = (trades: any[]) => {
		const currentMarkets = get(markets);
		
		trades.forEach((trade: any) => {
			const s: string = trade.s;
			const p: number = trade.p;

			if (s.startsWith('BINANCE:')) {
				// It's a crypto trade from Finnhub
				const symbol = s.replace('BINANCE:', '').replace('USDT', '');
				const cryptoItem = currentMarkets.crypto.items.find(i => i.symbol === symbol);
				if (cryptoItem && cryptoItem.current_price) {
					const previousClose = cryptoItem.current_price - cryptoItem.price_change_24h;
					const newChange = p - previousClose;
					const newChangePercent = previousClose !== 0 ? (newChange / previousClose) * 100 : 0;
					
					markets.updateCrypto(cryptoItem.id, {
						current_price: p,
						price_change_24h: newChange,
						price_change_percentage_24h: newChangePercent
					});
				}
			} else {
				// It's a stock or commodity or sector
				let itemCategory: 'indices' | 'commodities' | 'sectors' | null = null;
				let itemSymbol = '';
				
				const stockIndex = currentMarkets.indices.items.find(i => i.symbol === s);
				if (stockIndex) {
					itemCategory = 'indices';
					itemSymbol = s;
				} else {
					const commodityMatch = Object.entries(COMMODITY_SYMBOL_MAP).find(([_, v]) => v === s);
					const finnhubSymbol = commodityMatch ? commodityMatch[0] : s;
					const commodityItem = currentMarkets.commodities.items.find(i => i.symbol === finnhubSymbol);
					if (commodityItem) {
						itemCategory = 'commodities';
						itemSymbol = finnhubSymbol;
					} else {
						const sectorItem = currentMarkets.sectors.items.find(i => i.symbol === s);
						if (sectorItem) {
							itemCategory = 'sectors';
							itemSymbol = s;
						}
					}
				}

				if (itemCategory && itemSymbol) {
					let itemsList: any[];
					if (itemCategory === 'indices') itemsList = currentMarkets.indices.items;
					else if (itemCategory === 'commodities') itemsList = currentMarkets.commodities.items;
					else itemsList = currentMarkets.sectors.items;
					
					const targetItem = itemsList.find(i => i.symbol === itemSymbol);
					if (targetItem && targetItem.price !== null && !isNaN(targetItem.price)) {
						const previousClose = targetItem.price - targetItem.change;
						const newChange = p - previousClose;
						const newChangePercent = previousClose !== 0 ? (newChange / previousClose) * 100 : 0;

						markets.updateItem(itemCategory, itemSymbol, {
							price: p,
							change: newChange,
							changePercent: newChangePercent
						});
					}
				}
			}
		});
	};

	// 1. Connection to Finnhub (best for Crypto)
	if (hasFinnhubApiKey()) {
		const fhWs = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);
		state.finnhub = fhWs;

		fhWs.onopen = () => {
			logger.log('Markets API', 'Finnhub WebSocket connected');
			CRYPTO.forEach((c) => {
				fhWs.send(JSON.stringify({ type: 'subscribe', symbol: `BINANCE:${c.symbol}USDT` }));
			});
		};

		fhWs.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === 'trade' && data.data) {
					processTradeData(data.data);
				}
			} catch (e) {}
		};
	}

	// 2. Connection to local Python backend (best for Stocks/Commodities/Sectors)
	const localHost = window.location.hostname || 'localhost';
	const localWsUrl = `ws://${localHost}:8000/ws/markets`;
	logger.log('Markets API', `Connecting to Local WebSocket: ${localWsUrl}`);
	
	const localWs = new WebSocket(localWsUrl);
	state.local = localWs;

	localWs.onopen = () => {
		logger.log('Markets API', '✅ Local Analytics WebSocket connected');
	};

	localWs.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);
			if (data.type === 'trade' && data.data) {
				logger.log('Markets API', `📥 Received ${data.data.length} updates from Local WS`);
				processTradeData(data.data);
			}
		} catch (e) {
			logger.error('Markets API', 'Error parsing local WS message:', e);
		}
	};

	localWs.onerror = (err) => {
		logger.warn('Markets API', '❌ Local WebSocket error:', err);
	};

	localWs.onclose = (e) => {
		logger.warn('Markets API', `🔌 Local WebSocket closed: ${e.code} ${e.reason}`);
	};

	return () => {
		if (state.finnhub && state.finnhub.readyState === WebSocket.OPEN) state.finnhub.close();
		if (state.local && state.local.readyState === WebSocket.OPEN) state.local.close();
	};
}
