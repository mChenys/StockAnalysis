const fs = require('fs');

let content = fs.readFileSync('src/pusher/wechatPusher.js', 'utf8');

content = content.replace(
    'title: `股票分析报告: ${data.symbol || \'系统消息\'}`,',
    'title: data.title || `股票分析报告: ${data.symbol || \'系统消息\'}`,'
);

fs.writeFileSync('src/pusher/wechatPusher.js', content);
console.log('Done');
