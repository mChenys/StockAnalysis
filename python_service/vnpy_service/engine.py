"""
VNPY Trading Engine 封装
管理 MainEngine、EventEngine、Gateway 连接
"""
import logging
import threading
import time
from typing import Dict, List, Optional, Any, Callable, Set
from dataclasses import dataclass, field
from enum import Enum
import asyncio
from datetime import datetime
import uuid
import random

logger = logging.getLogger(__name__)


class GatewayType(Enum):
    """Gateway 类型"""
    FUTU = "FUTU"
    OST = "OST"  # 东方财富
    CTP = "CTP"  # 期货


class OrderStatus(Enum):
    """订单状态"""
    PENDING = "pending"
    SUBMITTED = "submitted"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class OrderDirection(Enum):
    """订单方向"""
    BUY = "buy"
    SELL = "sell"


@dataclass
class AccountInfo:
    """账户信息"""
    balance: float = 0.0
    available: float = 0.0
    margin: float = 0.0
    market_value: float = 0.0


@dataclass
class PositionInfo:
    """持仓信息"""
    symbol: str
    volume: int = 0
    available_volume: int = 0
    avg_price: float = 0.0
    current_price: float = 0.0
    pnl: float = 0.0
    pnl_ratio: float = 0.0


@dataclass
class OrderInfo:
    """订单信息"""
    order_id: str
    symbol: str
    direction: OrderDirection
    volume: int
    price: float
    status: OrderStatus = OrderStatus.PENDING
    filled_volume: int = 0
    avg_price: float = 0.0
    create_time: datetime = field(default_factory=datetime.now)
    update_time: datetime = field(default_factory=datetime.now)


@dataclass
class TickData:
    """Tick 行情数据"""
    symbol: str
    last_price: float
    bid_price_1: float
    ask_price_1: float
    bid_volume_1: int
    ask_volume_1: int
    volume: int
    turnover: float
    open_price: float
    high_price: float
    low_price: float
    pre_close: float
    bid_price_2: float = 0.0
    bid_price_3: float = 0.0
    bid_price_4: float = 0.0
    bid_price_5: float = 0.0
    ask_price_2: float = 0.0
    ask_price_3: float = 0.0
    ask_price_4: float = 0.0
    ask_price_5: float = 0.0
    bid_volume_2: int = 0
    bid_volume_3: int = 0
    bid_volume_4: int = 0
    bid_volume_5: int = 0
    ask_volume_2: int = 0
    ask_volume_3: int = 0
    ask_volume_4: int = 0
    ask_volume_5: int = 0
    datetime: datetime = field(default_factory=datetime.now)


class TradingEngine:
    """
    VNPY 交易引擎封装

    提供简化的交易接口，内部管理 VNPY MainEngine 和 EventEngine
    """

    def __init__(self):
        self._main_engine = None
        self._event_engine = None
        self._gateways: Dict[str, Any] = {}
        self._connected: Dict[str, bool] = {}
        self._tick_callbacks: List[Callable] = []
        self._order_callbacks: List[Callable] = []
        self._positions: Dict[str, PositionInfo] = {}
        self._orders: Dict[str, OrderInfo] = {}
        self._account: AccountInfo = AccountInfo()

        # Mock 模式 (未连接券商时使用)
        self._mock_mode = True
        self._mock_ticker_thread = None
        self._mock_thread_running = False

    def initialize(self) -> bool:
        """
        初始化交易引擎

        Returns:
            bool: 是否成功初始化
        """
        try:
            # 尝试导入 VNPY
            from vnpy.trader.engine import MainEngine
            from vnpy.event import EventEngine

            self._event_engine = EventEngine()
            self._main_engine = MainEngine(self._event_engine)

            # 注册事件处理
            self._register_event_handlers()

            logger.info("VNPY Trading Engine initialized successfully")
            return True

        except ImportError as e:
            logger.warning(f"VNPY not installed, running in mock mode: {e}")
            self._mock_mode = True
            return True
        except Exception as e:
            logger.error(f"Failed to initialize VNPY: {e}")
            return False

    def _register_event_handlers(self):
        """注册事件处理器"""
        if self._event_engine:
            from vnpy.trader.event import (
                EVENT_TICK, EVENT_ORDER, EVENT_TRADE,
                EVENT_POSITION, EVENT_ACCOUNT
            )

            self._event_engine.register(EVENT_TICK, self._on_tick)
            self._event_engine.register(EVENT_ORDER, self._on_order)
            self._event_engine.register(EVENT_TRADE, self._on_trade)
            self._event_engine.register(EVENT_POSITION, self._on_position)
            self._event_engine.register(EVENT_ACCOUNT, self._on_account)

    def add_gateway(self, gateway_type: GatewayType, config: Dict) -> bool:
        """
        添加 Gateway

        Args:
            gateway_type: Gateway 类型
            config: 配置参数

        Returns:
            bool: 是否成功添加
        """
        gateway_name = gateway_type.value

        # Mock 模式：使用 MockGateway
        if self._mock_mode or config.get("mock", False):
            from .gateway.mock_gateway import MockGateway
            gateway = MockGateway(config)
            gateway.connect()
            self._gateways[gateway_name] = gateway
            logger.info(f"Mock Gateway added and connected: {gateway_name}")
            return True

        # 实盘模式：使用真实 Gateway
        try:
            if gateway_type == GatewayType.FUTU:
                from .gateway.futu_gateway import FutuGateway, FutuConfig
                futu_config = FutuConfig(
                    host=config.get("host", "127.0.0.1"),
                    port=config.get("port", 11111),
                    password=config.get("password", ""),
                    market=config.get("market", "US")
                )
                gateway = FutuGateway(futu_config)
                self._gateways[gateway_name] = gateway
                logger.info(f"FutuGateway added: {futu_config.host}:{futu_config.port}")

            elif gateway_type == GatewayType.OST:
                logger.warning("OST Gateway not yet implemented")
                self._gateways[gateway_name] = None
                self._connected[gateway_name] = False
                return False

            else:
                logger.error(f"Unknown gateway type: {gateway_type}")
                return False

            self._connected[gateway_name] = False
            logger.info(f"Gateway {gateway_name} added successfully")
            return True

        except ImportError as e:
            logger.warning(f"Gateway {gateway_type.value} not available: {e}")
            # 降级到 Mock 模式
            from .gateway.mock_gateway import MockGateway
            gateway = MockGateway(config)
            self._gateways[gateway_name] = gateway
            self._mock_mode = True
            logger.info(f"Fallback to Mock Gateway for {gateway_name}")
            return True

    def connect(self, gateway_name: str, config: Dict) -> bool:
        """
        连接 Gateway

        Args:
            gateway_name: Gateway 名称
            config: 连接配置

        Returns:
            bool: 是否成功连接
        """
        if gateway_name not in self._gateways:
            logger.error(f"Gateway {gateway_name} not found")
            return False

        gateway = self._gateways.get(gateway_name)
        if not gateway:
            logger.warning(f"Gateway {gateway_name} not initialized")
            return False

        try:
            if gateway_name == "FUTU":
                # 使用 FutuGateway 连接
                success = gateway.connect()
                self._connected[gateway_name] = success
                return success
            else:
                logger.warning(f"Unknown gateway: {gateway_name}")
                return False

        except Exception as e:
            logger.error(f"Failed to connect {gateway_name}: {e}")
            return False

    def disconnect(self, gateway_name: str) -> bool:
        """断开 Gateway 连接"""
        gateway = self._gateways.get(gateway_name)
        if gateway and hasattr(gateway, 'disconnect'):
            gateway.disconnect()
        self._connected[gateway_name] = False
        logger.info(f"Gateway {gateway_name} disconnected")
        return True

    def is_connected(self, gateway_name: str) -> bool:
        """检查 Gateway 是否已连接"""
        gateway = self._gateways.get(gateway_name)
        if gateway and hasattr(gateway, 'is_connected'):
            return gateway.is_connected()
        return self._connected.get(gateway_name, False)

    def subscribe(self, gateway_name: str, symbols: List[str]) -> bool:
        """
        订阅行情

        Args:
            gateway_name: Gateway 名称
            symbols: 股票代码列表

        Returns:
            bool: 是否成功订阅
        """
        gateway = self._gateways.get(gateway_name)
        if not gateway:
            logger.warning(f"Gateway {gateway_name} not found")
            return False

        if hasattr(gateway, 'subscribe'):
            res = gateway.subscribe(symbols)
            # 如果是 Mock Gateway，启动模拟行情轮询
            if res and gateway_name in ["FUTU", "OST"]:
                self._start_mock_ticker()
            return res

        return False

    def _start_mock_ticker(self):
        """启动模拟行情推送任务"""
        if self._mock_thread_running:
            return
            
        self._mock_thread_running = True
        self._mock_ticker_thread = threading.Thread(target=self._mock_ticker_loop, daemon=True)
        self._mock_ticker_thread.start()
        logger.info("Mock ticker thread started")

    def _mock_ticker_loop(self):
        """模拟行情推送循环"""
        while self._mock_thread_running:
            try:
                # 给所有 gateway 推送已订阅产品的行情
                for gateway_name, gateway in self._gateways.items():
                    # 只有 Mock gateway 需要手动推
                    if gateway_name in ["FUTU", "OST"] and hasattr(gateway, '_subscribed_symbols'):
                        for symbol in gateway._subscribed_symbols:
                            mock_tick = gateway.get_quote(symbol)
                            if mock_tick:
                                # 模拟 EVENT_TICK 发送
                                from dataclasses import asdict
                                # 构造类似 VNPY 的 TickData 对象结构给 _on_tick 处理
                                # 实际上直接构造 TickData 发送回调更快捷
                                tick_data = TickData(
                                    symbol=mock_tick.symbol,
                                    last_price=mock_tick.last_price,
                                    bid_price_1=mock_tick.bid_price_1,
                                    bid_price_2=mock_tick.bid_price_2,
                                    bid_price_3=mock_tick.bid_price_3,
                                    bid_price_4=mock_tick.bid_price_4,
                                    bid_price_5=mock_tick.bid_price_5,
                                    ask_price_1=mock_tick.ask_price_1,
                                    ask_price_2=mock_tick.ask_price_2,
                                    ask_price_3=mock_tick.ask_price_3,
                                    ask_price_4=mock_tick.ask_price_4,
                                    ask_price_5=mock_tick.ask_price_5,
                                    bid_volume_1=mock_tick.bid_volume_1,
                                    bid_volume_2=mock_tick.bid_volume_2,
                                    bid_volume_3=mock_tick.bid_volume_3,
                                    bid_volume_4=mock_tick.bid_volume_4,
                                    bid_volume_5=mock_tick.bid_volume_5,
                                    ask_volume_1=mock_tick.ask_volume_1,
                                    ask_volume_2=mock_tick.ask_volume_2,
                                    ask_volume_3=mock_tick.ask_volume_3,
                                    ask_volume_4=mock_tick.ask_volume_4,
                                    ask_volume_5=mock_tick.ask_volume_5,
                                    volume=mock_tick.volume,
                                    turnover=0,
                                    open_price=mock_tick.last_price,
                                    high_price=mock_tick.last_price,
                                    low_price=mock_tick.last_price,
                                    pre_close=mock_tick.last_price
                                )
                                # 广播行情
                                logger.info(f"Broadcasting mock tick for {tick_data.symbol}")
                                for callback in self._tick_callbacks:
                                    try:
                                        callback(tick_data)
                                    except Exception as e:
                                        logger.error(f"Tick callback error: {e}")
                
            except Exception as e:
                logger.error(f"Mock ticker loop error: {e}")
                
            time.sleep(1.0) # 每秒推送一次行情

    def send_order(
        self,
        gateway_name: str,
        symbol: str,
        direction: OrderDirection,
        volume: int,
        price: float = 0.0,
        order_type: str = "limit"
    ) -> Optional[str]:
        """
        发送订单

        Args:
            gateway_name: Gateway 名称
            symbol: 股票代码
            direction: 买卖方向
            volume: 数量
            price: 价格 (0 为市价单)
            order_type: 订单类型 limit/market

        Returns:
            str: 订单 ID，失败返回 None
        """
        gateway = self._gateways.get(gateway_name)
        if not gateway:
            logger.warning(f"Gateway {gateway_name} not found")
            return None

        if not self.is_connected(gateway_name):
            logger.warning(f"Gateway {gateway_name} not connected")
            return None

        try:
            # 使用 Gateway 的下单方法
            if hasattr(gateway, 'send_order'):
                order_id = gateway.send_order(
                    symbol=symbol,
                    direction=direction.value.upper(),
                    volume=volume,
                    price=price,
                    order_type=order_type
                )

                if order_id:
                    # 记录订单
                    self._orders[order_id] = OrderInfo(
                        order_id=order_id,
                        symbol=symbol,
                        direction=direction,
                        volume=volume,
                        price=price,
                        status=OrderStatus.SUBMITTED
                    )
                    return order_id

            return None

        except Exception as e:
            logger.error(f"Failed to send order: {e}")
            return None

    def cancel_order(self, gateway_name: str, order_id: str) -> bool:
        """撤单"""
        if order_id not in self._orders:
            logger.warning(f"Order {order_id} not found")
            return False

        gateway = self._gateways.get(gateway_name)
        if not gateway:
            return False

        try:
            if hasattr(gateway, 'cancel_order'):
                success = gateway.cancel_order(order_id)
                if success and order_id in self._orders:
                    self._orders[order_id].status = OrderStatus.CANCELLED
                return success
        except Exception as e:
            logger.error(f"Failed to cancel order: {e}")

        return False

    def get_account(self, gateway_name: str) -> AccountInfo:
        """获取账户信息"""
        gateway = self._gateways.get(gateway_name)
        if not gateway:
            return self._account

        try:
            if hasattr(gateway, 'get_account'):
                account = gateway.get_account()
                if account:
                    return AccountInfo(
                        balance=getattr(account, 'total_assets', getattr(account, 'balance', 0.0)),
                        available=getattr(account, 'available_funds', getattr(account, 'available', 0.0)),
                        margin=getattr(account, 'frozen_cash', getattr(account, 'margin', 0.0)),
                        market_value=getattr(account, 'market_val', getattr(account, 'market_value', 0.0))
                    )
        except Exception as e:
            logger.error(f"Failed to get account: {e}")

        return self._account

    def get_positions(self, gateway_name: str) -> List[PositionInfo]:
        """获取持仓信息"""
        gateway = self._gateways.get(gateway_name)
        if not gateway:
            return list(self._positions.values())

        try:
            if hasattr(gateway, 'get_positions'):
                positions = gateway.get_positions()
                return [
                    PositionInfo(
                        symbol=getattr(pos, 'code', getattr(pos, 'symbol', '')),
                        volume=int(getattr(pos, 'qty', getattr(pos, 'volume', 0))),
                        available_volume=int(getattr(pos, 'can_sell_qty', getattr(pos, 'available_volume', 0))),
                        avg_price=getattr(pos, 'cost_price', getattr(pos, 'avg_price', 0.0)),
                        current_price=getattr(pos, 'current_price', 0.0) or \
                                      getattr(pos, 'price', 0.0) or \
                                      (getattr(pos, 'market_val', 0.0) / getattr(pos, 'qty', getattr(pos, 'volume', 1)) if getattr(pos, 'qty', getattr(pos, 'volume', 0)) > 0 else 0.0),
                        pnl=getattr(pos, 'pl_val', getattr(pos, 'pnl', 0.0)),
                        pnl_ratio=getattr(pos, 'pl_ratio', getattr(pos, 'pnl_ratio', 0.0))
                    )
                    for pos in positions
                ]
        except Exception as e:
            logger.error(f"Failed to get positions: {e}")

        return list(self._positions.values())

    def deposit(self, gateway_name: str, amount: float) -> bool:
        """模拟入金"""
        gateway = self._gateways.get(gateway_name)
        if not gateway:
            return False

        try:
            if hasattr(gateway, 'deposit'):
                gateway.deposit(amount)
                return True
        except Exception as e:
            logger.error(f"Failed to deposit: {e}")

        return False

    def get_order(self, order_id: str) -> Optional[OrderInfo]:
        """获取订单信息"""
        return self._orders.get(order_id)

    def get_all_orders(self) -> List[OrderInfo]:
        """获取所有订单"""
        return list(self._orders.values())

    def register_tick_callback(self, callback: Callable):
        """注册 Tick 回调"""
        self._tick_callbacks.append(callback)

    def register_order_callback(self, callback: Callable):
        """注册订单回调"""
        self._order_callbacks.append(callback)

    # ─── 事件处理 ────────────────────────────────────────

    def _on_tick(self, event):
        """处理 Tick 事件"""
        tick = event.data
        tick_data = TickData(
            symbol=tick.symbol,
            last_price=tick.last_price,
            bid_price_1=getattr(tick, 'bid_price_1', 0),
            bid_price_2=getattr(tick, 'bid_price_2', 0),
            bid_price_3=getattr(tick, 'bid_price_3', 0),
            bid_price_4=getattr(tick, 'bid_price_4', 0),
            bid_price_5=getattr(tick, 'bid_price_5', 0),
            ask_price_1=getattr(tick, 'ask_price_1', 0),
            ask_price_2=getattr(tick, 'ask_price_2', 0),
            ask_price_3=getattr(tick, 'ask_price_3', 0),
            ask_price_4=getattr(tick, 'ask_price_4', 0),
            ask_price_5=getattr(tick, 'ask_price_5', 0),
            bid_volume_1=getattr(tick, 'bid_volume_1', 0),
            bid_volume_2=getattr(tick, 'bid_volume_2', 0),
            bid_volume_3=getattr(tick, 'bid_volume_3', 0),
            bid_volume_4=getattr(tick, 'bid_volume_4', 0),
            bid_volume_5=getattr(tick, 'bid_volume_5', 0),
            ask_volume_1=getattr(tick, 'ask_volume_1', 0),
            ask_volume_2=getattr(tick, 'ask_volume_2', 0),
            ask_volume_3=getattr(tick, 'ask_volume_3', 0),
            ask_volume_4=getattr(tick, 'ask_volume_4', 0),
            ask_volume_5=getattr(tick, 'ask_volume_5', 0),
            volume=tick.volume,
            turnover=tick.turnover,
            open_price=tick.open_price,
            high_price=tick.high_price,
            low_price=tick.low_price,
            pre_close=tick.pre_close
        )

        for callback in self._tick_callbacks:
            try:
                callback(tick_data)
            except Exception as e:
                logger.error(f"Tick callback error: {e}")

    def _on_order(self, event):
        """处理订单事件"""
        order = event.data
        if order.vt_orderid in self._orders:
            self._orders[order.vt_orderid].status = OrderStatus(order.status)
            self._orders[order.vt_orderid].update_time = datetime.now()

        for callback in self._order_callbacks:
            try:
                callback(self._orders.get(order.vt_orderid))
            except Exception as e:
                logger.error(f"Order callback error: {e}")

    def _on_trade(self, event):
        """处理成交事件"""
        trade = event.data
        if trade.vt_orderid in self._orders:
            order = self._orders[trade.vt_orderid]
            order.filled_volume += trade.volume
            order.avg_price = (order.avg_price * (order.filled_volume - trade.volume) +
                               trade.price * trade.volume) / order.filled_volume
            if order.filled_volume >= order.volume:
                order.status = OrderStatus.FILLED

    def _on_position(self, event):
        """处理持仓事件"""
        pos = event.data
        self._positions[pos.vt_symbol] = PositionInfo(
            symbol=pos.symbol,
            volume=pos.volume,
            available_volume=pos.frozen_volume,
            avg_price=pos.price,
            current_price=pos.price
        )

    def _on_account(self, event):
        """处理账户事件"""
        account = event.data
        self._account = AccountInfo(
            balance=account.balance,
            available=account.available,
            margin=account.margin,
            market_value=account.market_value
        )

    def close(self):
        """关闭引擎"""
        if self._main_engine:
            self._main_engine.close()
        logger.info("Trading Engine closed")


# 全局引擎实例
trading_engine = TradingEngine()