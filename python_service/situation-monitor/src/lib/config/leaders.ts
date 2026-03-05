/**
 * World Leaders configuration for tracking
 */

import type { WorldLeader } from '$lib/types';

export const WORLD_LEADERS: WorldLeader[] = [
	// United States
	{
		id: 'trump',
		name: '唐纳德·特朗普',
		title: '总统',
		country: '美国',
		flag: '🇺🇸',
		keywords: ['trump', 'potus', 'white house'],
		since: '2025年1月起',
		party: '共和党',
		focus: ['关税', '移民', '彻底松绑监管']
	},
	{
		id: 'vance',
		name: 'JD·万斯',
		title: '副总统',
		country: '美国',
		flag: '🇺🇸',
		keywords: ['jd vance', 'vice president vance'],
		since: '2025年1月起',
		party: '共和党'
	},

	// China
	{
		id: 'xi',
		name: '习近平',
		title: '国家主席',
		country: '中国',
		flag: '🇨🇳',
		keywords: ['xi jinping', 'xi', 'chinese president'],
		since: '2013年3月起',
		party: '中国共产党 (CCP)',
		focus: ['台湾问题', '一带一路', '科技自主']
	},

	// Russia
	{
		id: 'putin',
		name: '弗拉基米尔·普京',
		title: '总统',
		country: '俄罗斯',
		flag: '🇷🇺',
		keywords: ['putin', 'kremlin', 'russian president'],
		since: '2012年5月起',
		party: '统一俄罗斯党',
		focus: ['乌克兰战争', '北约东扩', '能源']
	},

	// Europe
	{
		id: 'starmer',
		name: '基尔·斯塔默',
		title: '首相',
		country: '英国',
		flag: '🇬🇧',
		keywords: ['starmer', 'uk pm', 'british prime minister'],
		since: '2024年7月起',
		party: '工党'
	},
	{
		id: 'macron',
		name: '埃马纽埃尔·马克龙',
		title: '总统',
		country: '法国',
		flag: '🇫🇷',
		keywords: ['macron', 'french president', 'elysee'],
		since: '2017年5月起',
		party: '复兴党'
	},
	{
		id: 'scholz',
		name: '奥拉夫·朔尔茨',
		title: '总理',
		country: '德国',
		flag: '🇩🇪',
		keywords: ['scholz', 'german chancellor', 'berlin'],
		since: '2021年12月起',
		party: '社民党(SPD)'
	},
	{
		id: 'meloni',
		name: '焦尔吉娅·梅洛尼',
		title: '总理',
		country: '意大利',
		flag: '🇮🇹',
		keywords: ['meloni', 'italian pm', 'italy prime minister'],
		since: '2022年10月起',
		party: '意大利兄弟党'
	},

	// Middle East
	{
		id: 'netanyahu',
		name: '本雅明·内塔尼亚胡',
		title: '总理',
		country: '以色列',
		flag: '🇮🇱',
		keywords: ['netanyahu', 'bibi', 'israeli pm'],
		since: '2022年12月起',
		party: '利库德集团',
		focus: ['加沙', '伊朗', '司法重组']
	},
	{
		id: 'mbs',
		name: '穆罕默德·本·萨勒曼(MBS)',
		title: '王储',
		country: '沙特阿拉伯',
		flag: '🇸🇦',
		keywords: ['mbs', 'saudi crown prince', 'bin salman'],
		since: '2017年6月起',
		party: '沙特王室',
		focus: ['2030愿景', '石油', '区域影响力']
	},
	{
		id: 'khamenei',
		name: '阿里·哈梅内伊',
		title: '最高领袖',
		country: '伊朗',
		flag: '🇮🇷',
		keywords: ['khamenei', 'supreme leader', 'ayatollah'],
		since: '1989年6月起',
		party: '伊斯兰共和国',
		focus: ['核项目', '代理人网络', '对抗制裁']
	},

	// Asia-Pacific
	{
		id: 'modi',
		name: '纳伦德拉·莫迪',
		title: '总理',
		country: '印度',
		flag: '🇮🇳',
		keywords: ['modi', 'indian pm', 'india prime minister'],
		since: '2014年5月起',
		party: '印人党(BJP)',
		focus: ['经济腾飞', '中印边界', '科技发力']
	},
	{
		id: 'kim',
		name: '金正恩',
		title: '最高领导人',
		country: '朝鲜',
		flag: '🇰🇵',
		keywords: ['kim jong un', 'north korea', 'pyongyang'],
		since: '2011年12月起',
		party: '朝鲜劳动党',
		focus: ['核武', '导弹', '俄朝同盟']
	},
	{
		id: 'ishiba',
		name: '石破茂',
		title: '首相',
		country: '日本',
		flag: '🇯🇵',
		keywords: ['ishiba', 'japanese pm', 'japan prime minister'],
		since: '2024年10月起',
		party: '自民党(LDP)',
		focus: ['国防', '抗衡中国', '日美同盟']
	},
	{
		id: 'lai',
		name: '赖清德',
		title: '地区领导人',
		country: '中国台湾',
		flag: '🇹🇼',
		keywords: ['lai ching-te', 'taiwan president', 'taipei'],
		since: '2024年5月起',
		party: '民进党(DPP)',
		focus: ['两岸关系', '国防', '半导体']
	},

	// Ukraine
	{
		id: 'zelensky',
		name: '弗拉基米尔·泽连斯基',
		title: '总统',
		country: '乌克兰',
		flag: '🇺🇦',
		keywords: ['zelensky', 'ukraine president', 'kyiv'],
		since: '2019年5月起',
		party: '人民公仆党',
		focus: ['卫国战争', '西方援助', '争取入约']
	},

	// Latin America
	{
		id: 'milei',
		name: '哈维尔·米莱',
		title: '总统',
		country: '阿根廷',
		flag: '🇦🇷',
		keywords: ['milei', 'argentina president', 'buenos aires'],
		since: '2023年12月起',
		party: '自由前进党',
		focus: ['全面美元化', '削减开支', '去监管化']
	},
	{
		id: 'lula',
		name: '路易斯·伊纳西奥·卢拉·达席尔瓦',
		title: '总统',
		country: '巴西',
		flag: '🇧🇷',
		keywords: ['lula', 'brazil president', 'brasilia'],
		since: '2023年1月起',
		party: '劳工党(PT)',
		focus: ['亚马逊', '社会福利', '金砖联盟(BRICS)']
	},

	// Canada
	{
		id: 'carney',
		name: '马克·卡尼',
		title: '总理',
		country: '加拿大',
		flag: '🇨🇦',
		keywords: ['carney', 'canadian pm', 'canada prime minister', 'ottawa'],
		since: '2025年3月起',
		party: '自由党',
		focus: ['关税', '美加关系', '经济']
	}
];
