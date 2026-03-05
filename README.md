# 🤖 AI股票分析系统

一个集成多AI模型的实时股票数据抓取、智能分析和微信推送系统。

## ✨ 主要功能

- 🔧 **AI模型管理**: 支持OpenAI、Claude、Gemini、智谱AI等多种模型
- 📊 **智能分析**: 技术面、基本面、情绪分析、风险评估
- ⏰ **定时任务**: AI智能体自动执行分析任务
- 📱 **实时推送**: 微信企业号推送交易建议
- 🖥️ **Web管理**: 直观的模型配置和分析界面
- 🔄 **实时数据**: WebSocket实时更新分析结果

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置你的API密钥
```

### 3. 启动应用

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 4. 访问系统

打开浏览器访问: http://localhost:3000

## 📋 系统架构

```
StockAnalysis/
├── src/
│   ├── ai/              # AI模型管理
│   │   └── modelManager.js
│   ├── analyzer/        # 智能分析器
│   │   └── aiAnalyzer.js
│   ├── scheduler/       # 定时任务
│   │   └── taskScheduler.js
│   ├── routes/          # API路由
│   ├── database/        # 数据库模型
│   └── utils/           # 工具类
├── public/              # Web前端
└── config/              # 配置文件
```

## 🤖 支持的AI模型

### OpenAI
- GPT-4
- GPT-3.5 Turbo

### Anthropic Claude
- Claude-3 Opus
- Claude-3 Sonnet
- Claude-3 Haiku

### Google Gemini
- Gemini Pro
- Gemini Pro Vision

### 智谱AI
- GLM-4
- GLM-3 Turbo

## 📊 分析类型

1. **技术面分析**
   - 均线分析
   - MACD指标
   - RSI指标
   - 支撑阻力位
   - 趋势预测

2. **基本面分析**
   - 财务健康状况
   - 盈利能力
   - 估值分析
   - 行业地位

3. **情绪分析**
   - 新闻情绪
   - 社交媒体热度
   - 分析师观点

4. **风险评估**
   - 系统性风险
   - 个股风险
   - 投资组合风险

## 🔧 API接口

### 模型管理
- `GET /api/models` - 获取所有模型
- `POST /api/models` - 添加新模型
- `POST /api/models/:name/test` - 测试模型连接
- `DELETE /api/models/:name` - 删除模型

### AI分析
- `POST /api/analysis` - 执行单股分析
- `POST /api/analysis/batch` - 批量分析
- `GET /api/analysis/:symbol` - 获取历史分析
- `POST /api/advice` - 生成交易建议

## ⚙️ 配置说明

### AI模型配置

在Web界面中点击"添加模型"，填写以下信息：

1. **模型名称**: 自定义名称
2. **服务提供商**: 选择AI服务商
3. **API密钥**: 对应的API密钥
4. **模型版本**: 具体模型版本
5. **参数设置**: token数量、温度等

### 定时任务配置

系统默认包含：
- 每日9点执行AI分析
- 每小时市场检查

可以通过代码自定义更多任务。

## 📱 微信推送配置

1. 申请企业微信应用
2. 获取相关密钥信息
3. 在 `.env` 文件中配置
4. 系统将自动推送重要分析结果

## 🛠️ 开发说明

### 添加新的AI服务商

1. 在 `modelManager.js` 中添加新的调用方法
2. 更新前端的提供商选项
3. 添加相应的模型选项

### 扩展分析类型

1. 在 `aiAnalyzer.js` 中添加新的分析模板
2. 实现对应的分析逻辑
3. 更新API接口

### 自定义定时任务

在 `taskScheduler.js` 中使用 `addTask` 方法：

```javascript
scheduler.addTask('my-task', '0 */6 * * *', async () => {
    // 每6小时执行一次
    await myCustomAnalysis();
});
```

## 🔐 安全性

- API密钥加密存储
- JWT身份验证
- 请求速率限制
- 输入验证和过滤

## 📝 日志

系统会记录详细的运行日志：
- `logs/combined.log` - 综合日志
- `logs/error.log` - 错误日志

## 🤝 贡献

欢迎提交Issue和Pull Request来改进项目！

## 📄 许可证

MIT License

## ⚠️ 免责声明

本系统仅供学习和研究使用，不构成投资建议。投资有风险，请谨慎决策。

## 🚀 CloudBase 部署信息

### 部署状态

- **环境 ID**: `test-3gj6hf8n9547bbc0`
- **区域**: `ap-shanghai`
- **部署日期**: 2026-03-04

### 前端访问地址

🌐 **Web 应用**: https://test-3gj6hf8n9547bbc0-1257106486.tcloudbaseapp.com/

已部署的前端文件：
- `index.html` - 主页面
- `agent.html` - AI Agent 页面
- `app.js` - 前端应用脚本

### 后端部署说明

后端使用 CloudBase Run（容器模式）部署，包含以下特性：
- Node.js Express 应用
- WebSocket 实时通信
- AI 模型管理
- 9 维度股票分析

**部署方式**：
由于后端服务需要构建 Docker 镜像，建议使用以下方式部署：

1. **控制台部署**（推荐）：
   - 访问 CloudBase 控制台：https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/platform-run
   - 点击"新建服务" → 选择"容器服务"
   - 上传代码或连接 Git 仓库
   - 配置资源规格（建议：CPU 0.5核，内存 1GB）

2. **CLI 部署**：
   ```bash
   # 安装 CloudBase CLI
   npm install -g @cloudbase/cli
   
   # 登录
   tcb login
   
   # 部署
   tcb fn deploy stock-analysis-backend --runtime Nodejs18.13
   ```

### 环境变量配置

后端需要配置以下环境变量：

```bash
NODE_ENV=production
PORT=3000
MONGODB_URI=<your-mongodb-uri>
JWT_SECRET=<your-jwt-secret>
OPENAI_API_KEY=<your-openai-key>
NVIDIA_API_KEY=<your-nvidia-key>
WECHAT_CORPID=<your-wechat-corpid>
WECHAT_CORPSECRET=<your-wechat-secret>
WECHAT_AGENTID=<your-wechat-agentid>
```

### CloudBase 资源

已启用的 CloudBase 服务：
- ✅ 静态网站托管
- ✅ 云托管（待部署）
- ✅ 数据库（MySQL）
- ✅ 云存储
- ✅ 云函数

### 控制台入口

- **概览**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/overview
- **云托管**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/platform-run
- **静态托管**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/static-hosting
- **数据库**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/db/mysql/table/default/
- **云函数**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/scf
