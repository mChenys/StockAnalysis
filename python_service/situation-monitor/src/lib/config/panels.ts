/**
 * Panel configuration
 */

export interface PanelConfig {
	name: string;
	priority: 1 | 2 | 3;
}

export type PanelId =
	| 'map'
	| 'politics'
	| 'tech'
	| 'finance'
	| 'gov'
	| 'heatmap'
	| 'markets'
	| 'monitors'
	| 'commodities'
	| 'crypto'
	| 'polymarket'
	| 'whales'
	| 'mainchar'
	| 'printer'
	| 'contracts'
	| 'ai'
	| 'layoffs'
	| 'venezuela'
	| 'greenland'
	| 'iran'
	| 'leaders'
	| 'intel'
	| 'correlation'
	| 'narrative'
	| 'fed';

export const PANELS: Record<PanelId, PanelConfig> = {
	map: { name: '全球态势地图', priority: 1 },
	politics: { name: '政治与地缘动态', priority: 1 },
	tech: { name: '科技与AI热点', priority: 1 },
	finance: { name: '金融与财经', priority: 1 },
	gov: { name: '政府与政策', priority: 2 },
	heatmap: { name: '美股板块热力图', priority: 1 },
	markets: { name: '核心市场大盘', priority: 1 },
	monitors: { name: '我的私有雷达', priority: 1 },
	commodities: { name: '大宗商品与恐慌指数(VIX)', priority: 2 },
	crypto: { name: '加密货币', priority: 2 },
	polymarket: { name: 'Polymarket (预测市场)', priority: 2 },
	whales: { name: '巨鲸异动监控', priority: 3 },
	mainchar: { name: '今日风暴主角', priority: 2 },
	printer: { name: '全球印钞机(宽容度)监控', priority: 2 },
	contracts: { name: '美国政府核心采购合同', priority: 3 },
	ai: { name: 'AI 军备竞赛前哨', priority: 3 },
	layoffs: { name: '全球大厂裁员雷达', priority: 3 },
	venezuela: { name: '委内瑞拉高压局势', priority: 2 },
	greenland: { name: '格陵兰地缘异动', priority: 2 },
	iran: { name: '伊朗危机监控', priority: 2 },
	leaders: { name: '全球领导人动向', priority: 1 },
	intel: { name: '核心情报源', priority: 2 },
	correlation: { name: '全球动态关联性引擎', priority: 1 },
	narrative: { name: '宏观叙事追踪器', priority: 1 },
	fed: { name: '美联储利率雷达', priority: 1 }
};

export const NON_DRAGGABLE_PANELS: PanelId[] = ['map'];

export const MAP_ZOOM_MIN = 1;
export const MAP_ZOOM_MAX = 4;
export const MAP_ZOOM_STEP = 0.5;
