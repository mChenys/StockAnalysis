"""
Mock Gateway - 模拟交易网关

用于测试和开发，不需要连接真实券商。
"""
import logging
import uuid
import random
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)

try:
    import stock_data
except ImportError:
    stock_data = None


class OrderStatus(Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


@dataclass
class MockAccount:
    """模拟账户"""
    balance: float = 1000000.0
    available: float = 800000.0
    margin: float = 0.0
    market_value: float = 200000.0


@dataclass
class MockPosition:
    """模拟持仓"""
    symbol: str
    volume: int = 0
    available_volume: int = 0
    avg_price: float = 0.0
    current_price: float = 0.0
    pnl: float = 0.0
    pnl_ratio: float = 0.0


@dataclass
class MockOrder:
    """模拟订单"""
    order_id: str
    symbol: str
    direction: str
    volume: int
    price: float
    status: OrderStatus = OrderStatus.PENDING
    filled_volume: int = 0
    avg_price: float = 0.0
    create_time: datetime = field(default_factory=datetime.now)


@dataclass
class MockTick:
    """模拟行情"""
    symbol: str
    last_price: float
    bid_price_1: float
    ask_price_1: float
    bid_price_2: float = 0.0
    bid_price_3: float = 0.0
    bid_price_4: float = 0.0
    bid_price_5: float = 0.0
    ask_price_2: float = 0.0
    ask_price_3: float = 0.0
    ask_price_4: float = 0.0
    ask_price_5: float = 0.0
    bid_volume_1: int = 0
    bid_volume_2: int = 0
    bid_volume_3: int = 0
    bid_volume_4: int = 0
    bid_volume_5: int = 0
    ask_volume_1: int = 0
    ask_volume_2: int = 0
    ask_volume_3: int = 0
    ask_volume_4: int = 0
    ask_volume_5: int = 0
    volume: int = 0
    datetime: datetime = field(default_factory=datetime.now)


class MockGateway:
    """
    模拟交易 Gateway

    功能:
    - 模拟账户和持仓
    - 模拟下单和撤单
    - 模拟行情数据
    """

    def __init__(self, config: dict = None):
        self.config = config or {}
        self._connected = False
        self._account = MockAccount()
        self._positions: Dict[str, MockPosition] = {}
        self._orders: Dict[str, MockOrder] = {}
        self._subscribed_symbols: List[str] = []
        self._last_ticks: Dict[str, MockTick] = {} # 缓存最后一次生成的行情，避免在收盘（周末）时剧烈刷新假数据
        self._invalid_symbols: Set[str] = set() # 记录验证失败的股票代码

        # 初始化一些默认持仓
        self._init_default_positions()

    def _init_default_positions(self):
        """初始化默认持仓"""
        default_positions = [
            ("AAPL", 100, 175.0, 180.0),
            ("MSFT", 50, 380.0, 385.0),
            ("NVDA", 30, 450.0, 460.0),
        ]
        for symbol, volume, avg_price, current_price in default_positions:
            pnl = (current_price - avg_price) * volume
            pnl_ratio = (current_price - avg_price) / avg_price
            self._positions[symbol] = MockPosition(
                symbol=symbol,
                volume=volume,
                available_volume=volume,
                avg_price=avg_price,
                current_price=current_price,
                pnl=pnl,
                pnl_ratio=pnl_ratio
            )

    def connect(self) -> bool:
        """连接（Mock 模式直接返回成功）"""
        self._connected = True
        logger.info("Mock Gateway connected (simulated mode)")
        return True

    def disconnect(self):
        """断开连接"""
        self._connected = False
        logger.info("Mock Gateway disconnected")

    def is_connected(self) -> bool:
        """检查连接状态"""
        return self._connected

    def get_account(self) -> MockAccount:
        """获取账户信息"""
        # 计算持仓市值
        self._account.market_value = sum(pos.current_price * pos.volume for pos in self._positions.values())
        return self._account

    def get_positions(self) -> List[MockPosition]:
        """获取持仓列表"""
        # 刷新价格和盈亏
        for pos in self._positions.values():
            pos.current_price = self._get_mock_price(pos.symbol)
            pos.pnl = (pos.current_price - pos.avg_price) * pos.volume
            pos.pnl_ratio = (pos.current_price / pos.avg_price - 1) if pos.avg_price > 0 else 0
        return list(self._positions.values())

    def deposit(self, amount: float):
        """模拟入金"""
        self._account.balance += amount
        self._account.available += amount
        logger.info(f"Mock Account Deposit: {amount}. New Balance: {self._account.balance}")
        return self._account

    def send_order(
        self,
        symbol: str,
        direction: str,
        volume: int,
        price: float = 0.0,
        order_type: str = "limit"
    ) -> Optional[str]:
        """
        下单（Mock 模式）

        模拟逻辑:
        - 限价单：延迟成交
        - 市价单：立即成交
        """
        if not self._connected:
            logger.warning("Mock Gateway not connected")
            return None

        # 校验股票代码真实性
        current_price = self._get_mock_price(symbol)
        if current_price <= 0 and symbol not in self._positions:
            logger.error(f"Order rejected: Invalid or unknown stock symbol '{symbol}'")
            return None

        order_id = f"MOCK_{uuid.uuid4().hex[:8].upper()}"

        order = MockOrder(
            order_id=order_id,
            symbol=symbol,
            direction=direction.upper(),
            volume=volume,
            price=price,
            status=OrderStatus.SUBMITTED
        )
        self._orders[order_id] = order

        logger.info(f"Mock Order Submitted: {order_id} {direction} {volume} {symbol} @ {price}")

        # 市价单或价格为0则立即按现价成交
        if order_type == "market" or price == 0:
            self._fill_order(order_id, current_price)
        else:
            # 限价单有 70% 概率成交（模拟撮合）
            if random.random() < 0.7:
                self._fill_order(order_id, price)

        return order_id

    def _fill_order(self, order_id: str, fill_price: float):
        """成交订单"""
        if order_id not in self._orders:
            return

        order = self._orders[order_id]
        order.status = OrderStatus.FILLED
        order.filled_volume = order.volume
        order.avg_price = fill_price

        # 更新持仓
        symbol = order.symbol
        if order.direction == "BUY":
            if symbol in self._positions:
                pos = self._positions[symbol]
                total_cost = pos.avg_price * pos.volume + fill_price * order.volume
                pos.volume += order.volume
                pos.available_volume += order.volume
                pos.avg_price = total_cost / pos.volume
            else:
                self._positions[symbol] = MockPosition(
                    symbol=symbol,
                    volume=order.volume,
                    available_volume=order.volume,
                    avg_price=fill_price,
                    current_price=fill_price
                )
            # 扣除资金
            self._account.balance -= fill_price * order.volume
            self._account.available -= fill_price * order.volume

        elif order.direction == "SELL":
            if symbol in self._positions:
                pos = self._positions[symbol]
                pos.volume -= order.volume
                pos.available_volume -= order.volume
                if pos.volume <= 0:
                    del self._positions[symbol]
            # 增加资金
            self._account.balance += fill_price * order.volume
            self._account.available += fill_price * order.volume

        logger.info(f"Mock Order Filled: {order_id} @ {fill_price}")

    def _get_mock_price(self, symbol: str) -> float:
        """获取真实的 L1 价格信息"""
        if symbol in self._invalid_symbols:
            return 0.0

        if stock_data:
            try:
                yf_symbol = symbol
                if "." not in symbol:
                    if len(symbol) == 6 and (symbol.startswith("6") or symbol.startswith("0") or symbol.startswith("3")):
                        yf_symbol = f"{symbol}.SS" if symbol.startswith("6") else f"{symbol}.SZ"
                
                price_info = stock_data.get_stock_price(yf_symbol)
                
                # 校验股票代码真实性：如果 yfinance 返回的基础信息里没有 shortName 或 currentPrice，通常是无效代码
                if not price_info or (not price_info.get("shortName") and not price_info.get("currentPrice")):
                    logger.warning(f"Stock symbol verification failed: {symbol}")
                    self._invalid_symbols.add(symbol)
                    return 0.0

                if price_info.get("currentPrice"):
                    return round(float(price_info["currentPrice"]), 2)
            except Exception as e:
                # 针对限流报错不标记为无效，只针对 404/Invalid Symbol 标记
                err_msg = str(e).lower()
                if "none" in err_msg or "not found" in err_msg or "delisted" in err_msg:
                    self._invalid_symbols.add(symbol)
                logger.warning(f"Failed to get real price for {symbol}: {e}")

        # 如果没有真实数据且非收盘日，按持仓数据模拟（兜底）
        if symbol in self._positions:
            return self._positions[symbol].current_price
            
        return 0.0 # 无效或未定义的股票不返回模拟价格

    def get_quote(self, symbol: str) -> Optional[MockTick]:
        """获取行情深度 (L2 数据的模拟推导)"""
        from datetime import datetime
        now = datetime.now()
        is_weekend = now.weekday() >= 5 # 5=Sat, 6=Sun (收盘期间完全禁止数据动态刷新)
        
        # 1. 检查市场是否处于收盘状态 (周末、非交易时间)
        # 如果是周末且已有缓存数据，直接返回缓存，彻底停止刷新
        if is_weekend and symbol in self._last_ticks:
            return self._last_ticks[symbol]

        # 2. 获取 L1 真实成交价格 (从 yfinance 获取)
        price = self._get_mock_price(symbol)
        
        # 3. 如果价格无效且没有持仓记录，则判定该股无效
        if price <= 0:
            return None

        # 4. 模拟生成 L2 深度 (基于 L1 现价进行科学推导)
        # Note: 即使是商业软件，免费版的五档行情也是基于现价模拟产生的，除非对接真实的交易所 L2 接口
        tick = MockTick(
            symbol=symbol,
            last_price=price,
            bid_price_1=round(price - 0.01, 2),
            bid_price_2=round(price - 0.02, 2),
            bid_price_3=round(price - 0.03, 2),
            bid_price_4=round(price - 0.04, 2),
            bid_price_5=round(price - 0.05, 2),
            ask_price_1=round(price + 0.01, 2),
            ask_price_2=round(price + 0.02, 2),
            ask_price_3=round(price + 0.03, 2),
            ask_price_4=round(price + 0.04, 2),
            ask_price_5=round(price + 0.05, 2),
            bid_volume_1=random.randint(100, 1000),
            bid_volume_2=random.randint(100, 1000),
            bid_volume_3=random.randint(100, 1000),
            bid_volume_4=random.randint(100, 1000),
            bid_volume_5=random.randint(100, 1000),
            ask_volume_1=random.randint(100, 1000),
            ask_volume_2=random.randint(100, 1000),
            ask_volume_3=random.randint(100, 1000),
            ask_volume_4=random.randint(100, 1000),
            ask_volume_5=random.randint(100, 1000),
            volume=random.randint(10000, 1000000)
        )
        
        # 5. 更新缓存，方便收盘后维持一致性
        self._last_ticks[symbol] = tick
        return tick

    def cancel_order(self, order_id: str) -> bool:
        """撤单"""
        if order_id not in self._orders:
            return False

        order = self._orders[order_id]
        if order.status in [OrderStatus.FILLED, OrderStatus.CANCELLED]:
            return False

        order.status = OrderStatus.CANCELLED
        logger.info(f"Mock Order Cancelled: {order_id}")
        return True

    def get_order(self, order_id: str) -> Optional[MockOrder]:
        """获取订单"""
        return self._orders.get(order_id)

    def get_orders(self) -> List[MockOrder]:
        """获取所有订单"""
        return list(self._orders.values())

    def subscribe(self, symbols: List[str]) -> bool:
        """订阅行情"""
        self._subscribed_symbols.extend(symbols)
        logger.info(f"Mock Subscribed: {symbols}")
        return True


# 创建全局 Mock Gateway 实例
mock_gateway = MockGateway()