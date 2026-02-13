# Requirements Specification — AI-Stock-Analysis MVP v1.0

Version: v1.0
Last updated: 2026-02-12

1) 背景与目标
- 构建一个可接入多 AI 模型的 Node.js 应用，抓取财经新闻与热点，进行本地分析（结合 AI 技能/插件能力），生成买卖/投资建议报告，并通过微信/飞书等渠道精准推送给用户。
- 当前仓库为半成品，需补齐新闻抓取、AI 模型管理、分析引擎、报告生成、推送通道以及管理 UI 的端到端流程。

2) 角色与权限
- 普通用户：查看历史分析、下载报告、配置推送策略。
- 管理员/运维：管理 AI 模型/技能、配置数据源、监控告警、查看日志。
- 外部服务：外部 AI 服务提供商、新闻源 API、微信/飞书推送接口。

3) MVP 与分阶段发展
- MVP 核心功能：新闻抓取与去重、AI 模型接入与插件、本地分析引擎、报告生成与导出、推送通道、简单 Admin UI、日志与监控。
- 后续扩展：多源异步数据流、实时性优化、增强报告、复杂告警、用户账户与订阅、数据安全与审计日志。

4) 非功能性需求
- 性能与扩展性：模块化、横向扩展，并发友好。
- 可用性：幂等性、重试、鲁棒错误处理。
- 可靠性：持久化、容错定时任务、自动恢复。
- 安全性：认证、脱敏、环境变量管理、漏洞监控。
- 可维护性：统一风格、注释、JSDoc、清晰接口契约。
- 可测试性：单元测试与集成测试覆盖。
- 数据治理：保留策略、审计追溯。

5) 主要数据模型（字段摘要）
- NewsItem: id, sourceId, url, title, content, publishedAt, topics, sentimentScore, rawJson
- Topic: id, name, relevance, relatedSymbols[]
- AnalysisResult: id, symbol, date, indicators[], signals[], confidence
- Report: id, symbol, dateRange, summary, fullText, attachments[], generatedAt
- ModelConfig: id, provider, version, enabled, configRef
- SkillPlugin: id, name, description, version, config
- PushChannel: id, type, credentialsRef, enabled, schedule
- User: id, name, email, roles, preferences
- TaskLog: id, taskName, status, createdAt, updatedAt, notes

6) 系统接口与契约（高层）
- News Ingest API（内部使用）：fetchSources() -> NewsItem[]
- AI Engine API：ModelManager + provider 接口，analyze(input) -> { output, metadata }
- Analysis Pipeline：run(newsItems, symbols, indicators) -> AnalysisResult
- Report Generator：generate(analysisResult) -> Report
- Push Service：push(report, channelConfig) -> { success, detail }
- Admin API：模型/源/推送配置的管理端点，需鉴权。

7) 风险与合规
- 新闻源授权与版权风险
- AI 成本与 SLA 波动
- 推送渠道合规性
- 数据隐私与安全
- 版本控制与回滚

8) 验收标准
- MVP 实现完整链路：新闻抓取 -> 分析管线 -> 报告生成 -> 推送
- 至少一个可用推送通道
- 管理端可配置模型、源、推送规则
- 核心组件有单元测试与集成测试覆盖
- 日志可追溯，错误可定位，具备告警能力

9) 使用案例
- 用例1：管理员配置新闻源/AI 提供商/推送通道，触发每日抓取并推送日报
- 用例2：普通用户查看最近两周分析并下载 Markdown 报告
- 用例3：检测到重大财经事件并自动推送要点

10) 数据治理与合规指引
- 数据存储遵守最小化原则，定期清理与备份
- 对外 API 输出统一错误结构，避免暴露实现细节
- 审计日志与变更记录
