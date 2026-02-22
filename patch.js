const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/scheduler/taskScheduler.js');
let content = fs.readFileSync(filePath, 'utf8');

// Add import
if (!content.includes("const newsCrawler = require('../crawler/newsCrawler');")) {
    content = content.replace(
        "const wechatPusher = require('../pusher/wechatPusher');",
        "const wechatPusher = require('../pusher/wechatPusher');\nconst newsCrawler = require('../crawler/newsCrawler');"
    );
}

// Replace monitorNews
const oldMethod = `    async monitorNews() {
        try {
            // 这里可以集成新闻API
            // 检查是否有影响关注股票的重要新闻
            logger.debug('News monitoring check completed');
            
        } catch (error) {
            logger.error('News monitoring failed:', error);
        }
    }`;

const newMethod = `    async monitorNews() {
        try {
            const { newItems } = await newsCrawler.fetchAll();
            
            if (newItems && newItems.length > 0) {
                for (const newsItem of newItems) {
                    const isRelated = newsItem.relatedSymbols && 
                        newsItem.relatedSymbols.some(sym => this.watchList.includes(sym));
                    
                    const isHighSentiment = Math.abs(newsItem.sentimentScore) > 0.6;
                    
                    if (isRelated || isHighSentiment) {
                        await wechatPusher.pushMarketAlert({
                            type: 'news_alert',
                            symbol: (newsItem.relatedSymbols || []).join(','),
                            title: newsItem.title,
                            source: newsItem.sourceId,
                            publishTime: newsItem.publishedAt,
                            sentiment: newsItem.sentimentScore > 0 ? 'bullish' : 'bearish',
                            sentimentSummary: newsItem.content.substring(0, 100) + '...'
                        });
                        
                        await this.delay(1000);
                    }
                }
            }
            logger.debug('News monitoring check completed. Found ' + (newItems ? newItems.length : 0) + ' items.');
        } catch (error) {
            logger.error('News monitoring failed:', error);
        }
    }`;

content = content.replace(oldMethod, newMethod);
fs.writeFileSync(filePath, content);
console.log('Patch applied successfully.');
