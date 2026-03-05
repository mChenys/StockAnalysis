#!/bin/bash

# ═══════════════════════════════════════════════════════
# Stock Analysis System — Full Stack Launcher
# Starts Node.js main server, Python data service, and VNPY trading service
# ═══════════════════════════════════════════════════════

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_DIR="$ROOT_DIR/python_service"
PYTHON_VENV="$PYTHON_DIR/venv"

echo "🚀 Stock Analysis System — Full Stack Mode"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── 1. Setup Python virtual environment ─────────────────
if [ ! -d "$PYTHON_VENV" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv "$PYTHON_VENV"
fi

echo "📦 Installing Python dependencies..."
"$PYTHON_VENV/bin/pip" install -q -r "$PYTHON_DIR/requirements.txt"
echo "✅ Python dependencies ready"

# ─── 2. Kill existing processes on our ports ─────────────
echo ""
echo "🔍 Cleaning up existing services..."
# 彻底杀掉占用端口的进程及其子进程
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3005 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:8002 | xargs kill -9 2>/dev/null || true
# 预防性杀掉可能残留的相关进程名
pkill -9 -f "nodemon" 2>/dev/null || true
pkill -9 -f "uvicorn" 2>/dev/null || true
sleep 1
echo " ✅ Cleanup complete"

# ─── 3. Start Python Agno Agent (AI Analysis) ──────────────
echo "🐍 Starting Python Agno Agent (port 8000)..."
cd "$PYTHON_DIR"
"$PYTHON_VENV/bin/uvicorn" main:app --host 0.0.0.0 --port 8000 > python_service.log 2>&1 &
PYTHON_PID=$!
echo "   PID: $PYTHON_PID (Logs: python_service/python_service.log)"

# Wait for Python service to be ready
echo -n "   Waiting for service..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8000/health > /dev/null 2>&1; then
        echo " ✅ Ready!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo " ⚠️  Timeout (will continue anyway)"
    fi
    sleep 1
    echo -n "."
done

# ─── 4. Start VNPY Trading Service (Mock Mode) ──────────────
echo ""
echo "📈 Starting VNPY Trading Service (port 8002)..."
cd "$PYTHON_DIR"
"$PYTHON_VENV/bin/uvicorn" vnpy_service.main:app --host 0.0.0.0 --port 8002 > vnpy_service.log 2>&1 &
VNPY_PID=$!
echo "   PID: $VNPY_PID (Logs: python_service/vnpy_service.log)"
echo "   Mode: Mock (模拟交易模式)"

# Wait for VNPY service to be ready
echo -n "   Waiting for service..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8002/health > /dev/null 2>&1; then
        echo " ✅ Ready!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo " ⚠️  Timeout (will continue anyway)"
    fi
    sleep 1
    echo -n "."
done

# ─── 5. Cleanup on exit ─────────────────────────────────
cleanup() {
    echo ""
    echo "🛑 Shutting down all services..."
    kill $PYTHON_PID 2>/dev/null && echo "   ✅ Python Agno Agent stopped"
    kill $VNPY_PID 2>/dev/null && echo "   ✅ VNPY Trading Service stopped"
    kill $NODE_PID 2>/dev/null && echo "   ✅ Node.js server stopped"
    kill $MONITOR_PID 2>/dev/null && echo "   ✅ Monitor UI stopped"
    exit 0
}
trap cleanup SIGINT SIGTERM

# ─── 6. Start Node.js server ───────────────────────────
echo ""
echo "📗 Starting Node.js Server (port 3000)..."
cd "$ROOT_DIR"
npm run dev &
NODE_PID=$!

cd "$ROOT_DIR/python_service/situation-monitor"
npm run dev -- --host --port 3005 > dev.log 2>&1 &
MONITOR_PID=$!

sleep 3

echo ""
echo "═════════════════════════════════════════════"
echo "✅ Full Stack System Running!"
echo ""
echo "   📗 Main App:  http://localhost:3000"
echo "   🤖 AI Agent:  http://localhost:3000/agent"
echo "   🐍 Python:    http://localhost:8000"
echo "   📖 API Docs:  http://localhost:8000/docs"
echo "   📈 VNPY:      http://localhost:8002"
echo "   📊 VNPY Docs: http://localhost:8002/docs"
echo "   🌍 Monitor:   http://localhost:3005"
echo ""
echo "═════════════════════════════════════════════"
echo "Press Ctrl+C to stop all services."
echo ""

wait $NODE_PID
