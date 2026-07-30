# Nexus LLM Gateway

> 生产级 AI 统一网关 —— OpenAI 兼容协议，多 Provider 适配，语义缓存、限流配额、故障转移、用量计费。

让任何 AI 应用只需改一个 `baseURL`，就能获得**成本治理 + 高可用 + 可观测性**。

## ✨ 核心能力

| 能力 | 说明 |
|---|---|
| OpenAI 兼容协议 | 任何 OpenAI SDK 改 `baseURL` 即可接入 |
| 多 Provider 适配 | DeepSeek、Ollama（本地）、OpenAI，统一屏蔽差异 |
| 模型路由 | 按模型别名路由到对应 Provider |
| 故障转移 | 主模型失败自动切备用，流式/非流式均支持 |
| 语义缓存 | 相似请求命中缓存（pgvector），省 token 省时 |
| 限流配额 | Redis 令牌桶 RPM/TPM + 月度 Token 配额 |
| 用量计费 | token 计数、按模型计价、成本核算 |
| 多租户 | API Key 隔离、独立配额与计费 |
| 可观测性 | 全链路追踪 ID、结构化日志、用量看板 |
| Prompt 管理 | 模板 CRUD、版本化、变量插值 |

## 🛠 技术栈

- **运行时**: Node.js 20+ / TypeScript
- **Web 框架**: Hono
- **数据库**: PostgreSQL + pgvector（Drizzle ORM）
- **缓存/限流**: Redis
- **看板**: Next.js + Tailwind + shadcn/ui（Week 3）
- **部署**: Docker Compose

## 🚀 快速开始

### 1. 环境准备

```bash
# 复制环境变量
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY 等
```

### 2. 启动依赖（Postgres + Redis）

```bash
docker compose up -d
```

### 3. 安装依赖

```bash
npm install
```

### 4. 数据库迁移

```bash
npm run db:push    # 开发用 push，直接同步 schema
# 或 npm run db:generate && npm run db:migrate
```

### 5. 初始化种子数据

```bash
npm run seed
# 会输出一个 dev API Key，保存它
```

### 6. 启动网关

```bash
npm run dev
```

### 7. 验证

```bash
# 列出模型
curl http://localhost:8787/v1/models \
  -H "Authorization: Bearer <你的-master-key-或-dev-key>"

# 非流式对话
curl http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role":"user","content":"你好"}]
  }'

# 流式对话
curl http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "stream": true,
    "messages": [{"role":"user","content":"讲个笑话"}]
  }'
```

## 📡 使用 OpenAI SDK 接入

```python
from openai import OpenAI
client = OpenAI(
    base_url="http://localhost:8787/v1",
    api_key="<你的-key>"
)
resp = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role":"user","content":"你好"}]
)
print(resp.choices[0].message.content)
```

```javascript
import OpenAI from "openai";
const client = new OpenAI({
  baseURL: "http://localhost:8787/v1",
  apiKey: "<你的-key>",
});
const resp = await client.chat.completions.create({
  model: "ollama-llama3",
  messages: [{ role: "user", content: "你好" }],
});
```

## 📁 项目结构

```
src/
├── shared/          # 共享类型、配置、日志、工具
├── server/
│   ├── db/          # Drizzle schema、client、redis、seed
│   ├── providers/   # Provider 适配器（DeepSeek/Ollama/OpenAI）+ 注册中心
│   ├── middleware/  # 认证、日志
│   ├── routes/      # chat / embeddings / models / admin / health
│   ├── billing/     # 用量记录与计费
│   └── index.ts     # 入口
└── dashboard/       # Next.js 看板（Week 3）
```

## 🗓 开发路线

- [x] **Week 1**: 核心网关 MVP（Provider 适配、OpenAI 兼容路由、认证、用量记录）
- [x] **Week 2**: 语义缓存、限流配额、故障转移、全链路日志
- [ ] **Week 3**: Next.js 看板、Prompt 模板管理、Docker 化、文档

## � 语义缓存原理（核心差异化能力）

这是 LLM Gateway 区别于普通"中转站"的关键能力：

```
请求进来 → 提取 prompt → Embedding 向量化 → pgvector 近邻检索
                                              ↓
                                    相似度 > 阈值(0.95)?
                                     ↓ 是        ↓ 否
                              直接返回缓存结果    调用 LLM
                              (不花 token!)      ↓
                                              结果 + Embedding 写入缓存
```

**效果**：相似问题（如"今天天气怎么样"和"今天天气如何"）命中同一缓存，**零 token 消耗、毫秒级响应**。

查看缓存统计：
```bash
curl http://localhost:8787/admin/cache/stats -H "Authorization: Bearer <master-key>"
```

## 🛡 限流与配额

- **RPM 限流**：Redis 令牌桶，按 API Key 限制每分钟请求数（默认 60），超限返回 `429`
- **月度配额**：按租户限制当月 Token 总量，超限返回 `429`
- 响应头 `X-RateLimit-Remaining` 返回当前窗口剩余请求数

## 🚢 部署指南

### 一键部署（Docker Compose）

```bash
# 1. 准备生产配置
cp .env.production.example .env.production
# 编辑 .env.production，填入真实密钥和 API Key

# 2. 一键部署
chmod +x deploy.sh
./deploy.sh
```

### 手动部署

```bash
# 构建镜像
docker compose -f docker-compose.prod.yml build

# 启动所有服务
docker compose -f docker-compose.prod.yml up -d

# 初始化数据库
docker exec nexus-postgres psql -U nexus -d nexus -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 推送 schema
docker compose -f docker-compose.prod.yml exec gateway npx drizzle-kit push

# 创建初始 API Key
docker compose -f docker-compose.prod.yml exec gateway node dist/server/db/seed.js
```

### Nginx 反向代理 + SSL

```bash
# 安装 Nginx
sudo apt install nginx

# 申请 SSL 证书
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d gateway.yourdomain.com

# 复制 Nginx 配置
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/nexus-gateway
sudo ln -s /etc/nginx/sites-available/nexus-gateway /etc/nginx/sites-enabled/
# 编辑配置，替换 yourdomain.com 为你的域名
sudo nginx -t && sudo systemctl reload nginx
```

## ☁️ 服务器推荐方案

### 方案 A：轻量级（个人/小团队，月费 ~$5-10）

| 服务商 | 配置 | 价格 | 说明 |
|---|---|---|---|
| **阿里云轻量** | 2C 2G 60GB SSD | ~¥34/月 | 国内访问快，自带公网 IP |
| **腾讯云轻量** | 2C 2G 60GB SSD | ~¥30/月 | 同价位，可选香港节点 |
| **Hetzner CX22** | 2C 4G 40GB NVMe | ~€4.5/月 | 欧洲性价比之王 |
| **Oracle Cloud** | 4C 24G (Always Free) | 免费 | 注册需信用卡，ARM 实例性能强 |

**适合**：个人项目、小团队内部使用、日均请求 < 10K

### 方案 B：标准级（团队/创业公司，月费 ~$20-40）

| 服务商 | 配置 | 价格 | 说明 |
|---|---|---|---|
| **阿里云 ECS** | 2C 4G 80GB SSD | ~¥100/月 | 国内稳定，可选高可用 |
| **腾讯云 CVM** | 2C 4G 80GB SSD | ~¥90/月 | 同级别，CDN 配套好 |
| **DigitalOcean** | 2C 4G 80GB NVMe | $24/月 | 文档好，部署简单 |
| **Hetzner CX32** | 4C 8G 80GB NVMe | ~€8.9/月 | 性价比极高 |

**适合**：创业公司、对外提供服务、日均请求 10K-100K

### 方案 C：生产级（企业/高可用，月费 ~$50-200+）

| 服务商 | 配置 | 价格 | 说明 |
|---|---|---|---|
| **阿里云 ECS** | 4C 8G 200GB SSD | ~¥300/月 | 可搭配 SLB + RDS |
| **AWS EC2** | t3.medium (2C 4G) | ~$30/月 | 全球节点，配套完善 |
| **腾讯云 CVM** | 4C 8G 200GB SSD | ~¥280/月 | 可搭配 CLB + CDB |
| **自建 K8s** | 3 节点 4C 8G | ~¥600/月 | 高可用，弹性伸缩 |

**适合**：企业生产环境、高并发、需要 SLA 保障

### 推荐架构（生产环境）

```
用户 → CDN(Cloudflare/阿里CDN) → Nginx(SSL) → Nexus Gateway → DeepSeek/Ollama
                                                    ↓
                                            Postgres + Redis
```

### 最低配置要求

| 组件 | 最低 | 推荐 |
|---|---|---|
| CPU | 1 核 | 2 核+ |
| 内存 | 1GB | 4GB+ |
| 磁盘 | 20GB | 40GB+ SSD |
| 带宽 | 1Mbps | 5Mbps+ |
| Docker | 24+ | 24+ |

## 📄 License

MIT
