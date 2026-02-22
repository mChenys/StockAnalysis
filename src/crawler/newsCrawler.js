const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const NewsItem = require('../database/models/NewsItem');
const newsProcessor = require('../analyzer/newsProcessor');

class NewsCrawler {
    constructor() {
        this.sources = {
            cls: {
                name: '财联社7x24',
                url: 'https://www.cls.cn/nodeapi/telegraphList',
                type: 'api',
                limit: 20
            },
            eastmoney: {
                name: '东方财富7x24',
                url: 'https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_6_1_50.html',
                type: 'api',
                limit: 20
            },
            yahoo: {
                name: 'Yahoo Finance',
                url: 'https://finance.yahoo.com/rss/topstories',
                type: 'rss',
                limit: 10
            },
            sina: {
                name: '新浪7x24',
                url: 'https://rss.sina.com.cn/news/allnews/finance.xml',
                type: 'rss',
                limit: 20
            },
            '36kr': {
                name: '36氪',
                url: 'https://36kr.com/feed',
                type: 'rss',
                limit: 20
            }
        };
    }

    async fetchAll() {
        logger.info('🚀 Starting high-speed news ingestion...');
        const fetchTasks = Object.entries(this.sources).map(([id, config]) => 
            this.fetchSource(id, config).catch(err => {
                logger.error(`Source ${id} failed: ${err.message}`);
                return [];
            })
        );

        const results = await Promise.all(fetchTasks);
        const allItems = results.flat();
        
        return await this.saveNews(allItems);
    }

    async fetchSource(sourceId, config) {
        if (sourceId === 'cls') return this.fetchCLS(config);
        if (sourceId === 'eastmoney') return this.fetchEastMoney(config);
        if (config.type === 'rss') return this.fetchRSSNews(sourceId, config.url, config.limit);
        return [];
    }

    async fetchCLS(config) {
        try {
            const res = await axios.get(`${config.url}?last_time=${Math.floor(Date.now()/1000)}&rn=${config.limit}`);
            return res.data.data.roll_data.map(item => ({
                sourceId: 'CLS',
                url: `https://www.cls.cn/detail/${item.id}`,
                title: item.title || item.content.substring(0, 50),
                content: item.content,
                publishedAt: new Date(item.ctime * 1000),
                relatedSymbols: []
            }));
        } catch (e) { return []; }
    }

    async fetchEastMoney(config) {
        try {
            const res = await axios.get(config.url);
            return res.data.LivesList.map(item => ({
                sourceId: 'EastMoney',
                url: item.Url,
                title: item.Title,
                content: item.Digest,
                publishedAt: new Date(item.ShowTime),
                relatedSymbols: []
            }));
        } catch (e) { return []; }
    }

    async fetchRSSNews(sourceId, url, limit) {
        try {
            if (!url || typeof url !== 'string' || !url.startsWith('http')) {
                throw new Error(`Invalid RSS URL format for source: ${sourceId}`);
            }

            const res = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const $ = cheerio.load(res.data, { xmlMode: true });
            const items = [];
            $('item').each((i, el) => {
                if (i >= limit) return;
                
                const link = $(el).find('link').text().trim();
                const title = $(el).find('title').text().trim();
                const pubDateStr = $(el).find('pubDate').text().trim();
                
                if (!link || !title) return; // Skip items without necessary data
                
                items.push({
                    sourceId,
                    url: link,
                    title: title,
                    content: $(el).find('description').text().replace(/<[^>]*>/g, '').trim(),
                    publishedAt: pubDateStr ? new Date(pubDateStr) : new Date(),
                    relatedSymbols: []
                });
            });
            return items;
        } catch (e) {
            logger.error(`RSS Fetch Error for ${sourceId} (${url}): ${e.message}`);
            return [];
        }
    }

    async saveNews(newsItems) {
        let savedCount = 0;
        let skippedCount = 0;
        const newItems = [];

        // 批量情感评估与去重
        for (const item of newsItems) {
            try {
                const exists = await NewsItem.findOne({ url: item.url });
                if (exists) {
                    skippedCount++;
                    continue;
                }

                const news = new NewsItem(item);
                // 1. 提取主题 2. 评估情感 (并行执行)
                await Promise.all([
                    newsProcessor.extractTopics(news),
                    newsProcessor.analyzeSentiment(news)
                ]);

                await news.save();
                newItems.push(news);
                savedCount++;
            } catch (error) {
                logger.debug(`Save failed: ${error.message}`);
            }
        }

        logger.info(`✅ Ingestion Complete: Saved ${savedCount}, Skipped ${skippedCount}`);
        return { savedCount, skippedCount, newItems };
    }
}

module.exports = new NewsCrawler();
