"""
VNPY Service 使用示例

演示如何使用 vnpy_service 进行交易操作。
"""
import asyncio
import httpx


class VNPYDemo:
    """VNPY 服务使用示例"""

    def __init__(self, base_url: str = "http://127.0.0.1:8002"):
        self.base_url = base_url
        self.client = httpx.Client(timeout=30.0)

    # ─── 基础操作 ────────────────────────────────────────

    def check_health(self):
        """检查服务健康状态"""
        res = self.client.get(f"{self.base_url}/health")
        print(f"Health: {res.json()}")

    def list_gateways(self):
        """列出所有 Gateway"""
        res = self.client.get(f"{self.base_url}/gateway/list")
        print(f"Gateways: {res.json()}")

    def connect_futu(self, host: str = "127.0.0.1", port: int = 11111, password: str = ""):
        """连接富途 Gateway"""
        res = self.client.post(
            f"{self.base_url}/gateway/connect",
            json={
                "gateway": "FUTU",
                "config": {
                    "host": host,
                    "port": port,
                    "password": password
                }
            }
        )
        print(f"Connect FUTU: {res.json()}")

    # ─── 账户操作 ────────────────────────────────────────

    def get_account(self, gateway: str = "FUTU"):
        """获取账户信息"""
        res = self.client.get(f"{self.base_url}/api/account/{gateway}")
        print(f"Account: {res.json()}")

    def get_positions(self, gateway: str = "FUTU"):
        """获取持仓"""
        res = self.client.get(f"{self.base_url}/api/account/{gateway}/positions")
        print(f"Positions: {res.json()}")

    # ─── 订单操作 ────────────────────────────────────────

    def send_order(self, gateway: str, symbol: str, direction: str, volume: int, price: float = 0):
        """下单"""
        res = self.client.post(
            f"{self.base_url}/api/order",
            json={
                "gateway": gateway,
                "symbol": symbol,
                "direction": direction,  # buy / sell
                "volume": volume,
                "price": price,
                "order_type": "limit" if price > 0 else "market"
            }
        )
        print(f"Order: {res.json()}")
        return res.json()

    def cancel_order(self, gateway: str, order_id: str):
        """撤单"""
        res = self.client.delete(f"{self.base_url}/api/order/{gateway}/{order_id}")
        print(f"Cancel: {res.json()}")

    def list_orders(self):
        """列出所有订单"""
        res = self.client.get(f"{self.base_url}/api/order/list")
        print(f"Orders: {res.json()}")

    # ─── 策略操作 ────────────────────────────────────────

    def create_ai_strategy(self, name: str, symbols: list, gateway: str):
        """创建 AI 策略"""
        res = self.client.post(
            f"{self.base_url}/strategy",
            json={
                "name": name,
                "symbols": symbols,
                "gateway": gateway,
                "params": {
                    "ai_service_url": "http://localhost:3000",
                    "model_id": "deepseek-chat",
                    "analysis_interval": 300,
                    "confidence_threshold": 0.7,
                    "position_size": 100
                }
            }
        )
        print(f"Create Strategy: {res.json()}")

    def start_strategy(self, name: str):
        """启动策略"""
        res = self.client.post(f"{self.base_url}/strategy/{name}/start")
        print(f"Start Strategy: {res.json()}")

    def stop_strategy(self, name: str):
        """停止策略"""
        res = self.client.post(f"{self.base_url}/strategy/{name}/stop")
        print(f"Stop Strategy: {res.json()}")

    def get_strategy_signals(self, name: str):
        """获取策略信号"""
        res = self.client.get(f"{self.base_url}/strategy/{name}/signals")
        print(f"Signals: {res.json()}")

    def list_strategies(self):
        """列出所有策略"""
        res = self.client.get(f"{self.base_url}/strategy/list")
        print(f"Strategies: {res.json()}")

    def close(self):
        """关闭客户端"""
        self.client.close()


def demo_basic_operations():
    """基础操作演示"""
    print("\n" + "=" * 50)
    print("VNPY Service 基础操作演示")
    print("=" * 50)

    demo = VNPYDemo()

    # 1. 检查服务状态
    print("\n[1] 检查服务状态")
    demo.check_health()

    # 2. 列出 Gateway
    print("\n[2] 列出 Gateway")
    demo.list_gateways()

    # 3. 连接富途 (需要 OpenD 运行)
    # demo.connect_futu()

    # 4. 获取账户信息 (Mock 模式)
    print("\n[4] 获取账户信息")
    demo.get_account("FUTU")

    # 5. 获取持仓
    print("\n[5] 获取持仓")
    demo.get_positions("FUTU")

    # 6. 下单 (Mock 模式)
    print("\n[6] 下单测试")
    order = demo.send_order("FUTU", "AAPL", "buy", 100, 180.0)

    # 7. 查看订单
    print("\n[7] 查看订单")
    demo.list_orders()

    demo.close()


def demo_strategy_operations():
    """策略操作演示"""
    print("\n" + "=" * 50)
    print("VNPY Service 策略操作演示")
    print("=" * 50)

    demo = VNPYDemo()

    # 1. 创建 AI 策略
    print("\n[1] 创建 AI 策略")
    demo.create_ai_strategy(
        name="ai_tech_stocks",
        symbols=["AAPL", "MSFT", "NVDA"],
        gateway="FUTU"
    )

    # 2. 列出策略
    print("\n[2] 列出策略")
    demo.list_strategies()

    # 3. 启动策略
    print("\n[3] 启动策略")
    demo.start_strategy("ai_tech_stocks")

    # 4. 获取策略信号
    print("\n[4] 获取策略信号")
    demo.get_strategy_signals("ai_tech_stocks")

    # 5. 停止策略
    print("\n[5] 停止策略")
    demo.stop_strategy("ai_tech_stocks")

    demo.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "strategy":
        demo_strategy_operations()
    else:
        demo_basic_operations()

    print("\n" + "=" * 50)
    print("演示完成!")
    print("=" * 50)
    print("""
启动服务:
    cd python_service
    source venv/bin/activate
    python -m vnpy_service.main

运行演示:
    python -m vnpy_service.demo          # 基础操作
    python -m vnpy_service.demo strategy # 策略操作
    """)