# Roadmap & Milestones — AI Stock Analysis MVP v1.0

Version: v1.0
Last updated: 2026-02-12

1) 目标与原则
- 快速交付 MVP，确保端到端链路可用；在 MVP 基础上迅速扩展扩展阶段功能。
- 以可验证的里程碑与可交付物推动实现，确保质量与可维护性。

2) Phase-based Milestones
- Phase A: 需求确认与环境就绪
  - Deliverables: 最终 MVP 范围、技术栈列明、接口草案、环境搭建脚本
  - Success Criteria: 需求评审通过，能本地运行项目

- Phase B: 新闻抓取与数据管线骨架
  - Tasks: 实现 news-ingest 框架（2-3 源）、去重与归档、MongoDB 初始模型
  - Deliverables: NewsItem/Topic/AnalysisResult 的持久化、去重可用
  - Success Criteria: 能从源抓取并写入数据库，具备去重

- Phase C: AI 引擎与分析管线初版
  - Tasks: ModelManager 与 provider 接口、基础分析管线、初版报告
  - Deliverables: 端到端闭环的初版实现
  - Success Criteria: 新闻 -> 分析 -> 报告的可运行流程

- Phase D: 推送与管理 UI 初版
  - Tasks: PushService 对接、Admin UI 最小可用界面、定时任务
  - Deliverables: 能定时推送测试报告
  - Success Criteria: 至少一个推送通道可工作

- Phase E: 集成、测试与文档
  - Tasks: 完整测试用例、日志与监控、CI/CD、上线文档
  - Deliverables: 测试通过、构建可部署版本
  - Success Criteria: 全部核心功能可通过测试并可上线

- Phase F: 上线与迭代准备
  - Tasks: 上线首批环境、收集真实数据、基于反馈的迭代计划
  - Deliverables: 运行稳定的生产环境，下一轮迭代计划明确

3) 时间线（估算，按 2-4 周一个阶段以 MVP 为优先）
- Phase A: 1-2 周
- Phase B: 2-3 周
- Phase C: 3-4 周
- Phase D: 2-3 周
- Phase E: 2 周
- Phase F: 2 周

4) 风险与缓解
- 数据源变更：实现来源适配层与热更新能力
- AI 成本波动：多提供商策略与成本上限
- 推送合规：遵循渠道条款，记录发送日志
- 安全与合规：最小权限、日志脱敏、密钥管理
- 回滚方案：数据库迁移与特性开关

5) 交付物与验收
- 每阶段提供验收清单、测试覆盖率与示例数据
- 代码合并前需通过静态检查、单元测试与集成测试
- 提供用户文档与部署文档

6) 下一步
- 根据你的反馈确认阶段优先级、关键问题答案后，我将生成详细的任务清单（WBS）与实现计划，并开始阶段性实现。
