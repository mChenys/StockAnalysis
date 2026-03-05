"""
网格交易策略示例

网格策略是一种被动的量化策略，在设定的价格区间内自动高抛低吸。
适合震荡行情，通过频繁交易赚取价差。
"""
from typing import List, Dict, Optional, Any
from datetime import datetime
import logging

from .base_strategy import BaseStrategy, StrategyConfig, Signal

logger = logging.getLogger(__name__)


class GridStrategy(BaseStrategy):
    """
    网格交易策略

    在设定的价格区间内，按等间距布置买卖单，实现自动高抛低吸。

    配置示例:
        config = StrategyConfig(
            name="grid_aapl",
            symbols=["AAPL"],
            gateway="FUTU",
            params={
                "upper_price": 200.0,    # 网格上界
                "lower_price": 150.0,    # 网格下界
                "grid_count": 10,        # 网格数量
                "volume_per_grid": 100,  # 每格交易量
                "total_volume": 1000,    # 总持仓量
            }
        )
    """

    def __init__(self, config: StrategyConfig, engine=None):
        super().__init__(config, engine)

        # 网格参数
        self.upper_price = config.params.get("upper_price", 200.0)
        self.lower_price = config.params.get("lower_price", 150.0)
        self.grid_count = config.params.get("grid_count", 10)
        self.volume_per_grid = config.params.get("volume_per_grid", 100)
        self.total_volume = config.params.get("total_volume", 1000)

        # 计算网格间距
        self.grid_spacing = (self.upper_price - self.lower_price) / self.grid_count

        # 网格状态
        self._grid_levels: List[float] = []  # 网格价格线
        self._grid_positions: Dict[float, int] = {}  # 每个网格的持仓
        self._last_price: float = 0.0

    def on_init(self):
        """初始化网格"""
        self.log("Initializing Grid Strategy")

        # 生成网格价格线
        self._grid_levels = [
            self.lower_price + i * self.grid_spacing
            for i in range(self.grid_count + 1)
        ]

        self.log(f"Grid levels: {[round(p, 2) for p in self._grid_levels]}")

        # 初始化每个网格的持仓
        for level in self._grid_levels:
            self._grid_positions[level] = 0

    def on_tick(self, tick: Any):
        """处理 Tick 数据"""
        if self.status.value != "running":
            return

        current_price = tick.last_price

        # 检查是否跨越网格
        if self._last_price > 0:
            self._check_grid_cross(current_price)

        self._last_price = current_price

    def on_bar(self, bar: Any):
        """处理 K 线数据"""
        pass

    def _check_grid_cross(self, current_price: float):
        """
        检查是否跨越网格，并执行交易

        Args:
            current_price: 当前价格
        """
        # 找到当前价格所在的网格区间
        for i, level in enumerate(self._grid_levels[:-1]):
            next_level = self._grid_levels[i + 1]

            if level <= current_price < next_level:
                # 价格下跌穿越网格线 - 买入
                if current_price < self._last_price and self._last_price >= next_level:
                    self._buy_at_grid(level, current_price)

                # 价格上涨穿越网格线 - 卖出
                elif current_price > self._last_price and self._last_price <= level:
                    self._sell_at_grid(next_level, current_price)

                break

    def _buy_at_grid(self, grid_level: float, current_price: float):
        """在网格线买入"""
        symbol = self.config.symbols[0]

        # 检查是否还有资金
        position = self.get_position(symbol)
        if position >= self.total_volume:
            self.log(f"Max position reached, skip buy")
            return

        # 计算买入量
        buy_volume = min(self.volume_per_grid, self.total_volume - position)

        self.log(f"Grid BUY: {symbol} @ {current_price:.2f}, volume={buy_volume}")

        order_id = self.buy(
            symbol=symbol,
            volume=buy_volume,
            price=current_price,
            reason=f"Grid buy at {grid_level:.2f}"
        )

        if order_id:
            self._grid_positions[grid_level] += buy_volume

    def _sell_at_grid(self, grid_level: float, current_price: float):
        """在网格线卖出"""
        symbol = self.config.symbols[0]

        # 检查是否有持仓
        position = self.get_position(symbol)
        if position <= 0:
            self.log(f"No position to sell")
            return

        # 计算卖出量
        sell_volume = min(self.volume_per_grid, position)

        self.log(f"Grid SELL: {symbol} @ {current_price:.2f}, volume={sell_volume}")

        order_id = self.sell(
            symbol=symbol,
            volume=sell_volume,
            price=current_price,
            reason=f"Grid sell at {grid_level:.2f}"
        )

        if order_id:
            self._grid_positions[grid_level] -= sell_volume

    def get_grid_status(self) -> Dict:
        """获取网格状态"""
        return {
            "upper_price": self.upper_price,
            "lower_price": self.lower_price,
            "grid_count": self.grid_count,
            "grid_spacing": round(self.grid_spacing, 4),
            "grid_levels": [round(p, 2) for p in self._grid_levels],
            "grid_positions": {
                round(k, 2): v
                for k, v in self._grid_positions.items()
                if v != 0
            },
            "last_price": self._last_price,
            "total_position": self.get_position(self.config.symbols[0]) if self.config.symbols else 0
        }