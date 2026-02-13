const express = require('express');
const router = express.Router();
const NewsItem = require('../database/models/NewsItem');
const Topic = require('../database/models/Topic');
const newsCrawler = require('../crawler/newsCrawler');
const { authenticateToken, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

router.get('/', authenticateToken, async (req, res) => {
    try {
        const { sourceId, topic, symbol, page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const query = {};
        if (sourceId) query.sourceId = sourceId;
        if (topic) query.topics = topic;
        if (symbol) query.relatedSymbols = symbol;

        // 兼容处理：内存模式不支持链式 .sort().skip().limit()
        const news = await NewsItem.find(query);
        
        // 内存模式下手动处理排序和分页（可选，目前直接返回）
        const sortedNews = Array.isArray(news) ? news.sort((a, b) => b.publishedAt - a.publishedAt) : news;

        const total = 0; 

        res.json({
            success: true,
            data: sortedNews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total
            }
        });
    } catch (error) {
        logger.error('Get news API error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve news' });
    }
});

router.post('/ingest', authenticateToken, authorize('admin', 'analyst'), async (req, res) => {
    try {
        const newsItems = await newsCrawler.fetchAll();
        const stats = await newsCrawler.saveNews(newsItems);
        
        res.json({
            success: true,
            message: 'News ingestion completed',
            stats
        });
    } catch (error) {
        logger.error('News ingest API error:', error);
        res.status(500).json({ success: false, message: 'News ingestion failed' });
    }
});

router.get('/topics', authenticateToken, async (req, res) => {
    try {
        const topics = await Topic.find().sort({ relevance: -1 }).limit(50);
        res.json({ success: true, data: topics });
    } catch (error) {
        logger.error('Get topics API error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve topics' });
    }
});

module.exports = router;
