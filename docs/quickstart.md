# 快速开始

> 5 分钟让 AI 应用通过 Nexus Gateway 统一访问多个 LLM Provider。

## 前提条件

- Node.js >= 20
- Docker（用于 Postgres + Redis）
- 至少一个 LLM Provider 的 API Key

## 1. 克隆项目

```bash
git clone <your-repo-url>
cd nexus-llm-gateway
```

## 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少填入以下内容：

```bash
# 网关管理员密钥（管理看板登录用）
GATEWAY_MASTER_KEY=sk-nexus-master-your-secret-key

# 至少配置一个 Provider 的 API Key
DEEPSEEK_API_KEY=sk-your-deepseek-key    # DeepSeek
# 或
GEMINI_API_KEY=your-gemini-key           # Google Gemini
```

## 3. 安装依赖

```bash
npm install
cd dashboard && npm install && cd ..
```

## 4. 启动基础设施

```bash
docker-compose up -d postgres redis
```

## 5. 初始化数据库

```bash
# 创建表结构
npx drizzle-kit push --force

# 创建种子数据（生成默认租户和 API Key）
npx tsx --env-file=.env src/server/db/seed.ts
```

## 6. 启动服务

```bash
# 终端 1：启动网关
npm run dev

# 终端 2：启动管理看板（可选）
cd dashboard && npm run dev
```

## 7. 验证

```bash
# 健康检查
curl http://localhost:8787/health
# → {"status":"ok","db":true,"redis":true}

# 查看可用模型
curl http://localhost:8787/v1/models \
  -H "Authorization: Bearer sk-nexus-master-your-secret-key"

# 发送对话请求
curl http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer sk-nexus-master-your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"你好"}]}'
```

## 8. 接入应用

只需把 AI 应用的 `baseURL` 改为 `http://localhost:8787/v1`：

```python
# Python (OpenAI SDK)
from openai import OpenAI
client = OpenAI(
    base_url="http://localhost:8787/v1",
    api_key="your-api-key"
)
```

```javascript
// JavaScript
import OpenAI from "openai";
const client = new OpenAI({
    baseURL: "http://localhost:8787/v1",
    apiKey: "your-api-key"
});
```

## 9. 管理看板

打开 http://localhost:3000 ，使用 `GATEWAY_MASTER_KEY` 登录管理端，可查看：

- 用量趋势与费用统计
- 缓存命中率
- 创建/管理 API Key
- Provider 测速
- 模型路由配置

## 下一步

- [Provider 配置详解](./providers.md) — 配置更多 Provider
- [代理配置](./proxy.md) — 国内访问海外 API
- [架构设计](./architecture.md) — 理解系统架构
