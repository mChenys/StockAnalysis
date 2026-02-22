const fs = require('fs');

let content = fs.readFileSync('src/scheduler/taskScheduler.js', 'utf8');

const replacement1 = `
    formatPreMarketSummary(results) {
        const successful = results.filter(r => r.analysis || r.technical);
        return \`### 🌅 开盘前分析完成\\n\\n**分析股票:** \${successful.map(r => r.symbol || '').join(', ')}\\n**完成数量:** \${successful.length}/\${this.watchList.length}\\n\\n*请登录系统查看详细AI分析结果* \`;
    }

    formatPostMarketSummary(analyses) {
        return \`### 🌙 今日收盘分析\\n\\n\` + analyses.map(a => {
            // Check sentiment from technical analysis
            let sentiment = 'neutral';
            if (a.technical && a.technical.sentiment) sentiment = a.technical.sentiment.toLowerCase();
            
            let icon = '➖';
            if (['bullish', 'high', 'positive'].includes(sentiment)) icon = '🔺';
            if (['bearish', 'low', 'negative'].includes(sentiment)) icon = '🔻';
            
            const analysisText = a.technical && a.technical.analysis ? a.technical.analysis.substring(0, 100) : '无分析数据';
            return \`**【\${a.symbol}】** \${icon}\\n> 技术面: \${analysisText}...\\n\`;
        }).join('\\n');
    }`;

content = content.replace(`    formatPreMarketSummary(results) {
        const successful = results.filter(r => r.analysis);
        return \`🌅 开盘前分析完成\\n\\n分析股票: \${successful.map(r => r.symbol).join(', ')}\\n完成数量: \${successful.length}/\${this.watchList.length}\\n\\n请查看详细分析结果\`;
    }

    formatPostMarketSummary(analyses) {
        return \`🌙 今日收盘分析\\n\\n\` + analyses.map(a => 
            \`【\${a.symbol}】\\n技术面: \${a.technical.analysis.substring(0, 100)}...\\n\`
        ).join('\\n');
    }`, replacement1);

// Add markdown to other templates
content = content.replace(
    'message: `AI股票分析系统已启动\\n\\n✅ 监控股票: ${this.watchList.join(\', \')}\\n⏰ 任务调度: 已激活\\n🤖 AI模型: 就绪`,',
    'message: `### 🚀 AI股票分析系统已启动\\n\\n**✅ 监控股票:** ${this.watchList.join(\', \')}\\n**⏰ 任务调度:** 已激活\\n**🤖 AI模型:** 就绪`,',
);

content = content.replace(
    'message: `今日市场总结 (${summary.date})\\n市场表现: ${summary.marketPerformance}\\n热门变动: ${summary.topMovers}`,',
    'message: `### 📊 今日市场总结 (${summary.date})\\n\\n**市场表现:** ${summary.marketPerformance}\\n**热门变动:** ${summary.topMovers}`,',
);

fs.writeFileSync('src/scheduler/taskScheduler.js', content);
console.log('Done');
