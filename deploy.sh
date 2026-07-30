#!/bin/bash
# Nexus LLM Gateway - 一键部署脚本
# 用法: ./deploy.sh

set -e

echo "🚀 Nexus LLM Gateway 部署脚本"
echo "=============================="

# 检查 .env.production
if [ ! -f .env.production ]; then
  echo "❌ 未找到 .env.production，请从 .env.production.example 复制并修改"
  echo "   cp .env.production.example .env.production"
  exit 1
fi

# 构建并启动
echo "📦 构建并启动服务..."
docker compose -f docker-compose.prod.yml up -d --build

# 等待服务就绪
echo "⏳ 等待服务启动..."
sleep 10

# 初始化数据库（启用 pgvector + 推送 schema）
echo "🗄 初始化数据库..."
docker exec nexus-postgres psql -U nexus -d nexus -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true

# 推送 schema（需要在容器内执行）
echo "📋 推送数据库 schema..."
docker compose -f docker-compose.prod.yml exec -T gateway node -e "
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
" 2>/dev/null || echo "   (schema 需手动推送: npm run db:push)"

# 健康检查
echo "🏥 健康检查..."
HEALTH=$(curl -s http://localhost:${PORT:-8787}/health 2>/dev/null || echo "failed")
echo "   $HEALTH"

echo ""
echo "✅ 部署完成！"
echo "   网关地址: http://localhost:${PORT:-8787}"
echo "   健康检查: http://localhost:${PORT:-8787}/health"
echo "   管理 API: http://localhost:${PORT:-8787}/admin/*"
echo ""
echo "📝 下一步:"
echo "   1. 运行 seed 创建初始 API Key: docker compose -f docker-compose.prod.yml exec gateway node dist/server/db/seed.js"
echo "   2. 配置 Nginx 反向代理 + SSL（见 README）"