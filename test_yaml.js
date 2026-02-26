const yaml = require('yaml');

const yamlStr = `
app:
  timezone: "Asia/Shanghai"
notification:
  enabled: true
  # 推送渠道配置
  channels:
    telegram:
      bot_token: "old_token"
      chat_id: "old_chat_id"
`;

const doc = yaml.parseDocument(yamlStr);
const newChannels = { telegram: { bot_token: "new_token" }, dingtalk: { webhook_url: "ding" } };

const existingNotificationNode = doc.get('notification');
if (existingNotificationNode) {
    const channelsNode = existingNotificationNode.get('channels');
    if (channelsNode) {
        for (const [channelKey, channelData] of Object.entries(newChannels)) {
            let singleChannelNode = channelsNode.get(channelKey);
            if (!singleChannelNode) {
                // adding new channel
                const newDoc = new yaml.YAMLMap();
                for (const [k, v] of Object.entries(channelData)) newDoc.set(k, v);
                channelsNode.set(channelKey, newDoc);
            } else {
                for (const [propKey, propVal] of Object.entries(channelData)) {
                    singleChannelNode.set(propKey, propVal);
                }
            }
        }
    }
}

console.log(String(doc));
