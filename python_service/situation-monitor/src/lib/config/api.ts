/**
 * API Configuration
 */

import { browser } from '$app/environment';

/**
 * Finnhub API key
 * Get your free key at: https://finnhub.io/
 * Free tier: 60 calls/minute
 */
export const FINNHUB_API_KEY = import.meta.env.VITE_FINNHUB_API_KEY ?? '';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/**
 * FRED API key (St. Louis Fed)
 * Get your free key at: https://fred.stlouisfed.org/docs/api/api_key.html
 * Free tier: Unlimited requests
 */
// Default public FRED key for convenience (free tier)
const DEFAULT_FRED_KEY = '711722d56a00418c33ec7c88316e6802';
export const FRED_API_KEY = import.meta.env.VITE_FRED_API_KEY || DEFAULT_FRED_KEY;

export const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

/**
 * Check if we're in development mode
 * Uses import.meta.env which is available in both browser and test environments
 */
const isDev = browser ? (import.meta.env?.DEV ?? false) : false;

/**
 * Debug/logging configuration
 */
export const DEBUG = {
	enabled: isDev,
	logApiCalls: isDev,
	logCacheHits: false
} as const;

/**
 * Conditional logger - only logs in development
 */
export const logger = {
	log: (prefix: string, ...args: unknown[]) => {
		if (DEBUG.logApiCalls) {
			console.log(`[${prefix}]`, ...args);
		}
	},
	warn: (prefix: string, ...args: unknown[]) => {
		console.warn(`[${prefix}]`, ...args);
	},
	error: (prefix: string, ...args: unknown[]) => {
		console.error(`[${prefix}]`, ...args);
	}
};

/**
 * CORS proxy URLs for external API requests
 */
export const CORS_PROXIES = {
	local: '/api/proxy?url=',
	primary: 'https://api.allorigins.win/raw?url=',
	fallback: 'https://api.codetabs.com/v1/proxy?quest='
} as const;

// Default export for backward compatibility
export const CORS_PROXY_URL = CORS_PROXIES.local;

/**
 * Internal fetch with signal and timeout
 */
async function fetchWithTimeout(proxyBase: string, encodedUrl: string, timeoutMs: number): Promise<Response> {
	let finalUrl = '';
	if (proxyBase.startsWith('/')) {
		// Local proxy via Python backend
		const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
		const host = typeof window !== 'undefined' ? (window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname || '127.0.0.1') : '127.0.0.1';
		finalUrl = `${protocol}//${host}:8000${proxyBase}${encodedUrl}`;
	} else {
		finalUrl = proxyBase + encodedUrl;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(finalUrl, { signal: controller.signal });
		clearTimeout(timeoutId);
		return res;
	} catch (e) {
		clearTimeout(timeoutId);
		throw e;
	}
}

/**
 * Fetch with CORS proxy fallback
 * Tries local proxy first, then primary public, then fallback
 */
export async function fetchWithProxy(url: string, timeoutMs: number = 30000): Promise<Response> {
	const encodedUrl = encodeURIComponent(url);
	
	// 1. Try local proxy first (most reliable, bypassing CORS)
	try {
		// Use a tighter timeout for local proxy (8s)
		const response = await fetchWithTimeout(CORS_PROXIES.local, encodedUrl, 8000);
		if (response.ok) {
			const cloned = response.clone();
			try {
				const json = await cloned.json();
				if (json && json.error) {
					logger.warn('API', `Local proxy returned handled source error: ${json.error}`);
					return response;
				}
			} catch {
				// Not JSON, return as is
			}
			return response;
		}
	} catch (error) {
		logger.warn('API', 'Local proxy failed or timed out, trying public primary');
	}

	// 2. Try primary public proxy (15s)
	try {
		const response = await fetchWithTimeout(CORS_PROXIES.primary, encodedUrl, 15000);
		if (response.ok) return response;
	} catch (error) {
		logger.warn('API', 'Primary public proxy failed, trying fallback');
	}

	// 3. Last resort fallback (15s)
	return fetchWithTimeout(CORS_PROXIES.fallback, encodedUrl, 15000);
}

/**
 * API request delays (ms) to avoid rate limiting
 */
export const API_DELAYS = {
	betweenCategories: 500,
	betweenRetries: 1000
} as const;

/**
 * Cache TTLs (ms)
 */
export const CACHE_TTLS = {
	weather: 10 * 60 * 1000, // 10 minutes
	news: 5 * 60 * 1000, // 5 minutes
	markets: 60 * 1000, // 1 minute
	default: 5 * 60 * 1000 // 5 minutes
} as const;
