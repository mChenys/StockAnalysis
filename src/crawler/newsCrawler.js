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
            const res = await axios.get(url);
            const $ = cheerio.load(res.data, { xmlMode: true });
            const items = [];
            $('item').each((i, el) => {
                if (i >= limit) return;
                items.push({
                    sourceId,
                    url: $(el).find('link').text(),
                    title: $(el).find('title').text(),
                    content: $(el).find('description').text().replace(/<[^>]*>/g, ''),
                    publishedAt: new Date($(el).find('pubDate').text()),
                    relatedSymbols: []
                });
            });
            return items;
        } catch (e) { return []; }
    }

    async saveNews(newsItems) {
        let savedCount = 0;
        let skippedCount = 0;

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
                savedCount++;
            } catch (error) {
                logger.debug(`Save failed: ${error.message}`);
            }
        }

        logger.info(`✅ Ingestion Complete: Saved ${savedCount}, Skipped ${skippedCount}`);
        return { savedCount, skippedCount };
    }
}

module.exports = new NewsCrawler();
