"""
回测相关 API
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import random

router = APIRouter(prefix="/backtest", tags=["Backtest"])

class BacktestRequest(BaseModel):
    strategy_name: str
    symbol: str
    interval: str = "1m"
    start_date: str
    end_date: str
    capital: float = 1000000.0

class BacktestResult(BaseModel):
    total_return: float
    annual_return: float
    max_drawdown: float
    sharpe_ratio: float
    total_trades: int
    profit_trades: int
    loss_trades: int
    pnl_data: List[float] = []

@router.post("/run", response_model=BacktestResult)
async def run_backtest(request: BacktestRequest):
    """
    运行策略回测
    
    目前为模拟实现，后续可对接 VNPY CtaBacktester 模块。
    """
    # 模拟回测计算延迟
    # await asyncio.sleep(2) 
    
    # 生成模拟结果
    total_days = 252 # 假设一年
    pnl_data = [0.0]
    current_pnl = 0.0
    
    for _ in range(total_days):
        daily_move = random.uniform(-0.02, 0.025) # 稍微偏多头
        current_pnl += daily_move * 100
        pnl_data.append(round(current_pnl, 2))
        
    total_return = pnl_data[-1]
    
    return BacktestResult(
        total_return=round(total_return, 2),
        annual_return=round(total_return * (252/total_days), 2),
        max_drawdown=round(random.uniform(-15.0, -5.0), 2),
        sharpe_ratio=round(random.uniform(1.5, 3.2), 2),
        total_trades=random.randint(40, 150),
        profit_trades=random.randint(25, 90),
        loss_trades=random.randint(15, 60),
        pnl_data=pnl_data
    )
