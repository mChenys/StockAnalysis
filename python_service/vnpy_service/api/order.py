"""
订单相关 API
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

from ..engine import trading_engine, OrderDirection, OrderStatus

router = APIRouter(prefix="/order", tags=["Order"])


class OrderDirectionEnum(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    LIMIT = "limit"
    MARKET = "market"


class OrderRequest(BaseModel):
    """下单请求"""
    gateway: str = Field(..., description="Gateway 名称 (FUTU, OST)")
    symbol: str = Field(..., description="股票代码")
    direction: OrderDirectionEnum = Field(..., description="买卖方向")
    volume: int = Field(..., gt=0, description="数量")
    price: float = Field(default=0.0, ge=0, description="价格 (0 为市价)")
    order_type: OrderType = Field(default=OrderType.LIMIT, description="订单类型")


class OrderResponse(BaseModel):
    """订单响应"""
    order_id: str
    symbol: str
    direction: str
    volume: int
    price: float
    status: str
    filled_volume: int
    avg_price: float
    create_time: datetime
    update_time: datetime


class CancelResponse(BaseModel):
    """撤单响应"""
    order_id: str
    success: bool
    message: str


@router.post("", response_model=OrderResponse)
async def send_order(request: OrderRequest):
    """
    发送订单

    - **gateway**: Gateway 名称 (FUTU, OST)
    - **symbol**: 股票代码
    - **direction**: 买卖方向 (buy/sell)
    - **volume**: 数量
    - **price**: 价格 (0 为市价单)
    - **order_type**: 订单类型 (limit/market)
    """
    if not trading_engine.is_connected(request.gateway):
        raise HTTPException(
            status_code=503,
            detail=f"Gateway {request.gateway} not connected"
        )

    direction = OrderDirection.BUY if request.direction == OrderDirectionEnum.BUY else OrderDirection.SELL

    order_id = trading_engine.send_order(
        gateway_name=request.gateway,
        symbol=request.symbol,
        direction=direction,
        volume=request.volume,
        price=request.price,
        order_type=request.order_type.value
    )

    if not order_id:
        raise HTTPException(
            status_code=400, 
            detail=f"Order rejected: Stock symbol '{request.symbol}' is invalid or currently has no market data."
        )

    order = trading_engine.get_order(order_id)
    return OrderResponse(
        order_id=order.order_id,
        symbol=order.symbol,
        direction=order.direction.value,
        volume=order.volume,
        price=order.price,
        status=order.status.value,
        filled_volume=order.filled_volume,
        avg_price=order.avg_price,
        create_time=order.create_time,
        update_time=order.update_time
    )


@router.delete("/{gateway}/{order_id}", response_model=CancelResponse)
async def cancel_order(gateway: str, order_id: str):
    """
    撤销订单

    - **gateway**: Gateway 名称
    - **order_id**: 订单 ID
    """
    if not trading_engine.is_connected(gateway):
        raise HTTPException(status_code=503, detail=f"Gateway {gateway} not connected")

    success = trading_engine.cancel_order(gateway, order_id)

    return CancelResponse(
        order_id=order_id,
        success=success,
        message="Order cancelled" if success else "Failed to cancel order"
    )


@router.get("/list", response_model=List[OrderResponse])
async def list_orders():
    """获取所有订单"""
    orders = trading_engine.get_all_orders()
    return [
        OrderResponse(
            order_id=o.order_id,
            symbol=o.symbol,
            direction=o.direction.value,
            volume=o.volume,
            price=o.price,
            status=o.status.value,
            filled_volume=o.filled_volume,
            avg_price=o.avg_price,
            create_time=o.create_time,
            update_time=o.update_time
        )
        for o in orders
    ]


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str):
    """获取订单信息"""
    order = trading_engine.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return OrderResponse(
        order_id=order.order_id,
        symbol=order.symbol,
        direction=order.direction.value,
        volume=order.volume,
        price=order.price,
        status=order.status.value,
        filled_volume=order.filled_volume,
        avg_price=order.avg_price,
        create_time=order.create_time,
        update_time=order.update_time
    )