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

### v2.0 — Project Refactor（⬜ 执行中，见下方分阶段计划）

**目标**：轻量化，完成 BYOK 产品定位改造 —— 四层架构落地、拓展区（暂缓模块）物理隔离、移除企业向残留、Dashboard 首屏改为优化可视化。

**执行方式**：本计划由远程执行者逐步执行。**每完成一步**：运行该步验证命令 → 全部通过 → 单独提交（`refactor:` 前缀）→ 更新下方状态为 ✅。**全量基准**：`npx tsc --noEmit` 0 错误 + `npm test` 334/334 通过（44 文件）。

#### 目标目录结构（重构终点）

```
src/
├── shared/                 # 共享层：config / logger / types / utils（不动）
├── providers/              # Provider Layer：registry / base / deepseek / ollama / openai / mock
├── optimizer/              # 核心 Optimization Pipeline（唯一主方向）
│   ├── prompt/             # compression / conversation-compressor / adaptive-context / router
│   │                       # intent-learning / multi-dim-router / gateway-memory
│   ├── cache/              # semantic-cache / cache-gate / cache-confidence / cache-auto-refresh
│   ├── routing/            # smart-routing
│   ├── cost/               # cost-controller
│   └── judge/              # request-judge / judge
├── analytics/              # analytics / daily-stats / trend-analyzer
├── server/                 # API Gateway 层（保留现状，只留网关职责）
│   ├── routes/             # chat / models / embeddings / health / admin / user / batch
│   ├── middleware/         # auth / logging / metrics / pipeline / circuit-breaker / retry / types
│   ├── db/  ├── quota/  ├── billing/  └── config/   # + index.ts
└── extensions/             # 🔌 拓展区（暂缓，物理隔离）
    ├── dsl/  workflow/  agent/  scheduler/  event/  plugins/  compiler/
    ├── middleware/         # bulkhead / hedged-request / memory-pool / streaming-buffer
    │                       # adaptive-retry / weighted-router / compression / health-probe
    ├── prompt/             # adaptive-ttl / chunk-cache / cost-optimizer / guard / quality-score / rewrite
    ├── judge/              # quality-evaluator / semantic-judge
    ├── routing/            # parallel-generator
    └── cost/               # cost-report
```

> tsconfig（`include: ["src/**/*.ts"]`）与 vitest（`include: ["src/**/*.test.ts"]`）均为 `src/` 通配，**移动文件无需改任何构建配置**；测试文件跟随源码移动。

#### Phase 1 — 清理企业向残留（低风险）

| 状态 | 任务 | 说明 | 验证 |
|------|------|------|------|
| ⬜ TODO | 移除 Premium Cache 审批端点 | `src/server/routes/admin.ts` 删除 `PATCH /tenants/:id/request-premium` 与 `PATCH /tenants/:id/approve-premium`（约 60-100 行，含「Agent 自动审批」逻辑）；`tenants.cachePlan` 字段保留（不动 schema，避免 DB 迁移） | `npx tsc --noEmit` + `npm test` |
| ⬜ TODO | 排查企业向残留文案 | 全局检索 `RBAC / LDAP / Organization / Billing / 审批`，清理 `fit/improve.md`、`README.md`、代码注释中的过时表述 | `grep` 确认无残留 |

#### Phase 2 — 拓展区迁移到 `src/extensions/`（机械移动，风险集中）

> 这些文件当前 **0 个核心文件引用**（只被自身测试引用），移动只需修正文件自身及其测试的 import 路径。**建议每移一个子目录跑一次 `npx tsc --noEmit` 快速定位遗漏**。

| 状态 | 任务 | 源 → 目标 | 文件 |
|------|------|-----------|------|
| ⬜ TODO | 迁移框架类 | `server/{dsl,workflow,agent,scheduler,event,plugins,compiler}/` → `extensions/` 同名 | router-dsl、policy-engine、workflow-engine、agent-runtime、scheduler、event-bus、plugin-system、prompt-compiler（各含 .test.ts） |
| ⬜ TODO | 迁移暂缓中间件 | `server/middleware/` → `extensions/middleware/` | bulkhead、hedged-request、memory-pool、streaming-buffer、adaptive-retry、weighted-router、compression、health-probe（各含 .test.ts） |
| ⬜ TODO | 迁移暂缓优化模块 | `server/prompt/`、`server/judge/`、`server/routing/`、`server/cost/` → `extensions/` 同名 | prompt：adaptive-ttl、chunk-cache、cost-optimizer、guard、quality-score、rewrite；judge：quality-evaluator、semantic-judge；routing：parallel-generator；cost：cost-report |
| ⬜ TODO | 修正跨目录 import | 上述文件对 `shared/` 及彼此的相对路径 | 允许 **extensions → 核心**（如 `parallel-generator → judge/judge`），禁止 **核心 → extensions** |

**验收**：`npx tsc --noEmit` 0 错误 + `npm test` 334/334（测试跟随移动，数量不变）+ 无核心文件 import extensions。

#### Phase 3 — 核心模块目录重构（providers / optimizer / analytics）

| 状态 | 任务 | 源 → 目标 | 文件 |
|------|------|-----------|------|
| ⬜ TODO | 迁移 Provider 层 | `server/providers/` → `src/providers/` | registry、base、deepseek、ollama、openai、mock-provider |
| ⬜ TODO | 迁移 Optimizer 核心 | → `src/optimizer/{prompt,cache,routing,cost,judge}/` | prompt：compression、conversation-compressor、adaptive-context、router、intent-learning、multi-dim-router、gateway-memory；cache：semantic-cache、cache-gate、cache-confidence、cache-auto-refresh；routing：smart-routing；cost：cost-controller；judge：request-judge、judge |
| ⬜ TODO | 迁移 Analytics | `server/analytics/` → `src/analytics/` | analytics、daily-stats、trend-analyzer |
| ⬜ TODO | 修正全部引用方 import | `server/routes/{chat,admin,user}.ts`、`server/middleware/pipeline.ts` 等所有引用被移模块的文件 | 逐一更新相对路径 |

**验收**：`npx tsc --noEmit` 0 错误 + `npm test` 334/334 + `npm run dev` 启动冒烟（`curl /health` 200）。

#### Phase 4 — Provider 解耦验证

| 状态 | 任务 | 说明 | 验证 |
|------|------|------|------|
| ⬜ TODO | 验证 Provider 层纯净 | `providers/` 不得 import `cache/`、`router/`、`cost/`（现状已满足，移动后复检确认） | `grep` 确认 |

#### Phase 5 — Dashboard 首屏重构（优化可视化）

| 状态 | 任务 | 说明 | 验证 |
|------|------|------|------|
| ⬜ TODO | 首屏 5 张指标卡 | Saved% / Saved￥ / Latency / Cache Hit / Current Model，数据源 `GET /admin/optimization/stats`（已实现） | `dashboard` 构建 + 本地联调 |
| ⬜ TODO | 优化图表（可选） | 缓存置信度 `GET /admin/cache/confidence`、成本报告 `GET /admin/cost/report` | 同上 |
| ⬜ TODO | 企业向 UI 降级 | 现有 ManagerDashboard（多租户/审批/速度测试）收进「管理」子页，登录后默认进优化首屏 | 同上 |

#### Phase 6 — 收尾

| 状态 | 任务 | 说明 | 验证 |
|------|------|------|------|
| ⬜ TODO | README 项目结构更新 | 顶部定位 + 目录树改为上表 | 文档 |
| ⬜ TODO | 更新本表状态 | v2.0 全部 ✅，`fit/improve.md`「当前代码基础」状态同步 | 文档 |
| ⬜ TODO | 全量验证 + 推送 | `tsc` + `test` + `dashboard build` + CI 绿 | CI |

#### 风险与约束

1. **import 路径是最大风险**：移动后所有相对路径失效。策略 = 每移一个子目录立即跑 `tsc --noEmit`，按报错逐个修，避免一次性大爆炸。
2. **依赖方向**：核心 → extensions 为禁止项（重构完成后的 CI 检查项）；extensions → 核心、shared 允许。
3. **构建配置零改动**：tsconfig / vitest 均为 `src/**` 通配，只移动文件不改配置。
4. **每步一个提交**：`refactor: move X to src/extensions/` 粒度，便于回滚与 review。
5. **不引入新功能**：本计划纯结构重构，行为零变化（334/334 是行为不变的硬证据）。

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

> 以下已实现模块是 v2.x 的构建基础。**状态区分主方向与拓展区**：`✅ 已接入核心路径` 表示该模块已被 Optimization Pipeline（`chat.ts` 全链路 / `admin.ts` 监控）实际引用；`⏸ 暂缓（拓展区）` 表示当前 0 个核心文件引用，归入「拓展区（暂缓开发）」章节，主方向完善后再按需重新开发。

| 模块 | 源码 | 状态 |
|------|------|------|
| Prompt Compression | `src/server/prompt/compression.ts` | ✅ 已接入核心路径（chat.ts） |
| Conversation Compression | `src/server/prompt/conversation-compressor.ts` | ✅ 已接入核心路径（chat.ts） |
| Adaptive Context | `src/server/prompt/adaptive-context.ts` | ✅ 已接入核心路径（chat.ts） |
| Chunk Cache | `src/server/prompt/chunk-cache.ts` | ⏸ 暂缓（拓展区） |
| Cache Confidence | `src/server/cache/cache-confidence.ts` | ✅ 已接入核心路径（cache-gate） |
| Cache Gate | `src/server/cache/cache-gate.ts` | ✅ 已接入核心路径（chat.ts） |
| Cache Auto Refresh | `src/server/cache/cache-auto-refresh.ts` | ✅ 已接入核心路径（chat.ts / admin） |
| Smart Routing | `src/server/routing/smart-routing.ts` | ✅ 已接入核心路径（chat.ts） |
| Multi-Dim Router | `src/server/prompt/multi-dim-router.ts` | ✅ 已接入核心路径（经 smart-routing） |
| Cost Controller | `src/server/cost/cost-controller.ts` | ✅ 已接入核心路径（chat.ts） |
| Cost Report | `src/server/cost/cost-report.ts` | ⏸ 暂缓（拓展区） |
| Quality Evaluator | `src/server/judge/quality-evaluator.ts` | ⏸ 暂缓（拓展区） |
| Request Judge | `src/server/judge/request-judge.ts` | ✅ 已接入核心路径（chat.ts / admin） |
| Semantic Judge | `src/server/judge/semantic-judge.ts` | ⏸ 暂缓（拓展区） |
| Intent Learning | `src/server/prompt/intent-learning.ts` | ✅ 已接入核心路径（经 smart-routing） |
| Trend Analyzer | `src/server/analytics/trend-analyzer.ts` | ✅ 已接入核心路径（admin） |
| Policy Engine | `src/server/dsl/policy-engine.ts` | ⏸ 暂缓（拓展区） |
| Router DSL | `src/server/dsl/router-dsl.ts` | ⏸ 暂缓（拓展区） |
| Workflow Engine | `src/server/workflow/workflow-engine.ts` | ⏸ 暂缓（拓展区） |
| Agent Runtime | `src/server/agent/agent-runtime.ts` | ⏸ 暂缓（拓展区） |
| Event Bus | `src/server/event/event-bus.ts` | ⏸ 暂缓（拓展区） |
| Scheduler | `src/server/scheduler/scheduler.ts` | ⏸ 暂缓（拓展区） |
| Prompt Compiler | `src/server/compiler/prompt-compiler.ts` | ⏸ 暂缓（拓展区） |
| Batch API | `src/server/routes/batch.ts` | ✅ 已接入（路由 /v1/batch） |
| CLI | `cli/nexus-cli.mjs` | ✅ 周边工具 |
| SDK | `sdk/typescript/` + `sdk/python/` | ✅ 周边工具 |
| Auto Benchmark | `benchmark/auto-benchmark.mjs` | ✅ 周边工具 |

---

## 🔌 拓展区（暂缓开发）

> 原则：以下模块**不进入主开发方向**。它们是旧企业向 / 通用网关方向的产物，或未经验证的实验特性，当前 **0 个核心文件引用**（只被自身测试引用），个人开发者（BYOK）场景用不上。主方向（Optimization Pipeline，TRR/CSR/QPS）完善后再按需重新开发；届时逐模块评估价值，不承诺全部保留。
>
> 逻辑分区为 `src/extensions/`：当前暂缓模块**保留原位、不移动文件**，待 v2.0 目录重构时统一归入该目录；在此之前，文档层面即视为隔离。

| 类别 | 模块（源码） | 状态 |
|------|-------------|------|
| 策略 / 工作流框架（企业向） | `dsl/router-dsl`、`dsl/policy-engine`、`workflow/workflow-engine`、`agent/agent-runtime`、`scheduler/scheduler`、`event/event-bus`、`plugins/plugin-system`、`compiler/prompt-compiler` | ⏸ 暂缓 |
| 高负载 / 多租户中间件 | `middleware/bulkhead`、`hedged-request`、`memory-pool`、`streaming-buffer`、`adaptive-retry`、`weighted-router`、`compression`、`health-probe` | ⏸ 暂缓 |
| 未接线优化实验 | `prompt/adaptive-ttl`、`prompt/chunk-cache`、`prompt/cost-optimizer`、`prompt/guard`、`prompt/quality-score`、`prompt/rewrite`、`judge/quality-evaluator`、`judge/semantic-judge`、`routing/parallel-generator`、`cost/cost-report` | ⏸ 暂缓 |

**隔离约定**（防回归，可执行）：
1. 暂缓模块不得被核心路径（`src/server/routes/*`、`src/server/middleware/pipeline.ts`）新增 import。
2. 暂缓模块的测试保留（锁定其行为、防止后续回归），但不为暂缓模块新增功能。
3. 重新激活流程：评估 TRR/CSR/QPS 收益 → 接入 Optimization Pipeline → 更新本表状态为 ✅。
4. 新开发只围绕主方向：Compression → Cache → Router → Cost → Quality 一条链。

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