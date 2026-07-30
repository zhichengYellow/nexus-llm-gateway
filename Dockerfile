# ===== 构建阶段 =====
FROM node:22-slim AS builder

WORKDIR /app

# 复制依赖清单
COPY package.json package-lock.json* ./

# 安装依赖
RUN npm ci

# 复制源码
COPY . .

# 构建
RUN npm run build

# ===== 运行阶段 =====
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

# 只复制运行所需文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle ./drizzle

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8787/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 8787

CMD ["node", "--env-file=.env", "dist/server/index.js"]