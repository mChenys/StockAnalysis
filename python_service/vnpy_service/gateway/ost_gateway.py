"""
东方财富 Gateway 配置
"""
from pydantic import BaseModel


class OstGatewayConfig(BaseModel):
    """
    东方财富 Gateway 配置

    使用前准备:
    1. 开通东方财富证券账户
    2. 申请 API 权限 (机构更容易获批)
    3. 获取 broker_id 和账号信息

    注意:
    - 个人用户 API 权限申请较难
    - 建议先用模拟盘测试

    示例:
        config = OstGatewayConfig(
            account="your_account",
            password="your_password",
            broker_id="your_broker_id"
        )
    """
    account: str = ""
    password: str = ""
    broker_id: str = ""

    # 交易服务器
    td_address: str = ""
    # 行情服务器
    md_address: str = ""

    # 产品信息
    app_id: str = ""
    auth_code: str = ""

    class Config:
        # 东方财富支持:
        # - A股
        # - 部分港股通
        pass

    def to_vnpy_config(self) -> dict:
        """转换为 VNPY 配置格式"""
        return {
            "userid": self.account,
            "password": self.password,
            "brokerid": self.broker_id,
            "td_address": self.td_address,
            "md_address": self.md_address,
            "appid": self.app_id,
            "auth_code": self.auth_code
        }


# 默认配置 (需要填写实际值)
DEFAULT_OST_CONFIG = OstGatewayConfig()