/**
 * Onboarding presets for first-time users
 */

import type { PanelId } from './panels';

export interface Preset {
	id: string;
	name: string;
	icon: string;
	description: string;
	panels: PanelId[];
}

export const PRESETS: Record<string, Preset> = {
	'news-junkie': {
		id: 'news-junkie',
		name: '新闻极客',
		icon: '📰',
		description: '掌握政治、科技与金融领域的最新突发新闻',
		panels: ['politics', 'tech', 'finance', 'gov', 'ai', 'mainchar', 'map']
	},
	trader: {
		id: 'trader',
		name: '市场交易员',
		icon: '📈',
		description: '聚焦市场的仪表盘，涵盖股票、加密货币和全球各种大宗商品',
		panels: [
			'markets',
			'heatmap',
			'commodities',
			'crypto',
			'polymarket',
			'whales',
			'printer',
			'finance',
			'map'
		]
	},
	geopolitics: {
		id: 'geopolitics',
		name: '地缘政治观察家',
		icon: '🌍',
		description: '提供全球态势感知与地区热点冲突追踪',
		panels: [
			'map',
			'intel',
			'leaders',
			'politics',
			'gov',
			'venezuela',
			'greenland',
			'iran',
			'correlation',
			'narrative'
		]
	},
	intel: {
		id: 'intel',
		name: '情报分析师',
		icon: '🔍',
		description: '深度分析、模式检测以及各类叙事连线与追踪',
		panels: ['map', 'intel', 'leaders', 'correlation', 'narrative', 'mainchar', 'politics']
	},
	minimal: {
		id: 'minimal',
		name: '极简主义',
		icon: '⚡',
		description: '只关注最核心的要素：地图、新闻与市场',
		panels: ['map', 'politics', 'markets']
	},
	everything: {
		id: 'everything',
		name: '数据狂人(包含全部)',
		icon: '🎛️',
		description: '大乱炖 — 启用系统的所有数据透视监测面板',
		panels: [
			'map',
			'politics',
			'tech',
			'finance',
			'gov',
			'heatmap',
			'markets',
			'monitors',
			'commodities',
			'crypto',
			'polymarket',
			'whales',
			'mainchar',
			'printer',
			'contracts',
			'ai',
			'layoffs',
			'venezuela',
			'greenland',
			'iran',
			'leaders',
			'intel',
			'correlation',
			'narrative'
		]
	}
};

export const PRESET_ORDER = [
	'news-junkie',
	'trader',
	'geopolitics',
	'intel',
	'minimal',
	'everything'
];

// Storage keys
export const ONBOARDING_STORAGE_KEY = 'onboardingComplete';
export const PRESET_STORAGE_KEY = 'selectedPreset';
