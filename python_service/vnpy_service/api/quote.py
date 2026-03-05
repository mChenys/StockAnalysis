"""
行情相关 API 和 WebSocket
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import List, Set
from pydantic import BaseModel
from datetime import datetime
import asyncio
import json
import logging

from ..engine import trading_engine, TickData

router = APIRouter(prefix="/quote", tags=["Quote"])
logger = logging.getLogger(__name__)


class QuoteResponse(BaseModel):
    """行情响应"""
    symbol: str
    last_price: float
    bid_price: float
    ask_price: float
    bid_volume: int
    ask_volume: int
    volume: int
    turnover: float
    open_price: float
    high_price: float
    low_price: float
    pre_close: float
    datetime: datetime


class SubscribeRequest(BaseModel):
    """订阅请求"""
    gateway: str
    symbols: List[str]


# WebSocket 连接管理
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket connected, total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected, total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Broadcast error: {e}")


manager = ConnectionManager()


@router.post("/subscribe")
async def subscribe_quote(request: SubscribeRequest):
    """
    订阅行情

    - **gateway**: Gateway 名称
    - **symbols**: 股票代码列表
    """
    if not trading_engine.is_connected(request.gateway):
        raise HTTPException(
            status_code=503,
            detail=f"Gateway {request.gateway} not connected"
        )

    success = trading_engine.subscribe(request.gateway, request.symbols)
    return {
        "success": success,
        "gateway": request.gateway,
        "symbols": request.symbols
    }


@router.websocket("/ws/{gateway}")
async def websocket_quote(websocket: WebSocket, gateway: str):
    """
    实时行情 WebSocket

    连接后发送订阅消息:
    ```json
    {"action": "subscribe", "symbols": ["AAPL", "MSFT"]}
    ```

    接收行情数据:
    ```json
    {
        "type": "tick",
        "symbol": "AAPL",
        "last_price": 180.5,
        ...
    }
    ```
    """
    await manager.connect(websocket)

    # 注册 Tick 回调
    subscribed_symbols = set()
    # 获取当前事件循环，用于跨线程调用
    loop = asyncio.get_running_loop()

    def on_tick(tick: TickData):
        if tick.symbol in subscribed_symbols:
            # 使用 run_coroutine_threadsafe 确保跨线程调用安全 (Mock ticker 在后台线程运行)
            asyncio.run_coroutine_threadsafe(manager.broadcast({
                "type": "tick",
                "symbol": tick.symbol,
                "last_price": tick.last_price,
                "bid_price_1": tick.bid_price_1,
                "bid_price_2": tick.bid_price_2,
                "bid_price_3": tick.bid_price_3,
                "bid_price_4": tick.bid_price_4,
                "bid_price_5": tick.bid_price_5,
                "ask_price_1": tick.ask_price_1,
                "ask_price_2": tick.ask_price_2,
                "ask_price_3": tick.ask_price_3,
                "ask_price_4": tick.ask_price_4,
                "ask_price_5": tick.ask_price_5,
                "bid_volume_1": tick.bid_volume_1,
                "bid_volume_2": tick.bid_volume_2,
                "bid_volume_3": tick.bid_volume_3,
                "bid_volume_4": tick.bid_volume_4,
                "bid_volume_5": tick.bid_volume_5,
                "ask_volume_1": tick.ask_volume_1,
                "ask_volume_2": tick.ask_volume_2,
                "ask_volume_3": tick.ask_volume_3,
                "ask_volume_4": tick.ask_volume_4,
                "ask_volume_5": tick.ask_volume_5,
                "volume": tick.volume,
                "datetime": tick.datetime.isoformat()
            }), loop)

    trading_engine.register_tick_callback(on_tick)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)

                if message.get("action") == "subscribe":
                    symbols = message.get("symbols", [])
                    subscribed_symbols.update(symbols)

                    # 调用引擎订阅
                    if trading_engine.is_connected(gateway):
                        trading_engine.subscribe(gateway, symbols)

                    await websocket.send_json({
                        "type": "subscribed",
                        "symbols": list(subscribed_symbols)
                    })

                elif message.get("action") == "unsubscribe":
                    symbols = message.get("symbols", [])
                    subscribed_symbols.difference_update(symbols)
                    await websocket.send_json({
                        "type": "unsubscribed",
                        "symbols": list(symbols)
                    })

            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON"
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Quote WebSocket disconnected")


@router.post("/subscribe")
async def subscribe_quote(request: SubscribeRequest):
    """订阅行情 (HTTP 方式)"""
    gateway_name = request.gateway.upper()
    success = trading_engine.subscribe(gateway_name, request.symbols)
    
    return {
        "success": success,
        "gateway": gateway_name,
        "symbols": request.symbols
    }


@router.get("/mock/{symbol}", response_model=QuoteResponse)
async def get_mock_quote(symbol: str):
    """
    获取模拟行情 (测试用)

    在没有连接券商时可以用来测试
    """
    import random

    base_price = 100.0 + random.uniform(-10, 10)
    return QuoteResponse(
        symbol=symbol,
        last_price=round(base_price + random.uniform(-1, 1), 2),
        bid_price=round(base_price - 0.05, 2),
        ask_price=round(base_price + 0.05, 2),
        bid_volume=random.randint(100, 1000),
        ask_volume=random.randint(100, 1000),
        volume=random.randint(10000, 100000),
        turnover=random.uniform(1000000, 10000000),
        open_price=round(base_price, 2),
        high_price=round(base_price + 2, 2),
        low_price=round(base_price - 2, 2),
        pre_close=round(base_price - random.uniform(-2, 2), 2),
        datetime=datetime.now()
    )