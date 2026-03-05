"""
AI 驱动策略
调用 StockAnalysis 的 AI 分析接口来生成交易信号
"""
import asyncio
import httpx
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from .base_strategy import BaseStrategy, StrategyConfig, Signal

logger = logging.getLogger(__name__)


class AIStrategy(BaseStrategy):
    """
    AI 驱动的交易策略

    通过调用 StockAnalysis 的 AI 分析接口来生成交易信号

    配置示例:
        config = StrategyConfig(
            name="ai_strategy",
            symbols=["AAPL", "MSFT", "NVDA"],
            gateway="FUTU",
            params={
                "ai_service_url": "http://localhost:3000",
                "model_id": "deepseek-chat",
                "analysis_interval": 300,  # 5分钟分析一次
                "confidence_threshold": 0.7,  # 置信度阈值
                "position_size": 100,  # 每次交易数量
            }
        )
    """

    def __init__(self, config: StrategyConfig, engine=None):
        super().__init__(config, engine)

        # AI 服务配置
        self.ai_service_url = config.params.get("ai_service_url", "http://localhost:3000")
        self.model_id = config.params.get("model_id", "deepseek-chat")
        self.analysis_interval = config.params.get("analysis_interval", 300)  # 秒
        self.confidence_threshold = config.params.get("confidence_threshold", 0.7)
        self.position_size = config.params.get("position_size", 100)

        # 状态
        self._last_analysis: Dict[str, Dict] = {}
        self._analysis_task: Optional[asyncio.Task] = None
        self._http_client: Optional[httpx.AsyncClient] = None

    def on_init(self):
        """初始化"""
        self.log("Initializing AI Strategy")
        self.log(f"AI Service: {self.ai_service_url}")
        self.log(f"Model: {self.model_id}")
        self.log(f"Symbols: {self.config.symbols}")

    def on_tick(self, tick: Any):
        """处理 Tick 数据 - AI 策略主要依赖定时分析"""
        pass

    def on_bar(self, bar: Any):
        """处理 K 线数据 - AI 策略主要依赖定时分析"""
        pass

    async def start_analysis_loop(self):
        """启动定时分析循环"""
        self._http_client = httpx.AsyncClient(timeout=60.0)

        while self.status.value == "running":
            try:
                # 分析每个标的
                for symbol in self.config.symbols:
                    await self._analyze_and_trade(symbol)

                # 等待下一次分析
                await asyncio.sleep(self.analysis_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.log(f"Analysis error: {e}", level="error")
                await asyncio.sleep(60)  # 出错后等待 1 分钟

        await self._http_client.aclose()

    async def _analyze_and_trade(self, symbol: str):
        """
        分析单个标的并执行交易

        Args:
            symbol: 股票代码
        """
        try:
            self.log(f"Analyzing {symbol}...")

            # 1. 调用 AI 分析接口
            analysis = await self._call_ai_analysis(symbol)

            if not analysis:
                self.log(f"No analysis result for {symbol}", level="warning")
                return

            self._last_analysis[symbol] = analysis

            # 2. 解析分析结果
            signal = self._parse_analysis_to_signal(symbol, analysis)

            if not signal:
                return

            # 3. 执行交易
            await self._execute_signal(signal)

        except Exception as e:
            self.log(f"Failed to analyze {symbol}: {e}", level="error")

    async def _call_ai_analysis(self, symbol: str) -> Optional[Dict]:
        """
        调用 AI 分析接口

        Args:
            symbol: 股票代码

        Returns:
            分析结果字典
        """
        try:
            # 调用 StockAnalysis 的分析接口
            response = await self._http_client.post(
                f"{self.ai_service_url}/api/agent/chat",
                json={
                    "message": f"请分析 {symbol} 的投资价值，给出买入/卖出/持有建议，以及置信度(0-1)",
                    "modelId": self.model_id,
                    "context": {
                        "type": "trading_signal"
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("result", {})
            else:
                self.log(f"AI analysis failed: {response.status_code}", level="warning")
                return None

        except Exception as e:
            self.log(f"AI analysis error: {e}", level="error")
            return None

    def _parse_analysis_to_signal(self, symbol: str, analysis: Dict) -> Optional[Signal]:
        """
        解析 AI 分析结果为交易信号

        Args:
            symbol: 股票代码
            analysis: AI 分析结果

        Returns:
            交易信号，无信号返回 None
        """
        # 从分析结果中提取关键信息
        # 这里需要根据实际的 AI 返回格式来解析
        recommendation = analysis.get("recommendation", "hold")
        confidence = analysis.get("confidence", 0.0)
        reason = analysis.get("reason", "")

        # 检查置信度
        if confidence < self.confidence_threshold:
            self.log(f"{symbol}: Low confidence ({confidence}), skip")
            return None

        # 生成信号
        if recommendation.lower() in ["buy", "买入"]:
            return Signal(
                symbol=symbol,
                direction="buy",
                volume=self.position_size,
                price=0.0,  # 市价
                reason=f"AI Recommendation: {reason}"
            )
        elif recommendation.lower() in ["sell", "卖出"]:
            # 检查是否有持仓
            position = self.get_position(symbol)
            if position > 0:
                return Signal(
                    symbol=symbol,
                    direction="sell",
                    volume=min(self.position_size, position),
                    price=0.0,
                    reason=f"AI Recommendation: {reason}"
                )
        # else: hold - 不操作

        return None

    async def _execute_signal(self, signal: Signal):
        """
        执行交易信号

        Args:
            signal: 交易信号
        """
        self.log(f"Executing signal: {signal.direction} {signal.symbol} {signal.volume}")

        if signal.direction == "buy":
            order_id = self.buy(
                symbol=signal.symbol,
                volume=signal.volume,
                price=signal.price,
                reason=signal.reason
            )
            if order_id:
                self.log(f"Buy order placed: {order_id}")

        elif signal.direction == "sell":
            order_id = self.sell(
                symbol=signal.symbol,
                volume=signal.volume,
                price=signal.price,
                reason=signal.reason
            )
            if order_id:
                self.log(f"Sell order placed: {order_id}")

    # ─── 策略生命周期 ────────────────────────────────────────

    def start(self):
        """启动策略"""
        super().start()

        # 启动异步分析循环
        loop = asyncio.get_event_loop()
        self._analysis_task = loop.create_task(self.start_analysis_loop())

    def stop(self):
        """停止策略"""
        if self._analysis_task:
            self._analysis_task.cancel()

        super().stop()

    # ─── 状态查询 ────────────────────────────────────────

    def get_last_analysis(self, symbol: str) -> Optional[Dict]:
        """获取最近的分析结果"""
        return self._last_analysis.get(symbol)

    def get_all_analysis(self) -> Dict[str, Dict]:
        """获取所有分析结果"""
        return self._last_analysis.copy()