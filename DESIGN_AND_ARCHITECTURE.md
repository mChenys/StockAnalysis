# Design & Architecture — AI-Stock-Analysis MVP v1.0

Version: v1.0
Last updated: 2026-02-12

1) 总览
- 目标：模块化、可扩展的 Node.js 应用，端到端实现新闻抓取、AI 引擎、分析管线、报告生成与推送
- 数据流：NewsSource -> NewsItem -> Topic/Signal -> AnalysisResult -> Report -> PushChannel -> User

2) 架构要点
- 松耦合的模块化结构：news-ingest、ai-engine、analysis-pipeline、report-generator、push-service、admin-server、data-store、cron-manager
- 统一对外的内部 API 契约，便于替换实现与替换提供商
- 数据存储采用 MongoDB 以便灵活建模新闻、分析与报告
- 日志与监控：Winston 为核心，错误可聚合，留出告警入口
- 安全性：JWT/角色权限，敏感信息脱敏，环境变量管理

3) 组件职责
- news-ingest：新闻源接入、去重、归档、主题提取
- ai-engine：ModelManager、Provider 接口、插件/技能执行封装
- analysis-pipeline：数据清洗、技术指标计算、情绪分析、信号输出
- report-generator：从分析结果生成文本/ Markdown 报告
- push-service：微信/飞书推送实现及调度触发
- admin-server：管理界面与 Admin API，带鉴权
- data-store：MongoDB 的数据模型与持久化逻辑
- cron-manager：任务调度与事件驱动

4) 数据模型与契约（文本化）
- NewsItem: { _id, sourceId, url, title, content, publishedAt, topics, sentimentScore, rawJson }
- Topic: { _id, name, relevance, relatedSymbols: [] }
- AnalysisResult: { _id, symbol, date, indicators: [], signals: [], confidence }
- Report: { _id, symbol, dateRange: { from, to }, summary, fullText, attachments: [], generatedAt }
- ModelConfig: { _id, provider, version, enabled, configRef }
- SkillPlugin: { _id, name, description, version, config }
- PushChannel: { _id, type, credentialsRef, enabled, schedule }
- User: { _id, name, email, roles, preferences }
- TaskLog: { _id, taskName, status, createdAt, updatedAt, notes }

5) 关键接口契约（示意）
- internal API 示例：
  - POST /internal/api/news/ingest
    - Body: { sources: [{ id, params }], limit }
    - Response: { success, ingested, errors? }
- internal API：AI analyze、analysis run、reports generate、push send

6) 安全设计要点
- 密钥放在环境变量/密钥管理服务，不在数据库明文保存
- JWT 认证、最小权限原则
- 日志脱敏、不要记录密钥
- API 输出统一错误结构

7) 测试策略
- 单元测试：核心数据转换、管线逻辑、模型封装
- 集成测试：端到端流程（新闻抓取 -> 分析 -> 报告 -> 推送）
- 性能基线与压力测试

8) MVP 实现路线（概要）
- 新闻源接入 2-3 源，去重与归档
- ModelManager 与 provider 接口，至少一个提供商的 MVP 实现
- 分析管线基础实现：清洗、指标、情绪、信号
- 报告生成（Markdown/Text）
- PushService 初版（微信/飞书之一）
- Admin UI 的最小可用界面

9) 部署与运维
- 本地开发/Docker 初始支持
- 日志与监控初步搭建
- 变更日志与版本控制策略

10) 附：未来扩展点
- 实时流数据、图表化报告、复杂告警、订阅与计费、数据安全合规扩展
