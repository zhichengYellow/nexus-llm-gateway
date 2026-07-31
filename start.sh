#!/bin/bash
# Nexus LLM Gateway - 一键启动脚本
set -e

cd "$(dirname "$0")"

echo "========================================="
echo "  Nexus LLM Gateway - 启动"
echo "========================================="

# 1. 启动基础设施
echo "[1/4] 启动 Postgres + Redis..."
docker compose up -d postgres redis
sleep 3

# 2. 初始化 pgvector
echo "[2/4] 初始化向量扩展..."
docker exec nexus-postgres psql -U nexus -d nexus -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null

# 3. 迁移 + 种子数据
echo "[3/4] 迁移数据库 & 创建种子数据..."
source ~/.nvm/nvm.sh
nvm use 22 >/dev/null 2>&1
npx drizzle-kit push --force
npx tsx --env-file=.env src/server/db/seed.ts

# 4. 启动网关 + 看板
echo "[4/4] 启动网关 (8787) + 看板 (3000)..."
npx tsx --env-file=.env src/server/index.ts &
GW_PID=$!
cd dashboard && npx next dev -p 3000 &
DASH_PID=$!
cd ..

echo ""
echo "========================================="
echo "  ✅ 启动完成"
echo "  网关 API: http://localhost:8787"
echo "  管理看板: http://localhost:3000"
echo "  Master Key: sk-nexus-master-change-me"
echo "========================================="
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获退出信号，清理进程
cleanup() {
  echo ""
  echo "停止服务..."
  kill $GW_PID 2>/dev/null
  kill $DASH_PID 2>/dev/null
  docker compose down
  echo "已停止"
}
trap cleanup EXIT INT TERM

wait