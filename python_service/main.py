"""
Python Stock Analysis Agent Service
Uses Agno framework with YFinanceTools for reliable stock data.
Model configuration is passed dynamically from Node.js (not hardcoded).

Usage:
    cd python_service
    ./venv/bin/python main.py
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging
import uvicorn

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.yfinance import YFinanceTools
from agno.tools.duckduckgo import DuckDuckGoTools

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Stock Analysis Agno Agent",
    description="AI Stock Agent powered by Agno framework, with dynamic model selection",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request Models ────────────────────────────────────────

class ModelConfig(BaseModel):
    """Model configuration passed from Node.js modelManager"""
    apiKey: str = Field(..., description="API Key for the LLM")
    baseUrl: str = Field(..., description="Base URL, e.g. https://api.deepseek.com/v1")
    model: str = Field(..., description="Model ID, e.g. deepseek-chat")
    temperature: float = Field(default=0.7)
    maxTokens: int = Field(default=4096)


class AgentRequest(BaseModel):
    """Request from Node.js to run the agent"""
    question: str = Field(..., description="User's question in natural language")
    modelConfig: ModelConfig = Field(..., description="LLM model configuration")
    conversationHistory: Optional[List[Dict[str, str]]] = Field(
        default=None,
        description="Previous conversation messages [{role, content}]"
    )


# ─── Sanitized OpenAIChat ───────────────────────────────────
# Google AI Studio (Gemini) via its OpenAI-compat API has several
# incompatibilities with the standard OpenAI request format:
#   1. Internal Agno fields (requires_confirmation, etc.) → 400
#   2. stream_options={"include_usage": True} → not supported
#   3. parallel_tool_calls → not supported
#   4. "name" field on tool-result messages → can cause 400
# This subclass patches all of them.

from dataclasses import dataclass as _dataclass
from typing import Dict, Any, List, Optional, Union, Type, Iterator
from pydantic import BaseModel as _BaseModel

@_dataclass
class SanitizedOpenAIChat(OpenAIChat):
    """OpenAIChat subclass that sanitizes requests for Gemini compatibility."""

    def get_request_params(
        self,
        response_format=None,
        tools=None,
        tool_choice=None,
        run_response=None,
    ) -> Dict[str, Any]:
        params = super().get_request_params(
            response_format=response_format,
            tools=tools,
            tool_choice=tool_choice,
            run_response=run_response,
        )

        # 1) Strip Agno-internal fields from ALL tool definitions
        if "tools" in params:
            for tool in params["tools"]:
                if isinstance(tool, dict) and "function" in tool:
                    func_def = tool["function"]
                    if isinstance(func_def, dict):
                        for _internal_key in ("requires_confirmation", "external_execution", "approval_type"):
                            func_def.pop(_internal_key, None)
            logger.debug(f"[SanitizedOpenAIChat] Cleaned {len(params['tools'])} tool definitions")

        # 2) Remove parallel_tool_calls (Gemini doesn't support it)
        params.pop("parallel_tool_calls", None)

        # 3) Remove store (Gemini doesn't support it)
        params.pop("store", None)

        # 4) Remove service_tier (Gemini doesn't support it)
        params.pop("service_tier", None)

        return params

    def invoke_stream(
        self,
        messages,
        assistant_message,
        response_format=None,
        tools=None,
        tool_choice=None,
        run_response=None,
        compress_tool_results=False,
    ) -> Iterator:
        """
        Override to remove stream_options which Gemini doesn't support,
        and clean up message format.
        """
        from openai import RateLimitError, APIConnectionError, APIStatusError
        from agno.models.base import ModelResponse
        from agno.exceptions import ModelProviderError, ModelAuthenticationError
        from agno.utils.log import log_error

        try:
            if run_response and run_response.metrics:
                run_response.metrics.set_time_to_first_token()

            assistant_message.metrics.start_timer()

            # Clean messages for Gemini compatibility
            formatted_messages = []
            for m in messages:
                formatted = self._format_message(m, compress_tool_results)
                # Remove "name" field from tool-result messages to avoid Gemini 400
                if formatted.get("role") == "tool" and "name" in formatted:
                    formatted.pop("name", None)
                formatted_messages.append(formatted)

            request_params = self.get_request_params(
                response_format=response_format,
                tools=tools,
                tool_choice=tool_choice,
                run_response=run_response,
            )

            # Gemini does NOT support stream_options, so we don't pass it
            for chunk in self.get_client().chat.completions.create(
                model=self.id,
                messages=formatted_messages,
                stream=True,
                **request_params,
            ):
                yield self._parse_provider_response_delta(chunk)

            assistant_message.metrics.stop_timer()

        except RateLimitError as e:
            log_error(f"Rate limit error from OpenAI API: {e}")
            # Safe error parsing - handle both dict and list responses
            try:
                err_body = e.response.json()
                if isinstance(err_body, list):
                    err_body = err_body[0] if err_body else {}
                error_message = err_body.get("error", {})
                if isinstance(error_message, dict):
                    error_message = error_message.get("message", "Rate limit exceeded")
                else:
                    error_message = str(error_message)
            except Exception:
                error_message = str(e)
            raise ModelProviderError(
                message=error_message,
                status_code=getattr(e.response, 'status_code', 429),
                model_name=self.name,
                model_id=self.id,
            ) from e
        except APIConnectionError as e:
            log_error(f"API connection error from OpenAI API: {e}")
            raise ModelProviderError(message=str(e), model_name=self.name, model_id=self.id) from e
        except APIStatusError as e:
            log_error(f"API status error from OpenAI API: {e}")
            try:
                err_body = e.response.json()
                if isinstance(err_body, list):
                    err_body = err_body[0] if err_body else {}
                error_message = err_body.get("error", {})
                if isinstance(error_message, dict):
                    error_message = error_message.get("message", "Unknown model error")
                else:
                    error_message = str(error_message)
            except Exception:
                error_message = str(e)
            raise ModelProviderError(
                message=error_message,
                status_code=getattr(e.response, 'status_code', 500),
                model_name=self.name,
                model_id=self.id,
            ) from e
        except ModelAuthenticationError as e:
            raise e
        except Exception as e:
            log_error(f"Error from OpenAI API: {e}")
            raise ModelProviderError(message=str(e), model_name=self.name, model_id=self.id) from e

    def invoke(
        self,
        messages,
        assistant_message,
        response_format=None,
        tools=None,
        tool_choice=None,
        run_response=None,
        compress_tool_results=False,
    ):
        """Override to clean message format and handle Gemini error responses."""
        from openai import RateLimitError, APIConnectionError, APIStatusError
        from agno.exceptions import ModelProviderError, ModelAuthenticationError
        from agno.utils.log import log_error

        try:
            if run_response and run_response.metrics:
                run_response.metrics.set_time_to_first_token()

            assistant_message.metrics.start_timer()

            # Clean messages for Gemini compatibility
            formatted_messages = []
            for m in messages:
                formatted = self._format_message(m, compress_tool_results)
                if formatted.get("role") == "tool" and "name" in formatted:
                    formatted.pop("name", None)
                formatted_messages.append(formatted)

            response = self.get_client().chat.completions.create(
                model=self.id,
                messages=formatted_messages,
                **self.get_request_params(
                    response_format=response_format,
                    tools=tools,
                    tool_choice=tool_choice,
                    run_response=run_response,
                ),
            )
            assistant_message.metrics.stop_timer()

            provider_response = self._parse_provider_response(response, response_format=response_format)
            return provider_response

        except RateLimitError as e:
            log_error(f"Rate limit error from OpenAI API: {e}")
            try:
                err_body = e.response.json()
                if isinstance(err_body, list):
                    err_body = err_body[0] if err_body else {}
                error_message = err_body.get("error", {})
                if isinstance(error_message, dict):
                    error_message = error_message.get("message", "Rate limit exceeded")
                else:
                    error_message = str(error_message)
            except Exception:
                error_message = str(e)
            raise ModelProviderError(
                message=error_message,
                status_code=getattr(e.response, 'status_code', 429),
                model_name=self.name,
                model_id=self.id,
            ) from e
        except APIConnectionError as e:
            log_error(f"API connection error: {e}")
            raise ModelProviderError(message=str(e), model_name=self.name, model_id=self.id) from e
        except APIStatusError as e:
            log_error(f"API status error: {e}")
            try:
                err_body = e.response.json()
                if isinstance(err_body, list):
                    err_body = err_body[0] if err_body else {}
                error_message = err_body.get("error", {})
                if isinstance(error_message, dict):
                    error_message = error_message.get("message", "Unknown model error")
                else:
                    error_message = str(error_message)
            except Exception:
                error_message = str(e)
            raise ModelProviderError(
                message=error_message,
                status_code=getattr(e.response, 'status_code', 500),
                model_name=self.name,
                model_id=self.id,
            ) from e
        except ModelAuthenticationError as e:
            raise e
        except Exception as e:
            log_error(f"Error from OpenAI API: {e}")
            raise ModelProviderError(message=str(e), model_name=self.name, model_id=self.id) from e


# ─── Agent Factory ──────────────────────────────────────────

def get_computed_technical_indicators(symbol: str) -> str:
    """获取股票的精确技术指标，包括 RSI、MACD、SMA50 (50日均线)、SMA200 (200日均线)。"""
    try:
        import yfinance as yf
        import pandas as pd
        
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")
        if hist.empty:
            return "No historical data found for technical analysis."
        
        hist['SMA50'] = hist['Close'].rolling(window=50).mean()
        hist['SMA200'] = hist['Close'].rolling(window=200).mean()
        
        # Calculate RSI
        delta = hist['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        hist['RSI'] = 100 - (100 / (1 + rs))
        
        # Calculate MACD
        exp1 = hist['Close'].ewm(span=12, adjust=False).mean()
        exp2 = hist['Close'].ewm(span=26, adjust=False).mean()
        macd = exp1 - exp2
        hist['MACD'] = macd
        
        last_row = hist.iloc[-1]
        
        return str({
            "SMA50": round(float(last_row['SMA50']), 2) if not pd.isna(last_row['SMA50']) else "N/A",
            "SMA200": round(float(last_row['SMA200']), 2) if not pd.isna(last_row['SMA200']) else "N/A",
            "RSI": round(float(last_row['RSI']), 2) if not pd.isna(last_row['RSI']) else "N/A",
            "MACD": round(float(last_row['MACD']), 2) if not pd.isna(last_row['MACD']) else "N/A",
        })
    except Exception as e:
        return f"Error computing technical indicators: {e}"

def create_agent(config: ModelConfig) -> Agent:
    """
    Create an Agno Agent with dynamic model configuration.
    Uses SanitizedOpenAIChat to ensure compatibility with Google AI Studio / Gemini.
    """
    # Ensure baseUrl ends with /v1 for OpenAI compatibility
    # But don't double it if already present (e.g. NVIDIA NIM URLs)
    base_url = config.baseUrl
    if '/v1' not in base_url:
        if not base_url.endswith('/'):
            base_url += '/'
        base_url += 'v1'

    model = SanitizedOpenAIChat(
        id=config.model,
        api_key=config.apiKey,
        base_url=base_url,
        temperature=config.temperature,
        # Ensure enough tokens for multi-step tool calling (at least 4096)
        max_tokens=max(config.maxTokens or 1024, 4096),
    )

    agent = Agent(
        name="Stock Analysis Agent",
        model=model,
        tools=[
            YFinanceTools(
                enable_stock_price=True,
                enable_analyst_recommendations=True,
                enable_stock_fundamentals=True,
                enable_company_news=True,
                enable_technical_indicators=False,  # Replaced by custom function
                enable_historical_prices=True,
                enable_company_info=True,
            ),
            get_computed_technical_indicators,
            DuckDuckGoTools(),
        ],
        instructions=[
            "你是一位顶级华尔街资深量化分析师，擅长将复杂的金融指标转化为散户能听懂的投资建议。",
            "",
            "## 股票代码格式化（非常重要）",
            "当用户输入纯6位数字的中国A股代码时，你在调用任何工具之前，【必须】自动加上Yahoo Finance后缀：",
            "- `6` 开头：加上 `.SS`（例如 `600519.SS`）",
            "- `0` 或 `3` 开头：加上 `.SZ`（例如 `002156.SZ`）",
            "- `8` 或 `4` 开头：加上 `.BJ`",
            "非纯6位数字的美股维持原样组合。不加后缀工具将报错！",
            "",
            "## 分析流程：数据收集（硬性规定）",
            "在开始写报告前，你【必须】调用你拥有的股票数据工具。请必须调用且至少调用以下信息源：",
            "1. 当前价格工具",
            "2. 基本面数据工具",
            "3. 技术指标工具",
            "4. 分析师预期工具",
            "**绝对禁止编造任何 PE、RSI、均线等金融数据！**",
            "",
            "## 回答结构（对每一个指标必须进行『解读』）",
            "请按以下 Markdown 结构生成报告，**不要单纯罗列数据，你的价值在于解读！**",
            "",
            "### 1. 当前盘面",
            "报告当前价格及表现（使用 📈 📉 符号加粗高亮价格）。",
            "",
            "### 2. 基本面诊断（长线逻辑）",
            "- 提取核心数据（如市盈率PE、市净率PB等），放进一个小表格。",
            "- **核心要求**：用通俗易懂的大白话解释这些数据。比如说明它的估值是偏高还是偏低，说明公司的盈利情况，是否存在泡沫。",
            "",
            "### 3. 技术面剖析（中短线逻辑）",
            "- 提取 RSI、MACD、50日/200日均线等关键数值，同样放进表格。",
            "- **核心要求**：必须逐一解读！",
            "  * RSI 此时在什么位置（超买/超卖/震荡）？意味着什么？",
            "  * MACD 显示的趋势动能是多头还是空头？",
            "  * 均线系统呈什么排列？现在价格在均线上方还是下方？支持阻力位在哪里？",
            "",
            "### 4. 华尔街共识",
            "简述投行和分析师们的主流态度（强买/买入/持有比例）。",
            "",
            "### 5. 操作建议（明确、可执行）",
            "- 结合上面的基本面估值与技术面走势，给出一个综合的研判结论。",
            "- 给出具体的数值区间建议（具体到当前的股价价格附近）：",
            "  - **买入区间**",
            "  - **持有区间**",
            "  - **卖出/减仓区间**",
            "",
            "### 6. 风险预警",
            "- **风险等级评分**：必须严格在一行内写出如【风险评分：X分 / 总分10分】，并明确补充是【低风险】、【中风险】还是【高风险】。1分最安全，10分最危险。",
            "- 必须结合 Beta 值、技术面背离、公司盈利等情况说明**为什么**给出这个评分。",
            "- 结尾附上标准风险提示：“本分析由AI生成，仅供参考，不构成任何投资建议。股市有风险，入市需谨慎。”",
            "",
            "注意：永远保持专业、清晰，且所有的分析、结论、数字都必须合乎金融逻辑，使用中文作答。",
        ],
        markdown=True,
        debug_mode=False,
    )

    return agent


def create_agent_no_tools(config: ModelConfig) -> Agent:
    """
    Create a simpler Agno Agent WITHOUT tools for models that don't support function calling.
    The agent will answer based on its built-in knowledge without calling YFinance/DuckDuckGo.
    """
    base_url = config.baseUrl
    # Only append /v1 if not already present
    if '/v1' not in base_url:
        if not base_url.endswith('/'):
            base_url += '/'
        base_url += 'v1'

    model = SanitizedOpenAIChat(
        id=config.model,
        api_key=config.apiKey,
        base_url=base_url,
        temperature=config.temperature,
        max_tokens=config.maxTokens,
    )

    agent = Agent(
        name="Stock Analysis Agent (No Tools)",
        model=model,
        tools=[],  # No tools
        instructions=[
            "你是一位顶级华尔街量化分析师，擅长股票投资分析。",
            "当前模型不支持实时工具调用，请基于你的训练知识进行分析。",
            "明确告知用户数据可能不是最新的，建议查看实时行情验证。",
            "使用 Markdown 格式输出分析报告，重要数据用加粗。",
            "使用表格展示分析数据。",
            "涨跌用 📈 📉 表示。",
            "分析时结合技术面和基本面。",
            "明确给出操作建议（买入/持有/卖出区间）。",
            "量化风险等级（1-10分）。",
            "所有分析最后附上风险提示。",
            "使用中文回答。",
        ],
        markdown=True,
        debug_mode=False,
    )

    return agent


# ─── Endpoints ──────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "agno-stock-agent",
        "version": "2.0.0",
        "framework": "agno",
    }


@app.post("/api/agent/chat")
async def agent_chat(req: AgentRequest):
    """
    Run the Agno Agent with the user's question.
    The agent automatically handles tool calling (YFinance, DuckDuckGo).
    """
    try:
        logger.info(f"[AgnoAgent] Question: {req.question}")
        logger.info(f"[AgnoAgent] Model: {req.modelConfig.model} @ {req.modelConfig.baseUrl}")

        # Create agent with user's model config
        agent = create_agent(req.modelConfig)

        # Build message with conversation history if provided
        prompt = req.question
        if req.conversationHistory and len(req.conversationHistory) > 0:
            history_text = "\n".join(
                f"{'用户' if m.get('role') == 'user' else 'AI'}: {m.get('content', '')}"
                for m in req.conversationHistory[-6:]  # Last 6 messages for context
            )
            prompt = f"对话历史:\n{history_text}\n\n当前问题: {req.question}"

        # Run the agent — Agno handles tool calling automatically!
        response = agent.run(prompt)

        # Extract the final content
        content = response.content if hasattr(response, 'content') else str(response)

        logger.info(f"[AgnoAgent] Response length: {len(content)} chars")

        # ─── Error Detection ─────────────────────────────────
        # Agno may return API errors as normal text responses.
        # Detect common error patterns and raise so Node.js can fallback.
        error_patterns = [
            "tool choice requires",
            "tool_choice",
            "tool-call-parser",
            "enable-auto-tool-choice",
            "rate_limit",
            "RateLimitError",
            "APIConnectionError",
            "APIStatusError",
            "BadRequestError",
            "AuthenticationError",
            "insufficient_quota",
        ]
        content_lower = content.lower()
        for pattern in error_patterns:
            if pattern.lower() in content_lower:
                logger.warning(f"[AgnoAgent] Detected error pattern in response: '{pattern}'")
                raise HTTPException(
                    status_code=500,
                    detail=f"Agent returned error response: {content[:200]}"
                )

        # Also reject very short responses that are likely errors
        if len(content.strip()) < 20:
            logger.warning(f"[AgnoAgent] Response too short, likely an error: '{content}'")
            raise HTTPException(
                status_code=500,
                detail=f"Agent returned suspiciously short response: {content}"
            )

        return {
            "success": True,
            "data": {
                "response": content,
                "model": req.modelConfig.model,
                "source": "agno_agent",
            }
        }

    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        logger.error(f"[AgnoAgent] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─── SSE Streaming Endpoint ─────────────────────────────────

from fastapi.responses import StreamingResponse
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Thread pool for running sync Agno agent in background
_executor = ThreadPoolExecutor(max_workers=4)


@app.post("/api/agent/chat/stream")
async def agent_chat_stream(req: AgentRequest):
    """
    SSE streaming version of agent chat.
    Strategy:
      1. Try Agno stream=True, stream_events=True for real-time tool/content events
      2. If streaming fails (Agno internal bug), auto-fallback to non-streaming agent.run()
      3. Per-event error handling to skip malformed events without crashing
    """
    logger.info(f"[AgnoStream] Question: {req.question}")
    logger.info(f"[AgnoStream] Model: {req.modelConfig.model} @ {req.modelConfig.baseUrl}")

    def _build_prompt(req):
        prompt = req.question
        if req.conversationHistory and len(req.conversationHistory) > 0:
            history_items = []
            for m in req.conversationHistory[-6:]:
                if isinstance(m, dict):
                    role = m.get('role', 'user')
                    content = m.get('content', '')
                else:
                    continue
                history_items.append(f"{'用户' if role == 'user' else 'AI'}: {content}")
            if history_items:
                history_text = "\n".join(history_items)
                prompt = f"对话历史:\n{history_text}\n\n当前问题: {req.question}"
        return prompt

    def _extract_tool_name(tool_info):
        """Safely extract tool name from ToolExecution object."""
        if not tool_info:
            return ""
        for attr in ('function_name', 'tool_name', 'name'):
            val = getattr(tool_info, attr, None)
            if val:
                return str(val)
        return ""

    def _extract_tool_args(tool_info):
        """Safely extract tool args from ToolExecution object."""
        if not tool_info:
            return {}
        for attr in ('function_args', 'tool_args', 'arguments'):
            val = getattr(tool_info, attr, None)
            if val is not None:
                if isinstance(val, str):
                    try:
                        return json.loads(val)
                    except:
                        return {"raw": val}
                elif isinstance(val, dict):
                    return val
        return {}

    def _make_sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    def _friendly_error(e: Exception) -> str:
        """Convert common exceptions to user-friendly Chinese messages."""
        err_str = str(e)
        if '429' in err_str or 'rate_limit' in err_str.lower() or 'quota' in err_str.lower():
            return "⚠️ API 调用频率超限，请稍后再试（免费配额每分钟/每天有限制）"
        if '401' in err_str or 'authentication' in err_str.lower() or 'api_key' in err_str.lower():
            return "⚠️ API 密钥无效或已过期，请检查模型配置"
        if '403' in err_str or 'forbidden' in err_str.lower():
            return "⚠️ API 访问被拒绝，请检查模型权限设置"
        if 'timeout' in err_str.lower() or 'timed out' in err_str.lower():
            return "⚠️ 请求超时，请稍后重试"
        if 'connection' in err_str.lower():
            return "⚠️ 无法连接到 AI 服务，请检查网络"
        return f"❌ {err_str}"

    def generate_events():
        """Synchronous generator with multi-layer error handling."""
        agent = None
        prompt = None
        done_sent = False

        try:
            agent = create_agent(req.modelConfig)
            prompt = _build_prompt(req)
        except Exception as e:
            logger.error(f"[AgnoStream] Agent creation failed: {e}", exc_info=True)
            yield _make_sse({"type": "error", "content": _friendly_error(e)})
            return

        # ── Strategy 1: Streaming with events ──
        try:
            yield _make_sse({"type": "status", "content": "🔍 正在分析您的问题..."})

            stream_iter = agent.run(prompt, stream=True, stream_events=True)
            full_content = ""

            for event in stream_iter:
                try:
                    event_type = getattr(event, 'event', '')

                    if event_type == 'ToolCallStarted':
                        tool_info = getattr(event, 'tool', None)
                        yield _make_sse({
                            "type": "tool_start",
                            "tool": _extract_tool_name(tool_info),
                            "args": _extract_tool_args(tool_info),
                        })

                    elif event_type == 'ToolCallCompleted':
                        tool_info = getattr(event, 'tool', None)
                        yield _make_sse({
                            "type": "tool_done",
                            "tool": _extract_tool_name(tool_info),
                        })

                    elif event_type == 'ToolCallError':
                        tool_info = getattr(event, 'tool', None)
                        yield _make_sse({
                            "type": "tool_error",
                            "tool": _extract_tool_name(tool_info),
                            "error": str(getattr(event, 'error', 'Unknown')),
                        })

                    elif event_type == 'ReasoningStarted':
                        yield _make_sse({"type": "reasoning_start"})

                    elif event_type in ('ReasoningContentDelta', 'ReasoningStep'):
                        reasoning = getattr(event, 'reasoning_content', '') or getattr(event, 'content', '')
                        if reasoning:
                            yield _make_sse({"type": "reasoning", "content": str(reasoning)})

                    elif event_type == 'ReasoningCompleted':
                        yield _make_sse({"type": "reasoning_done"})

                    elif event_type == 'RunContent':
                        content = getattr(event, 'content', '')
                        if content:
                            full_content += str(content)
                            yield _make_sse({"type": "content", "delta": str(content)})

                    elif event_type == 'ModelRequestStarted':
                        model_name = getattr(event, 'model', '') or req.modelConfig.model
                        yield _make_sse({"type": "status", "content": f"🤖 正在调用模型 {model_name}..."})

                    elif event_type == 'RunCompleted':
                        final_content = getattr(event, 'content', '') or full_content
                        yield _make_sse({
                            "type": "done",
                            "content": str(final_content) if final_content else full_content,
                            "model": req.modelConfig.model,
                        })
                        done_sent = True

                    elif event_type == 'RunError':
                        error_content = getattr(event, 'content', 'Unknown error')
                        yield _make_sse({"type": "error", "content": _friendly_error(Exception(str(error_content)))})
                        done_sent = True

                except Exception as event_err:
                    # Per-event error: skip this event but continue iterating
                    logger.warning(f"[AgnoStream] Skipping event due to error: {event_err}")
                    continue

            # Send accumulated content if no RunCompleted event was fired
            if not done_sent and full_content:
                yield _make_sse({
                    "type": "done",
                    "content": full_content,
                    "model": req.modelConfig.model,
                })
                done_sent = True

            if done_sent:
                return  # Success! No need for fallback

        except Exception as stream_err:
            err_msg = str(stream_err)
            logger.warning(f"[AgnoStream] Streaming failed: {err_msg}")

            # Detect tool_choice not supported → retry without tools
            if 'tool_choice' in err_msg or 'tool-call-parser' in err_msg or 'enable-auto-tool-choice' in err_msg:
                logger.info("[AgnoStream] Model doesn't support tool calling, retrying without tools")
                yield _make_sse({"type": "status", "content": "⚠️ 此模型不支持实时数据工具，切换到知识分析模式..."})
                try:
                    no_tool_agent = create_agent_no_tools(req.modelConfig)
                    response = no_tool_agent.run(prompt)
                    content = response.content if hasattr(response, 'content') else str(response)
                    if content and len(content.strip()) > 0:
                        yield _make_sse({
                            "type": "done",
                            "content": str(content),
                            "model": req.modelConfig.model,
                        })
                        done_sent = True
                    else:
                        yield _make_sse({"type": "error", "content": "⚠️ AI 未返回有效内容，请重试"})
                        done_sent = True
                except Exception as no_tool_err:
                    logger.error(f"[AgnoStream] No-tools fallback also failed: {no_tool_err}", exc_info=True)
                    yield _make_sse({"type": "error", "content": _friendly_error(no_tool_err)})
                    done_sent = True
            else:
                yield _make_sse({"type": "status", "content": "⏳ 正在切换到标准模式..."})

        # ── Strategy 2: Non-streaming fallback (with tools) ──
        if not done_sent:
            try:
                response = agent.run(prompt)
                content = response.content if hasattr(response, 'content') else str(response)
                if content and len(content.strip()) > 0:
                    yield _make_sse({
                        "type": "done",
                        "content": str(content),
                        "model": req.modelConfig.model,
                    })
                else:
                    yield _make_sse({"type": "error", "content": "⚠️ AI 未返回有效内容，请重试"})
            except Exception as fallback_err:
                err_msg2 = str(fallback_err)
                logger.error(f"[AgnoStream] Fallback failed: {err_msg2}", exc_info=True)

                # Second chance: if tool_choice error in non-streaming too
                if 'tool_choice' in err_msg2 or 'tool-call-parser' in err_msg2 or 'enable-auto-tool-choice' in err_msg2:
                    yield _make_sse({"type": "status", "content": "⚠️ 此模型不支持实时数据工具，切换到知识分析模式..."})
                    try:
                        no_tool_agent = create_agent_no_tools(req.modelConfig)
                        response = no_tool_agent.run(prompt)
                        content = response.content if hasattr(response, 'content') else str(response)
                        if content and len(content.strip()) > 0:
                            yield _make_sse({
                                "type": "done",
                                "content": str(content),
                                "model": req.modelConfig.model,
                            })
                        else:
                            yield _make_sse({"type": "error", "content": "⚠️ AI 未返回有效内容，请重试"})
                    except Exception as last_err:
                        yield _make_sse({"type": "error", "content": _friendly_error(last_err)})
                else:
                    yield _make_sse({"type": "error", "content": _friendly_error(fallback_err)})

    async def async_event_generator():
        """Wraps the sync generator using a queue for true real-time streaming."""
        loop = asyncio.get_event_loop()
        queue = asyncio.Queue()
        _SENTINEL = object()

        def run_sync():
            try:
                for event_str in generate_events():
                    loop.call_soon_threadsafe(queue.put_nowait, event_str)
            except Exception as e:
                logger.error(f"[AgnoStream] Unexpected error in run_sync: {e}")
                err_sse = _make_sse({"type": "error", "content": _friendly_error(e)})
                loop.call_soon_threadsafe(queue.put_nowait, err_sse)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, _SENTINEL)

        # Start sync generator in thread pool
        loop.run_in_executor(_executor, run_sync)

        # Yield events as they arrive
        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            yield item

    return StreamingResponse(
        async_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ─── Direct data endpoints (no LLM needed) ─────────────────

@app.post("/api/stock/price")
async def get_stock_price(req: dict):
    """Direct yfinance price lookup (no LLM)"""
    try:
        import yfinance as yf
        symbol = req.get("symbol", "")
        ticker = yf.Ticker(symbol)
        info = ticker.info

        return {
            "success": True,
            "data": {
                "symbol": symbol.upper(),
                "currentPrice": info.get("currentPrice") or info.get("regularMarketPrice", 0),
                "previousClose": info.get("previousClose", 0),
                "volume": info.get("volume", 0),
                "marketCap": info.get("marketCap", 0),
                "name": info.get("shortName", symbol),
                "source": "yfinance_direct"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stock/history")
async def get_stock_history(req: dict):
    """Direct yfinance historical data lookup"""
    try:
        import yfinance as yf
        symbol = req.get("symbol", "")
        period = req.get("period", "1y")
        interval = req.get("interval", "1d")
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval=interval)
        data = []
        import pandas as pd
        for index, row in hist.iterrows():
            if pd.isna(row["Close"]):
                continue
            data.append({
                "date": index.isoformat(),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"])
            })
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching history for {req.get('symbol')}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Entry Point ────────────────────────────────────────────

if __name__ == "__main__":
    print("🐍 Starting Agno Stock Agent Service on port 8000...")
    print("📖 API Docs: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
