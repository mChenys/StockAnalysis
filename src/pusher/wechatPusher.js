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
                title: `股票分析报告: ${data.symbol || '系统消息'}`,
                desp: data.message || data.analysis || '无详细内容'
            });
            return true;
        } catch (e) { return false; }
    }

    async pushViaCorpWeChat(data) {
        if (!this.config.corpId || !this.config.corpSecret) return false;
        // 简化的企业微信逻辑...
        return false;
    }

    async pushViaTestAccount(data) {
        if (!this.config.testAppId || !this.config.testAppSecret) return false;
        // 简化的测试号逻辑...
        return false;
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
