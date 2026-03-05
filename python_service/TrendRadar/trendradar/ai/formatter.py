# coding=utf-8
"""
AI 分析结果格式化模块

将 AI 分析结果格式化为各推送渠道的样式
"""

import html as html_lib
import re
from .analyzer import AIAnalysisResult


def _escape_html(text: str) -> str:
    """转义 HTML 特殊字符，防止 XSS 攻击"""
    return html_lib.escape(text) if text else ""


def _format_list_content(text: str) -> str:
    """
    格式化列表内容，确保序号前有换行
    例如将 "1. xxx 2. yyy" 转换为:
    1. xxx
    2. yyy
    """
    if not text:
        return ""
    
    # 去除首尾空白，防止 AI 返回的内容开头就有换行导致显示空行
    text = text.strip()

    # 0. 合并序号与紧随的【标签】（防御性处理）
    # 将 "1.\n【投资者】：" 或 "1. 【投资者】：" 合并为 "1. 投资者："
    text = re.sub(r'(\d+\.)\s*【([^】]+)】([:：]?)', r'\1 \2：', text)

    # 1. 规范化：确保 "1." 后面有空格
    result = re.sub(r'(\d+)\.([^ \d])', r'\1. \2', text)

    # 2. 强制换行：匹配 "数字."，且前面不是换行符
    result = re.sub(r'(?<=[^\n])\s+(\d+\.)', r'\n\1', result)
    
    # 3. 处理 "1.**粗体**" 这种情况（虽然 Prompt 要求不输出 Markdown，但防御性处理）
    result = re.sub(r'(?<=[^\n])(\d+\.\*\*)', r'\n\1', result)

    # 4. 处理中文标点后的换行
    result = re.sub(r'([：:;,。；，])\s*(\d+\.)', r'\1\n\2', result)

    # 5. 处理 "XX方面："、"XX领域：" 等子标题换行
    # 只有在中文标点（句号、逗号、分号等）后才触发换行，避免破坏 "1. XX领域：" 格式
    result = re.sub(r'([。！？；，、])\s*([a-zA-Z0-9\u4e00-\u9fa5]+(方面|领域)[:：])', r'\1\n\2', result)

    # 6. 处理 【标签】 格式
    # 6a. 标签前确保空行分隔（文本开头除外）
    result = re.sub(r'(?<=\S)\n*(【[^】]+】)', r'\n\n\1', result)
    # 6b. 合并标签与被换行拆开的冒号：【tag】\n： → 【tag】：
    result = re.sub(r'(【[^】]+】)\n+([:：])', r'\1\2', result)
    # 6c. 标签后（含可选冒号），如果紧跟非空白非冒号内容则另起一行
    # 用 (?=[^\s:：]) 避免正则回溯将冒号误判为"内容"而拆开 【tag】：
    result = re.sub(r'(【[^】]+】[:：]?)[ \t]*(?=[^\s:：])', r'\1\n', result)

    # 7. 在列表项之间增加视觉空行
    # 排除 【标签】 行（以】结尾）和子标题行（以冒号结尾）之后的情况，避免标题与首项之间出现空行
    result = re.sub(r'(?<![:：】])\n(\d+\.)', r'\n\n\1', result)

    return result


def _format_standalone_summaries(summaries: dict) -> str:
    """格式化独立展示区概括为纯文本行，每个源名称单独一行"""
    if not summaries:
        return ""
    lines = []
    for source_name, summary in summaries.items():
        if summary:
            lines.append(f"[{source_name}]:\n{summary}")
    return "\n\n".join(lines)


def render_ai_analysis_markdown(result: AIAnalysisResult) -> str:
    """渲染为通用 Markdown 格式（Telegram、企业微信、ntfy、Bark、Slack）"""
    if not result.success:
        return f"⚠️ AI 分析失败: {result.error}"

    lines = ["**✨ AI 热点分析**", ""]

    if result.core_trends:
        lines.extend(["**核心热点态势**", _format_list_content(result.core_trends), ""])

    if result.sentiment_controversy:
        lines.extend(
            ["**舆论风向争议**", _format_list_content(result.sentiment_controversy), ""]
        )

    if result.signals:
        lines.extend(["**异动与弱信号**", _format_list_content(result.signals), ""])

    if result.rss_insights:
        lines.extend(
            ["**RSS 深度洞察**", _format_list_content(result.rss_insights), ""]
        )

    if result.outlook_strategy:
        lines.extend(
            ["**研判策略建议**", _format_list_content(result.outlook_strategy), ""]
        )

    if result.stock_recommendations:
        lines.extend(
            ["**📈 股票推荐及代码**", _format_list_content(result.stock_recommendations), ""]
        )

    if result.risk_alerts:
        lines.extend(
            ["**⚠️ 利空风险警示**", _format_list_content(result.risk_alerts), ""]
        )

    if result.standalone_summaries:
        summaries_text = _format_standalone_summaries(result.standalone_summaries)
        if summaries_text:
            lines.extend(["**独立源点速览**", summaries_text])

    return "\n".join(lines)


def render_ai_analysis_feishu(result: AIAnalysisResult) -> str:
    """渲染为飞书卡片 Markdown 格式"""
    if not result.success:
        return f"⚠️ AI 分析失败: {result.error}"

    lines = ["**✨ AI 热点分析**", ""]

    if result.core_trends:
        lines.extend(["**核心热点态势**", _format_list_content(result.core_trends), ""])

    if result.sentiment_controversy:
        lines.extend(
            ["**舆论风向争议**", _format_list_content(result.sentiment_controversy), ""]
        )

    if result.signals:
        lines.extend(["**异动与弱信号**", _format_list_content(result.signals), ""])

    if result.rss_insights:
        lines.extend(
            ["**RSS 深度洞察**", _format_list_content(result.rss_insights), ""]
        )

    if result.outlook_strategy:
        lines.extend(
            ["**研判策略建议**", _format_list_content(result.outlook_strategy), ""]
        )

    if result.risk_alerts:
        lines.extend(
            ["**⚠️ 利空风险警示**", _format_list_content(result.risk_alerts), ""]
        )

    if result.standalone_summaries:
        summaries_text = _format_standalone_summaries(result.standalone_summaries)
        if summaries_text:
            lines.extend(["**独立源点速览**", summaries_text])

    return "\n".join(lines)


def render_ai_analysis_dingtalk(result: AIAnalysisResult) -> str:
    """渲染为钉钉 Markdown 格式"""
    if not result.success:
        return f"⚠️ AI 分析失败: {result.error}"

    lines = ["### ✨ AI 热点分析", ""]

    if result.core_trends:
        lines.extend(
            ["#### 核心热点态势", _format_list_content(result.core_trends), ""]
        )

    if result.sentiment_controversy:
        lines.extend(
            [
                "#### 舆论风向争议",
                _format_list_content(result.sentiment_controversy),
                "",
            ]
        )

    if result.signals:
        lines.extend(["#### 异动与弱信号", _format_list_content(result.signals), ""])

    if result.rss_insights:
        lines.extend(
            ["#### RSS 深度洞察", _format_list_content(result.rss_insights), ""]
        )

    if result.outlook_strategy:
        lines.extend(
            ["#### 研判策略建议", _format_list_content(result.outlook_strategy), ""]
        )

    if result.stock_recommendations:
        lines.extend(
            ["#### 📈 股票推荐及代码", _format_list_content(result.stock_recommendations), ""]
        )

    if result.risk_alerts:
        lines.extend(
            ["#### ⚠️ 利空风险警示", _format_list_content(result.risk_alerts), ""]
        )

    if result.standalone_summaries:
        summaries_text = _format_standalone_summaries(result.standalone_summaries)
        if summaries_text:
            lines.extend(["#### 独立源点速览", summaries_text])

    return "\n".join(lines)


def render_ai_analysis_html(result: AIAnalysisResult) -> str:
    """渲染为 HTML 格式（邮件）"""
    if not result.success:
        return (
            f'<div class="ai-error">⚠️ AI 分析失败: {_escape_html(result.error)}</div>'
        )

    html_parts = ['<div class="ai-analysis">', "<h3>✨ AI 热点分析</h3>"]

    if result.core_trends:
        content = _format_list_content(result.core_trends)
        content_html = _escape_html(content).replace("\n", "<br>")
        html_parts.extend(
            [
                '<div class="ai-section">',
                "<h4>核心热点态势</h4>",
                f'<div class="ai-content">{content_html}</div>',
                "</div>",
            ]
        )

    if result.sentiment_controversy:
        content = _format_list_content(result.sentiment_controversy)
        content_html = _escape_html(content).replace("\n", "<br>")
        html_parts.extend(
            [
                '<div class="ai-section">',
                "<h4>舆论风向争议</h4>",
                f'<div class="ai-content">{content_html}</div>',
                "</div>",
            ]
        )

    if result.signals:
        content = _format_list_content(result.signals)
        content_html = _escape_html(content).replace("\n", "<br>")
        html_parts.extend(
            [
                '<div class="ai-section">',
                "<h4>异动与弱信号</h4>",
                f'<div class="ai-content">{content_html}</div>',
                "</div>",
            ]
        )

    if result.rss_insights:
        content = _format_list_content(result.rss_insights)
        content_html = _escape_html(content).replace("\n", "<br>")
        html_parts.extend(
            [
                '<div class="ai-section">',
                "<h4>RSS 深度洞察</h4>",
                f'<div class="ai-content">{content_html}</div>',
                "</div>",
            ]
        )

    if result.outlook_strategy:
        content = _format_list_content(result.outlook_strategy)
        content_html = _escape_html(content).replace("\n", "<br>")
        html_parts.extend(
            [
                '<div class="ai-section">',
                "<h4>研判策略建议</h4>",
                f'<div class="ai-content">{content_html}</div>',
                "</div>",
            ]
        )

    if result.stock_recommendations:
        content = _format_list_content(result.stock_recommendations)
        content_html = _escape_html(content).replace("\n", "<br>")
        html_parts.extend(
            [
                '<div class="ai-section ai-conclusion">',
                "<h4>📈 股票推荐及代码</h4>",
                f'<div class="ai-content">{content_html}</div>',
                "</div>",
            ]
        )

    if result.risk_alerts:
        content = _format_list_content(result.risk_alerts)
        content_html = _escape_html(content).replace("\n", "<br>")
        html_parts.extend(
            [
                '<div class="ai-section ai-conclusion" style="border-left-color: #ef4444;">',
                '<h4 style="color: #ef4444;">⚠️ 利空风险警示</h4>',
                f'<div class="ai-content">{content_html}</div>',
                "</div>",
            ]
        )

    if result.standalone_summaries:
        summaries_text = _format_standalone_summaries(result.standalone_summaries)
        if summaries_text:
            summaries_html = _escape_html(summaries_text).replace("\n", "<br>")
            html_parts.extend(
                [
                    '<div class="ai-section">',
                    "<h4>独立源点速览</h4>",
                    f'<div class="ai-content">{summaries_html}</div>',
                    "</div>",
                ]
            )

    html_parts.append("</div>")
    return "\n".join(html_parts)


def render_ai_analysis_plain(result: AIAnalysisResult) -> str:
    """渲染为纯文本格式"""
    if not result.success:
        return f"AI 分析失败: {result.error}"

    lines = ["【✨ AI 热点分析】", ""]

    if result.core_trends:
        lines.extend(["[核心热点态势]", _format_list_content(result.core_trends), ""])

    if result.sentiment_controversy:
        lines.extend(
            ["[舆论风向争议]", _format_list_content(result.sentiment_controversy), ""]
        )

    if result.signals:
        lines.extend(["[异动与弱信号]", _format_list_content(result.signals), ""])

    if result.rss_insights:
        lines.extend(["[RSS 深度洞察]", _format_list_content(result.rss_insights), ""])

    if result.outlook_strategy:
        lines.extend(["[研判策略建议]", _format_list_content(result.outlook_strategy), ""])

    if result.stock_recommendations:
        lines.extend(["[📈 股票推荐及代码]", _format_list_content(result.stock_recommendations), ""])

    if result.risk_alerts:
        lines.extend(["[⚠️ 利空风险警示]", _format_list_content(result.risk_alerts), ""])

    if result.standalone_summaries:
        summaries_text = _format_standalone_summaries(result.standalone_summaries)
        if summaries_text:
            lines.extend(["[独立源点速览]", summaries_text])

    return "\n".join(lines)


def get_ai_analysis_renderer(channel: str):
    """根据渠道获取对应的渲染函数"""
    renderers = {
        "feishu": render_ai_analysis_feishu,
        "dingtalk": render_ai_analysis_dingtalk,
        "wework": render_ai_analysis_markdown,
        "telegram": render_ai_analysis_markdown,
        "email": render_ai_analysis_html_rich,  # 邮件使用丰富样式，配合 HTML 报告的 CSS
        "ntfy": render_ai_analysis_markdown,
        "bark": render_ai_analysis_plain,
        "slack": render_ai_analysis_markdown,
    }
    return renderers.get(channel, render_ai_analysis_markdown)


def render_ai_analysis_html_rich(result: AIAnalysisResult) -> str:
    """渲染为丰富样式的 HTML 格式（HTML 报告用）"""
    if not result:
        return ""

    # 检查是否成功
    if not result.success:
        error_msg = result.error or "未知错误"
        return f"""
                <div class="ai-section">
                    <div class="ai-error">⚠️ AI 分析失败: {_escape_html(str(error_msg))}</div>
                </div>"""

    ai_html = """
                <div class="ai-section">
                    <div class="ai-section-header">
                        <div class="ai-section-title">✨ AI 热点分析</div>
                    </div>"""

    if result.core_trends:
        content = _format_list_content(result.core_trends)
        content_html = _escape_html(content).replace("\n", "<br>")
        ai_html += f"""
                    <div class="ai-block">
                        <div class="ai-block-title">核心热点态势</div>
                        <div class="ai-block-content">{content_html}</div>
                    </div>"""

    if result.sentiment_controversy:
        content = _format_list_content(result.sentiment_controversy)
        content_html = _escape_html(content).replace("\n", "<br>")
        ai_html += f"""
                    <div class="ai-block">
                        <div class="ai-block-title">舆论风向争议</div>
                        <div class="ai-block-content">{content_html}</div>
                    </div>"""

    if result.signals:
        content = _format_list_content(result.signals)
        content_html = _escape_html(content).replace("\n", "<br>")
        ai_html += f"""
                    <div class="ai-block">
                        <div class="ai-block-title">异动与弱信号</div>
                        <div class="ai-block-content">{content_html}</div>
                    </div>"""

    if result.rss_insights:
        content = _format_list_content(result.rss_insights)
        content_html = _escape_html(content).replace("\n", "<br>")
        ai_html += f"""
                    <div class="ai-block">
                        <div class="ai-block-title">RSS 深度洞察</div>
                        <div class="ai-block-content">{content_html}</div>
                    </div>"""

    if result.outlook_strategy:
        content = _format_list_content(result.outlook_strategy)
        content_html = _escape_html(content).replace("\n", "<br>")
        ai_html += f"""
                    <div class="ai-block">
                        <div class="ai-block-title">研判策略建议</div>
                        <div class="ai-block-content">{content_html}</div>
                    </div>"""

    if result.stock_recommendations:
        content = _format_list_content(result.stock_recommendations)
        content_html = _escape_html(content)
        # 转换为漂亮的标签
        content_html = re.sub(r'【([^】]+)】', r'<div style="display:inline-block;background:#e0f2fe;color:#0284c7;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;margin-top:12px;margin-bottom:4px;border:1px solid #bae6fd;">\1</div>', content_html)
        content_html = content_html.replace("\n", "<br>")
        # Add special highlight class for stock recommendations
        ai_html += f"""
                    <div class="ai-block ai-block-highlight" style="background: rgba(43,144,217,0.06); border: 1px solid rgba(43,144,217,0.2);">
                        <div class="ai-block-title" style="color: #2b90d9; display: flex; align-items: center; gap: 6px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-5 5"/></svg>
                            股票推荐及代码
                        </div>
                        <div class="ai-block-content">{content_html}</div>
                    </div>"""

    if result.risk_alerts:
        content = _format_list_content(result.risk_alerts)
        content_html = _escape_html(content)
        # 转换为漂亮的标签
        content_html = re.sub(r'【([^】]+)】', r'<div style="display:inline-block;background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;margin-top:12px;margin-bottom:4px;border:1px solid #fecaca;">\1</div>', content_html)
        content_html = content_html.replace("\n", "<br>")
        ai_html += f"""
                    <div class="ai-block ai-block-highlight" style="background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2);">
                        <div class="ai-block-title" style="color: #ef4444; display: flex; align-items: center; gap: 6px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                            利空风险警示
                        </div>
                        <div class="ai-block-content">{content_html}</div>
                    </div>"""

    if result.standalone_summaries:
        summaries_text = _format_standalone_summaries(result.standalone_summaries)
        if summaries_text:
            summaries_html = _escape_html(summaries_text).replace("\n", "<br>")
            ai_html += f"""
                    <div class="ai-block">
                        <div class="ai-block-title">独立源点速览</div>
                        <div class="ai-block-content">{summaries_html}</div>
                    </div>"""

    ai_html += """
                </div>"""
    return ai_html
