const Topic = require('../database/models/Topic');
const modelManager = require('../ai/modelManager');
const logger = require('../utils/logger');

class NewsProcessor {
    async extractTopics(newsItem) {
        const text = `${newsItem.title} ${newsItem.content}`;
        const symbols = this.findSymbolsInText(text);
        const allSymbols = [...new Set([...(newsItem.relatedSymbols || []), ...symbols])];

        for (const symbol of allSymbols) {
            try {
                let topic = await Topic.findOne({ name: symbol });
                if (topic) {
                    topic.relevance += 1;
                    topic.lastMentionedAt = new Date();
                    await topic.save();
                } else {
                    topic = new Topic({ name: symbol, relevance: 1, relatedSymbols: [symbol] });
                    await topic.save();
                }
            } catch (e) {}
        }
        newsItem.relatedSymbols = allSymbols;
    }

    findSymbolsInText(text) {
        const commonSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX', 'AMD', 'SPY', 'QQQ', 'BTC', 'ETH'];
        return commonSymbols.filter(s => new RegExp(`\\b${s}\\b`, 'g').test(text));
    }

    /**
     * AI 情感分析引擎
     */
    async analyzeSentiment(newsItem) {
        try {
            const prompt = `你是一个专业的金融量化分析师。请对以下新闻进行情感打分。
            
标题: ${newsItem.title}
内容: ${newsItem.content.substring(0, 300)}

要求：
1. 返回一个 -1.0 (极大利空) 到 1.0 (极大利好) 之间的数字。
2. 只返回数字，不要任何文字解释。
3. 如果内容不相关，返回 0.0。`;

            // 优先选择高性能模型进行情感分析
            const models = modelManager.getModels().filter(m => m.active);
            if (models.length === 0) {
                newsItem.sentimentScore = 0;
                return;
            }

            const result = await modelManager.callModel(models[0].name, prompt);
            const score = parseFloat(result.match(/-?\d+(\.\d+)?/g)?.[0] || 0);
            newsItem.sentimentScore = Math.max(-1, Math.min(1, score));
            
            logger.debug(`Sentiment for ${newsItem.title.substring(0, 15)}...: ${newsItem.sentimentScore}`);
        } catch (error) {
            logger.debug('Sentiment analysis failed, defaulting to 0');
            newsItem.sentimentScore = 0;
        }
    }
}

module.exports = new NewsProcessor();
