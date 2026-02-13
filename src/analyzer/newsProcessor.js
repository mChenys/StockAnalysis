const Topic = require('../database/models/Topic');
const logger = require('../utils/logger');

class NewsProcessor {
    async extractTopics(newsItem) {
        const text = `${newsItem.title} ${newsItem.content}`;
        const symbols = newsItem.relatedSymbols || [];
        
        const extractedSymbols = this.findSymbolsInText(text);
        const allSymbols = [...new Set([...symbols, ...extractedSymbols])];

        for (const symbol of allSymbols) {
            try {
                let topic = await Topic.findOne({ name: symbol });
                if (topic) {
                    topic.relevance += 1;
                    topic.lastMentionedAt = new Date();
                    await topic.save();
                } else {
                    topic = new Topic({
                        name: symbol,
                        relevance: 1,
                        relatedSymbols: [symbol]
                    });
                    await topic.save();
                }
            } catch (error) {
                logger.error(`Error processing topic for symbol ${symbol}:`, error);
            }
        }

        return allSymbols;
    }

    findSymbolsInText(text) {
        const symbols = [];
        const commonSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX', 'AMD', 'SPY', 'QQQ'];
        
        for (const symbol of commonSymbols) {
            const regex = new RegExp(`\\b${symbol}\\b`, 'g');
            if (regex.test(text)) {
                symbols.push(symbol);
            }
        }
        
        return symbols;
    }

    async processBatch(newsItems) {
        logger.info(`Processing batch of ${newsItems.length} news items...`);
        for (const item of newsItems) {
            item.topics = await this.extractTopics(item);
        }
    }
}

module.exports = new NewsProcessor();
