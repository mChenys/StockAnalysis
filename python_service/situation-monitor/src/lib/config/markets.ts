/**
 * Market configuration - sectors, commodities, stocks
 */

export interface SectorConfig {
	symbol: string;
	name: string;
}

export interface CommodityConfig {
	symbol: string;
	name: string;
	display: string;
}

export const SECTORS: SectorConfig[] = [
	{ symbol: 'XLK', name: '科技 (Tech)' },
	{ symbol: 'XLF', name: '金融 (Fin)' },
	{ symbol: 'XLE', name: '能源 (Energy)' },
	{ symbol: 'XLV', name: '医疗 (Health)' },
	{ symbol: 'XLY', name: '非必需消费 (Cons)' },
	{ symbol: 'XLI', name: '工业 (Indus)' },
	{ symbol: 'XLP', name: '必需消费 (Staple)' },
	{ symbol: 'XLU', name: '公用事业 (Util)' },
	{ symbol: 'XLB', name: '材料 (Mat)' },
	{ symbol: 'XLRE', name: '房地产 (RealE)' },
	{ symbol: 'XLC', name: '通讯 (Comms)' },
	{ symbol: 'SMH', name: '半导体 (Semis)' }
];

export const COMMODITIES: CommodityConfig[] = [
	{ symbol: '^VIX', name: '恐慌指数', display: 'VIX' },
	{ symbol: 'GC=F', name: '黄金', display: 'GOLD' },
	{ symbol: 'CL=F', name: '原油', display: 'OIL' },
	{ symbol: 'NG=F', name: '天然气', display: 'NATGAS' },
	{ symbol: 'SI=F', name: '白银', display: 'SILVER' },
	{ symbol: 'HG=F', name: '铜', display: 'COPPER' }
];

// Major Tech Giants (Magnificent Seven)
export const INDICES = [
	{ symbol: 'AAPL', name: '苹果公司', display: 'AAPL' },
	{ symbol: 'MSFT', name: '微软', display: 'MSFT' },
	{ symbol: 'GOOGL', name: '谷歌', display: 'GOOGL' },
	{ symbol: 'AMZN', name: '亚马逊', display: 'AMZN' },
	{ symbol: 'NVDA', name: '英伟达', display: 'NVDA' },
	{ symbol: 'META', name: 'Meta', display: 'META' },
	{ symbol: 'TSLA', name: '特斯拉', display: 'TSLA' }
];

// Crypto assets tracked
export const CRYPTO = [
	{ id: 'bitcoin', symbol: 'BTC', name: '比特币' },
	{ id: 'ethereum', symbol: 'ETH', name: '以太坊' },
	{ id: 'solana', symbol: 'SOL', name: 'Solana' }
];
