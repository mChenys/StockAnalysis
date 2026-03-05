"""
基础策略类
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class StrategyStatus(Enum):
    """策略状态"""
    STOPPED = "stopped"
    RUNNING = "running"
    PAUSED = "paused"


@dataclass
class StrategyConfig:
    """策略配置"""
    name: str
    symbols: List[str]
    gateway: str
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Signal:
    """交易信号"""
    symbol: str
    direction: str  # buy/sell
    volume: int
    price: float = 0.0  # 0 为市价
    reason: str = ""
    timestamp: datetime = field(default_factory=datetime.now)


class BaseStrategy(ABC):
    """
    策略基类

    所有自定义策略都应继承此类并实现:
    - on_init(): 初始化
    - on_tick(tick): 处理 Tick 数据
    - on_bar(bar): 处理 K 线数据
    - on_order(order): 处理订单回报
    """

    def __init__(self, config: StrategyConfig, engine=None):
        self.config = config
        self.engine = engine
        self.status = StrategyStatus.STOPPED
        self._position: Dict[str, int] = {}  # symbol -> volume
        self._orders: Dict[str, Any] = {}
        self._signals: List[Signal] = []
        self._pnl: float = 0.0

    @abstractmethod
    def on_init(self):
        """
        策略初始化

        用于:
        - 设置参数
        - 加载历史数据
        - 初始化指标
        """
        pass

    @abstractmethod
    def on_tick(self, tick: Any):
        """
        处理 Tick 数据

        Args:
            tick: TickData 对象
        """
        pass

    @abstractmethod
    def on_bar(self, bar: Any):
        """
        处理 K 线数据

        Args:
            bar: BarData 对象
        """
        pass

    def on_order(self, order: Any):
        """
        处理订单回报

        Args:
            order: OrderInfo 对象
        """
        logger.info(f"Order update: {order.order_id} - {order.status.value}")

    def on_trade(self, trade: Any):
        """
        处理成交回报

        Args:
            trade: TradeData 对象
        """
        logger.info(f"Trade: {trade.symbol} {trade.volume}@{trade.price}")

    def start(self):
        """启动策略"""
        self.status = StrategyStatus.RUNNING
        logger.info(f"Strategy {self.config.name} started")

    def stop(self):
        """停止策略"""
        self.status = StrategyStatus.STOPPED
        logger.info(f"Strategy {self.config.name} stopped")

    def pause(self):
        """暂停策略"""
        self.status = StrategyStatus.PAUSED
        logger.info(f"Strategy {self.config.name} paused")

    def resume(self):
        """恢复策略"""
        self.status = StrategyStatus.RUNNING
        logger.info(f"Strategy {self.config.name} resumed")

    # ─── 交易接口 ────────────────────────────────────────

    def buy(self, symbol: str, volume: int, price: float = 0.0, reason: str = "") -> Optional[str]:
        """
        买入

        Args:
            symbol: 股票代码
            volume: 数量
            price: 价格 (0 为市价)
            reason: 买入原因

        Returns:
            订单 ID
        """
        if self.status != StrategyStatus.RUNNING:
            logger.warning(f"Strategy not running, cannot buy")
            return None

        if not self.engine:
            logger.warning("No engine attached")
            return None

        signal = Signal(
            symbol=symbol,
            direction="buy",
            volume=volume,
            price=price,
            reason=reason
        )
        self._signals.append(signal)

        logger.info(f"Buy signal: {symbol} {volume}@{price} - {reason}")

        # 调用引擎下单
        from ..engine import OrderDirection
        return self.engine.send_order(
            gateway_name=self.config.gateway,
            symbol=symbol,
            direction=OrderDirection.BUY,
            volume=volume,
            price=price
        )

    def sell(self, symbol: str, volume: int, price: float = 0.0, reason: str = "") -> Optional[str]:
        """
        卖出

        Args:
            symbol: 股票代码
            volume: 数量
            price: 价格 (0 为市价)
            reason: 卖出原因

        Returns:
            订单 ID
        """
        if self.status != StrategyStatus.RUNNING:
            logger.warning(f"Strategy not running, cannot sell")
            return None

        if not self.engine:
            logger.warning("No engine attached")
            return None

        signal = Signal(
            symbol=symbol,
            direction="sell",
            volume=volume,
            price=price,
            reason=reason
        )
        self._signals.append(signal)

        logger.info(f"Sell signal: {symbol} {volume}@{price} - {reason}")

        # 调用引擎下单
        from ..engine import OrderDirection
        return self.engine.send_order(
            gateway_name=self.config.gateway,
            symbol=symbol,
            direction=OrderDirection.SELL,
            volume=volume,
            price=price
        )

    def cancel_order(self, order_id: str) -> bool:
        """撤单"""
        if not self.engine:
            return False
        return self.engine.cancel_order(self.config.gateway, order_id)

    # ─── 持仓和资金 ────────────────────────────────────────

    def get_position(self, symbol: str) -> int:
        """获取持仓"""
        return self._position.get(symbol, 0)

    def get_all_positions(self) -> Dict[str, int]:
        """获取所有持仓"""
        return self._position.copy()

    def get_signals(self) -> List[Signal]:
        """获取所有信号"""
        return self._signals.copy()

    def get_pnl(self) -> float:
        """获取盈亏"""
        return self._pnl

    # ─── 工具方法 ────────────────────────────────────────

    def log(self, message: str, level: str = "info"):
        """记录日志"""
        if level == "debug":
            logger.debug(f"[{self.config.name}] {message}")
        elif level == "warning":
            logger.warning(f"[{self.config.name}] {message}")
        elif level == "error":
            logger.error(f"[{self.config.name}] {message}")
        else:
            logger.info(f"[{self.config.name}] {message}")