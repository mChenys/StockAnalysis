const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const NewsItem = require('../database/models/NewsItem');
const newsProcessor = require('../analyzer/newsProcessor');

class NewsCrawler {
    constructor() {
        this.sources = {
            yahoo: {
                name: 'Yahoo Finance News',
                url: 'https://finance.yahoo.com/rss/topstories',
                type: 'rss'
            },
            reuters: {
                name: 'Reuters Business',
                url: 'https://www.reuters.com/business/',
                type: 'html'
            },
            mock: {
                name: 'Mock News Service',
                url: 'mock://news',
                type: 'mock'
            }
        };
    }

    async fetchAll() {
        logger.info('Starting news ingestion from all sources...');
        const results = [];
        for (const [id, config] of Object.entries(this.sources)) {
            try {
                const items = await this.fetchSource(id, config);
                results.push(...items);
            } catch (error) {
                logger.error(`Failed to fetch from ${config.name}:`, error);
            }
        }
        return results;
    }

    async fetchSource(sourceId, config) {
        switch (config.type) {
            case 'mock':
                return this.fetchMockNews(sourceId);
            case 'rss':
                return this.fetchRSSNews(sourceId, config.url);
            case 'html':
                return this.fetchHTMLNews(sourceId, config.url);
            default:
                throw new Error(`Unsupported source type: ${config.type}`);
        }
    }

    async fetchMockNews(sourceId) {
        const mockNews = [
            {
                sourceId,
                url: 'https://example.com/news/1',
                title: 'Fed signals potential rate cuts as inflation cools',
                content: 'Federal Reserve officials suggested that rate cuts could be on the horizon if inflation continues its downward trend toward the 2% target.',
                publishedAt: new Date(),
                relatedSymbols: ['SPY', 'QQQ']
            },
            {
                sourceId,
                url: 'https://example.com/news/2',
                title: 'Tech giants rally on strong earnings outlook',
                content: 'Major technology companies seen a boost in share prices following optimistic forward-looking guidance in recent quarterly reports.',
                publishedAt: new Date(Date.now() - 3600000),
                relatedSymbols: ['AAPL', 'MSFT', 'NVDA']
            }
        ];
        return mockNews;
    }

    async fetchRSSNews(sourceId, url) {
        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data, { xmlMode: true });
            const items = [];
            
            $('item').each((i, el) => {
                if (i >= 10) return;
                const title = $(el).find('title').text();
                const link = $(el).find('link').text();
                const content = $(el).find('description').text();
                const pubDate = $(el).find('pubDate').text();
                
                items.push({
                    sourceId,
                    url: link,
                    title,
                    content: content.replace(/<[^>]*>/g, ''),
                    publishedAt: new Date(pubDate),
                    relatedSymbols: []
                });
            });
            
            return items;
        } catch (error) {
            logger.error(`Error fetching RSS from ${url}:`, error);
            return [];
        }
    }

    async fetchHTMLNews(sourceId, url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            const $ = cheerio.load(response.data);
            const items = [];
            
            $('article').each((i, el) => {
                if (i >= 5) return;
                const title = $(el).find('h3').text().trim();
                const link = $(el).find('a').attr('href');
                const fullUrl = link?.startsWith('http') ? link : `https://www.reuters.com${link}`;
                
                if (title && link) {
                    items.push({
                        sourceId,
                        url: fullUrl,
                        title,
                        content: title,
                        publishedAt: new Date(),
                        relatedSymbols: []
                    });
                }
            });
            
            return items;
        } catch (error) {
            logger.error(`Error fetching HTML from ${url}:`, error);
            return [];
        }
    }

    async saveNews(newsItems) {
        let savedCount = 0;
        let skippedCount = 0;

        for (const item of newsItems) {
            try {
                const exists = await NewsItem.findOne({ url: item.url });
                if (exists) {
                    skippedCount++;
                    continue;
                }

                const news = new NewsItem(item);
                await newsProcessor.extractTopics(news);
                await news.save();
                savedCount++;
            } catch (error) {
                logger.error(`Error saving news item ${item.url}:`, error);
            }
        }

        logger.info(`News ingestion complete. Saved: ${savedCount}, Skipped: ${skippedCount}`);
        return { savedCount, skippedCount };
    }
}

module.exports = new NewsCrawler();
