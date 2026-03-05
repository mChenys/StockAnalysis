# coding=utf-8
"""
AI 分析器模块

调用 AI 大模型对热点新闻进行深度分析
基于 LiteLLM 统一接口，支持 100+ AI 提供商
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from trendradar.ai.client import AIClient


@dataclass
class AIAnalysisResult:
    """AI 分析结果"""
    # 新版 5 核心板块
    core_trends: str = ""                # 核心热点与舆情态势
    sentiment_controversy: str = ""      # 舆论风向与争议
    signals: str = ""                    # 异动与弱信号
    rss_insights: str = ""               # RSS 深度洞察
    outlook_strategy: str = ""           # 研判与策略建议
    stock_recommendations: str = ""      # 股票推荐与代码
    risk_alerts: str = ""                # 风险警示与代码
    standalone_summaries: Dict[str, str] = field(default_factory=dict)  # 独立展示区概括 {源ID: 概括}

    # 基础元数据
    raw_response: str = ""               # 原始响应
    success: bool = False                # 是否成功
    error: str = ""                      # 错误信息

    # 新闻数量统计
    total_news: int = 0                  # 总新闻数（热榜+RSS）
    analyzed_news: int = 0               # 实际分析的新闻数
    max_news_limit: int = 0              # 分析上限配置值
    hotlist_count: int = 0               # 热榜新闻数
    rss_count: int = 0                   # RSS 新闻数
    ai_mode: str = ""                    # AI 分析使用的模式 (daily/current/incremental)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典以便序列化"""
        return {
            "core_trends": self.core_trends,
            "sentiment_controversy": self.sentiment_controversy,
            "signals": self.signals,
            "rss_insights": self.rss_insights,
            "outlook_strategy": self.outlook_strategy,
            "stock_recommendations": self.stock_recommendations,
            "risk_alerts": self.risk_alerts,
            "standalone_summaries": self.standalone_summaries,
            "raw_response": self.raw_response,
            "success": self.success,
            "error": self.error,
            "total_news": self.total_news,
            "analyzed_news": self.analyzed_news,
            "max_news_limit": self.max_news_limit,
            "hotlist_count": self.hotlist_count,
            "rss_count": self.rss_count,
            "ai_mode": self.ai_mode
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AIAnalysisResult":
        """从字典恢复对象"""
        if not data:
            return cls()
        return cls(
            core_trends=data.get("core_trends", ""),
            sentiment_controversy=data.get("sentiment_controversy", ""),
            signals=data.get("signals", ""),
            rss_insights=data.get("rss_insights", ""),
            outlook_strategy=data.get("outlook_strategy", ""),
            stock_recommendations=data.get("stock_recommendations", ""),
            risk_alerts=data.get("risk_alerts", ""),
            standalone_summaries=data.get("standalone_summaries", {}),
            raw_response=data.get("raw_response", ""),
            success=data.get("success", False),
            error=data.get("error", ""),
            total_news=data.get("total_news", 0),
            analyzed_news=data.get("analyzed_news", 0),
            max_news_limit=data.get("max_news_limit", 0),
            hotlist_count=data.get("hotlist_count", 0),
            rss_count=data.get("rss_count", 0),
            ai_mode=data.get("ai_mode", "")
        )


class AIAnalyzer:
    """AI 分析器"""

    def __init__(
        self,
        ai_config: Dict[str, Any],
        analysis_config: Dict[str, Any],
        get_time_func: Callable,
        debug: bool = False,
    ):
        """
        初始化 AI 分析器

        Args:
            ai_config: AI 模型配置（LiteLLM 格式）
            analysis_config: AI 分析功能配置（language, prompt_file 等）
            get_time_func: 获取当前时间的函数
            debug: 是否开启调试模式
        """
        self.ai_config = ai_config
        self.analysis_config = analysis_config
        self.get_time_func = get_time_func
        self.debug = debug

        # 创建 AI 客户端（基于 LiteLLM）
        self.client = AIClient(ai_config)

        # 验证配置
        valid, error = self.client.validate_config()
        if not valid:
            print(f"[AI] 配置警告: {error}")

        # 从分析配置获取功能参数
        self.max_news = analysis_config.get("MAX_NEWS_FOR_ANALYSIS", 50)
        self.include_rss = analysis_config.get("INCLUDE_RSS", True)
        self.include_rank_timeline = analysis_config.get("INCLUDE_RANK_TIMELINE", False)
        self.include_standalone = analysis_config.get("INCLUDE_STANDALONE", False)
        self.language = analysis_config.get("LANGUAGE", "Chinese")

        # 加载提示词模板
        self.system_prompt, self.user_prompt_template = self._load_prompt_template(
            analysis_config.get("PROMPT_FILE", "ai_analysis_prompt.txt")
        )

        # 并行模式配置
        self.parallel_mode = os.environ.get("PARALLEL_AI", "false").lower() == "true"
        models_json = os.environ.get("AI_MODELS_POOL", "[]")
        try:
            self.models_pool = json.loads(models_json)
        except:
            self.models_pool = []
        
        if self.parallel_mode:
            print(f"[AI] 并行模式已启用，备选模型池大小: {len(self.models_pool)}")

    def _load_prompt_template(self, prompt_file: str) -> tuple:
        """加载提示词模板"""
        config_dir = Path(__file__).parent.parent.parent / "config"
        prompt_path = config_dir / prompt_file

        if not prompt_path.exists():
            print(f"[AI] 提示词文件不存在: {prompt_path}")
            return "", ""

        content = prompt_path.read_text(encoding="utf-8")

        # 解析 [system] 和 [user] 部分
        system_prompt = ""
        user_prompt = ""

        if "[system]" in content and "[user]" in content:
            parts = content.split("[user]")
            system_part = parts[0]
            user_part = parts[1] if len(parts) > 1 else ""

            # 提取 system 内容
            if "[system]" in system_part:
                system_prompt = system_part.split("[system]")[1].strip()

            user_prompt = user_part.strip()
        else:
            # 整个文件作为 user prompt
            user_prompt = content

        return system_prompt, user_prompt

    def analyze(
        self,
        stats: List[Dict],
        rss_stats: Optional[List[Dict]] = None,
        report_mode: str = "daily",
        report_type: str = "当日汇总",
        platforms: Optional[List[str]] = None,
        keywords: Optional[List[str]] = None,
        standalone_data: Optional[Dict] = None,
    ) -> AIAnalysisResult:
        """执行 AI 分析"""
        
        # 准备数据
        news_content, rss_content, hotlist_total, rss_total, analyzed_count = self._prepare_news_content(stats, rss_stats)
        total_news = hotlist_total + rss_total

        if not news_content and not rss_content:
            return AIAnalysisResult(success=False, error="没有可分析的新闻内容", total_news=total_news)

        # 并行分析逻辑
        if self.parallel_mode and analyzed_count > 15:
            return self._analyze_parallel(
                news_content, rss_content, stats, hotlist_total, rss_total, 
                analyzed_count, report_mode, report_type, platforms, keywords, standalone_data
            )

        # --- 原始单模型分析逻辑 ---
        # 构建提示词
        current_time = self.get_time_func().strftime("%Y-%m-%d %H:%M:%S")

        # 提取关键词
        if not keywords:
            keywords = [s.get("word", "") for s in stats if s.get("word")] if stats else []

        user_prompt = self.user_prompt_template
        user_prompt = user_prompt.replace("{report_mode}", report_mode)
        user_prompt = user_prompt.replace("{report_type}", report_type)
        user_prompt = user_prompt.replace("{current_time}", current_time)
        user_prompt = user_prompt.replace("{news_count}", str(hotlist_total))
        user_prompt = user_prompt.replace("{rss_count}", str(rss_total))
        user_prompt = user_prompt.replace("{platforms}", ", ".join(platforms) if platforms else "多平台")
        user_prompt = user_prompt.replace("{keywords}", ", ".join(keywords[:20]) if keywords else "无")
        user_prompt = user_prompt.replace("{news_content}", news_content)
        user_prompt = user_prompt.replace("{rss_content}", rss_content)
        user_prompt = user_prompt.replace("{language}", self.language)

        # 构建独立展示区内容
        standalone_content = ""
        if self.include_standalone and standalone_data:
            standalone_content = self._prepare_standalone_content(standalone_data)
        user_prompt = user_prompt.replace("{standalone_content}", standalone_content)

        # 调用 AI API
        try:
            response = self._call_ai(user_prompt)
            result = self._parse_response(response)
            result.total_news, result.hotlist_count, result.rss_count, result.analyzed_news = total_news, hotlist_total, rss_total, analyzed_count
            return result
        except Exception as e:
            return AIAnalysisResult(success=False, error=f"AI 分析失败: {str(e)}")

    def _analyze_parallel(
        self, news_content, rss_content, stats, hotlist_total, rss_total, 
        analyzed_count, report_mode, report_type, platforms, keywords, standalone_data
    ) -> AIAnalysisResult:
        """并行分块分析与汇总 - 增强版"""
        print(f"[AI] 🚀 正在启动并行加速分析... (总数: {analyzed_count} 条)")
        
        # 1. 任务分块 (稍微调大一点分块，保证上下文)
        all_lines = news_content.split('\n') + rss_content.split('\n')
        chunk_size = 20
        chunks = [all_lines[i:i + chunk_size] for i in range(0, len(all_lines), chunk_size)]
        
        print(f"[AI] 已将内容切分为 {len(chunks)} 个任务块，并行扫描深度已提升")

        # 2. 并行调用备选模型
        model_pool = self.models_pool if self.models_pool else [self.ai_config]
        summaries = []
        
        def process_chunk(chunk_idx, chunk_text, model_cfg):
            client = AIClient(model_cfg)
            # 强化分块提取提示词：要求包含理由，要求不遗漏细节
            prompt = (
                "## 任务：深度金融情报提取\n"
                "你是一名资深量化交易员和宏观分析师。请深度扫描以下新闻片段：\n\n"
                f"{chunk_text}\n\n"
                "## 要求：\n"
                "1. 提取核心投资主线以及潜伏的异动信号。\n"
                "2. 挖掘所有关联的上市公司（包括 A 股、港股、美股）。\n"
                "3. **必须**为每只股票提供简短但致命的推荐逻辑（为什么它会受此新闻驱动？）。\n"
                "4. 格式：[代码] 公司名：逻辑... \n"
                "5. 拒绝废话，只输出干货情报。"
            )
            try:
                resp = client.chat([{"role": "user", "content": prompt}])
                return f"--- 任务块 {chunk_idx+1} 情报汇总 ---\n{resp}"
            except Exception as e:
                return f"--- 任务块 {chunk_idx+1} 扫描中断 ---\n原因: {str(e)}"

        with ThreadPoolExecutor(max_workers=min(len(chunks), 15)) as executor:
            future_to_chunk = {
                executor.submit(process_chunk, i, "\n".join(chunk), model_pool[i % len(model_pool)]): i 
                for i, chunk in enumerate(chunks)
            }
            for future in as_completed(future_to_chunk):
                summaries.append(future.result())

        print(f"[AI] 并行分块扫描完成，情报碎片已收集，正在进入多维合成阶段...")

        # 3. 终极合成分析 (Synthesis)
        current_time = self.get_time_func().strftime("%Y-%m-%d %H:%M:%S")
        combined_summaries = "\n\n".join(summaries)
        
        synthesis_prompt = self.user_prompt_template
        # 清空原始新闻占位符，由汇总情报替代，减少主回复回复的 Token 压力并提高精度
        synthesis_prompt = synthesis_prompt.replace("{news_content}", "（参见下方[深度情报快照]）")
        synthesis_prompt = synthesis_prompt.replace("{rss_content}", "（已整合进情报汇总）")
        
        synthesis_prompt = synthesis_prompt.replace("{report_mode}", report_mode).replace("{report_type}", report_type)
        synthesis_prompt = synthesis_prompt.replace("{current_time}", current_time)
        synthesis_prompt = synthesis_prompt.replace("{news_count}", str(hotlist_total))
        synthesis_prompt = synthesis_prompt.replace("{rss_count}", str(rss_total))
        synthesis_prompt = synthesis_prompt.replace("{platforms}", ", ".join(platforms) if platforms else "多平台")
        synthesis_prompt = synthesis_prompt.replace("{keywords}", ", ".join(keywords[:20]) if keywords else "无")
        synthesis_prompt = synthesis_prompt.replace("{language}", self.language)

        standalone_content = ""
        if self.include_standalone and standalone_data:
            standalone_content = self._prepare_standalone_content(standalone_data)
        synthesis_prompt = synthesis_prompt.replace("{standalone_content}", standalone_content)

        # 终极提示词强化：要求必须包含理由，纠正格式错误
        final_user_prompt = (
            f"{synthesis_prompt}\n\n"
            "## [深度情报快照：第一阶段分布式扫描结果]\n"
            f"{combined_summaries}\n\n"
            "## 终极指令（强制执行）：\n"
            "1. 现在的任务是：将上述零散的情报碎片合成为一份完整、连贯、且极具商业价值的研报。\n"
            "2. **股票推荐板块**：禁止仅列出名字。必须按照格式 `1. [代码] 公司名：具体逻辑原因` 进行输出。**逻辑原因必须基于新闻事实，不能少于 15 字。**\n"
            "3. 即使新闻很多，也要经过严谨筛选，至少推荐 5-10 只极具潜力的个股。覆盖 A 股、美股和港股。\n"
            "4. 严禁在代码后面加点（如禁止输出 [AAPL.O] 或 [0700.HK]），只能使用纯代码。\n"
            "5. 请根据数据量和深度输出内容丰富、逻辑严密的 JSON。"
        )
        
        try:
            response = self._call_ai(final_user_prompt)
            result = self._parse_response(response)
            result.total_news, result.hotlist_count, result.rss_count, result.analyzed_news = hotlist_total + rss_total, hotlist_total, rss_total, analyzed_count
            return result
        except Exception as e:
            return AIAnalysisResult(success=False, error=f"合成分析失败: {str(e)}")

    def _prepare_news_content(
        self,
        stats: List[Dict],
        rss_stats: Optional[List[Dict]] = None,
    ) -> tuple:
        """
        准备新闻内容文本（增强版）

        热榜新闻包含：来源、标题、排名范围、时间范围、出现次数
        RSS 包含：来源、标题、发布时间

        Returns:
            tuple: (news_content, rss_content, hotlist_total, rss_total, analyzed_count)
        """
        news_lines = []
        rss_lines = []
        news_count = 0
        rss_count = 0

        # 计算总新闻数
        hotlist_total = sum(len(s.get("titles", [])) for s in stats) if stats else 0
        rss_total = sum(len(s.get("titles", [])) for s in rss_stats) if rss_stats else 0

        # 热榜内容
        if stats:
            for stat in stats:
                word = stat.get("word", "")
                titles = stat.get("titles", [])
                if word and titles:
                    news_lines.append(f"\n**{word}** ({len(titles)}条)")
                    for t in titles:
                        if not isinstance(t, dict):
                            continue
                        title = t.get("title", "")
                        if not title:
                            continue

                        # 来源
                        source = t.get("source_name", t.get("source", ""))

                        # 构建行
                        if source:
                            line = f"- [{source}] {title}"
                        else:
                            line = f"- {title}"

                        # 始终显示简化格式：排名范围 + 时间范围 + 出现次数
                        ranks = t.get("ranks", [])
                        if ranks:
                            min_rank = min(ranks)
                            max_rank = max(ranks)
                            rank_str = f"{min_rank}" if min_rank == max_rank else f"{min_rank}-{max_rank}"
                        else:
                            rank_str = "-"

                        first_time = t.get("first_time", "")
                        last_time = t.get("last_time", "")
                        time_str = self._format_time_range(first_time, last_time)

                        appear_count = t.get("count", 1)

                        line += f" | 排名:{rank_str} | 时间:{time_str} | 出现:{appear_count}次"

                        # 开启完整时间线时，额外添加轨迹
                        if self.include_rank_timeline:
                            rank_timeline = t.get("rank_timeline", [])
                            timeline_str = self._format_rank_timeline(rank_timeline)
                            line += f" | 轨迹:{timeline_str}"

                        news_lines.append(line)

                        news_count += 1
                        if news_count >= self.max_news:
                            break
                if news_count >= self.max_news:
                    break

        # RSS 内容（仅在启用时构建）
        if self.include_rss and rss_stats:
            remaining = self.max_news - news_count
            for stat in rss_stats:
                if rss_count >= remaining:
                    break
                word = stat.get("word", "")
                titles = stat.get("titles", [])
                if word and titles:
                    rss_lines.append(f"\n**{word}** ({len(titles)}条)")
                    for t in titles:
                        if not isinstance(t, dict):
                            continue
                        title = t.get("title", "")
                        if not title:
                            continue

                        # 来源
                        source = t.get("source_name", t.get("feed_name", ""))

                        # 发布时间
                        time_display = t.get("time_display", "")

                        # 构建行：[来源] 标题 | 发布时间
                        if source:
                            line = f"- [{source}] {title}"
                        else:
                            line = f"- {title}"
                        if time_display:
                            line += f" | {time_display}"
                        rss_lines.append(line)

                        rss_count += 1
                        if rss_count >= remaining:
                            break

        news_content = "\n".join(news_lines) if news_lines else ""
        rss_content = "\n".join(rss_lines) if rss_lines else ""
        total_count = news_count + rss_count

        return news_content, rss_content, hotlist_total, rss_total, total_count

    def _call_ai(self, user_prompt: str) -> str:
        """调用 AI API（使用 LiteLLM）"""
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        return self.client.chat(messages)

    def _format_time_range(self, first_time: str, last_time: str) -> str:
        """格式化时间范围（简化显示，只保留时分）"""
        def extract_time(time_str: str) -> str:
            if not time_str:
                return "-"
            # 尝试提取 HH:MM 部分
            if " " in time_str:
                parts = time_str.split(" ")
                if len(parts) >= 2:
                    time_part = parts[1]
                    if ":" in time_part:
                        return time_part[:5]  # HH:MM
            elif ":" in time_str:
                return time_str[:5]
            # 处理 HH-MM 格式
            result = time_str[:5] if len(time_str) >= 5 else time_str
            if len(result) == 5 and result[2] == '-':
                result = result.replace('-', ':')
            return result

        first = extract_time(first_time)
        last = extract_time(last_time)

        if first == last or last == "-":
            return first
        return f"{first}~{last}"

    def _format_rank_timeline(self, rank_timeline: List[Dict]) -> str:
        """格式化排名时间线"""
        if not rank_timeline:
            return "-"

        parts = []
        for item in rank_timeline:
            time_str = item.get("time", "")
            if len(time_str) == 5 and time_str[2] == '-':
                time_str = time_str.replace('-', ':')
            rank = item.get("rank")
            if rank is None:
                parts.append(f"0({time_str})")
            else:
                parts.append(f"{rank}({time_str})")

        return "→".join(parts)

    def _prepare_standalone_content(self, standalone_data: Dict) -> str:
        """
        将独立展示区数据转为文本，注入 AI 分析 prompt

        Args:
            standalone_data: 独立展示区数据 {"platforms": [...], "rss_feeds": [...]}

        Returns:
            格式化的文本内容
        """
        lines = []

        # 热榜平台
        for platform in standalone_data.get("platforms", []):
            platform_id = platform.get("id", "")
            platform_name = platform.get("name", platform_id)
            items = platform.get("items", [])
            if not items:
                continue

            lines.append(f"### [{platform_name}]")
            for item in items:
                title = item.get("title", "")
                if not title:
                    continue

                line = f"- {title}"

                # 排名信息
                ranks = item.get("ranks", [])
                if ranks:
                    min_rank = min(ranks)
                    max_rank = max(ranks)
                    rank_str = f"{min_rank}" if min_rank == max_rank else f"{min_rank}-{max_rank}"
                    line += f" | 排名:{rank_str}"

                # 时间范围
                first_time = item.get("first_time", "")
                last_time = item.get("last_time", "")
                if first_time:
                    time_str = self._format_time_range(first_time, last_time)
                    line += f" | 时间:{time_str}"

                # 出现次数
                count = item.get("count", 1)
                if count > 1:
                    line += f" | 出现:{count}次"

                # 排名轨迹（如果启用）
                if self.include_rank_timeline:
                    rank_timeline = item.get("rank_timeline", [])
                    if rank_timeline:
                        timeline_str = self._format_rank_timeline(rank_timeline)
                        line += f" | 轨迹:{timeline_str}"

                lines.append(line)
            lines.append("")

        # RSS 源
        for feed in standalone_data.get("rss_feeds", []):
            feed_id = feed.get("id", "")
            feed_name = feed.get("name", feed_id)
            items = feed.get("items", [])
            if not items:
                continue

            lines.append(f"### [{feed_name}]")
            for item in items:
                title = item.get("title", "")
                if not title:
                    continue

                line = f"- {title}"
                published_at = item.get("published_at", "")
                if published_at:
                    line += f" | {published_at}"

                lines.append(line)
            lines.append("")

        return "\n".join(lines)

    def _parse_response(self, response: str) -> AIAnalysisResult:
        """解析 AI 响应"""
        result = AIAnalysisResult(raw_response=response)

        if not response or not response.strip():
            result.error = "AI 返回空响应"
            return result

        try:
            json_str = response

            if "```json" in response:
                parts = response.split("```json", 1)
                if len(parts) > 1:
                    code_block = parts[1]
                    end_idx = code_block.find("```")
                    if end_idx != -1:
                        json_str = code_block[:end_idx]
                    else:
                        json_str = code_block
            elif "```" in response:
                parts = response.split("```", 2)
                if len(parts) >= 2:
                    json_str = parts[1]

            json_str = json_str.strip()
            if not json_str:
                raise ValueError("提取的 JSON 内容为空")

            data = json.loads(json_str)

            # 新版字段解析
            result.core_trends = data.get("core_trends", "")
            result.sentiment_controversy = data.get("sentiment_controversy", "")
            result.signals = data.get("signals", "")
            result.rss_insights = data.get("rss_insights", "")
            result.outlook_strategy = data.get("outlook_strategy", "")
            result.stock_recommendations = data.get("stock_recommendations", "")
            result.risk_alerts = data.get("risk_alerts", "")

            # 解析独立展示区概括
            summaries = data.get("standalone_summaries", {})
            if isinstance(summaries, dict):
                result.standalone_summaries = {
                    str(k): str(v) for k, v in summaries.items()
                }
            
            result.success = True

        except json.JSONDecodeError as e:
            error_context = json_str[max(0, e.pos - 30):e.pos + 30] if json_str and e.pos else ""
            result.error = f"JSON 解析错误 (位置 {e.pos}): {e.msg}"
            if error_context:
                result.error += f"，上下文: ...{error_context}..."
            # 使用原始响应填充 core_trends，确保有输出
            result.core_trends = response[:500] + "..." if len(response) > 500 else response
            result.success = True
        except (IndexError, KeyError, TypeError, ValueError) as e:
            result.error = f"响应解析错误: {type(e).__name__}: {str(e)}"
            result.core_trends = response[:500] if len(response) > 500 else response
            result.success = True
        except Exception as e:
            result.error = f"解析时发生未知错误: {type(e).__name__}: {str(e)}"
            result.core_trends = response[:500] if len(response) > 500 else response
            result.success = True

        return result
