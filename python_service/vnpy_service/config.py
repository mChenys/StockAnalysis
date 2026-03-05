"""
VNPY Service 配置管理
"""
import os
from typing import Optional
from pydantic import BaseModel
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """VNPY Service 配置"""

    # 服务配置
    host: str = "0.0.0.0"
    port: int = 8002
    debug: bool = False

    # VNPY 引擎配置
    event_buffer_size: int = 1000

    # Gateway 配置 - 富途
    futu_enabled: bool = True
    futu_host: str = "127.0.0.1"
    futu_port: int = 11111
    futu_password: str = ""

    # Gateway 配置 - 东方财富
    ost_enabled: bool = True
    ost_account: str = ""
    ost_password: str = ""
    ost_broker_id: str = ""

    # AI 服务配置 (用于 AI 策略)
    ai_service_url: str = "http://localhost:3000"

    class Config:
        env_prefix = "VNPY_"
        env_file = ".env"


class FutuGatewayConfig(BaseModel):
    """富途 Gateway 配置"""
    host: str = "127.0.0.1"
    port: int = 11111
    password: str = ""

    class Config:
        # 富途 OpenD 配置说明:
        # 1. 下载安装 OpenD: https://www.futunn.com/download/openAPI
        # 2. 启动 OpenD 并设置密码
        # 3. 默认端口 11111
        pass


class OstGatewayConfig(BaseModel):
    """东方财富 Gateway 配置"""
    account: str
    password: str
    broker_id: str

    class Config:
        # 东方财富 API 配置说明:
        # 1. 需要东方财富证券账户
        # 2. 申请 API 权限 (机构更容易获批)
        # 3. 获取 broker_id
        pass


# 全局配置实例
settings = Settings()