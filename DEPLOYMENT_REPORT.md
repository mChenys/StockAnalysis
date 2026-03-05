# 🚀 CloudBase 部署报告

**部署时间**: 2026-03-04  
**部署环境**: test-3gj6hf8n9547bbc0  
**区域**: ap-shanghai  

---

## ✅ 部署成功

### 前端（静态托管）

**访问地址**: https://test-3gj6hf8n9547bbc0-1257106486.tcloudbaseapp.com/

**已部署文件**:
- ✅ `index.html` - 主页面
- ✅ `agent.html` - AI Agent 页面  
- ✅ `app.js` - 前端应用脚本

**状态**: 部署成功，可正常访问

---

## ⚠️ 后端部署说明

### 问题
后端 Cloud Run 部署遇到超时问题，可能原因：
1. Docker 镜像构建时间较长
2. 项目依赖较多，下载耗时
3. 网络连接问题

### 推荐部署方式

#### 方式一：控制台部署（推荐）

1. 访问 CloudBase 控制台：
   ```
   https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/platform-run
   ```

2. 点击"新建服务" → 选择"容器服务"

3. 配置参数：
   - **服务名称**: `stock-analysis-backend`
   - **镜像来源**: 本地代码目录
   - **CPU**: 0.5核
   - **内存**: 1GB
   - **最小实例**: 0（节省成本）
   - **最大实例**: 5
   - **端口**: 3000
   - **访问类型**: 公网访问

4. 上传项目代码或连接 Git 仓库

5. 配置环境变量（见下方）

#### 方式二：使用 CloudBase CLI

```bash
# 1. 安装 CLI
npm install -g @cloudbase/cli

# 2. 登录
tcb login

# 3. 部署服务
tcb run deploy stock-analysis-backend \
  --runtime nodejs \
  --port 3000 \
  --cpu 0.5 \
  --mem 1 \
  --min-num 0 \
  --max-num 5
```

---

## 🔧 环境变量配置

### 必需的环境变量

在 CloudBase 控制台或 CLI 中配置以下环境变量：

```bash
# 服务配置
NODE_ENV=production
PORT=3000

# 数据库（如果使用 MongoDB）
MONGODB_URI=mongodb://localhost:27017/stockanalysis

# 认证
JWT_SECRET=your-jwt-secret-here

# AI 服务提供商
OPENAI_API_KEY=sk-your-openai-key
NVIDIA_API_KEY=nvapi-your-nvidia-key

# 微信推送（可选）
WECHAT_CORPID=your-wechat-corp-id
WECHAT_CORPSECRET=your-wechat-corp-secret
WECHAT_AGENTID=your-wechat-agent-id

# Python 服务（如果使用）
PYTHON_SERVICE_URL=http://localhost:5001
```

### 配置方式

**控制台配置**:
1. 进入云托管服务详情页
2. 点击"配置" → "环境变量"
3. 添加上述环境变量

**CLI 配置**:
```bash
tcb run update stock-analysis-backend \
  --env NODE_ENV=production \
  --env PORT=3000 \
  --env JWT_SECRET=your-secret
```

---

## 📊 已启用的 CloudBase 服务

| 服务 | 状态 | 说明 |
|------|------|------|
| 静态网站托管 | ✅ 已部署 | 前端应用 |
| 云托管 | ⏳ 待部署 | 后端服务 |
| 数据库（MySQL） | ✅ 已启用 | 可用于数据存储 |
| 云存储 | ✅ 已启用 | 文件存储 |
| 云函数 | ✅ 已启用 | Serverless 函数 |

---

## 🔗 重要链接

### CloudBase 控制台

- **环境概览**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/overview
- **云托管服务**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/platform-run
- **静态托管**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/static-hosting
- **数据库管理**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/db/mysql/table/default/
- **云函数管理**: https://tcb.cloud.tencent.com/dev?envId=test-3gj6hf8n9547bbc0#/scf

### 应用访问

- **前端应用**: https://test-3gj6hf8n9547bbc0-1257106486.tcloudbaseapp.com/
- **后端 API**: 部署后可通过云托管服务获取

---

## 📝 下一步操作

1. **完成后端部署**:
   - 使用控制台上传代码
   - 配置环境变量
   - 启动服务

2. **配置前端 API 地址**:
   - 更新 `public/app.js` 中的 API 基础地址
   - 重新上传前端文件

3. **测试应用**:
   - 访问前端地址
   - 测试 AI 分析功能
   - 验证数据库连接

4. **监控和日志**:
   - 查看云托管服务日志
   - 监控服务性能指标
   - 设置告警规则

---

## ⚠️ 注意事项

1. **数据库**: 项目默认使用内存存储，如需持久化请配置 MongoDB 或使用 CloudBase 数据库

2. **WebSocket**: 确保云托管服务支持 WebSocket 连接

3. **Python 服务**: Python 微服务需要单独部署（建议使用云函数或另一个云托管服务）

4. **成本控制**: 
   - 设置最小实例为 0 可节省成本
   - 但会增加冷启动时间
   - 建议生产环境设置最小实例为 1

5. **安全性**:
   - 不要在代码中硬编码密钥
   - 使用环境变量管理敏感信息
   - 配置访问控制规则

---

## 🎯 部署总结

✅ **前端**: 已成功部署到静态托管  
⏳ **后端**: 需要手动完成部署  
📊 **数据库**: 已启用，可使用  
📦 **存储**: 已启用，可使用  

**下一步**: 按照上述步骤完成后端部署，然后更新前端配置即可完整运行应用。
