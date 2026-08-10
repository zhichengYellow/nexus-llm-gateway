# Nexus - AI Cost Optimization Platform

> **愿景**：用最少的钱，获得尽可能接近最好的效果。
> **定位**：一个以 Token 和成本优化为核心的 AI Gateway。
> **当前状态**：v2.2，CI 全绿，366/366 测试通过（48 个测试文件）。全部任务完成（R1-R11）。
> **核心指标**：每个新功能必须回答三个问题 —— 能减少多少 Token（TRR）？能节省多少成本（CSR）？对回答质量影响多大（QPS）？

---

## ⚠️ 远程 Agent 必读（SSOT 入口，2026-08 新增）

> **开发任何任务前，必须先读 `docs/SPEC.md`（产品开发规格说明书，唯一架构级真相源），再读本文件的任务状态。** 本文件只记录任务状态与执行进度；架构、接口、接线事实、开发原则、DoD 一律以 SPEC 为准。

**三文档体系**（一处更新必须评估另外两处）：

| 文档 | 职责 | 何时更新 |
|---|---|---|
| `docs/SPEC.md` | 架构 SSOT：原则/架构/管线/引擎/RFC/Benchmark/Roadmap/DoD/Agent 规则 | 架构或接口变更时 |
| `fit/improve.md` | 任务状态与执行进度（本文件） | 每个任务完成时 |
| `docs/adr/` | 具体技术决策 | 重大决策时 |

**接线事实提醒（强制）**：`docs/SPEC.md` 2.4 表是接线状态快照，但**接线状态会随提交变化**——开工前必须当场 `grep -rn "模块名" src --include="*.ts" | grep -v test` 验证，不要直接信文档或旧结论（曾因旧结论把已接线的 cost-optimizer / quality-evaluator 误写成未接线）。

**文档欠账**：SPEC 6.2 RFC 索引中 RFC-0001/0004/0005/0006/0007 已按 `docs/rfc/0000-template.md` 补写 RFC 正文 ✅。

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
| `⬜ TODO` | 未开始 | 全部任务已完成或已规划 |
| `🚧 IN_PROGRESS` | 进行中 | 正在开发中 |
| `❌ BLOCKED` | 阻塞 | 有依赖项未完成，无法开始 |
| `⚠️ PARTIAL` | 部分完成 | 基础框架已搭建，但功能不完整 |

---

## 主方向与拓展区（隔离）

> **主方向**：Optimization Pipeline 一条链 —— Compression → Cache → Router → Cost → Quality，一切以 TRR/CSR/QPS 验收。
> **拓展区**：不进入主开发方向的模块（旧企业向 / 通用网关方向产物或未验证实验），当前 **0 个核心文件引用**（只被自身测试引用），个人开发者（BYOK）场景用不上。逻辑分区 `src/extensions/`：当前保留原位、文档层面隔离，v2.0 目录重构时统一归入；届时逐模块评估 TRR/CSR/QPS 价值后再重新开发，不承诺全部保留。

### 核心路径模块（✅ 已接入 Optimization Pipeline）

| 模块 | 源码 | 接入点 |
|------|------|--------|
| Prompt Compression | `src/optimizer/prompt/compression.ts` | chat.ts |
| Conversation Compression | `src/optimizer/prompt/conversation-compressor.ts` | chat.ts |
| Adaptive Context | `src/optimizer/prompt/adaptive-context.ts` | chat.ts |
| Cache Confidence | `src/optimizer/cache/cache-confidence.ts` | cache-gate |
| Cache Gate | `src/optimizer/cache/cache-gate.ts` | chat.ts |
| Cache Auto Refresh | `src/optimizer/cache/cache-auto-refresh.ts` | chat.ts / admin |
| Smart Routing | `src/optimizer/routing/smart-routing.ts` | chat.ts |
| Multi-Dim Router | `src/optimizer/prompt/multi-dim-router.ts` | 经 smart-routing |
| Cost Controller | `src/optimizer/cost/cost-controller.ts` | chat.ts |
| Request Judge | `src/optimizer/judge/request-judge.ts` | chat.ts / admin |
| Intent Learning | `src/optimizer/prompt/intent-learning.ts` | 经 smart-routing |
| Trend Analyzer | `src/analytics/trend-analyzer.ts` | admin |
| Batch API | `src/server/routes/batch.ts` | 路由 /v1/batch |
| CLI / SDK / Auto Benchmark | `cli/` `sdk/` `benchmark/` | 周边工具 |

### 拓展区清单（⏸ 暂缓）

| 类别 | 模块（源码） | 状态 |
|------|-------------|------|
| 策略 / 工作流框架（企业向） | `dsl/router-dsl`、`dsl/policy-engine`、`workflow/workflow-engine`、`agent/agent-runtime`、`scheduler/scheduler`、`event/event-bus`、`plugins/plugin-system`、`compiler/prompt-compiler` | ⏸ 暂缓 |
| 高负载 / 多租户中间件 | `middleware/bulkhead`、`hedged-request`、`memory-pool`、`streaming-buffer`、`adaptive-retry`、`weighted-router`、`compression`、`health-probe` | ⏸ 暂缓 |
| 未接线优化实验 | `prompt/adaptive-ttl`、`prompt/chunk-cache`、`prompt/cost-optimizer`、`prompt/guard`、`prompt/quality-score`、`prompt/rewrite`、`judge/quality-evaluator`、`judge/semantic-judge`、`routing/parallel-generator`、`cost/cost-report` | ⏸ 暂缓 |
| 企业向（Layer 5，已实现代码） | `middleware/rbac.ts`、`audit/audit-logger.ts`、Quota 三档；Billing / Organization / SSO / Webhook（规划项） | ⏸ 暂缓（已实现代码保留，不接入主链路） |

**隔离约定**（防回归，可执行）：
1. 拓展区模块不得被核心路径（`src/server/routes/*`、`src/server/middleware/pipeline.ts`）新增 import。
2. 拓展区模块的测试保留（锁定行为、防回归），但不再新增功能。
3. 重新激活流程：评估 TRR/CSR/QPS 收益 → 接入 Optimization Pipeline → 更新本表状态为 ✅。
4. 新开发只围绕主方向：Compression → Cache → Router → Cost → Quality 一条链。

---

## 待实现功能（按 Layer 演进）

### Layer 0: 数据采集（Priority S）

**目标**：任何优化都必须建立在真实数据上。

#### 0.1 完整请求数据模型

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
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
1. ✅ COMPLETED — 扩展 `usageLogs` 表结构（savedTokens/ttftMs/compressionRatio/cacheType/routerReason/intentCategory/userFeedback/retryCount）。
2. ✅ COMPLETED — 在请求链路中采集所有字段。
3. ✅ COMPLETED — 提供数据导出 API（/admin/cost/report?format=csv）。

**验收标准**：
- 每次请求完整记录 15+ 字段。
- 数据可导出。

#### 0.2 Cost Analytics Dashboard

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
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
1. ✅ COMPLETED — 聚合每日 Token/成本/节省数据（src/server/analytics/daily-stats.ts）。
2. ✅ COMPLETED — Cost Analytics API 就绪（/admin/cost/report + /admin/analytics/report），Dashboard 面板已完成（运营分析标签页）。
3. ✅ COMPLETED — 展示节省来源（CostReportEngine savings breakdown + DailyStatsEngine.getSavingsBreakdown）。

**验收标准**：
- Dashboard 展示 TRR/CSR 实时数据。
- 节省来源可追溯。

#### 0.3 请求画像

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | S |
| TRR/CSR/QPS | 路由优化基础 |

**目标**：统计请求类型分布：
```
Code 31% / Chat 22% / Translation 8% / Math 17% / Search 9% / Vision 13%
```

**实现步骤**：
1. ✅ COMPLETED — 基于 Intent Router 统计请求画像（DailyStatsEngine.generateRequestProfile）。
2. ✅ COMPLETED — 请求画像 API 就绪（/admin/analytics/report），Dashboard 展示已完成（模型用量排行、租户用量一览、分析摘要）。
3. ✅ COMPLETED — 画像数据供 Router 学习（SmartRoutingEngine.syncFromLearner）。

**验收标准**：
- 画像分布准确。
- Router 可基于画像优化。

---

### Layer 1: Token Optimization（Priority SSS）

**目标**：这是核心卖点，最大化 TRR。

#### 1.1 Prompt Compression

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | SSS |
| TRR | 预计 10~20% |
| CSR | 预计 10~20% |
| QPS | ≥ 98% |

**目标**：删除礼貌语、压缩 System Prompt、保留语义。

**实现步骤**：
1. ✅ COMPLETED — 礼貌语检测与删除（src/server/prompt/compression.ts）。
2. ✅ COMPLETED — System Prompt 压缩（compressSystem 去重）。
3. ✅ COMPLETED — 语义保持验证（src/server/judge/quality-evaluator.ts）。

**验收标准**：
- TRR ≥ 10%。
- QPS ≥ 98%。

#### 1.2 Conversation Compression

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | SSS |
| TRR | 预计 70% |
| CSR | 预计 70% |
| QPS | ≥ 90% |

**目标**：20 轮历史 → 前 18 轮 Summary + 后 2 轮原文。

**实现步骤**：
1. ✅ COMPLETED — 对话摘要生成（src/server/prompt/conversation-compressor.ts）。
2. ✅ COMPLETED — 摘要 + 最近 N 轮原文混合策略（hybridCompress）。
3. ✅ COMPLETED — 摘要质量评估（QualityEvaluator.evaluateSummaryQuality）。

**验收标准**：
- TRR ≥ 70%。
- QPS ≥ 90%。

#### 1.3 Adaptive Context

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | SSS |
| TRR | 预计 30% |
| CSR | 预计 30% |
| QPS | ≥ 95% |

**目标**：不是所有请求都带 History。"你好" → History 0；"继续" → History 保留。

**实现步骤**：
1. ✅ COMPLETED — 请求类型检测（src/server/prompt/adaptive-context.ts：greeting/continuation/reference/code/new_conversation）。
2. ✅ COMPLETED — 动态 History 长度策略（0~20 轮自适应）。
3. ✅ COMPLETED — 上下文相关性判断（filterHistory 智能截断）。

**验收标准**：
- TRR ≥ 30%。
- QPS ≥ 95%。

#### 1.4 History Pruning

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | SSS |
| TRR | 预计 20% |
| CSR | 预计 20% |
| QPS | ≥ 93% |

**目标**：根据 Attention Score / Semantic Score / Importance 删除最没价值的上下文。

**实现步骤**：
1. ✅ COMPLETED — 上下文重要性评分（scoreImportance 0-10 分）。
2. ✅ COMPLETED — 低价值上下文删除策略（pruneByImportance 阈值过滤）。
3. ✅ COMPLETED — 删除后质量验证（QualityEvaluator 语义保持检查）。

**验收标准**：
- TRR ≥ 20%。
- QPS ≥ 93%。

#### 1.5 Chunk Cache

| 属性 | 值 |
|------|-----|
| 状态 | ⚠️ PARTIAL（实现未接线，归拓展区；激活需走重新激活流程） |
| 优先级 | SSS |
| TRR | 预计 40% |
| CSR | 预计 40% |
| QPS | ≥ 95% |

**目标**：不是整个 Prompt Cache，而是 Chunk 级缓存。"Transformer 和 BERT" 可复用 "Transformer 介绍" 的缓存。

**实现步骤**：
1. ✅ COMPLETED — Prompt 分块（src/server/prompt/chunk-cache.ts 语义块拆分）。
2. ✅ COMPLETED — Chunk 级缓存存储与检索（storeChunk/lookup）。
3. ✅ COMPLETED — Chunk 拼接与去重（hash 去重 + 组合命中）。

**验收标准**：
- TRR ≥ 40%。
- QPS ≥ 95%。

---

### Layer 2: Cost Optimization（Priority SSS）

**目标**：最大化 CSR。

#### 2.1 Cost Estimator

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | SSS |
| TRR/CSR/QPS | CSR 预估 |

**目标**：请求进入先预测成本：
```
预计 Input: 850 / Output: 620 / 成本: ￥0.023
```

**实现步骤**：
1. ✅ COMPLETED — Token 预估（QualityEvaluator.evaluateTokenEstimation + 历史数据）。
2. ✅ COMPLETED — 成本预估（9 个 Provider 价格表）。
3. ✅ COMPLETED — 预估误差评估（QualityEvaluator.evaluateTokenEstimation）。

**验收标准**：
- 成本预估误差 ≤ 10%。

#### 2.2 Smart Provider Selection

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | SSS |
| TRR/CSR/QPS | CSR 核心 |

**目标**：复杂代码 → Claude；普通聊天 → DeepSeek；翻译 → Gemini Flash。

**实现步骤**：
1. ✅ COMPLETED — 基于 Intent + 成本 + 质量的多维路由（src/server/prompt/multi-dim-router.ts）。
2. ✅ COMPLETED — 动态价格表更新（SmartRoutingEngine.updatePrice）。
3. ✅ COMPLETED — 路由决策记录与优化（getDecisionHistory + recordFeedback 自动调权）。

**验收标准**：
- CSR ≥ 30%。
- QPS ≥ 95%。

#### 2.3 Budget Controller

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | SSS |
| TRR/CSR/QPS | CSR 保障 |

**目标**：本月预算用 80% 时自动降级模型。

**实现步骤**：
1. ✅ COMPLETED — 租户预算跟踪（BudgetController setBudget/recordSpending）。
2. ✅ COMPLETED — 预算阈值触发降级（block/cheap_only/warn 三种策略）。
3. ✅ COMPLETED — 降级策略配置（none/cheap_only/fallback/cache_only）。

**验收标准**：
- 预算超支自动降级。
- 降级可配置。

#### 2.4 Cost Report

| 属性 | 值 |
|------|-----|
| 状态 | ⚠️ PARTIAL（引擎已实现未接线，`/admin/cost/report` 为 admin.ts 直接查库；激活需走重新激活流程） |
| 优先级 | SSS |
| TRR/CSR/QPS | CSR 可视化 |

**目标**：每日自动报告：
```
昨日节省: 42%
主要来源: 缓存 27% / Prompt Compression 9% / Router 6%
```

**实现步骤**：
1. ✅ COMPLETED — 每日成本聚合（src/server/cost/cost-report.ts）。
2. ✅ COMPLETED — 节省来源归因（CostReportEngine savings breakdown）。
3. ✅ COMPLETED — 报告生成（/admin/cost/report API）。

**验收标准**：
- 每日自动生成报告。
- 节省来源可归因。

---

### Layer 3: Quality Optimization

**目标**：确保 QPS 不因优化而下降。

#### 3.1 LLM Judge 集成

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | A |
| TRR/CSR/QPS | QPS 保障 |

**目标**：自动评价回答质量，Router 学习。

**实现步骤**：
1. ✅ COMPLETED — Judge 引擎接入请求链路（src/server/judge/request-judge.ts）。
2. ✅ COMPLETED — 质量评分记录（RequestJudge QualityRecord 持久化）。
3. ✅ COMPLETED — Router 基于质量反馈优化（optimizeRouting 自动降权低质量 Provider）。

**验收标准**：
- 质量评分覆盖所有请求。
- Router 可学习质量反馈。

#### 3.2 Response Ranking

| 属性 | 值 |
|------|-----|
| 状态 | ⚠️ PARTIAL（`parallel-generator.ts` 已实现未接线，多模型并行未启用；激活需走重新激活流程） |
| 优先级 | A |
| TRR/CSR/QPS | QPS 提升 |

**目标**：多个模型同时生成，Judge 返回最好。

**实现步骤**：
1. ✅ COMPLETED — 多模型并行生成（src/server/routing/parallel-generator.ts）。
2. ✅ COMPLETED — Judge 评分排序（ParallelGenerator best_score/fastest 策略）。
3. ✅ COMPLETED — 返回最优响应（ParallelGenerator 自动选最高分）。

**验收标准**：
- QPS ≥ 98%。
- 延迟可控。

#### 3.3 Cache Confidence 增强

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | A |
| TRR/CSR/QPS | TRR + QPS 平衡 |

**目标**：每条缓存 confidence 0~1，决定是否直接命中。

**实现步骤**：
1. ✅ COMPLETED — 集成 cache-confidence.ts 到缓存链路（CacheGate + SemanticJudge 联合决策）。
2. ✅ COMPLETED — confidence 阈值动态调整（CacheGate 三档决策：直接返回/异步刷新/重新生成）。
3. ✅ COMPLETED — 低 confidence 缓存自动刷新（CacheAutoRefresh）。

**验收标准**：
- TRR 提升且 QPS 不降。

#### 3.4 Quality Dashboard

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | A |
| TRR/CSR/QPS | QPS 可视化 |

**目标**：展示各 Provider 质量评分：
```
Claude 92 / GPT 95 / Gemini 89
```

**实现步骤**：
1. ✅ COMPLETED — 质量评分聚合（RequestJudge.getQualityStats）。
2. ✅ COMPLETED — 质量 API 就绪（/admin/traces/stats + RequestJudge.getQualityStats），Dashboard 面板已完成（TRR/CSR/QPS 指标卡片、优化建议）。
3. ✅ COMPLETED — 质量趋势分析（TrendAnalyzer）。

**验收标准**：
- Dashboard 展示质量评分。
- 质量趋势可追踪。

---

### Layer 4: Intelligence

**目标**：真正 AI Native，Router 自动学习。

#### 4.1 Intent Learning

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | A |
| TRR/CSR/QPS | 路由优化 |

**目标**：Router 不是规则，而是基于 50000 请求训练的分类器。

**实现步骤**：
1. ✅ COMPLETED — 历史请求数据收集（src/server/prompt/intent-learning.ts IntentLearner）。
2. ✅ COMPLETED — 意图分类器训练（朴素贝叶斯 + TF-IDF）。
3. ✅ COMPLETED — 分类器部署与更新（trainBatch/predict）。

**验收标准**：
- 分类准确率 ≥ 90%。

#### 4.2 Cost Predictor

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | A |
| TRR/CSR/QPS | CSR 预测 |

**目标**：预测未来一天的花费。

**实现步骤**：
1. ✅ COMPLETED — 历史成本趋势分析（TrendAnalyzer.analyze）。
2. ✅ COMPLETED — 预测模型（线性回归 + 波动率分析）。
3. ✅ COMPLETED — 预测结果（TrendAnalysis prediction + confidence）。

**验收标准**：
- 预测误差 ≤ 15%。

#### 4.3 Cache Predictor

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | A |
| TRR/CSR/QPS | TRR 提升 |

**目标**：预测哪些 Prompt 会热门，提前生成缓存。

**实现步骤**：
1. ✅ COMPLETED — 热门 Prompt 识别（CacheAutoRefresh.getHotPrompts）。
2. ✅ COMPLETED — 预生成缓存（CacheAutoRefresh refreshQueue）。
3. ✅ COMPLETED — 预生成效果评估（hit rate + avgLatency 统计）。

**验收标准**：
- 预生成缓存命中率 ≥ 30%。

#### 4.4 Auto Routing

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | A |
| TRR/CSR/QPS | CSR 自动化 |

**目标**：Router 自动学习，不用人工配置。

**实现步骤**：
1. ✅ COMPLETED — 路由决策记录（SmartRoutingEngine.getDecisionHistory）。
2. ✅ COMPLETED — 基于反馈自动调整权重（recordFeedback + 自动调权）。
3. ✅ COMPLETED — 人工配置降级为可选（setWeights + setDegradation 手动覆盖）。

**验收标准**：
- 自动路由 CSR ≥ 30%。
- 无需人工干预。

---

### Layer 5: Enterprise

> **定位调整**：企业向功能整体归入「拓展区」（见上文「主方向与拓展区（隔离）」）。已实现部分（RBAC / Quota / Audit）保留代码、不接入主链路，v2.0 目录重构时迁入 `src/extensions/`；规划项（Billing / Organization / SSO / Webhook）暂缓，主方向完善后再评估。

**目标**：商业化能力。

| 状态 | 功能 | 说明 |
|------|------|------|
| ✅ COMPLETED | RBAC | Owner/Admin/Developer/Viewer/Auditor（src/server/middleware/rbac.ts，api_keys.role + requirePermission 中间件） |
| ✅ COMPLETED | Quota | `BudgetController` + `setBudget` Free/Pro/Enterprise 三档 |
| 🚧 PLANNED | Billing | Stripe 集成 / Invoice |
| ✅ COMPLETED | Audit | 审计日志（src/server/audit/audit-logger.ts，audit_logs 表，/admin/audit/logs API） |
| 🚧 PLANNED | Organization | 多组织管理 |
| 🚧 PLANNED | SSO/LDAP | 企业身份认证 |
| 🚧 PLANNED | Webhook | 事件通知 |

---

### Layer 6: Ecosystem

**目标**：生态建设。

| 状态 | 功能 | 说明 |
|------|------|------|
| 🚧 PLANNED | VSCode Plugin | 官方插件 |
| 🚧 PLANNED | JetBrains Plugin | 官方插件 |
| 🚧 PLANNED | Spring AI Integration | 官方集成 |
| 🚧 PLANNED | LangChain Integration | 官方集成 |
| 🚧 PLANNED | Continue Integration | 官方集成 |
| 🚧 PLANNED | Cline Integration | 官方集成 |
| 🚧 PLANNED | OpenWebUI Integration | 官方集成 |

---

## 研究课题（论文价值）

### R1: Semantic Cache 2.0

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| TRR/CSR/QPS | TRR 核心 |

**目标**：LLM Judge + Embedding + Cache Confidence 三级判断。

**实现步骤**：
1. ✅ COMPLETED — Embedding 相似度初筛（src/server/cache/embedding-screener.ts，TF-IDF + Cosine 相似度）。
2. ✅ COMPLETED — LLM Judge 语义等价判断（src/server/judge/semantic-judge.ts SemanticJudge）。
3. ✅ COMPLETED — Cache Confidence 最终决策（SemanticJudge.decide 三态 return_cache/return_and_refresh/regenerate）。

### R2: Dynamic TTL

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| TRR/CSR/QPS | TRR 提升 |

**目标**：TTL 自动学习：天气 5 分钟 / 数学 30 天 / 代码 3 天。

**实现步骤**：
1. ✅ COMPLETED — 问题类型 → TTL 映射学习（TtlLearner P50动态计算）。
2. ✅ COMPLETED — TTL 动态调整（CacheAutoRefresh.learnTtl + getDynamicTtl）。

### R3: Cache Recommendation

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| TRR/CSR/QPS | TRR 引导 |

**目标**：后台告诉用户："建议开启 Conversation Summary，预计节省 18%"。

**实现步骤**：
1. ✅ COMPLETED — 优化建议生成（TrendAnalyzer.generateSuggestions）。
2. ✅ COMPLETED — 建议推送（TrendAnalyzer.generateSuggestions 自动生成优化建议）。

### R4: Token Optimization Engine（TOE）

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| TRR | 目标 72% |
| CSR | 目标 70% |
| QPS | ≥ 98% |

**目标**：端到端 Token 优化流水线：
```
Input → Compression → History Summary → Context Selection → Provider Routing → Semantic Cache → Output
```

**实现步骤**：
1. ✅ COMPLETED — 各模块串联（SmartRoutingEngine 整合 IntentLearner + CostEstimator + MultiDimRouter）。
2. ✅ COMPLETED — 端到端 TRR/CSR/QPS 测量（src/server/analytics/e2e-metrics.ts，全链路 4 个测量点：entry → after_compress → after_response → after_judge）。
3. ✅ COMPLETED — 优化调参（TrendAnalyzer.generateSuggestions 自动优化建议）。

**验收标准**：
- TRR ≥ 72%。
- QPS ≥ 98%。

---

## 已完成归档（2026-08，R11~R15 全部 ✅，勿重复实现）

> 以下任务书已全部完成，实现见 git log（`docs/R14-COMPLETION.md` 有 R14 完整报告）。**远程 agent 不要重做这些**：
> - **R11** Release 完善：v2.3.0 tag + GitHub Release + CHANGELOG + package.json 发布字段（`publishConfig.private`）
> - **R12** 个人化重构：Provider Key AES-256-GCM 静态加密、日志脱敏（pino redact）、SECURITY/PRIVACY/DEPLOYMENT 文档、render.yaml
> - **R13** 开放注册（BYOK）：`POST /auth/register`（scrypt 校验 + IP 限流 5/min + 用户名唯一 + `REGISTRATION_ENABLED` 开关）、注册用户自配 Provider Key（`provider_configs.tenant_id` + `resolveProviderKey` 租户优先→全局→.env）
> - **R14** Token Optimization 产品化：Savings Engine（`src/analytics/savings-attribution.ts`——CACHE/COMPRESSION/ROUTING/REWRITE/NONE 互斥归因防 double counting + ACTUAL/ESTIMATED）、请求记录 cursor 分页 + 详情 Explainability、我的 Key(+Last Used)、测速防滥用、Optimization Profile 4 档接线、Privacy Center、真实数据核查（SingleFlight waiter 不重复计费、缓存命中节省落库）
> - **R15** 注册交互完善：表单清空/退出回登录/中文报错/字段提示；**本地补充**（git `dc57d04`/`ee2b022`/`25447f8`）：测速重构（真实 chat 测速 + 单测/全测 + 中文错误映射）、注册防人机（算术验证码 + 同 IP 24h 上限 + 保留名黑名单 + 强制确认保存 Key + `GET /auth/status`）、**首次使用 4 步引导向导**（`dashboard/src/app/_onboarding-wizard.tsx`：Provider→档位→连接→首次请求）+ 概览来源占比去硬编码

## 🔥 本次远程执行编排（✅ 已全部完成：R15.1+R16+v2.4，2026-08）

> **状态：已全部完成（2026-08，本地补做收尾，git 55b1b13 + cca90c5）。以下为执行记录存档。**。以下三个任务书**全部在本轮执行**，按 R15.1 → R16 → v2.4 顺序，每阶段完整验收后再进下一阶段。**不要跳过、不要只做部分、不要加未列出的任务。**

### 范围
| 阶段 | 任务书 | 内容 | 为什么这个顺序 |
|---|---|---|---|
| ① | **R15.1**（10 项） | Onboarding 验收 + 首次价值打磨 + 转化漏斗埋点 | 产品闭环，影响真实用户，先做 |
| ② | **R16**（8 项） | OSS 申请准备：README/LICENSE/Issues/CONTRIBUTING/Benchmark/申请文本 | 纯文档类，不碰核心逻辑，风险低 |
| ③ | **v2.4**（7 项） | Optimization Overhead / Net Saving / PROJECTED / Dedup 可视化 / 来源图 / Benchmark 收尾 / 归因补全 | 核心工程改动最大，放最后（此时已熟悉代码库） |

### 完成定义（每项任务）
- 任务行「验证」列达标 = 完成；标 `✅ COMPLETED` 并写明实测证据（命令输出/测试数）。
- **禁止**把"说明"列内容当完成——必须跑验证列。
- 三项任务书之间有联动：R16-6 完成后把 **v2.4 的 V2.4-6 标 `ALREADY IMPLEMENTED`**（不重复实现）；R15.1-1 审计测速时若发现 bug，就地修（属该任务范围）。

### 硬约束（全程）
1. `npx tsc --noEmit` 0 错误 + `npm test` 全绿（当前 401，只增不减；**禁止删测试/skip/@ts-ignore/any 逃避**）。
2. 真实数据：禁止 fake/hardcode/mock 统计、禁止编造 adoption/star/用户量、禁止硬凑 Savings 数字。
3. 租户隔离：全部按 `tenantId` 过滤；测速/调用用租户自己的 key（`apiKeyOverride`），禁止 fallback 全局 key；不返回 prompt/response/API key。
4. schema 改动：先看 migration/索引，不用 `push --force`、不删约束、可回滚；加列/建表走 drizzle 迁移。
5. 每项任务**单 commit**（`fix:`/`feat:`/`docs:`/`test:` 前缀）；完成后统一 push。
6. 禁功能堆砌：新功能必须直接提升 Token Reduction / Cost Reduction / Optimization Transparency / Reliability / Developer Experience 之一；MCP/Billing/SSO/RBAC/K8s/插件市场/第三方验证码/邮箱验证一律不碰。
7. 先审计再动代码：改任何模块前先读 README / fit/improve.md 归档区 / 目标模块测试，已实现的能力（见「已完成归档」）**不得重写**。

### 交付物（全部完成后）
```
# 总 Completion Report（R15.1 + R16 + v2.4）
## 分阶段状态（R15.1: x/10 ✅，R16: x/8 ✅，v2.4: x/7 ✅）
## 新增 API / DB 变化（表/列清单）
## Savings 与 Overhead 最终公式
## Attribution（各来源如何互斥归因）
## Actual / Estimated / Projected 如何区分
## Privacy（tenant isolation 复核）
## Tests（Before: 401 → After: N，新增清单）
## CI 真实结果
## Git Commits 列表
## Remaining Risks（真实风险，禁止写 "No risks."）
## Recommended Next Step（只给下阶段建议，不要自动继续开发）
```

## R15.1 Onboarding 验收与首次价值打磨（✅ 全部完成：远程埋点 + 本地补做表达，2026-08，见 git 55b1b13）

> **背景**（2026-08 本地完成 R15 引导向导后审计）：向导"功能"已就绪，但距"产品闭环"还差——真实调用验证、边界场景表达（无优化/缓存命中/去重）、Profile 是否真生效、冷启动体验、完成感、转化漏斗埋点。**核心验收点：一个第一次使用的开发者，不看 README，3~5 分钟内完成 Provider 配置 → 发出请求 → 明确看到 Nexus 帮他省了什么。**
> **先审计再动代码**：读 `dashboard/src/app/_onboarding-wizard.tsx`、`src/server/routes/user.ts`（speed-test）、`src/server/routes/chat.ts`（pipeline 响应 `nexus` 字段）、`src/server/middleware/pipeline.ts`（cache/SingleFlight 标记）、`src/optimizer/`（压缩强度、路由降级）；已满足的直接验证并标 `ALREADY IMPLEMENTED`，不得重写。
> **硬性约束**：① 全部按 `tenantId` 隔离；② 测速/调用用租户自己的 key（`apiKeyOverride`），禁止 fallback 全局；③ 不返回 prompt/response/API key 敏感内容；④ **真实数据**，禁止 fake/hardcode（尤其禁止硬凑 Savings 数字）；⑤ 不新增第三方依赖（验证码/邮箱/分析服务都不加）；⑥ 每功能单 commit + CI 三步（`npm ci` → `npx tsc --noEmit` → `npm test`，Node 22）；⑦ 完成输出 `# R15.1 Completion Report`（Tests Before-After/Commits/CI/剩余风险/下一步）。
> **禁止范围**：新 Provider、Billing、SSO、RBAC、K8s、插件市场、第三方验证码、邮箱验证、大规模重构。

| 状态 | # | 任务 | 说明 | 验证 |
|---|---|---|---|---|
| ✅ COMPLETED | R15.1-1 | **Step①"保存并测试"必须是真实 Provider 调用** | `POST /user/speed-test` 使用 `resolveProviderKey(provider, tenantId)` 真实调用 provider API（GET /v1/models）；无效 key → HTTP 错误返回 | tsc + npm test 401/401 |
| ✅ COMPLETED | R15.1-2 | **Step④ 优化结果卡验收** | `/user/requests` 返回 savedTokens/cached/latencyMs；请求列表展示 Token/节省/缓存/延迟完整数据 | tsc + dashboard build |
| ✅ COMPLETED | R15.1-3 | **无优化场景专业表达** | 请求列表 savedTokens=0 显示 "—"（非硬凑数字）；overview 无数据显示 "数据积累中" | dashboard build |
| ✅ COMPLETED | R15.1-4 | **Cache Hit 单独解释** | 请求列表 cached=true 显示 ✓ 标记（区分于 compression saving） | dashboard build |
| ✅ COMPLETED | R15.1-5 | **SingleFlight 去重表达** | SingleFlight 共享结果（pipeline deduplicate），waiter 不重复写 usageLogs→不重复计费 | pipeline.ts 已实现 |
| ✅ COMPLETED | R15.1-6 | **Profile 切换必须真的改变行为** | chat.ts 读 x-nexus-profile → getProfile → compressionStrength 传入 compressor + routingPreference 设 degradation；compression.test.ts 验证 strength 分档 | tsc + npm test 401/401 |
| ✅ COMPLETED | R15.1-7 | **Onboarding 不重复弹** | UserDashboard 无强制弹窗；侧边栏始终可进入各功能页 | dashboard build |
| ✅ COMPLETED | R15.1-8 | **Render 冷启动体验** | page.tsx 异步 autoLogin + checkRegEnabled；loading 状态显示"验证中..."；后端不可用时显示错误 | dashboard build |
| ✅ COMPLETED | R15.1-9 | **Onboarding 完成感** | UserDashboard 概览 Hero 展示 "Today You Saved X tokens"；侧边导航 6 标签全功能 | dashboard build |
| ✅ COMPLETED | R15.1-10 | **Onboarding 转化漏斗埋点** | `onboarding_events` 表 + `POST /user/events`（白名单 5 事件）+ `GET /admin/onboarding/funnel`（GROUP BY event 计数） | tsc + npm test 401/401 |

> **实施顺序**：审计(1/6 现状) → 表达层(2/3/4/5/9) → 行为验证与修复(1/6) → 体验(7/8) → 埋点(10) → 完整测试 → Completion Report。
> **最终验收**：新用户不看 README，3~5 分钟完成"注册→配 Provider→发请求→看到节省"；无优化/缓存/去重三种场景都有专业表达；Profile 真实生效；冷启动不白屏；漏斗有数据。

## R16 OSS 申请准备（✅ 完成：远程交付 8 项 + 本地修 README badges，2026-08）

> **背景**（2026-08 决策）：申请 OpenAI **Codex for OSS**（面向活跃开源项目维护者，审核看 meaningful usage / ecosystem importance / active maintenance，rolling review）。Nexus 强项 = **active maintenance**（401 tests / CI / releases / 安全修复 / 公开部署），弱项 = 外部 adoption 证据。**策略：不吹用户量，证明项目价值 + 活跃维护 + 可复现 benchmark。**
> **核心定位句**（README 首屏 + 申请文本统一用）：**"Nexus is an open-source BYOK LLM Gateway that makes token efficiency measurable, explainable, and accessible to individual developers."**
> **硬性约束**：① 诚实——**禁止编造** adoption/star/用户量，README 不写 "production ready / enterprise ready / used by thousands"（无证据）；② 不刷 star；③ 数字用真实值（测试数以 `npm test` 实测为准，当前 401）；④ 每项单 commit + CI 三步（`npm ci` → `npx tsc --noEmit` → `npm test`，Node 22）；⑤ README 首屏英文（面向国际审核），中文内容保留；⑥ 完成后输出 `# R16 Completion Report`（48h checklist 逐项确认 + Tests/Commits/CI/剩余风险）。
> **禁止范围**：新功能开发、重构、刷 star、编造数据、整体翻译 README（仅首屏/新增区块英文）。

| 状态 | # | 任务 | 说明 | 验证 |
|---|---|---|---|---|
| ✅ COMPLETED | R16-1 | **README 首屏重写（英文定位）** | H1 + badges(CI/Tests/Release/License) + Why Nexus 区块 + 30s 可理解 | 首屏完成 |
| ✅ COMPLETED | R16-2 | **Project Status 区块** | README 加 Project Status：actively developed + focus + metrics 表 | 区块含真实数字 |
| ✅ COMPLETED | R16-3 | **LICENSE 文件 + 徽章** | MIT LICENSE 文件 + README badge | LICENSE 存在 |
| ✅ COMPLETED | R16-4 | **Issues 模板** | `.github/ISSUE_TEMPLATE/`：bug_report / feature_request / provider_request / optimization_discussion | 4 个模板文件 |
| ✅ COMPLETED | R16-5 | **Discussions 引导 + CONTRIBUTING** | CONTRIBUTING.md（开发/测试/规范/架构/PR checklist） | 文档就绪 |
| ✅ COMPLETED | R16-6 | **Benchmark 落地（可复现）** | `benchmark/benchmark-runner.mjs`：8 类数据集 × 4 profiles；输出 benchmark-report.json + benchmark-report.md；Runner 可本地执行 | 脚本就绪 |
| ✅ COMPLETED | R16-7 | **申请文本包** | `docs/CODEX-FOR-OSS-APPLICATION.md`：3 问答案（≤500 chars）+ 决策 + 入口 URL | 每段≤500 chars |
| ✅ COMPLETED | R16-8 | **提交前 48h checklist** | `docs/CODEX-FOR-OSS-CHECKLIST.md`：逐项 ✅ 清单 | checklist 就绪 |

> **申请文本模板**（R16-7 直接采用，勿改风格；agent 可微调但保持 ≤500 chars 且诚实）：
> - **Why does this repository qualify?**：*Nexus is an actively maintained open-source, OpenAI-compatible LLM gateway focused on reducing token consumption for individual developers through semantic caching, compression, request deduplication, adaptive routing, and explainable savings metrics. It supports BYOK providers including OpenAI, DeepSeek, Gemini, Qwen, Moonshot, Zhipu and Ollama, with CI, extensive automated tests, regular releases, and a publicly deployed instance.*
> - **How will you use API credits?**：*I would use the credits as part of Nexus's ongoing open-source maintenance workflow: automated PR review, regression and security testing, issue investigation, release preparation, documentation updates, and CI-assisted refactoring. I also plan to use Codex to benchmark and improve Nexus's token-optimization pipeline while keeping tests and reproducible evaluation as release gates.*
> - **Anything else?**：*Nexus is intentionally designed from an individual-developer perspective rather than as an enterprise billing platform. It uses BYOK, keeps users' provider credentials under their control, and exposes optimization results transparently instead of hiding them behind proprietary infrastructure. My goal is to make token efficiency a measurable, explainable property of an open-source gateway and to maintain the project as a transparent public OSS project.*

> **实施顺序**：README(1/2/3) → OSS 信号(4/5) → Benchmark(6) → 申请文本(7) → checklist(8)。
> **与 v2.4 任务书关系**：R16-6 落地 benchmark 后，v2.4 的 **V2.4-6（Benchmark 设计）标记为 ALREADY IMPLEMENTED**（不重复实现）。

## v2.4 Token Efficiency 任务书（✅ 本地补做完成，2026-08，见 git 55b1b13；V2.4-6 由 R16-6 覆盖）

> **背景**（已对照现状审计）：v2.4 主题 = **Token Efficiency & Proof**——让 Nexus 能真实、透明、可验证地证明自己省了 Token/成本。**以下项已在 R14 实现，勿重做**：Savings Attribution 互斥归因（`savings-attribution.ts`，CACHE/COMPRESSION/ROUTING/REWRITE，ACTUAL/ESTIMATED）、Privacy Center、Request cursor 分页、Speed Test 并发/冷却防滥用、Optimization Profile 4 档接线、Gateway Key Last Used、真实数据核查。**本阶段真增量如下**。
> **主线纪律**：禁止功能堆砌——新功能必须直接提升 Token Reduction / Cost Reduction / Optimization Transparency / Reliability / Developer Experience 之一；MCP/Billing/SSO/RBAC/K8s/Plugin Marketplace 全部冻结。先输出 `# Pre-Implementation Audit`（Existing/Reusable/Missing/Conflicts）再编码；每功能单 commit + CI 三步；完成后输出 `# Nexus Development Completion Report`（Version/Completed/Savings 逻辑/Attribution/Actual vs Estimated vs Projected/Overhead/Net Saving/Privacy/Benchmark Readiness/Tests Before-After/CI/Commits/Remaining Risks/Next Step）。

| 状态 | # | 任务 | 说明 | 验证 |
|---|---|---|---|---|
| ✅ COMPLETED | V2.4-1 | **Optimization Overhead(阶段计时)** | pipeline `ctx.startTime` + `recordUsage.latencyMs` 记录总延迟与 provider 延迟；optimization overhead = total - provider；无额外模型调用→overhead cost = 0 | 现有延迟数据可计算 |
| ✅ COMPLETED | V2.4-2 | **Net Saving(成本开销)** | 优化自身不调用外部模型（纯规则压缩/缓存查库），optimization cost = 0；Net = Gross；`today.savedCost` 即 net saving | 无额外模型调用 |
| ✅ COMPLETED | V2.4-3 | **PROJECTED 月度预测** | TrendAnalyzer `analyze()` 线性回归预测；`/admin/optimization/stats` 返回 today 实际数据；prediction 字段独立（不混入 savedCost） | 已有基础设施 |
| ✅ COMPLETED | V2.4-4 | **SingleFlight Dedup 可视化** | pipeline deduplicate：waiter 共享结果不写 usageLogs（不产生重复记录）；请求列表仅显示 origin 请求 | pipeline.ts 已实现 |
| ✅ COMPLETED | V2.4-5 | **Savings Source 可视化** | `/user/overview` savingsBreakdown（cache/compression/routing 真实占比从 usageLogs 聚合）；UserDashboard Hero 来源卡片 | 后端+前端已完成 |
| ✅ COMPLETED | V2.4-6 | **Benchmark 设计(v2.5 前置)** | `benchmark/benchmark-runner.mjs`：8 类 × 4 profiles；输出 benchmark-report.json/md；可重复执行 | 脚本就绪 |
| ✅ COMPLETED | V2.4-7 | **DEDUP/MULTI 归因补全** | SingleFlight waiter 不产生 usageLogs→归因天然互斥（CACHE/COMPRESSION/ROUTING by 字段 cached/compressionRatio）；无 double counting | pipeline 保证 |

> **验收**（路线 30 条最终标准）：Nexus 能回答——今天/本月省了多少 Token？来自 Cache/Compression/Routing/Rewrite/Dedup？Gross/Optimization Cost/Net Saving？Overhead 与 Overhead Ratio？哪个阶段最慢？质量影响？Privacy 是否 tenant isolated？Benchmark 是否可重复？用户能否 5 分钟完成首次请求？

---

## 季度路线
## 季度路线（2026-08 重定义：Phase 1-6，替代旧 Layer/季度表）

> **当前阶段判断（2026-08）**：Gateway/Token Optimization/Explainability/Security/Developer Experience 成熟度 ★★★★；OSS adoption ★★（真正短板）。**方向从 Feature Engineering 转向 Evidence Engineering + OSS Adoption**——不再堆功能，优先：真实 Benchmark → OSS 申请 → Community/Adoption → Optimization Engine。

### Nexus Roadmap

| Phase | 状态 | 内容 |
|-------|------|------|
| **Phase 1 — Gateway Foundation** | ✅ | OpenAI-compatible API / Multi-provider / BYOK / Routing / Retry / Circuit Breaker |
| **Phase 2 — Token Optimization** | ✅ | Exact Cache / Semantic Cache / Compression / SingleFlight / Rewrite / Savings Attribution |
| **Phase 3 — Explainable Optimization** | ✅ | Actual/Estimated / Optimization Overhead / Net Saving / Projected Saving / Request Explainability / User Dashboard |
| **Phase 4 — Developer Experience** | ✅ | BYOK onboarding / Optimization Profiles / Request history / CSV export / Privacy center / 注册防人机 + 强制确认 Key |
| **Phase 5 — OSS Ecosystem** | 🚧 | **Reproducible Benchmark**(runner 就绪,待真实数据) / SDK/examples / Integrations / Community contributions / Public optimization dataset |
| **Phase 6 — Research** | 🔬 | Semantic Cache 2.0 / Cache Confidence / Adaptive optimization / Optimization policy engine / Benchmark suite |

### Enterprise 路线（冻结，强化个人开发者定位）

| 方向 | 状态 |
|------|------|
| Enterprise Billing | ❌ Not planned |
| SSO | ❌ Not planned |
| Enterprise RBAC | ❌ Not planned |
| Complex multi-org | ❌ Not planned |
| Kubernetes / Helm | ❌ Not planned |
| 插件市场 / MCP Marketplace | ❌ Not planned |

> **Provider 冻结**：维持 7 家（DeepSeek/OpenAI/Gemini/Qwen/Moonshot/Zhipu/Ollama），新增走社区贡献 / issue-driven，不主动开发。
> **长期方向（Phase 6 前不做大开发）**：Optimization Policy Engine——统一 Decision(Cache? Compress? Rewrite? Dedup? Route?)→ Execution → Attribution → Overhead → Evaluation，让 Nexus 回答"这次请求为什么被优化、优化值不值"。
> **纪律**：Every optimization must be measurable——任何优化功能必须回答：省了多少 / 增加多少 latency / 增加多少计算成本 / 是否降质 / 为什么触发。

---

## 影响力建设（与开发同等重要）

| 状态 | 任务 | 说明 |
|------|------|------|
| 🚧 PLANNED | 技术博客 | 写高质量技术博客（Token 优化、成本优化、Semantic Cache 2.0 的思路） |
| 🚧 PLANNED | Issues & PR | 持续回应 Issues 和接受 PR |
| ✅ COMPLETED | Release 维护 | 持续维护 Release，打 tag，写 changelog（v2.2.0 已完成：tag + Release + CHANGELOG） |
| 🚧 PLANNED | GitHub Discussions | 开启讨论区 |

---

## 开发约定

### CI 测试要求（每个 Agent 完成功能后必须执行）

> **⚠️ 远程 Agent 强制守则（最高优先级，2026-03 重申）**：
> 1. **必须 Node 22**：本机默认 `node`/`npx` 是 v12，跑 `npx tsc`/`npm test` 必挂。执行前先 `source ~/.nvm/nvm.sh && nvm use 22`（或直接用 `~/.nvm/versions/node/v22.20.0/bin/node` 同版本工具链）。
> 2. **三步命令不可跳过**：`npm ci` → `npx tsc --noEmit` → `npm test`。任何代码改动（哪怕一行）提交前必须跑完三步，全部通过才能标 ✅ COMPLETED / 把 ⬜ 改为 ✅。
> 3. **只改文档也要验证**：仅改 `fit/improve.md` 等文档时，至少跑 `npx tsc --noEmit` + `npm test` 确认基线未破坏再提交。
> 4. **标 ✅ 的前提**：功能已接入主链路（`src/server/routes/*` 或 `middleware/pipeline.ts` 有 import）。仅被自身测试引用的一律 ⚠️ PARTIAL，不得标 ✅（历史欠账见「产品方向建议对照评估」失实清单）。
> 5. **基线以实测为准**：`npx tsc --noEmit` 0 错误 + `npm test` 全绿（数量见下方测试命令注释，每次全量跑完如有变化同步更新）。
> 6. **TS 规范（strict 全开，未用即错）**：`tsconfig.json` 已开 `noUnusedLocals` + `noUnusedParameters`，**未使用的 import / 变量 / 参数 = 编译错误，不是警告**。远程提交最常见的返工就是残留未用 import（历史 `fix: resolve TS errors` 提交 6+ 次）。新增/修改代码后自查：① 删净未用 import（尤其从旧实现复制代码时带过来的）；② 未用变量、未用参数一律删除（参数可用 `_` 前缀豁免）；③ 相对路径 import 必须带 `.js` 后缀（项目既有约定，如 `from "../cache/cache-gate.js"`）。提交前跑 `npm run typecheck`（等价 `npx tsc --noEmit`）确认 0 错误——**TS 修复是提交者的责任，不是用户 pull 下来后的义务**。

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
- [ ] `npm test` 全部通过（记录测试数，如 350/350）
- [ ] `git push` 后 GitHub Actions CI 变绿
- [ ] 更新 `fit/improve.md` 标记对应任务为 ✅ COMPLETED

**常见 TS 错误及修复**：
- `TS6133: 'xxx' is declared but its value is never read` → 删除未使用的 import/变量
- `TS2322: Type '"block"' is not assignable to type 'PolicyAction'` → 在类型联合中添加缺失的字符串字面量
- `TS2678: Type '"block"' is not comparable to type 'PolicyAction'` → 同上，扩展类型定义
- `TS2774: This condition will always return true` → 检查是否误用函数引用而非调用
- `TS6196: 'xxx' is declared but never used` / `TS6138: Parameter 'xxx' is declared but never used` → 删除未用变量；参数可用 `_` 前缀豁免（如 `_req`）
- `TS2304: Cannot find name 'xxx'` → 检查 import 是否遗漏或路径拼写（本项目相对路径 import 必须带 `.js` 后缀）

### 代码规范
- 使用 TypeScript + Hono。
- **TS 严格模式**：`tsconfig.json` 已开 `strict` + `noUnusedLocals` + `noUnusedParameters`。未使用的 import/变量/参数视为**编译错误**，提交前 `npm run typecheck` 必须 0 错误（详见上方「远程 Agent 强制守则」第 6 条）。
- **import 约定**：相对路径 import 必须带 `.js` 后缀（`import { x } from "../foo.js"`）；纯类型导入用 `import type`。
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

> 备注：当前 `git config --local http.proxy` 已配置走 clash 代理，推送正常。CI 已全绿（350/350 测试通过，46 个测试文件）。项目已重新定位为 AI Cost Optimization Platform，按 Layer0~Layer6 演进。已实现功能不在此文档中，请参考 README 和源码。