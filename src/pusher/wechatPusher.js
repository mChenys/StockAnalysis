const axios = require('axios');
const logger = require('../utils/logger');

class WeChatPusher {
    constructor() {
        this.config = {
            serverChan: process.env.SERVERCHAN_KEY,
            corpId: process.env.WECHAT_CORP_ID,
            corpSecret: process.env.WECHAT_CORP_SECRET,
            agentId: process.env.WECHAT_AGENT_ID,
            testAppId: process.env.WECHAT_TEST_APPID,
            testAppSecret: process.env.WECHAT_TEST_APPSECRET,
            testUserOpenId: process.env.WECHAT_TEST_USER_OPENID,
            testTemplateId: process.env.WECHAT_TEST_TEMPLATE_ID
        };
    }


    async pushMarketAlert(analysisData) {
        if (analysisData.type === 'news_alert') {
            const getSentimentIcon = (sentiment) => {
                const s = sentiment?.toLowerCase() || '';
                if (['bullish', 'high', 'positive'].includes(s)) return '🔺';
                if (['bearish', 'low', 'negative'].includes(s)) return '🔻';
                return '➖';
            };

            const icon = getSentimentIcon(analysisData.sentiment);
            const title = analysisData.newsTitle || analysisData.title || '市场重要新闻';
            const source = analysisData.source || '未知来源';
            const pubTime = analysisData.publishTime || new Date().toLocaleString('zh-CN');
            
            analysisData.title = `新闻预警: ${analysisData.symbol || '市场消息'} ${icon}`;
            analysisData.message = `**${title}**\n\n> 来源: ${source} | 时间: ${pubTime}\n\n**情感分析:** ${icon} ${analysisData.sentiment || 'Neutral'}\n\n**AI摘要:**\n${analysisData.sentimentSummary || analysisData.message || '无详细内容'}\n\n---\n*这是系统自动生成的分析报告*`;
        }

        const methods = [
            () => this.pushViaServerChan(analysisData),
            () => this.pushViaCorpWeChat(analysisData),
            () => this.pushViaTestAccount(analysisData)
        ];

        let success = false;
        for (const method of methods) {
            try {
                const res = await method();
                if (res) {
                    if (!global.messagesSentCount) global.messagesSentCount = 0;
                    global.messagesSentCount++;
                    success = true;
                }
            } catch (error) {
                logger.debug(`Push method failed: ${error.message}`);
            }
        }

        if (!success) {
            logger.debug('No valid push channel configured or all channels failed.');
        }
        return success;
    }

    async pushViaServerChan(data) {
        if (!this.config.serverChan) return false;
        try {
            const url = `https://sctapi.ftqq.com/${this.config.serverChan}.send`;
            await axios.post(url, {
                title: data.title || `股票分析报告: ${data.symbol || '系统消息'}`,
                desp: data.message || data.analysis || '无详细内容'
            });
            return true;
        } catch (e) { return false; }
    }

    async pushViaCorpWeChat(data) {
        if (!this.config.corpId || !this.config.corpSecret || !this.config.agentId) return false;
        try {
            // 获取 access token
            const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.corpSecret}`;
            const tokenRes = await axios.get(tokenUrl);
            const accessToken = tokenRes.data.access_token;
            if (!accessToken) return false;

            // 发送 markdown 消息
            const sendUrl = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;
            await axios.post(sendUrl, {
                touser: '@all',
                msgtype: 'markdown',
                agentid: this.config.agentId,
                markdown: {
                    content: `### ${data.title || '股票分析报告: ' + (data.symbol || '系统消息')}\n\n${data.message || data.analysis || '无详细内容'}`
                }
            });
            return true;
        } catch (e) { 
            logger.debug(`CorpWeChat push failed: ${e.message}`);
            return false; 
        }
    }

    async pushViaTestAccount(data) {
        if (!this.config.testAppId || !this.config.testAppSecret || !this.config.testUserOpenId || !this.config.testTemplateId) return false;
        try {
            const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.config.testAppId}&secret=${this.config.testAppSecret}`;
            const tokenRes = await axios.get(tokenUrl);
            const accessToken = tokenRes.data.access_token;
            if (!accessToken) return false;

            let plainText = (data.message || data.analysis || '无详细内容').replace(/[*#>`]/g, '').trim();
            if (plainText.length > 200) plainText = plainText.substring(0, 197) + '...';

            const sendUrl = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`;
            await axios.post(sendUrl, {
                touser: this.config.testUserOpenId,
                template_id: this.config.testTemplateId,
                data: {
                    first: { value: data.title || `股票分析报告: ${data.symbol || '系统消息'}`, color: '#173177' },
                    keyword1: { value: data.symbol || '市场消息', color: '#173177' },
                    keyword2: { value: new Date().toLocaleString('zh-CN'), color: '#173177' },
                    remark: { value: plainText, color: '#173177' }
                }
            });
            return true;
        } catch (e) { 
            logger.debug(`TestAccount push failed: ${e.message}`);
            return false; 
        }
    }

    getConfigStatus() {
        return {
            serverChan: !!this.config.serverChan,
            corpWeChat: !!(this.config.corpId && this.config.corpSecret),
            testAccount: !!(this.config.testAppId && this.config.testAppSecret)
        };
    }

    async testPush() {
        return this.pushMarketAlert({
            symbol: 'TEST',
            message: '这是一条系统测试消息，用于验证推送通道。'
        });
    }
}

module.exports = new WeChatPusher();
