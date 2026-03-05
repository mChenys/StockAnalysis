"""
账户相关 API
"""
from fastapi import APIRouter, HTTPException
from typing import List
from pydantic import BaseModel

from ..engine import trading_engine, AccountInfo, PositionInfo

router = APIRouter(prefix="/account", tags=["Account"])


class AccountResponse(BaseModel):
    """账户响应"""
    balance: float
    available: float
    margin: float
    market_value: float


class PositionResponse(BaseModel):
    """持仓响应"""
    symbol: str
    volume: int
    available_volume: int
    avg_price: float
    current_price: float
    pnl: float
    pnl_ratio: float


@router.get("/{gateway}", response_model=AccountResponse)
async def get_account(gateway: str):
    """
    获取账户信息

    Args:
        gateway: Gateway 名称 (FUTU, OST)
    """
    if not trading_engine.is_connected(gateway):
        raise HTTPException(status_code=503, detail=f"Gateway {gateway} not connected")

    account = trading_engine.get_account(gateway)
    return AccountResponse(
        balance=account.balance,
        available=account.available,
        margin=account.margin,
        market_value=account.market_value
    )


@router.get("/{gateway}/positions", response_model=List[PositionResponse])
async def get_positions(gateway: str):
    """
    获取持仓信息

    Args:
        gateway: Gateway 名称
    """
    if not trading_engine.is_connected(gateway):
        raise HTTPException(status_code=503, detail=f"Gateway {gateway} not connected")

    positions = trading_engine.get_positions(gateway)
    return [
        PositionResponse(
            symbol=p.symbol,
            volume=p.volume,
            available_volume=p.available_volume,
            avg_price=p.avg_price,
            current_price=p.current_price,
            pnl=p.pnl,
            pnl_ratio=p.pnl_ratio
        )
        for p in positions
    ]


class DepositRequest(BaseModel):
    """入金请求"""
    gateway: str
    amount: float


@router.post("/deposit")
async def deposit_funds(request: DepositRequest):
    """
    模拟入金

    - **gateway**: Gateway 名称
    - **amount**: 入金金额
    """
    if not trading_engine.is_connected(request.gateway):
        raise HTTPException(status_code=503, detail=f"Gateway {request.gateway} not connected")

    success = trading_engine.deposit(request.gateway, request.amount)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to deposit funds")

    return {"success": True, "message": f"Successfully deposited {request.amount}"}