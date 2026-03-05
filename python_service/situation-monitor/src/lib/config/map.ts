// Map configuration - hotspots, conflict zones, and strategic locations

export interface Hotspot {
	name: string;
	lat: number;
	lon: number;
	level: 'critical' | 'high' | 'elevated' | 'low';
	desc: string;
}

export interface ConflictZone {
	name: string;
	coords: [number, number][];
	color: string;
}

export interface Chokepoint {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface CableLanding {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface NuclearSite {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface MilitaryBase {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface Ocean {
	name: string;
	lat: number;
	lon: number;
}

export const THREAT_COLORS = {
	critical: '#ff0000',
	high: '#ff4444',
	elevated: '#ffcc00',
	low: '#00ff88'
} as const;

export const SANCTIONED_COUNTRY_IDS = [
	364, // Iran
	408, // North Korea
	760, // Syria
	862, // Venezuela
	112, // Belarus
	643, // Russia
	728, // South Sudan
	729 // Sudan
];

export const HOTSPOTS: Hotspot[] = [
	{
		name: '华盛顿',
		lat: 38.9,
		lon: -77.0,
		level: 'low',
		desc: '华盛顿 — 美国政治中心，白宫，五角大楼，国会大厦'
	},
	{
		name: '莫斯科',
		lat: 55.75,
		lon: 37.6,
		level: 'elevated',
		desc: '莫斯科 — 克里姆林宫，俄罗斯军事指挥中心，制裁核心'
	},
	{
		name: '北京',
		lat: 39.9,
		lon: 116.4,
		level: 'elevated',
		desc: '北京 — 中国核心，中美角力，科技竞争焦点'
	},
	{
		name: '基辅',
		lat: 50.45,
		lon: 30.5,
		level: 'high',
		desc: '基辅 — 现役冲突区，俄罗斯入侵持续中'
	},
	{
		name: '台北',
		lat: 25.03,
		lon: 121.5,
		level: 'elevated',
		desc: '台北 — 台海局势，台积电，区域紧张核心'
	},
	{
		name: '德黑兰',
		lat: 35.7,
		lon: 51.4,
		level: 'critical',
		desc: '德黑兰 — 高危动荡：大规模抗议，政权不稳，核计划'
	},
	{
		name: '特拉维夫',
		lat: 32.07,
		lon: 34.78,
		level: 'high',
		desc: '特拉维夫 — 巴以冲突，活跃军事行动区'
	},
	{
		name: '伦敦',
		lat: 51.5,
		lon: -0.12,
		level: 'low',
		desc: '伦敦 — 金融中心，五眼联盟，北约盟国'
	},
	{
		name: '布鲁塞尔',
		lat: 50.85,
		lon: 4.35,
		level: 'low',
		desc: '布鲁塞尔 — 欧盟/北约总部，欧洲政策中心'
	},
	{
		name: '平壤',
		lat: 39.03,
		lon: 125.75,
		level: 'elevated',
		desc: '平壤 — 朝鲜核威胁，频繁导弹测试'
	},
	{
		name: '利雅得',
		lat: 24.7,
		lon: 46.7,
		level: 'elevated',
		desc: '利雅得 — 沙特石油储备，OPEC+，也门冲突，地区大国'
	},
	{
		name: '新德里',
		lat: 28.6,
		lon: 77.2,
		level: 'low',
		desc: '新德里 — 印度崛起力量，中印边境摩擦'
	},
	{
		name: '新加坡',
		lat: 1.35,
		lon: 103.82,
		level: 'low',
		desc: '新加坡 — 航运咽喉要道，亚洲金融中心'
	},
	{
		name: '东京',
		lat: 35.68,
		lon: 139.76,
		level: 'low',
		desc: '东京 — 美国盟友，地区安全，经济强国'
	},
	{
		name: '加拉加斯',
		lat: 10.5,
		lon: -66.9,
		level: 'high',
		desc: '加拉加斯 — 委内瑞拉危机，马杜罗政权，美国制裁，人道主义紧急情况'
	},
	{
		name: '努克',
		lat: 64.18,
		lon: -51.72,
		level: 'elevated',
		desc: '努克 — 格陵兰，美国收购意向，北极战略，丹麦关系'
	}
];

export const CONFLICT_ZONES: ConflictZone[] = [
	{
		name: '乌克兰',
		coords: [
			[30, 52],
			[40, 52],
			[40, 45],
			[30, 45],
			[30, 52]
		],
		color: '#ff4444'
	},
	{
		name: '加沙',
		coords: [
			[34, 32],
			[35, 32],
			[35, 31],
			[34, 31],
			[34, 32]
		],
		color: '#ff4444'
	},
	{
		name: '台湾海峡',
		coords: [
			[117, 28],
			[122, 28],
			[122, 22],
			[117, 22],
			[117, 28]
		],
		color: '#ffaa00'
	},
	{
		name: '也门',
		coords: [
			[42, 19],
			[54, 19],
			[54, 12],
			[42, 12],
			[42, 19]
		],
		color: '#ff6644'
	},
	{
		name: '苏丹',
		coords: [
			[22, 23],
			[38, 23],
			[38, 8],
			[22, 8],
			[22, 23]
		],
		color: '#ff6644'
	},
	{
		name: '缅甸',
		coords: [
			[92, 28],
			[101, 28],
			[101, 10],
			[92, 10],
			[92, 28]
		],
		color: '#ff8844'
	}
];

export const CHOKEPOINTS: Chokepoint[] = [
	{
		name: '苏伊士',
		lat: 30.0,
		lon: 32.5,
		desc: '苏伊士运河 — 承载12%全球贸易，欧亚大通道'
	},
	{
		name: '巴拿马',
		lat: 9.1,
		lon: -79.7,
		desc: '巴拿马运河 — 美洲中转，太西连接关键'
	},
	{
		name: '霍尔木兹',
		lat: 26.5,
		lon: 56.5,
		desc: '霍尔木兹海峡 — 掌握21%全球石油，波斯湾出口'
	},
	{
		name: '马六甲',
		lat: 2.5,
		lon: 101.0,
		desc: '马六甲海峡 — 25%全球贸易，中国核心供应链通道'
	},
	{
		name: '曼德',
		lat: 12.5,
		lon: 43.3,
		desc: '曼德海峡 — 红海门户，胡塞武装高发威胁区'
	},
	{ name: '直布罗陀', lat: 36.0, lon: -5.5, desc: '直布罗陀海峡 — 地中海唯一出海口' },
	{
		name: '博斯普鲁斯',
		lat: 41.1,
		lon: 29.0,
		desc: '博斯普鲁斯海峡 — 黑海门户，俄罗斯出口生命线'
	}
];

export const CABLE_LANDINGS: CableLanding[] = [
	{ name: '纽约(NYC)', lat: 40.7, lon: -74.0, desc: '纽约 — 跨大西洋海底海缆枢纽 (10+ 线路)' },
	{ name: '康沃尔', lat: 50.1, lon: -5.5, desc: '康沃尔(英国) — 欧洲与美洲核心数字网关' },
	{ name: '马赛', lat: 43.3, lon: 5.4, desc: '马赛 — 地中海数据枢纽，亚欧非海底光缆入口' },
	{ name: '孟买', lat: 19.1, lon: 72.9, desc: '孟买 — 印度网关 (10+ 线路)' },
	{ name: '新加坡', lat: 1.3, lon: 103.8, desc: '新加坡 — 亚太平核心网络连通点' },
	{ name: '香港', lat: 22.3, lon: 114.2, desc: '香港 — 中国出境网络连通枢纽' },
	{ name: '东京', lat: 35.5, lon: 139.8, desc: '东京 — 横跨太平洋终点枢纽' },
	{ name: '悉尼', lat: -33.9, lon: 151.2, desc: '悉尼 — 澳洲与太平洋数字交汇点' },
	{ name: '洛杉矶', lat: 33.7, lon: -118.2, desc: '洛杉矶(LA) — 太平洋美洲网关' },
	{ name: '迈阿密', lat: 25.8, lon: -80.2, desc: '迈阿密 — 美洲/加勒比海数字通讯中心' }
];

export const NUCLEAR_SITES: NuclearSite[] = [
	{ name: '纳坦兹', lat: 33.7, lon: 51.7, desc: '纳坦兹 — 伊朗铀浓缩中心' },
	{ name: '宁边', lat: 39.8, lon: 125.8, desc: '宁边 — 朝鲜核心核设施' },
	{ name: '迪莫纳', lat: 31.0, lon: 35.1, desc: '迪莫纳 — 以色列核设施' },
	{ name: '布什尔', lat: 28.8, lon: 50.9, desc: '布什尔 — 伊朗核电站' },
	{
		name: '扎波罗热',
		lat: 47.5,
		lon: 34.6,
		desc: '扎波罗热 — 欧洲最大核电站，活跃冲突区'
	},
	{ name: '切尔诺贝利', lat: 51.4, lon: 30.1, desc: '切尔诺贝利 — 核污染隔离区，曾被占领' },
	{ name: '福岛', lat: 37.4, lon: 141.0, desc: '福岛 — 事故核电站，退役监测区' }
];

export const MILITARY_BASES: MilitaryBase[] = [
	{ name: '拉姆施泰因', lat: 49.4, lon: 7.6, desc: '拉姆施泰因 — 美国空军驻欧洲核心枢纽 (德国)' },
	{
		name: '迪戈加西亚',
		lat: -7.3,
		lon: 72.4,
		desc: '迪戈加西亚 — 美英印度洋战略基地'
	},
	{
		name: '冲绳',
		lat: 26.5,
		lon: 127.9,
		desc: '冲绳 — 驻日美军基地，太平洋前哨'
	},
	{ name: '关岛', lat: 13.5, lon: 144.8, desc: '关岛 — 美国太平洋最高指挥部，轰炸机基地' },
	{
		name: '吉布提',
		lat: 11.5,
		lon: 43.1,
		desc: '吉布提 — 美/中/法多国海外驻军，非洲之角'
	},
	{ name: '卡塔尔', lat: 25.1, lon: 51.3, desc: '乌代德空军基地 — 美国中央司令部前线' },
	{
		name: '加里宁格勒',
		lat: 54.7,
		lon: 20.5,
		desc: '加里宁格勒 — 俄罗斯波罗的海飞地，导弹基地'
	},
	{ name: '塞瓦斯托波尔', lat: 44.6, lon: 33.5, desc: '塞瓦斯托波尔 — 俄罗斯黑海舰队母港' },
	{
		name: '海南',
		lat: 18.2,
		lon: 109.5,
		desc: '海南 — 中国海军潜艇基地，南海前哨'
	}
];

export const OCEANS: Ocean[] = [
	{ name: '大西洋', lat: 25, lon: -40 },
	{ name: '太平洋', lat: 0, lon: -150 },
	{ name: '印度洋', lat: -20, lon: 75 },
	{ name: '北冰洋', lat: 75, lon: 0 },
	{ name: '南冰洋', lat: -60, lon: 0 }
];

export const WEATHER_CODES: Record<number, string> = {
	0: '☀️ 晴',
	1: '🌤️ 大部晴',
	2: '⛅ 局部多云',
	3: '☁️ 阴天',
	45: '🌫️ 雾',
	48: '🌫️ 雾',
	51: '🌧️ 毛毛雨',
	53: '🌧️ 毛毛雨',
	55: '🌧️ 毛毛雨',
	61: '🌧️ 雨',
	63: '🌧️ 雨',
	65: '🌧️ 大雨',
	71: '🌨️ 雪',
	73: '🌨️ 雪',
	75: '🌨️ 大雪',
	77: '🌨️ 雪',
	80: '🌧️ 阵雨',
	81: '🌧️ 阵雨',
	82: '⛈️ 雷阵雨',
	85: '🌨️ 阵雪',
	86: '🌨️ 阵雪',
	95: '⛈️ 雷暴',
	96: '⛈️ 雷暴',
	99: '⛈️ 雷暴'
};
