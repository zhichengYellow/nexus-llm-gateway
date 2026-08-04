# Nexus

### AI Gateway for Individual Developers

> **Save 30~80% LLM Cost with Zero Configuration.**

一个专门为个人开发者打造的 AI Gateway。

* 🚀 OpenAI Compatible
* 🧠 Smart Auto Routing
* 💰 Token Optimization
* ⚡ Semantic Cache
* 📉 Context Compression
* 🔄 Multi Provider Failover

**Bring Your Own API Key.**
**We optimize your cost, not manage your account.**

---

## 核心指标（North Star Metric）

> 整个 Nexus 不再围绕"支持多少模型"宣传，而是围绕三个数字：

| 指标 | 全称 | 含义 | 目标 |
|------|------|------|------|
| TRR | Token Reduction Rate | Token 降低率 | **50%+** |
| CSR | Cost Saving Rate | 成本节省率 | **60%+** |
| QPS | Quality Preservation Score | 质量保持率（优化前后对比） | **95%+** |

**每一个新功能上线，都必须回答**：
- 能减少多少 Token？
- 能节省多少钱？
- 回答质量下降了多少？

如果不能提升这三个指标之一，就不进入 Core。

---

## 产品原则（Product Philosophy）

### 第一原则：用户拥有自己的 API
不是"你注册 → 我发 Key"，而是"用户填自己的 OpenAI/Gemini/DeepSeek → Gateway 自动优化"。**你不是 API 平台。**

### 第二原则：Gateway 不替用户花钱
Gateway 只负责**省钱**。

### 第三原则：零配置优先
任何功能如果需要十几个配置项就失败。应该是 `Auto`。

### 第四原则：个人优先
不要 RBAC、审批、LDAP、Billing、Organization。Enterprise 单独做。

### 第五原则：默认就是最佳实践
第一次启动用户什么都不用调。Cache → Compression → Retry → Router → Summary 全部自动开启。

### 第六原则：所有优化都必须可视化
每次请求 Dashboard 显示：
```
原始: 1234 Token
压缩: 910 Token
Cache: 命中
最终: 410 Token
节省: 67%
```

---

## 系统架构（四层）

```
               Nexus
                  │
      ┌───────────┴────────────┐
    Client                 Dashboard
                  │
              API Gateway
                  │
         Optimization Pipeline
                  │
 ┌────────┬────────┬────────┬────────┐
 Prompt   Context   Cache   Router
 Optimizer Optimizer Engine Decision
                  │
            Provider Manager
                  │
 OpenAI DeepSeek Gemini Ollama ...
```

### 第一层：Provider（Provider Layer）
职责只有一个：**调用 API**。不要任何缓存、任何 Router。

### 第二层：Optimizer（核心，整个项目最大特色）
所有创新都放这里：
```
optimizer/
├── prompt/
├── context/
├── cache/
├── router/
├── retry/
├── compression/
├── summary/
├── cost/
└── quality/
```

流水线：
```
Prompt → Prompt Optimizer → Context Optimizer → Semantic Cache → Router → Provider → Quality Judge → Store Cache
```

### 第三层：Analytics（分析）
Dashboard 只是显示，Analytics 负责计算：
```
analytics/
├── token
├── latency
├── cache
├── provider
├── routing
├── savings
└── quality
```

### 第四层：UI
Dashboard 尽量简单。第一页就是：
```
Today
Saved 48%
Saved ￥18.3
Latency
Cache Hit
Current Model
```

---

## Feature Roadmap

### v2.0 — Project Refactor（⬜ 全部 TODO）

**目标**：轻量化，完成产品定位改造。

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | 目录重构 | 按四层架构重构：`src/providers/` → `src/optimizer/` → `src/analytics/` → dashboard |
| ⬜ TODO | 移除 Enterprise | 移除 RBAC/审批/LDAP/Billing/Organization 相关规划与代码 |
| ⬜ TODO | Analytics 重构 | `analytics/token/latency/cache/provider/routing/savings/quality` |
| ⬜ TODO | Dashboard 重构 | 第一屏：Saved % / Saved ￥ / Latency / Cache Hit / Current Model |
| ⬜ TODO | Provider 解耦 | Provider 只负责调用 API，剥离缓存/Router |
| ⬜ TODO | Optimization Pipeline | 独立核心流水线：Prompt→Context→Cache→Router→Provider→Judge |
| ⬜ TODO | BYOK 首次启动 | Welcome 向导：选择 Provider + 输入 API Key → 自动生成配置文件 |
| ⬜ TODO | README 重构 | 第一屏改为本文件顶部定位 |

### v2.1 — Prompt Optimization Engine

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Prompt Compression | 礼貌语删除、System Prompt 压缩（已实现 `compression.ts`，需接入） |
| ⬜ TODO | Prompt Rewrite | Prompt 改写优化（已有 baseline，需完善） |
| ⬜ TODO | Prompt Deduplicate | Prompt 去重 |

### v2.2 — Conversation Optimization

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Auto Summary | 对话自动摘要（已实现 `conversation-compressor.ts`，需接入） |
| ⬜ TODO | Adaptive Context | 动态上下文（已实现 `adaptive-context.ts`，需接入） |
| ⬜ TODO | History Compression | 历史压缩（已实现 `pruneByImportance`，需接入） |

### v2.3 — Semantic Cache 2.0

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Cache Confidence | 缓存置信度（已实现 `cache-confidence.ts`，需接入 `cache-gate`） |
| ⬜ TODO | Adaptive TTL | 动态 TTL（已实现 `adaptive-ttl.ts` + `cache-auto-refresh.ts`） |
| ⬜ TODO | Chunk Cache | 分块缓存（已实现 `chunk-cache.ts`，需接入） |
| ⬜ TODO | Partial Cache | 部分缓存 |

### v2.4 — Smart Cost Engine

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Cost Predictor | 成本预测（已实现 `trend-analyzer.ts`） |
| ⬜ TODO | Provider Recommendation | Provider 推荐（已实现 `multi-dim-router.ts`） |
| ⬜ TODO | Auto Routing | 自动路由（已实现 `smart-routing.ts`） |
| ⬜ TODO | Cost Analytics | 成本分析（已实现 `cost-report.ts`） |

### v2.5 — Developer Experience

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | One Click Install | 一键安装 |
| ⬜ TODO | Config Wizard | 配置向导（BYOK 首次启动） |
| ⬜ TODO | API Key Wizard | API Key 向导 |
| ⬜ TODO | Docker Desktop | Docker Desktop 支持 |
| ⬜ TODO | VSCode Plugin | VSCode 插件 |

---

## 配置设计（BYOK 重点）

不要 `.env` 几十行。第一次启动：
```
Welcome to Nexus
请选择:
[✓] DeepSeek
[✓] Gemini
[ ] OpenAI
[✓] Ollama

DeepSeek API Key:
Gemini API Key:
```

自动生成：
```yaml
providers:
  deepseek:
    api_key: xxx
  gemini:
    api_key: xxx

optimizer:
  cache: auto
  compression: auto
  summary: auto

router:
  mode: auto
```

用户以后根本不用改。

---

## 当前代码基础（已有，需整合）

> 以下已实现模块是 v2.x 的构建基础，`⬜ 需接入` 表示已实现但未接入 Optimization Pipeline。

| 模块 | 源码 | 状态 |
|------|------|------|
| Prompt Compression | `src/server/prompt/compression.ts` | ✅ 已实现，⬜ 需接入 |
| Conversation Compression | `src/server/prompt/conversation-compressor.ts` | ✅ 已实现，⬜ 需接入 |
| Adaptive Context | `src/server/prompt/adaptive-context.ts` | ✅ 已实现，⬜ 需接入 |
| Chunk Cache | `src/server/prompt/chunk-cache.ts` | ✅ 已实现，⬜ 需接入 |
| Cache Confidence | `src/server/cache/cache-confidence.ts` | ✅ 已实现，⬜ 需接入 |
| Cache Gate | `src/server/cache/cache-gate.ts` | ✅ 已实现，⬜ 需接入 |
| Cache Auto Refresh | `src/server/cache/cache-auto-refresh.ts` | ✅ 已实现 |
| Smart Routing | `src/server/routing/smart-routing.ts` | ✅ 已实现，⬜ 需接入 |
| Multi-Dim Router | `src/server/prompt/multi-dim-router.ts` | ✅ 已实现 |
| Cost Controller | `src/server/cost/cost-controller.ts` | ✅ 已实现 |
| Cost Report | `src/server/cost/cost-report.ts` | ✅ 已实现 |
| Quality Evaluator | `src/server/judge/quality-evaluator.ts` | ✅ 已实现 |
| Request Judge | `src/server/judge/request-judge.ts` | ✅ 已实现 |
| Semantic Judge | `src/server/judge/semantic-judge.ts` | ✅ 已实现 |
| Intent Learning | `src/server/prompt/intent-learning.ts` | ✅ 已实现 |
| Trend Analyzer | `src/server/analytics/trend-analyzer.ts` | ✅ 已实现 |
| Policy Engine | `src/server/dsl/policy-engine.ts` | ✅ 已实现 |
| Router DSL | `src/server/dsl/router-dsl.ts` | ✅ 已实现 |
| Workflow Engine | `src/server/workflow/workflow-engine.ts` | ✅ 已实现 |
| Agent Runtime | `src/server/agent/agent-runtime.ts` | ✅ 已实现 |
| Event Bus | `src/server/event/event-bus.ts` | ✅ 已实现 |
| Scheduler | `src/server/scheduler/scheduler.ts` | ✅ 已实现 |
| Prompt Compiler | `src/server/compiler/prompt-compiler.ts` | ✅ 已实现 |
| Batch API | `src/server/routes/batch.ts` | ✅ 已实现 |
| CLI | `cli/nexus-cli.mjs` | ✅ 已实现 |
| SDK | `sdk/typescript/` + `sdk/python/` | ✅ 已实现 |
| Auto Benchmark | `benchmark/auto-benchmark.mjs` | ✅ 已实现 |

**测试**：334/334 通过（44 个测试文件），CI 全绿。

---

## 开发约定

### CI 测试要求（每个 Agent 完成功能后必须执行）

| 步骤 | 命令 | 说明 | 失败处理 |
|------|------|------|----------|
| 1. 安装依赖 | `npm ci` | 干净安装依赖，验证 lockfile 自洽 | 若报 EUSAGE，用 `npm install` 重建 lockfile |
| 2. 类型检查 | `npx tsc --noEmit` | TypeScript 类型检查 | 修复所有 TS 错误 |
| 3. 运行测试 | `npm test` | 运行全部 Vitest 测试 | 修复失败的测试 |

**提交前检查清单**：
- [ ] `npm ci` 成功
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm test` 全部通过（当前 334/334）
- [ ] `git push` 后 CI 变绿
- [ ] 更新 `fit/improve.md` 标记对应任务为 ✅ COMPLETED

### 代码规范
- 使用 TypeScript + Hono。
- 使用 Drizzle ORM + PostgreSQL + Redis。
- 使用 Vitest 进行测试。

### 提交规范
- `feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`

### 分支管理
- `main`：主分支，CI 全绿。
- `feature/*`：功能分支。
- `fix/*`：修复分支。

---

> 备注：项目已重新定位为 **AI Gateway for Individual Developers（BYOK）**。核心不再是 Gateway，而是 **Optimization Pipeline**。每个新功能以 TRR/CSR/QPS 衡量投入产出。