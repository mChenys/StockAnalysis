# MooMoo (富途海外版) OpenD 配置指南

## 1. 下载 OpenD

### MooMoo 海外版
- 官网: https://www.moomoo.com/download/openapi
- 直接链接: https://www.moomoo.com/download/OpenAPI

### 富途国内版 (如果用富途牛牛)
- 官网: https://www.futunn.com/download/openAPI

## 2. 安装和启动 OpenD

### macOS
```bash
# 1. 下载 .dmg 文件
# 2. 拖拽到 Applications
# 3. 启动 OpenD 应用

# 或者命令行启动
open -a OpenD
```

### Windows
```bash
# 1. 下载 .exe 安装包
# 2. 安装并启动
```

### Linux
```bash
# 下载 Linux 版本
wget https://softwarefile.futunn.com/OpenD_x.x.x_linux.tar.gz
tar -xzf OpenD_x.x.x_linux.tar.gz
./OpenD
```

## 3. OpenD 配置

启动 OpenD 后，设置以下参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| **监听地址** | 127.0.0.1 | 本地访问 |
| **监听端口** | 11111 | 默认端口 |
| **密码** | 自定义 | API 访问密码 |

### 配置文件 (OpenD.xml)
```xml
<config>
    <api_svr>
        <host>127.0.0.1</host>
        <port>11111</port>
    </api_svr>
    <password>your_password</password>
</config>
```

## 4. 账号登录

OpenD 需要登录 MooMoo 账号：

1. 启动 OpenD 应用
2. 扫码登录 MooMoo 账号
3. 确认 API 权限已开通

### 开通 API 权限
- MooMoo App → 我的 → 设置 → 交易权限 → OpenAPI
- 需要完成风险测评

## 5. 测试连接

### Python 测试
```python
from futu import OpenQuoteContext, RET_OK

# 创建行情上下文
quote_ctx = OpenQuoteContext(host='127.0.0.1', port=11111)

# 测试连接
ret, data = quote_ctx.get_global_state()
if ret == RET_OK:
    print("OpenD 连接成功!")
    print(f"状态: {data}")
else:
    print(f"连接失败: {data}")

quote_ctx.close()
```

### curl 测试
```bash
# 通过 VNPY Service 测试
curl -X POST http://localhost:8002/gateway/connect \
  -H "Content-Type: application/json" \
  -d '{"gateway": "FUTU", "config": {"host": "127.0.0.1", "port": 11111, "market": "US"}}'
```

## 6. 市场代码

| 市场 | 代码 | 示例 |
|------|------|------|
| 美股 | US | AAPL, MSFT, NVDA |
| 港股 | HK | HK.00700, HK.09988 |
| A股 | CN | CN.000001 |

## 7. 常见问题

### Q: OpenD 无法启动
- 检查端口 11111 是否被占用
- 检查是否有足够的系统权限

### Q: 连接超时
- 确认 OpenD 已启动
- 确认地址和端口正确
- 检查防火墙设置

### Q: API 权限不足
- 登录 MooMoo App 开通 OpenAPI 权限
- 某些功能需要特定权限等级

### Q: 交易时间限制
- 美股: 美东时间 9:30-16:00
- 港股: 港股交易时段
- 盘前盘后交易需要额外权限

## 8. 费用说明

- OpenD 使用免费
- 交易手续费按券商标准收取
- API 调用无额外费用

## 9. 文档资源

- OpenD 官方文档: https://openapi.moomoo.com/
- Python SDK 文档: https://openapi.moomoo.com/python-doc/
- API 参考: https://openapi.moomoo.com/api-reference/