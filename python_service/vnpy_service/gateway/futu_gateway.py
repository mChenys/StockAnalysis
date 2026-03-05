"""
富途 Futu OpenD Gateway 实现

直接使用 futu-api 连接富途 OpenD，无需依赖 vnpy_futu。

使用前准备:
1. 下载安装 OpenD: https://www.futunn.com/download/openAPI
2. 启动 OpenD 并设置密码
3. OpenD 默认监听 127.0.0.1:11111

MooMoo 海外版说明:
- MooMoo 是富途海外版，使用相同的 OpenD
- 需要使用 MooMoo 账号登录 OpenD
- OpenD 下载地址: https://www.moomoo.com/download/openapi
"""
import logging
import threading
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import time

logger = logging.getLogger(__name__)


class OrderStatus(Enum):
    """订单状态"""
    PENDING = "pending"
    SUBMITTED = "submitted"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


@dataclass
class FutuConfig:
    """富途 OpenD 配置"""
    host: str = "127.0.0.1"
    port: int = 11111
    password: str = ""
    security_firm: int = 1  # 1: 富途证券

    # 市场设置
    # HK: 港股, US: 美股, CN: A股
    market: str = "US"


@dataclass
class AccountData:
    """账户数据"""
    total_assets: float = 0.0
    cash: float = 0.0
    market_val: float = 0.0
    frozen_cash: float = 0.0
    available_funds: float = 0.0


@dataclass
class PositionData:
    """持仓数据"""
    code: str
    qty: float = 0.0
    can_sell_qty: float = 0.0
    cost_price: float = 0.0
    market_val: float = 0.0
    pl_ratio: float = 0.0
    pl_val: float = 0.0


@dataclass
class OrderData:
    """订单数据"""
    order_id: str
    code: str
    qty: float
    price: float
    side: str  # BUY / SELL
    status: OrderStatus = OrderStatus.PENDING
    dealt_qty: float = 0.0
    dealt_avg_price: float = 0.0
    create_time: datetime = field(default_factory=datetime.now)
    update_time: datetime = field(default_factory=datetime.now)


@dataclass
class TickData:
    """Tick 数据"""
    code: str
    last_price: float
    open_price: float
    high_price: float
    low_price: float
    prev_close: float
    volume: int
    turnover: float
    timestamp: datetime = field(default_factory=datetime.now)


class FutuGateway:
    """
    富途 Gateway - 直接使用 futu-api

    功能:
    - 连接 OpenD
    - 查询账户、持仓
    - 下单、撤单
    - 订阅行情
    """

    def __init__(self, config: FutuConfig = None):
        self.config = config or FutuConfig()
        self._quote_ctx = None
        self._trade_ctx = None
        self._connected = False
        self._is_us_market = config.market == "US" if config else True

        # 数据缓存
        self._account: Optional[AccountData] = None
        self._positions: Dict[str, PositionData] = {}
        self._orders: Dict[str, OrderData] = {}

        # 回调
        self._tick_callbacks: List[Callable] = []
        self._order_callbacks: List[Callable] = []

        # 行情订阅线程
        self._quote_thread: Optional[threading.Thread] = None
        self._quote_running = False

    def connect(self) -> bool:
        """
        连接 OpenD

        Returns:
            bool: 是否成功连接
        """
        try:
            from futu import OpenQuoteContext, OpenHKTradeContext, OpenUSTradeContext, RET_OK

            # 创建行情上下文
            self._quote_ctx = OpenQuoteContext(
                host=self.config.host,
                port=self.config.port
            )

            # 创建交易上下文 (根据市场选择)
            if self._is_us_market:
                self._trade_ctx = OpenUSTradeContext(
                    host=self.config.host,
                    port=self.config.port,
                    security_firm=self.config.security_firm
                )
            else:
                self._trade_ctx = OpenHKTradeContext(
                    host=self.config.host,
                    port=self.config.port,
                    security_firm=self.config.security_firm
                )

            # 测试连接 - 获取全局状态
            ret, data = self._quote_ctx.get_global_state()
            if ret == RET_OK:
                self._connected = True
                logger.info(f"成功连接 OpenD: {self.config.host}:{self.config.port}")
                logger.info(f"OpenD 状态: {data}")
                return True
            else:
                logger.error(f"连接 OpenD 失败: {data}")
                return False

        except ImportError as e:
            logger.error(f"futu-api 未安装: {e}")
            logger.info("请运行: pip install futu-api")
            return False
        except Exception as e:
            logger.error(f"连接 OpenD 失败: {e}")
            return False

    def disconnect(self):
        """断开连接"""
        self._quote_running = False

        if self._quote_ctx:
            self._quote_ctx.close()
            self._quote_ctx = None

        if self._trade_ctx:
            self._trade_ctx.close()
            self._trade_ctx = None

        self._connected = False
        logger.info("已断开 OpenD 连接")

    def is_connected(self) -> bool:
        """检查是否已连接"""
        return self._connected

    # ─── 账户查询 ────────────────────────────────────────

    def get_account(self) -> Optional[AccountData]:
        """获取账户信息"""
        if not self._connected or not self._trade_ctx:
            logger.warning("未连接 OpenD")
            return None

        try:
            from futu import RET_OK

            # 获取账户资金
            ret, data = self._trade_ctx.accinfo_query()
            if ret == RET_OK and not data.empty:
                row = data.iloc[0]
                self._account = AccountData(
                    total_assets=float(row.get('total_assets', 0)),
                    cash=float(row.get('cash', 0)),
                    market_val=float(row.get('market_val', 0)),
                    frozen_cash=float(row.get('frozen_cash', 0)),
                    available_funds=float(row.get('available_funds', 0))
                )
                return self._account
            else:
                logger.error(f"获取账户信息失败: {data}")
                return None

        except Exception as e:
            logger.error(f"获取账户信息异常: {e}")
            return None

    def get_positions(self) -> List[PositionData]:
        """获取持仓列表"""
        if not self._connected or not self._trade_ctx:
            return []

        try:
            from futu import RET_OK

            ret, data = self._trade_ctx.position_list_query()
            if ret == RET_OK and not data.empty:
                self._positions.clear()
                positions = []
                for _, row in data.iterrows():
                    pos = PositionData(
                        code=str(row.get('code', '')),
                        qty=float(row.get('qty', 0)),
                        can_sell_qty=float(row.get('can_sell_qty', 0)),
                        cost_price=float(row.get('cost_price', 0)),
                        market_val=float(row.get('market_val', 0)),
                        pl_ratio=float(row.get('pl_ratio', 0)),
                        pl_val=float(row.get('pl_val', 0))
                    )
                    positions.append(pos)
                    self._positions[pos.code] = pos
                return positions
            else:
                logger.warning(f"获取持仓失败或无持仓: {data}")
                return []

        except Exception as e:
            logger.error(f"获取持仓异常: {e}")
            return []

    # ─── 订单操作 ────────────────────────────────────────

    def send_order(
        self,
        symbol: str,
        direction: str,
        volume: int,
        price: float = 0.0,
        order_type: str = "limit"
    ) -> Optional[str]:
        """
        下单

        Args:
            symbol: 股票代码 (如 "AAPL", "HK.00700")
            direction: "BUY" 或 "SELL"
            volume: 数量
            price: 价格 (市价单填 0)
            order_type: "limit" 或 "market"

        Returns:
            订单 ID，失败返回 None
        """
        if not self._connected or not self._trade_ctx:
            logger.warning("未连接 OpenD")
            return None

        try:
            from futu import RET_OK, TrdSide, OrderType

            # 转换方向
            trd_side = TrdSide.BUY if direction.upper() == "BUY" else TrdSide.SELL

            # 转换订单类型
            if order_type == "market":
                ord_type = OrderType.MARKET
            else:
                ord_type = OrderType.LIMIT

            # 下单
            ret, data = self._trade_ctx.place_order(
                price=price,
                qty=volume,
                code=symbol,
                trd_side=trd_side,
                ord_type=ord_type
            )

            if ret == RET_OK and not data.empty:
                order_id = str(data.iloc[0].get('order_id', ''))
                logger.info(f"下单成功: {order_id} {symbol} {direction} {volume}@{price}")

                # 记录订单
                self._orders[order_id] = OrderData(
                    order_id=order_id,
                    code=symbol,
                    qty=volume,
                    price=price,
                    side=direction.upper(),
                    status=OrderStatus.SUBMITTED
                )

                return order_id
            else:
                logger.error(f"下单失败: {data}")
                return None

        except Exception as e:
            logger.error(f"下单异常: {e}")
            return None

    def cancel_order(self, order_id: str) -> bool:
        """撤单"""
        if not self._connected or not self._trade_ctx:
            return False

        try:
            from futu import RET_OK

            ret, data = self._trade_ctx.modify_order(
                modify_order_op=0,  # 撤单
                order_id=order_id,
                qty=0,
                price=0
            )

            if ret == RET_OK:
                logger.info(f"撤单成功: {order_id}")
                if order_id in self._orders:
                    self._orders[order_id].status = OrderStatus.CANCELLED
                return True
            else:
                logger.error(f"撤单失败: {data}")
                return False

        except Exception as e:
            logger.error(f"撤单异常: {e}")
            return False

    def get_order(self, order_id: str) -> Optional[OrderData]:
        """获取订单信息"""
        return self._orders.get(order_id)

    def get_orders(self) -> List[OrderData]:
        """获取所有订单"""
        return list(self._orders.values())

    # ─── 行情订阅 ────────────────────────────────────────

    def subscribe(self, symbols: List[str]) -> bool:
        """
        订阅行情

        Args:
            symbols: 股票代码列表 (如 ["AAPL", "MSFT"] 或 ["HK.00700"])
        """
        if not self._connected or not self._quote_ctx:
            logger.warning("未连接 OpenD")
            return False

        try:
            from futu import RET_OK, SubType

            # 订阅 K 线和 Tick
            ret, err_msg = self._quote_ctx.subscribe(
                code_list=symbols,
                subtype_list=[SubType.QUOTE, SubType.K_1M],
                is_first_push=True
            )

            if ret == RET_OK:
                logger.info(f"订阅行情成功: {symbols}")
                return True
            else:
                logger.error(f"订阅行情失败: {err_msg}")
                return False

        except Exception as e:
            logger.error(f"订阅行情异常: {e}")
            return False

    def get_quote(self, symbol: str) -> Optional[TickData]:
        """获取实时行情"""
        if not self._connected or not self._quote_ctx:
            return None

        try:
            from futu import RET_OK

            ret, data = self._quote_ctx.get_market_snapshot([symbol])
            if ret == RET_OK and not data.empty:
                row = data.iloc[0]
                return TickData(
                    code=symbol,
                    last_price=float(row.get('last_price', 0)),
                    open_price=float(row.get('open_price', 0)),
                    high_price=float(row.get('high_price', 0)),
                    low_price=float(row.get('low_price', 0)),
                    prev_close=float(row.get('prev_close_price', 0)),
                    volume=int(row.get('volume', 0)),
                    turnover=float(row.get('turnover', 0))
                )
            return None

        except Exception as e:
            logger.error(f"获取行情异常: {e}")
            return None

    def register_tick_callback(self, callback: Callable):
        """注册 Tick 回调"""
        self._tick_callbacks.append(callback)

    def register_order_callback(self, callback: Callable):
        """注册订单回调"""
        self._order_callbacks.append(callback)


# ─── 便捷函数 ────────────────────────────────────────

def create_futu_gateway(
    host: str = "127.0.0.1",
    port: int = 11111,
    market: str = "US"
) -> FutuGateway:
    """
    创建富途 Gateway

    Args:
        host: OpenD 地址
        port: OpenD 端口
        market: 市场 "US" / "HK" / "CN"

    Returns:
        FutuGateway 实例
    """
    config = FutuConfig(host=host, port=port, market=market)
    gateway = FutuGateway(config)
    return gateway