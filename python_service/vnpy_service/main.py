"""
VNPY Trading Service - FastAPI 主入口

启动方式:
    cd python_service
    source venv/bin/activate
    python -m vnpy_service.main

或者:
    uvicorn vnpy_service.main:app --host 0.0.0.0 --port 8002 --reload
"""
import logging
from contextlib import asynccontextmanager
from typing import Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .engine import trading_engine, GatewayType
from .api import account_router, order_router, quote_router, backtest_router

# 配置日志
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化
    logger.info("Starting VNPY Trading Service...")

    # 初始化交易引擎
    if trading_engine.initialize():
        logger.info("Trading engine initialized")

        # 添加 Gateways
        if settings.futu_enabled:
            trading_engine.add_gateway(GatewayType.FUTU, {})
            logger.info("Futu gateway added")

        if settings.ost_enabled:
            trading_engine.add_gateway(GatewayType.OST, {})
            logger.info("OST gateway added")
    else:
        logger.warning("Trading engine initialization failed, running in mock mode")

    yield

    # 关闭时清理
    logger.info("Shutting down VNPY Trading Service...")
    trading_engine.close()


# 创建 FastAPI 应用
app = FastAPI(
    title="VNPY Trading Service",
    description="VNPY 交易服务适配层，提供 HTTP/WebSocket 接口",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(account_router, prefix="/api")
app.include_router(order_router, prefix="/api")
app.include_router(quote_router, prefix="/api")
app.include_router(backtest_router, prefix="/api")


# ─── Gateway 管理 API ────────────────────────────────────────

class GatewayConnectRequest(BaseModel):
    """Gateway 连接请求"""
    gateway: str
    config: Dict = {}


class GatewayResponse(BaseModel):
    """Gateway 响应"""
    gateway: str
    connected: bool


@app.get("/")
async def root():
    """根路径"""
    return {
        "service": "VNPY Trading Service",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "mock_mode": trading_engine._mock_mode,
        "gateways": {
            name: trading_engine.is_connected(name)
            for name in trading_engine._gateways.keys()
        }
    }


@app.get("/gateway/list")
async def list_gateways():
    """列出所有 Gateway"""
    return {
        "gateways": [
            {
                "name": name,
                "connected": trading_engine.is_connected(name)
            }
            for name in trading_engine._gateways.keys()
        ]
    }


@app.post("/gateway/connect", response_model=GatewayResponse)
async def connect_gateway(request: GatewayConnectRequest):
    """
    连接 Gateway

    - **gateway**: Gateway 名称 (FUTU, OST)
    - **config**: 连接配置
    """
    gateway_name = request.gateway.upper()

    # 检查 Gateway 是否存在
    if gateway_name not in trading_engine._gateways:
        # 尝试添加 Gateway
        try:
            gateway_type = GatewayType(gateway_name)
            trading_engine.add_gateway(gateway_type, request.config)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown gateway: {gateway_name}"
            )

    # 连接
    success = trading_engine.connect(gateway_name, request.config)

    return GatewayResponse(
        gateway=gateway_name,
        connected=success
    )


@app.post("/gateway/disconnect/{gateway}", response_model=GatewayResponse)
async def disconnect_gateway(gateway: str):
    """断开 Gateway 连接"""
    gateway_name = gateway.upper()
    success = trading_engine.disconnect(gateway_name)

    return GatewayResponse(
        gateway=gateway_name,
        connected=not success
    )


# ─── 策略管理 API ────────────────────────────────────────

from .strategy.base_strategy import StrategyConfig, StrategyStatus
from .strategy.ai_strategy import AIStrategy

# 策略实例存储
_strategies: Dict[str, AIStrategy] = {}


class StrategyCreateRequest(BaseModel):
    """创建策略请求"""
    name: str
    symbols: list[str]
    gateway: str
    params: Dict = {}


class StrategyResponse(BaseModel):
    """策略响应"""
    name: str
    status: str
    symbols: list[str]
    gateway: str


@app.post("/strategy", response_model=StrategyResponse)
async def create_strategy(request: StrategyCreateRequest):
    """
    创建 AI 策略

    - **name**: 策略名称
    - **symbols**: 交易标的列表
    - **gateway**: 使用的 Gateway
    - **params**: 策略参数
    """
    if request.name in _strategies:
        raise HTTPException(status_code=400, detail="Strategy already exists")

    config = StrategyConfig(
        name=request.name,
        symbols=request.symbols,
        gateway=request.gateway,
        params=request.params
    )

    strategy = AIStrategy(config, trading_engine)
    strategy.on_init()
    _strategies[request.name] = strategy

    return StrategyResponse(
        name=request.name,
        status=strategy.status.value,
        symbols=request.symbols,
        gateway=request.gateway
    )


@app.get("/strategy/list", response_model=list[StrategyResponse])
async def list_strategies():
    """列出所有策略"""
    return [
        StrategyResponse(
            name=s.config.name,
            status=s.status.value,
            symbols=s.config.symbols,
            gateway=s.config.gateway
        )
        for s in _strategies.values()
    ]


@app.post("/strategy/{name}/start")
async def start_strategy(name: str):
    """启动策略"""
    if name not in _strategies:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy = _strategies[name]
    strategy.start()

    return {"message": f"Strategy {name} started", "status": strategy.status.value}


@app.post("/strategy/{name}/stop")
async def stop_strategy(name: str):
    """停止策略"""
    if name not in _strategies:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy = _strategies[name]
    strategy.stop()

    return {"message": f"Strategy {name} stopped", "status": strategy.status.value}


@app.get("/strategy/{name}/signals")
async def get_strategy_signals(name: str):
    """获取策略信号"""
    if name not in _strategies:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy = _strategies[name]
    signals = strategy.get_signals()

    return {
        "strategy": name,
        "signals": [
            {
                "symbol": s.symbol,
                "direction": s.direction,
                "volume": s.volume,
                "price": s.price,
                "reason": s.reason,
                "timestamp": s.timestamp.isoformat()
            }
            for s in signals
        ]
    }


@app.delete("/strategy/{name}")
async def delete_strategy(name: str):
    """删除策略"""
    if name not in _strategies:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy = _strategies[name]
    if strategy.status == StrategyStatus.RUNNING:
        strategy.stop()

    del _strategies[name]

    return {"message": f"Strategy {name} deleted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "vnpy_service.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )