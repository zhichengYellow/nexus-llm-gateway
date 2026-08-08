# Deployment

Nexus 支持**本地部署**与 **Render 云端部署**两种模式。

## 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `GATEWAY_MASTER_KEY` | ✅ | 网关鉴权主密钥（调用 /v1 与 /admin 均需） |
| `DATABASE_URL` | ✅ | PostgreSQL 连接串 |
| `REDIS_URL` | ✅ | Redis 连接串（限流依赖） |
| `ENCRYPTION_KEY` | 生产 ✅ | Provider Key 静态加密密钥（`openssl rand -hex 32`） |
| `DEEPSEEK_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` 等 | 按需 | Provider 密钥（也可在 Console Provider 页配置，存 DB 加密） |
| `PORT` | 否 | 监听端口，默认 8787（Render 自动注入） |

## 本地部署

```bash
git clone <repo> && cd nexus-llm-gateway
cp .env.example .env          # 填写 DATABASE_URL / REDIS_URL / GATEWAY_MASTER_KEY
docker compose up -d          # Postgres + Redis
npm ci
npx drizzle-kit push          # 建表（或 npm run db:push）
npm run dev                   # 开发（tsx watch）
# 或生产:
npm run build && npm start    # node dist/server/index.js
```

验证：

```bash
curl http://localhost:8787/health          # {"status":"ok","db":true,"redis":true}
curl http://localhost:8787/v1/models -H "Authorization: Bearer $GATEWAY_MASTER_KEY"
```

## Render 云端部署

仓库已包含 `render.yaml`，可在 Render 上通过 **New → Blueprint → 选择仓库** 一键部署。

### 步骤

1. **先创建数据库与 Redis**（Blueprint 会自动创建 PostgreSQL；Redis 需在 Render 控制台创建托管 Redis，或将 `REDIS_URL` 指向外部 Redis 如 Upstash）。
2. **部署 Web Service**，配置环境变量：
   - `GATEWAY_MASTER_KEY`、`ENCRYPTION_KEY`（强随机）
   - `DATABASE_URL`（指向 Render 数据库）
   - `REDIS_URL`（指向 Render/外部 Redis）
   - Provider keys（`DEEPSEEK_API_KEY` 等）
3. 首次部署时 `preDeployCommand`（`npx drizzle-kit push`）自动建表。
4. 访问 `https://<service>.onrender.com/health` 确认 `status: ok`。

### 注意

- **免费层会休眠**：15 分钟无流量进入休眠，下次请求有冷启动延迟；长期使用建议 `starter` 档。
- 健康检查 `/health` 在 DB/Redis 未就绪时返回 503，请确保数据库与 Redis 先创建完成。
- Dashboard（Next.js）可单独部署（Vercel / Render Static），指向网关地址；仅调用 API 时无需部署。

## Docker

根目录 `docker-compose.yml` 提供 Postgres + Redis；网关本体以 Node 进程运行（未打包镜像，保持轻量）。
