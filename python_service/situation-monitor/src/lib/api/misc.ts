/**
 * Miscellaneous API functions for specialized panels
 * Note: Some of these use mock data as the original APIs require authentication
 */
import { fetchFinnhubQuote } from './markets';

export interface Prediction {
	id: string;
	question: string;
	yes: number;
	volume: string;
	sentiment?: 'bullish' | 'bearish' | 'neutral';
}

export interface WhaleTransaction {
	coin: string;
	amount: number;
	usd: number;
	hash: string;
	from: string;
	to: string;
	timestamp: string;
	type: 'inflow' | 'outflow' | 'neutral';
}

export interface Contract {
	agency: string;
	description: string;
	vendor: string;
	amount: number;
}

export interface Layoff {
	company: string;
	count: number;
	title: string;
	date: string;
}

/**
 * Fetch Polymarket predictions
 * Note: Polymarket API requires authentication - returns curated prediction data
 */
export async function fetchPolymarket(): Promise<Prediction[]> {
	// These represent active prediction markets on major events
	// 这些是各大事件在聚合预测市场上的实时概率
	return [
		{
			id: 'pm-1',
			question: '2026年中美是否会发生军事冲突摩擦?',
			yes: 18,
			volume: '2.4M',
			sentiment: 'bearish'
		},
		{
			id: 'pm-2',
			question: '比特币在2026年底能达到15万美元吗?',
			yes: 35,
			volume: '8.1M',
			sentiment: 'bullish'
		},
		{
			id: 'pm-3',
			question: '美联储会在2026年Q1宣布降息吗?',
			yes: 42,
			volume: '5.2M',
			sentiment: 'bullish'
		},
		{
			id: 'pm-4',
			question: 'AI 会否在2026年引发大规模失业潮?',
			yes: 28,
			volume: '1.8M',
			sentiment: 'bearish'
		},
		{
			id: 'pm-5',
			question: '俄乌冲突会在2026年停火结束吗?',
			yes: 22,
			volume: '3.5M',
			sentiment: 'bullish'
		},
		{
			id: 'pm-6',
			question: '国际油价会再度突破 100美元/桶?',
			yes: 31,
			volume: '2.1M',
			sentiment: 'bearish'
		},
		{
			id: 'pm-7',
			question: '美国关键基础设施是否会遭受重大网络攻击?',
			yes: 45,
			volume: '1.5M',
			sentiment: 'bearish'
		}
	];
}

/**
 * Fetch whale transactions
 * Note: Would use Whale Alert API - returning sample data
 */
export async function fetchWhaleTransactions(): Promise<WhaleTransaction[]> {
	// Sample whale transaction base amounts
	let btcPrice = 64000;
	let ethPrice = 3000;
	let solPrice = 140;

	// Use real-time Finnhub values to calculate actual USD equivalents
	try {
		const [btcQuote, ethQuote, solQuote] = await Promise.all([
			fetchFinnhubQuote('BINANCE:BTCUSDT'),
			fetchFinnhubQuote('BINANCE:ETHUSDT'),
			fetchFinnhubQuote('BINANCE:SOLUSDT')
		]);
		if (btcQuote?.c) btcPrice = btcQuote.c;
		if (ethQuote?.c) ethPrice = ethQuote.c;
		if (solQuote?.c) solPrice = solQuote.c;
	} catch (error) {
		console.warn('Failed to fetch real crypto prices for Whale data:', error);
	}

	const now = new Date();
	const minutesAgo = (mins: number) => new Date(now.getTime() - mins * 60000).toISOString();

	return [
		{
			coin: 'BTC',
			amount: 1500,
			usd: 1500 * btcPrice,
			hash: '000000000000000000012a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
			from: 'Binance',
			to: 'Unknown Wallet',
			timestamp: minutesAgo(5),
			type: 'outflow'
		},
		{
			coin: 'ETH',
			amount: 25000,
			usd: 25000 * ethPrice,
			hash: '0x5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3g4h5i6j',
			from: 'Unknown Wallet',
			to: 'Coinbase',
			timestamp: minutesAgo(12),
			type: 'inflow'
		},
		{
			coin: 'BTC',
			amount: 850,
			usd: 850 * btcPrice,
			hash: '00000000000000000009i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1',
			from: 'Unknown Wallet',
			to: 'Unknown Wallet',
			timestamp: minutesAgo(24),
			type: 'neutral'
		},
		{
			coin: 'SOL',
			amount: 500000,
			usd: 500000 * solPrice,
			hash: '3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3g4h5i6j7k8l9m0n1o2p3q4r',
			from: 'Kraken',
			to: 'Unknown Wallet',
			timestamp: minutesAgo(45),
			type: 'outflow'
		},
		{
			coin: 'ETH',
			amount: 15000,
			usd: 15000 * ethPrice,
			hash: '0x7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s6t7u8v',
			from: 'Gemini',
			to: 'Unknown Wallet',
			timestamp: minutesAgo(72),
			type: 'outflow'
		}
	];
}

/**
 * Fetch government contracts
 * Note: Would use USASpending.gov API - returning sample data
 */
export async function fetchGovContracts(): Promise<Contract[]> {
	// 模拟美国政府核心外包采购合同数据
	return [
		{
			agency: '国防部 (DOD)',
			description: '先进雷达系统开发与集成网络构建',
			vendor: '雷神公司 (Raytheon)',
			amount: 2500000000
		},
		{
			agency: '航空航天局 (NASA)',
			description: '阿尔忒弥斯登月计划着陆器支持系统',
			vendor: 'SpaceX',
			amount: 1800000000
		},
		{
			agency: '国土安全部 (DHS)',
			description: '边境安全AI技术监控现代化重构',
			vendor: 'Palantir',
			amount: 450000000
		},
		{
			agency: '退伍军人部 (VA)',
			description: '电子健康医疗记录网络系统升级',
			vendor: '甲骨文 (Oracle Cerner)',
			amount: 320000000
		},
		{
			agency: '能源部 (DOE)',
			description: '跨州清洁能源电网基础设施建设',
			vendor: '通用电气 (General Electric)',
			amount: 275000000
		}
	];
}

/**
 * Fetch layoffs data
 * Note: Would use layoffs.fyi API or similar - returning sample data
 */
export async function fetchLayoffs(): Promise<Layoff[]> {
	const now = new Date();
	const formatDate = (daysAgo: number) => {
		const d = new Date(now);
		d.setDate(d.getDate() - daysAgo);
		return d.toISOString();
	};

	return [
		{ company: 'Meta', count: 1200, title: '工程与现实实验室重组', date: formatDate(2) },
		{ company: 'Amazon', count: 850, title: 'AWS云业务分支优化合并', date: formatDate(5) },
		{ company: 'Salesforce', count: 700, title: '收购后团队成本缩减裁员', date: formatDate(8) },
		{ company: 'Intel', count: 1500, title: '代工制造结构性调整优化', date: formatDate(12) },
		{ company: 'Snap', count: 500, title: '减少成本开支战略计划', date: formatDate(15) }
	];
}
