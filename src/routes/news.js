const express = require('express');
const router = express.Router();
const NewsItem = require('../database/models/NewsItem');
const Topic = require('../database/models/Topic');
const newsCrawler = require('../crawler/newsCrawler');
const { authenticateToken, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

router.get('/', authenticateToken, async (req, res) => {
    try {
        const { sourceId, topic, symbol, query, page = 1, limit = 15 } = req.query;
        let queryStr = query || symbol || topic || "";

        let isAShareOrGeneral = !queryStr || queryStr.includes('A股') || queryStr.includes('财经');

        // Try getting from python service
        const pythonClient = require('../services/pythonClient');
        const isPythonAvailable = await pythonClient.isPythonServiceAvailable();

        let newsData = [];
        if (isPythonAvailable && queryStr !== 'A股') {
            try {
                // 如果是具体名字或英文标的，直接传给 Python (Yfinance/DuckDuckGo)
                const pNews = await pythonClient.getMarketNews(queryStr || "财经 股票", parseInt(limit));
                newsData = pNews.map(item => ({ ...item, market: '美股' }));
            } catch (err) {
                logger.error('Python API news fetch failed:', err.message);
            }
        }

        // 获取 A 股 / 中文财联社最新资讯补充 (如果不全是英文 ticker 的话)
        let clsNews = [];
        if (isAShareOrGeneral || /[\u4e00-\u9fa5]/.test(queryStr)) {
            try {
                // 调用本地系统基于 RSS 的高速中国 A 股及宏观抽取
                const data = await newsCrawler.fetchSource('cls', newsCrawler.sources.cls);
                // 简单的关键字过滤（如果有输入）
                if (queryStr && !isAShareOrGeneral) {
                    clsNews = data.filter(n => n.title.includes(queryStr) || n.content.includes(queryStr));
                } else {
                    clsNews = data.slice(0, 15);
                }
                const globalKeywords = ['美国', '特朗普', '拜登', '美联储', '鲍威尔', '纳斯达克', '道琼斯', '标普', '美股', '华尔街', '苹果', '特斯拉', '谷歌', '微软', '亚马逊', '英伟达', 'Meta', '伊朗', '中东', '欧盟', '日元', '日本央行', '美债', '降息', '加息', '海外'];
                clsNews = clsNews.map(item => {
                    const text = (item.title + ' ' + (item.content || '')).toLowerCase();
                    const isGlobal = globalKeywords.some(kw => text.includes(kw.toLowerCase()));
                    return { ...item, market: isGlobal ? '美股' : 'A股' };
                });
            } catch (e) {
                logger.error('Local CLS fetch failed:', e.message);
            }
        }

        // 合并池
        const combined = [...clsNews, ...newsData];
        // 去重并且排序
        const uniqueSet = new Set();
        const finalNews = [];
        for (const item of combined) {
            const iden = item.url || item.title;
            if (!uniqueSet.has(iden)) {
                uniqueSet.add(iden);
                finalNews.push(item);
            }
        }
        finalNews.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

        const usList = finalNews.filter(x => x.market === '美股').slice(0, 20);
        const aList = finalNews.filter(x => x.market === 'A股').slice(0, 20);

        // 输出合并后的独立列表
        const outputNews = [...aList, ...usList];

        res.json({
            success: true,
            data: outputNews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: outputNews.length
            }
        });
    } catch (error) {
        logger.error('Get news API error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve news' });
    }
});

router.post('/ingest', authenticateToken, authorize('admin', 'analyst'), async (req, res) => {
    try {
        // fetchAll() already calls saveNews() internally, just return the result
        const stats = await newsCrawler.fetchAll();
        
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
        // In-memory mode: Topic.find() returns array, not query object
        const topics = await Topic.find();
        const sortedTopics = Array.isArray(topics)
            ? topics.sort((a, b) => (b.relevance || 0) - (a.relevance || 0)).slice(0, 50)
            : topics;
        res.json({ success: true, data: sortedTopics });
    } catch (error) {
        logger.error('Get topics API error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve topics' });
    }
});

module.exports = router;
