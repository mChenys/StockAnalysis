#!/bin/bash

# AI股票分析系统启动脚本

echo "🚀 启动AI股票分析系统..."
echo "================================================"

# 检查Node.js环境
echo "📋 检查运行环境..."
if ! command -v node &> /dev/null; then
    echo "❌ 错误: Node.js 未安装"
    echo "请安装 Node.js 16.0.0 或更高版本"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js版本: $NODE_VERSION"

# 创建必要的目录
echo "📁 创建必要目录..."
mkdir -p logs config .qoze

# 检查并创建环境配置文件
if [ ! -f .env ]; then
    echo "⚙️  创建环境配置文件..."
    cp .env.example .env
    echo ""
    echo "⚠️  重要提醒:"
    echo "   请编辑 .env 文件配置以下内容:"
    echo "   1. AI模型API密钥 (OpenAI/Claude/Gemini等)"
    echo "   2. 微信推送配置 (Server酱推荐)"
    echo "   3. 股票数据源API密钥 (可选)"
    echo ""
    echo "   配置完成后请重新运行此脚本"
    echo ""
    
    # 询问是否现在配置
    read -p "是否现在打开配置文件进行编辑? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v code &> /dev/null; then
            code .env
        elif command -v nano &> /dev/null; then
            nano .env
        elif command -v vim &> /dev/null; then
            vim .env
        else
            echo "请手动编辑 .env 文件"
        fi
    fi
    
    echo "配置完成后请重新运行: ./start.sh"
    exit 0
fi

# 检查依赖
echo "📦 检查项目依赖..."
if [ ! -d "node_modules" ]; then
    echo "🔄 安装项目依赖..."
    npm install
    
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
else
    echo "✅ 依赖已安装"
fi

# 检查配置状态
echo "🔍 检查配置状态..."

# 检查是否配置了AI模型
if grep -q "your_.*_api_key_here" .env; then
    echo "⚠️  警告: 检测到默认API密钥，请配置真实的API密钥"
fi

# 检查推送配置
HAS_PUSH_CONFIG=false
if grep -q "^SERVERCHAN_KEY=SCT" .env && ! grep -q "SCT123456789abcdef" .env; then
    echo "✅ Server酱推送已配置"
    HAS_PUSH_CONFIG=true
elif grep -q "^WECHAT_CORP_ID=" .env && ! grep -q "your_corp_id" .env; then
    echo "✅ 企业微信推送已配置"  
    HAS_PUSH_CONFIG=true
elif grep -q "^WECHAT_TEST_APPID=" .env && ! grep -q "your_test_appid" .env; then
    echo "✅ 微信测试号推送已配置"
    HAS_PUSH_CONFIG=true
fi

if [ "$HAS_PUSH_CONFIG" = false ]; then
    echo "ℹ️  提示: 推送功能未配置，将无法发送通知"
    echo "   推荐配置Server酱: https://sct.ftqq.com/"
fi

# 显示系统信息
echo ""
echo "📊 系统信息:"
echo "   工作目录: $(pwd)"
echo "   Node.js: $NODE_VERSION"
echo "   系统: $(uname -s)"
echo "   时间: $(date)"

# 最终确认启动
echo ""
echo "🎯 准备启动服务..."
echo "   管理界面: http://localhost:3000"
echo "   API接口: http://localhost:3000/api"
echo ""

read -p "按 Enter 键启动服务 (Ctrl+C 取消): "

# 清理旧的日志
if [ -f "logs/combined.log" ]; then
    echo "🧹 清理旧日志..."
    > logs/combined.log
    > logs/error.log 2>/dev/null || true
fi

# 启动应用
echo ""
echo "🚀 启动AI股票分析系统..."
echo "================================================"

# 检查端口是否被占用
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  警告: 端口3000已被占用"
    read -p "是否终止占用端口的进程并继续? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        lsof -ti:3000 | xargs kill -9 2>/dev/null || true
        sleep 2
    else
        echo "启动取消"
        exit 0
    fi
fi

# 启动应用
export NODE_ENV=production
npm start

# 如果程序退出，显示退出信息
EXIT_CODE=$?
echo ""
echo "================================================"
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ 应用正常退出"
else
    echo "❌ 应用异常退出 (代码: $EXIT_CODE)"
    echo "请检查日志文件: logs/error.log"
fi
echo "感谢使用AI股票分析系统！"
