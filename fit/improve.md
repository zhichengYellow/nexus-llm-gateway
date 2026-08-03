# Nexus - AI Cost Optimization Platform

> **愿景**：用最少的钱，获得尽可能接近最好的效果。
> **定位**：一个以 Token 和成本优化为核心的 AI Gateway。
> **当前状态**：v2.0（12 Phase 中 10 个已完成），CI 全绿，266/266 测试通过。
> **核心指标**：每个新功能必须回答三个问题 —— 能减少多少 Token（TRR）？能节省多少成本（CSR）？对回答质量影响多大（QPS）？

---

## 核心指标定义

| 指标 | 全称 | 定义 | 目标 |
|------|------|------|------|
| TRR | Token Reduction Rate | Token 降低率 = 节省 Token / 原始 Token | ≥ 50% |
| CSR | Cost Saving Rate | 成本节省率 = 节省金额 / 原始金额 | ≥ 40% |
| QPS | Quality Preservation Score | 质量保持率 = 优化后质量 / 原始质量 | ≥ 95% |

**开发原则**：只有能提升 TRR/CSR/QPS 之一的功能才进入开发计划，否则放入长期待办。

---

## TODO 状态标识说明

> **其他 Agent 请按以下标识识别任务状态**：

| 标识 | 含义 | 说明 |
|------|------|------|
| `✅ COMPLETED` | 已完成 | 功能已实现，有对应源文件，测试通过 |
| `⬜ TODO` | 未开始 | 尚未开始开发 |
| `🚧 IN_PROGRESS` | 进行中 | 正在开发中 |
| `❌ BLOCKED` | 阻塞 | 有依赖项未完成，无法开始 |
| `⚠️ PARTIAL` | 部分完成 | 基础框架已搭建，但功能不完整 |

---

## 项目当前状态

- **版本**：v2.0（12 Phase 中 10 个已完成）
- **CI**：GitHub Actions 全绿，266/266 测试通过（30 个测试文件）
- **lockfile**：自洽（esbuild 0.28.1 / @emnapi 2.0.0-alpha.3 齐全）
- **时区**：pino-pretty 固定 Asia/Shanghai
- **代理**：git 走 clash 代理 (127.0.0.1:7897)

---

## 已完成功能清单

### 基础能力（v1.0~v1.1.2）— ✅ 全部完成

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | 工程级语义缓存 | `src/server/cache/semantic-cache.ts` | Canonical Key、SingleFlight、分类 TTL、防毒化 |
| ✅ COMPLETED | 容错三件套 | `src/server/middleware/circuit-breaker.ts` + `weighted-router.ts` + `retry.ts` | Circuit Breaker、Weighted Router、Retry |
| ✅ COMPLETED | Health Probe 四态 | `src/server/middleware/health-probe.ts` | UNKNOWN/HEALTHY/DEGRADED/UNREACHABLE |
| ✅ COMPLETED | Capability Discovery | `src/server/providers/registry.ts` | 无 key 自动禁用云 provider |
| ✅ COMPLETED | Prometheus /metrics | `src/server/middleware/metrics.ts` | /metrics 端点 |
| ✅ COMPLETED | Provider 级代理 | `src/server/providers/base.ts` | `<TYPE>_PROXY` 环境变量 |
| ✅ COMPLETED | 时区修复 | `src/shared/logger.ts` | pino-pretty timeZone: Asia/Shanghai |

### 基准测试与 CI（v1.1.3）

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | 离线基准测试 | `benchmark/offline-benchmark.mjs` | 离线性能测试 |
| ✅ COMPLETED | 缓存基准测试 | `benchmark/cache-benchmark.mjs` | 缓存性能测试 |
| ✅ COMPLETED | 性能压测 | `benchmark/load-test.mjs` | 负载压测 |
| ✅ COMPLETED | CI 每日基准工作流 | `.github/workflows/benchmark.yml` | 每日自动 benchmark |
| ✅ COMPLETED | CLI 工具 | `cli/nexus-cli.mjs` | `nexus doctor / health / cache clear` 已实现 |

### v1.2 AI Native Gateway — ✅ 全部完成

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | Intent Router | `src/server/prompt/router.ts` | Prompt → Intent Classifier → Best Provider，支持 `model=auto` |
| ✅ COMPLETED | Cost Optimizer | `src/server/prompt/cost-optimizer.ts` | 估算 token/预算/历史成功率/价格，自动选最便宜 provider |
| ✅ COMPLETED | Quality Score Router | `src/server/prompt/quality-score.ts` | Score = 0.5×Quality + 0.3×Latency + 0.2×Cost |
| ✅ COMPLETED | Adaptive TTL | `src/server/prompt/adaptive-ttl.ts` | 按问题类型自动判断 TTL（天气 5min / 知识 30天） |

### 架构 — ✅ 全部完成

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | Middleware Pipeline | `src/server/middleware/pipeline.ts` | Auth → RateLimit → Cache → Router → Retry → Provider → Metrics → Logger |
| ✅ COMPLETED | Plugin System | `src/server/plugins/plugin-system.ts` | Provider/Router/Cache/Auth/Metrics 插件化 |
| ✅ COMPLETED | Config Hot Reload | `src/server/config/hot-reload.ts` | Dashboard 修改权重/路由，无需重启 |

### 可靠性 — ✅ 全部完成

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | Bulkhead | `src/server/middleware/bulkhead.ts` | Provider 连接池隔离 |
| ✅ COMPLETED | Hedged Request | `src/server/middleware/hedged-request.ts` | 超时同时发备用 provider |
| ✅ COMPLETED | Adaptive Retry | `src/server/middleware/adaptive-retry.ts` | 429/500/503 不同退避策略 |

### AI Native — ✅ 全部完成

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | Prompt Guard | `src/server/prompt/guard.ts` | PII 自动 Mask |
| ✅ COMPLETED | Prompt Rewrite | `src/server/prompt/rewrite.ts` | System + Tenant + User Prompt 统一 |

### 性能 — ✅ 全部完成

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | Streaming Buffer | `src/server/middleware/streaming-buffer.ts` | SSE 缓冲 32ms 后 flush |
| ✅ COMPLETED | Memory Pool | `src/server/middleware/memory-pool.ts` | 减少 JSON Parse / 对象创建 |
| ✅ COMPLETED | Compression | `src/server/middleware/compression.ts` | SSE Gzip |

### v1.3 Observability + Analytics — ✅ 全部完成

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | LLM Observability | `src/server/middleware/observability.ts` | 全链路 Trace + Waterfall + Span |
| ✅ COMPLETED | LLM Analytics | `src/server/analytics/analytics.ts` | Top10 / 趋势 / 分布统计 |
| ✅ COMPLETED | Gateway Memory | `src/server/prompt/gateway-memory.ts` | 租户历史/偏好学习/衰减优化 |
| ✅ COMPLETED | CI 修复 | `.github/workflows/benchmark.yml` + `ci.yml` | Daily Benchmark sed 修复 + Node 20 警告修复 |

### 测试 — ✅ 全部完成

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | Provider Mock | `src/server/providers/mock-provider.ts` | 单元测试不依赖真实 API |
| ✅ COMPLETED | Utils 测试 | `src/shared/utils.test.ts` | 工具函数测试 |
| ✅ COMPLETED | Registry 测试 | `src/server/providers/registry.test.ts` | Provider 注册测试 |

### 12 Phase 核心模块 — ✅ 10/12 完成

| 状态 | Phase | 源文件 | 说明 |
|------|-------|--------|------|
| ✅ COMPLETED | Phase 2 Router DSL | `src/server/dsl/router-dsl.ts` | YAML DSL + Parser + Compiler + Runtime |
| ✅ COMPLETED | Phase 3 Workflow | `src/server/workflow/workflow-engine.ts` | Node/Edge/DAG + 条件分支 + 循环 |
| ✅ COMPLETED | Phase 4 Prompt Compiler | `src/server/compiler/prompt-compiler.ts` | AST + 编译 Pass + Debug |
| ✅ COMPLETED | Phase 5 Policy Engine | `src/server/dsl/policy-engine.ts` | PII/Secret/Injection 检测 |
| ✅ COMPLETED | Phase 6 Agent Runtime | `src/server/agent/agent-runtime.ts` | Planner + Tool + Memory + Executor |
| ✅ COMPLETED | Phase 7 Event Bus | `src/server/event/event-bus.ts` | Pub/Sub + Event Store + Replay |
| ✅ COMPLETED | Phase 8 Scheduler | `src/server/scheduler/scheduler.ts` | Cron + 任务管理 + 失败重试 |
| ✅ COMPLETED | Phase 9 Auto Benchmark | `benchmark/auto-benchmark.mjs` | 自动化基准测试 + Judge 评分 |
| ✅ COMPLETED | Phase 10 Judge | `src/server/judge/judge.ts` | 相关性/准确性/流畅度/安全性/完整性 |
| ✅ COMPLETED | Phase 11 Batch | `src/server/routes/batch.ts` | `/v1/batch` 批量请求 |
| ⬜ TODO | Phase 1 分布式缓存 | - | Faiss/HNSW + 多节点 + Snapshot/WAL（Cache Confidence 已实现） |
| ⬜ TODO | Phase 12 内核重构 | - | kernel/runtime/pipeline/scheduler/plugin/dsl/compiler/executor/storage |

### 开源生态 — ✅ 全部完成

| 状态 | 功能 | 源文件 | 说明 |
|------|------|--------|------|
| ✅ COMPLETED | SDK | `sdk/typescript/` + `sdk/python/` | npm + pip |
| ✅ COMPLETED | CLI | `cli/nexus-cli.mjs` | health/models/provider/cache/benchmark/doctor |
| ✅ COMPLETED | Examples | `examples/` | spring-ai/langchain/openwebui/cline/continue/mcp |
| ✅ COMPLETED | Compatibility Matrix | `examples/compatibility-matrix.md` | 13 种客户端兼容性 |
| ✅ COMPLETED | 文档 | `docs/` + `docs/adr/` | 架构图 + 快速开始 + 6 个 ADR |
| ✅ COMPLETED | CONTRIBUTING.md | `CONTRIBUTING.md` | 贡献指南 |

---

## 新路线：AI Cost Optimization Platform

> **核心价值主张**：Nexus 是一个以 Token 和成本优化为核心的 AI Gateway。
> **每个功能必须回答**：TRR（Token 降低率）/ CSR（成本节省率）/ QPS（质量保持率）。

---

### Layer 0: 数据采集（Priority S）

**目标**：任何优化都必须建立在真实数据上。

#### 0.1 完整请求数据模型

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | S |
| TRR/CSR/QPS | 数据基础，所有优化依赖 |

**目标**：每一次请求记录完整数据：
```
Request
├── Prompt Length
├── Input Token
├── Output Token
├── Compression Ratio
├── Cache Hit
├── Cache Type
├── Provider
├── Model
├── Cost
├── TTFT
├── TPS
├── Latency
├── Retry Count
├── Router Reason
└── User Feedback
```

**实现步骤**：
1. ⬜ TODO — 扩展 `usageLogs` 表结构，增加 compressionRatio/cacheType/routerReason/userFeedback 字段。
2. ⬜ TODO — 在请求链路中采集所有字段。
3. ⬜ TODO — 提供数据导出 API（JSON/CSV）。

**验收标准**：
- 每次请求完整记录 15+ 字段。
- 数据可导出。

#### 0.2 Cost Analytics Dashboard

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | S |
| TRR/CSR/QPS | CSR 可视化 |

**目标**：Dashboard 展示：
```
今日
总 Token: 128万
节省 Token: 82万
节省比例: 64%
节省金额: ￥381
```

**实现步骤**：
1. ⬜ TODO — 聚合每日 Token/成本/节省数据。
2. ⬜ TODO — Dashboard 新增 Cost Analytics 面板。
3. ⬜ TODO — 展示节省来源（缓存/压缩/路由）。

**验收标准**：
- Dashboard 展示 TRR/CSR 实时数据。
- 节省来源可追溯。

#### 0.3 请求画像

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | S |
| TRR/CSR/QPS | 路由优化基础 |

**目标**：统计请求类型分布：
```
Code 31% / Chat 22% / Translation 8% / Math 17% / Search 9% / Vision 13%
```

**实现步骤**：
1. ⬜ TODO — 基于 Intent Router 统计请求画像。
2. ⬜ TODO — Dashboard 展示画像分布。
3. ⬜ TODO — 画像数据供 Router 学习。

**验收标准**：
- 画像分布准确。
- Router 可基于画像优化。

---

### Layer 1: Token Optimization（Priority SSS）

**目标**：这是核心卖点，最大化 TRR。

#### 1.1 Prompt Compression

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | SSS |
| TRR | 预计 10~20% |
| CSR | 预计 10~20% |
| QPS | ≥ 98% |

**目标**：删除礼貌语、压缩 System Prompt、保留语义。

**实现步骤**：
1. ⬜ TODO — 礼貌语检测与删除（"请帮我..."、"谢谢..."、"麻烦..."）。
2. ⬜ TODO — System Prompt 压缩（去冗余、合并重复指令）。
3. ⬜ TODO — 语义保持验证（Judge 评分对比）。

**验收标准**：
- TRR ≥ 10%。
- QPS ≥ 98%。

#### 1.2 Conversation Compression

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | SSS |
| TRR | 预计 70% |
| CSR | 预计 70% |
| QPS | ≥ 90% |

**目标**：20 轮历史 → 前 18 轮 Summary + 后 2 轮原文。

**实现步骤**：
1. ⬜ TODO — 对话摘要生成（LLM 或规则）。
2. ⬜ TODO — 摘要 + 最近 N 轮原文混合策略。
3. ⬜ TODO — 摘要质量评估。

**验收标准**：
- TRR ≥ 70%。
- QPS ≥ 90%。

#### 1.3 Adaptive Context

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | SSS |
| TRR | 预计 30% |
| CSR | 预计 30% |
| QPS | ≥ 95% |

**目标**：不是所有请求都带 History。"你好" → History 0；"继续" → History 保留。

**实现步骤**：
1. ⬜ TODO — 请求类型检测（新对话/继续/引用）。
2. ⬜ TODO — 动态 History 长度策略。
3. ⬜ TODO — 上下文相关性判断。

**验收标准**：
- TRR ≥ 30%。
- QPS ≥ 95%。

#### 1.4 History Pruning

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | SSS |
| TRR | 预计 20% |
| CSR | 预计 20% |
| QPS | ≥ 93% |

**目标**：根据 Attention Score / Semantic Score / Importance 删除最没价值的上下文。

**实现步骤**：
1. ⬜ TODO — 上下文重要性评分。
2. ⬜ TODO — 低价值上下文删除策略。
3. ⬜ TODO — 删除后质量验证。

**验收标准**：
- TRR ≥ 20%。
- QPS ≥ 93%。

#### 1.5 Chunk Cache

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | SSS |
| TRR | 预计 40% |
| CSR | 预计 40% |
| QPS | ≥ 95% |

**目标**：不是整个 Prompt Cache，而是 Chunk 级缓存。"Transformer 和 BERT" 可复用 "Transformer 介绍" 的缓存。

**实现步骤**：
1. ⬜ TODO — Prompt 分块（语义块）。
2. ⬜ TODO — Chunk 级缓存存储与检索。
3. ⬜ TODO — Chunk 拼接与去重。

**验收标准**：
- TRR ≥ 40%。
- QPS ≥ 95%。

---

### Layer 2: Cost Optimization（Priority SSS）

**目标**：最大化 CSR。

#### 2.1 Cost Estimator

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | SSS |
| TRR/CSR/QPS | CSR 预估 |

**目标**：请求进入先预测成本：
```
预计 Input: 850 / Output: 620 / 成本: ￥0.023
```

**实现步骤**：
1. ⬜ TODO — Token 预估（基于历史平均）。
2. ⬜ TODO — 成本预估（基于 Provider 价格表）。
3. ⬜ TODO — 预估误差评估。

**验收标准**：
- 成本预估误差 ≤ 10%。

#### 2.2 Smart Provider Selection

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | SSS |
| TRR/CSR/QPS | CSR 核心 |

**目标**：复杂代码 → Claude；普通聊天 → DeepSeek；翻译 → Gemini Flash。

**实现步骤**：
1. ⬜ TODO — 基于 Intent + 成本 + 质量的多维路由。
2. ⬜ TODO — 动态价格表更新。
3. ⬜ TODO — 路由决策记录与优化。

**验收标准**：
- CSR ≥ 30%。
- QPS ≥ 95%。

#### 2.3 Budget Controller

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | SSS |
| TRR/CSR/QPS | CSR 保障 |

**目标**：本月预算用 80% 时自动降级模型。

**实现步骤**：
1. ⬜ TODO — 租户预算跟踪。
2. ⬜ TODO — 预算阈值触发降级。
3. ⬜ TODO — 降级策略配置。

**验收标准**：
- 预算超支自动降级。
- 降级可配置。

#### 2.4 Cost Report

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | SSS |
| TRR/CSR/QPS | CSR 可视化 |

**目标**：每日自动报告：
```
昨日节省: 42%
主要来源: 缓存 27% / Prompt Compression 9% / Router 6%
```

**实现步骤**：
1. ⬜ TODO — 每日成本聚合。
2. ⬜ TODO — 节省来源归因。
3. ⬜ TODO — 报告生成与推送。

**验收标准**：
- 每日自动生成报告。
- 节省来源可归因。

---

### Layer 3: Quality Optimization

**目标**：确保 QPS 不因优化而下降。

#### 3.1 LLM Judge 集成

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | A |
| TRR/CSR/QPS | QPS 保障 |

**目标**：自动评价回答质量，Router 学习。

**实现步骤**：
1. ⬜ TODO — Judge 引擎接入请求链路。
2. ⬜ TODO — 质量评分记录。
3. ⬜ TODO — Router 基于质量反馈优化。

**验收标准**：
- 质量评分覆盖所有请求。
- Router 可学习质量反馈。

#### 3.2 Response Ranking

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | A |
| TRR/CSR/QPS | QPS 提升 |

**目标**：多个模型同时生成，Judge 返回最好。

**实现步骤**：
1. ⬜ TODO — 多模型并行生成。
2. ⬜ TODO — Judge 评分排序。
3. ⬜ TODO — 返回最优响应。

**验收标准**：
- QPS ≥ 98%。
- 延迟可控。

#### 3.3 Cache Confidence 增强

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | A |
| TRR/CSR/QPS | TRR + QPS 平衡 |

**目标**：每条缓存 confidence 0~1，决定是否直接命中。

**实现步骤**：
1. ⬜ TODO — 集成 `cache-confidence.ts` 到缓存链路。
2. ⬜ TODO — confidence 阈值动态调整。
3. ⬜ TODO — 低 confidence 缓存自动刷新。

**验收标准**：
- TRR 提升且 QPS 不降。

#### 3.4 Quality Dashboard

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | A |
| TRR/CSR/QPS | QPS 可视化 |

**目标**：展示各 Provider 质量评分：
```
Claude 92 / GPT 95 / Gemini 89
```

**实现步骤**：
1. ⬜ TODO — 质量评分聚合。
2. ⬜ TODO — Dashboard 质量面板。
3. ⬜ TODO — 质量趋势分析。

**验收标准**：
- Dashboard 展示质量评分。
- 质量趋势可追踪。

---

### Layer 4: Intelligence

**目标**：真正 AI Native，Router 自动学习。

#### 4.1 Intent Learning

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | A |
| TRR/CSR/QPS | 路由优化 |

**目标**：Router 不是规则，而是基于 50000 请求训练的分类器。

**实现步骤**：
1. ⬜ TODO — 历史请求数据收集。
2. ⬜ TODO — 意图分类器训练。
3. ⬜ TODO — 分类器部署与更新。

**验收标准**：
- 分类准确率 ≥ 90%。

#### 4.2 Cost Predictor

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | A |
| TRR/CSR/QPS | CSR 预测 |

**目标**：预测未来一天的花费。

**实现步骤**：
1. ⬜ TODO — 历史成本趋势分析。
2. ⬜ TODO — 预测模型（线性/指数）。
3. ⬜ TODO — 预测结果展示。

**验收标准**：
- 预测误差 ≤ 15%。

#### 4.3 Cache Predictor

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | A |
| TRR/CSR/QPS | TRR 提升 |

**目标**：预测哪些 Prompt 会热门，提前生成缓存。

**实现步骤**：
1. ⬜ TODO — 热门 Prompt 识别。
2. ⬜ TODO — 预生成缓存。
3. ⬜ TODO — 预生成效果评估。

**验收标准**：
- 预生成缓存命中率 ≥ 30%。

#### 4.4 Auto Routing

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | A |
| TRR/CSR/QPS | CSR 自动化 |

**目标**：Router 自动学习，不用人工配置。

**实现步骤**：
1. ⬜ TODO — 路由决策记录。
2. ⬜ TODO — 基于反馈自动调整权重。
3. ⬜ TODO — 人工配置降级为可选。

**验收标准**：
- 自动路由 CSR ≥ 30%。
- 无需人工干预。

---

### Layer 5: Enterprise

**目标**：商业化能力。

| 状态 | 功能 | 说明 |
|------|------|------|
| ⬜ TODO | RBAC | Owner/Admin/Developer/Viewer/Auditor |
| ⬜ TODO | Quota | 按 Token 数限流，套餐 Free/Pro/Enterprise |
| ⬜ TODO | Billing | Stripe 集成 / Invoice |
| ⬜ TODO | Audit | 审计日志 |
| ⬜ TODO | Organization | 多组织管理 |
| ⬜ TODO | SSO/LDAP | 企业身份认证 |
| ⬜ TODO | Webhook | 事件通知 |

---

### Layer 6: Ecosystem

**目标**：生态建设。

| 状态 | 功能 | 说明 |
|------|------|------|
| ⬜ TODO | VSCode Plugin | 官方插件 |
| ⬜ TODO | JetBrains Plugin | 官方插件 |
| ⬜ TODO | Spring AI Integration | 官方集成 |
| ⬜ TODO | LangChain Integration | 官方集成 |
| ⬜ TODO | Continue Integration | 官方集成 |
| ⬜ TODO | Cline Integration | 官方集成 |
| ⬜ TODO | OpenWebUI Integration | 官方集成 |

---

## 研究课题（论文价值）

### R1: Semantic Cache 2.0

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| TRR/CSR/QPS | TRR 核心 |

**目标**：LLM Judge + Embedding + Cache Confidence 三级判断。

**实现步骤**：
1. ⬜ TODO — Embedding 相似度初筛。
2. ⬜ TODO — LLM Judge 语义等价判断。
3. ⬜ TODO — Cache Confidence 最终决策。

### R2: Dynamic TTL

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| TRR/CSR/QPS | TRR 提升 |

**目标**：TTL 自动学习：天气 5 分钟 / 数学 30 天 / 代码 3 天。

**实现步骤**：
1. ⬜ TODO — 问题类型 → TTL 映射学习。
2. ⬜ TODO — TTL 动态调整。

### R3: Cache Recommendation

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| TRR/CSR/QPS | TRR 引导 |

**目标**：后台告诉用户："建议开启 Conversation Summary，预计节省 18%"。

**实现步骤**：
1. ⬜ TODO — 优化建议生成。
2. ⬜ TODO — 建议推送。

### R4: Token Optimization Engine（TOE）

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| TRR | 目标 72% |
| CSR | 目标 70% |
| QPS | ≥ 98% |

**目标**：端到端 Token 优化流水线：
```
Input → Compression → History Summary → Context Selection → Provider Routing → Semantic Cache → Output
```

**实现步骤**：
1. ⬜ TODO — 各模块串联。
2. ⬜ TODO — 端到端 TRR/CSR/QPS 测量。
3. ⬜ TODO — 优化调参。

**验收标准**：
- TRR ≥ 72%。
- QPS ≥ 98%。

---

## 季度路线

### Q3（当前）—— 数据基础

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Layer 0.1 | 完整请求数据模型 |
| ⬜ TODO | Layer 0.2 | Cost Analytics Dashboard |
| ⬜ TODO | Layer 0.3 | 请求画像 |
| ⬜ TODO | Phase 1 | 分布式语义缓存（Faiss/HNSW + 多节点） |

### Q4 —— Token 优化

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Layer 1.1 | Prompt Compression |
| ⬜ TODO | Layer 1.2 | Conversation Compression |
| ⬜ TODO | Layer 1.3 | Adaptive Context |
| ⬜ TODO | Layer 1.4 | History Pruning |
| ⬜ TODO | Layer 1.5 | Chunk Cache |

### Q1（明年）—— 成本优化

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Layer 2.1 | Cost Estimator |
| ⬜ TODO | Layer 2.2 | Smart Provider Selection |
| ⬜ TODO | Layer 2.3 | Budget Controller |
| ⬜ TODO | Layer 2.4 | Cost Report |

### Q2（明年）—— 质量 + 智能

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Layer 3 | Quality Optimization（Judge/Ranking/Confidence/Dashboard） |
| ⬜ TODO | Layer 4 | Intelligence（Intent Learning/Cost Predictor/Cache Predictor/Auto Routing） |

### Q3（明年）—— 企业 + 生态

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Layer 5 | Enterprise（RBAC/Quota/Billing/Audit/SSO） |
| ⬜ TODO | Layer 6 | Ecosystem（VSCode/JetBrains/Spring AI/LangChain） |
| ⬜ TODO | Phase 12 | 内核重构 → Nexus Runtime |

---

## 影响力建设（与开发同等重要）

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | 技术博客 | 写高质量技术博客（Token 优化、成本优化、Semantic Cache 2.0 的思路） |
| ✅ COMPLETED | 架构图 | `docs/architecture.md` 含 Mermaid 架构图 |
| ⬜ TODO | Issues & PR | 持续回应 Issues 和接受 PR |
| ⬜ TODO | Release 维护 | 持续维护 Release，打 tag，写 changelog |
| ✅ COMPLETED | Compatibility Matrix | `examples/compatibility-matrix.md` 13 种客户端兼容性 |
| ✅ COMPLETED | CONTRIBUTING.md | `CONTRIBUTING.md` 贡献指南 |
| ⬜ TODO | GitHub Discussions | 开启讨论区 |

---

## 开发约定

### CI 测试要求（每个 Agent 完成功能后必须执行）

> **重要**：任何功能开发完成后，必须本地验证通过以下 3 步，并确保 GitHub Actions CI 变绿后才能标记为 ✅ COMPLETED。

| 步骤 | 命令 | 说明 | 失败处理 |
|------|------|------|----------|
| 1. 安装依赖 | `npm ci` | 干净安装依赖，验证 lockfile 自洽 | 若报 EUSAGE，用 `npm install` 重建 lockfile |
| 2. 类型检查 | `npx tsc --noEmit` | TypeScript 类型检查 | 修复所有 TS 错误（常见：未使用 import TS6133、类型不匹配 TS2322/TS2678、条件永远为 true TS2774） |
| 3. 运行测试 | `npm test` | 运行全部 Vitest 测试 | 修复失败的测试，确保全部通过 |

**CI 工作流**（`.github/workflows/ci.yml`）：
- `npm ci` → `npx tsc --noEmit` → `npm test`
- 在 `main` 分支 push 和 pull_request 时自动运行
- 使用 Node 22 + `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION: true`

**提交前检查清单**：
- [ ] `npm ci` 成功（无 EUSAGE 错误）
- [ ] `npx tsc --noEmit` 通过（无 TS 错误）
- [ ] `npm test` 全部通过（记录测试数，如 266/266）
- [ ] `git push` 后 GitHub Actions CI 变绿
- [ ] 更新 `fit/improve.md` 标记对应任务为 ✅ COMPLETED

**常见 TS 错误及修复**：
- `TS6133: 'xxx' is declared but its value is never read` → 删除未使用的 import/变量
- `TS2322: Type '"block"' is not assignable to type 'PolicyAction'` → 在类型联合中添加缺失的字符串字面量
- `TS2678: Type '"block"' is not comparable to type 'PolicyAction'` → 同上，扩展类型定义
- `TS2774: This condition will always return true` → 检查是否误用函数引用而非调用

### 代码规范
- 使用 TypeScript + Hono。
- 使用 Drizzle ORM + PostgreSQL + Redis。
- 使用 Vitest 进行测试。
- 使用 ESLint + Prettier 格式化。

### 提交规范
- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `test:` 测试
- `chore:` 工具/配置

### 分支管理
- `main`：主分支，CI 全绿。
- `feature/*`：功能分支。
- `fix/*`：修复分支。

### ADR 规范
- 每个重大设计决策记录在 `docs/adr/` 下。
- 格式：`NNNN-title.md`，包含 Context / Decision / Alternatives / Consequences。
- 示例：`0001-semantic-cache-design.md`、`0002-router-dsl.md`、`0003-workflow-engine.md`。

---

> 备注：当前 `git config --local http.proxy` 已配置走 clash 代理，推送正常。CI 已全绿（266/266 测试通过）。Daily Benchmark CI 已修复（改用 Node.js 脚本）。项目已重新定位为 AI Cost Optimization Platform，按 Layer0~Layer6 演进。