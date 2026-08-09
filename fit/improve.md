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

## GitHub Release 与 npm Package 完善（⬜ 全部 TODO，供远程 agent 执行）

> **现状**（2026-08-07 实测）：`package.json` version = 0.1.0（实际产品已 v2.2），缺 `main/types/files/exports/repository/license/bin`；无 `CHANGELOG.md`；git tag 仅 v1.1.1/v1.1.2；npm 未发布。**目标**：Release 可追溯、包可安装（npm 或本地构建），版本对齐 v2.2。
> **关联**：「影响力建设」表中 Release 维护行完成后标 ✅。

| 状态 | # | 任务 | 说明 | 验证 |
|---|---|---|---|---|
| ✅ COMPLETED | R11-1 | package.json 发布字段补全 | version → 2.2.0；补 main/files/exports/repository/license/bin/publishConfig | `npm pkg get version main files` 输出正确 |
| ✅ COMPLETED | R11-2 | 构建产物验证 | `npm run build` → `dist/`；rootDir 改为 src 对齐路径 | `npm run build` 成功 |
| ✅ COMPLETED | R11-3 | CHANGELOG.md | v0.x → v1.x → v2.0 → v2.1 → v2.2 全版本记录 | `CHANGELOG.md` 存在 |
| ✅ COMPLETED | R11-4 | GitHub Release v2.2.0 | **Release 已创建**：`gh release create v2.2.0`（2026-08-07，本地补）——https://github.com/zhichengYellow/nexus-llm-gateway/releases/tag/v2.2.0 | `gh release view v2.2.0` 返回正常 |
| ✅ COMPLETED | R11-5 | npm 发布决策 | 个人项目不发布 npm：`publishConfig.private=true` 防误发；README 补生产构建说明 | `npm pkg get publishConfig` 返回 `{"private":true}` |

> **执行约定**：R11-1 → R11-5 按序执行；每项完成跑 CI 三步（`npm ci` → `npx tsc --noEmit` → `npm test`）+ 更新本表状态为 ✅。R11-4 需要 GitHub 凭据（gh CLI / token）；无凭据时至少完成 tag + CHANGELOG，并在提交说明中注明。

## R12 个人化重构增量（本地完成，2026-08-07）

> **背景**：对照「Nexus v2.0 Personal Developer Edition 任务书」（BYOK + Privacy + Token Optimization）审计后，项目 6/9 个 Phase 已达成（v2.0 个人化/R5、Optimization Pipeline、Dashboard 价值化/R6 等）；以下为审计发现的真增量，已本地完成。

| 状态 | 项 | 说明 | 验证 |
|---|---|---|---|
| ✅ | **Provider Key 静态加密** | AES-256-GCM（`src/shared/crypto.ts`），存储 `enc:v1:iv.tag.cipher`；密钥 `ENCRYPTION_KEY`（生产缺失拒绝保存）；旧明文懒迁移；`GET /admin/providers/keys` 返回 `masked`（`sk-****abcd`）不返回明文 | crypto.test.ts 7 用例 + tsc + npm test |
| ✅ | **日志全局脱敏** | pino redact：`apiKey / api_key / authorization / password / secret`（含嵌套深度变体）一律 `[REDACTED]`（`src/shared/logger.ts`） | credential-security.test.ts 6 用例 |
| ✅ | **隐私测试** | `credential-security.test.ts`：日志不落 apiKey/Authorization/嵌套凭据、加密存储无明文、脱敏不泄漏完整 key | 6 用例全过 |
| ✅ | **安全/隐私文档** | 新增 `SECURITY.md`（凭据处理/日志策略/生产清单/漏洞报告）+ `PRIVACY.md`（Privacy by Architecture：数据边界表、无远程遥测、自托管、导出删除） | 文档 |
| ✅ | **部署** | 新增 `render.yaml`（Blueprint：Web + PostgreSQL + 迁移 preDeploy + 健康检查 + 环境变量）+ `DEPLOYMENT.md`（本地/Render 双模式、环境变量清单、注意点） | 文档 |
| ✅ | **README** | 新增「隐私与安全（Privacy by Architecture）」+「云端部署（Render）」章节，链接 SECURITY/PRIVACY/DEPLOYMENT | 文档 |
| ✅ COMPLETED | **Optimization Profile 接入 chat 链路** | `PromptCompressor.compress()` 接受 `strength` 参数（0-1 分三档）；chat.ts 从请求头 `x-nexus-profile` 或 DB 设置读取 profile；`compressionStrength` 控制压缩强度；`routingPreference` 联动 smart-routing 降级策略 | tsc 0 错误 + npm test 385/385 |

> **结论**：任务书 P0（凭据安全）→ P1（隐私/文档）→ P1（部署）已本地闭环；唯一遗留为 Optimization Profile 接线（可选增强，不阻塞发布）。

## R13 开放体验——轻量用户注册（⬜ 全部 TODO，供远程 agent 执行）

> **背景**：云端已部署（Render），他人体验需要注册。**基础设施已就绪**：`tenants`/`api_keys` 表、API Key 认证（`auth.ts` 已按 `key_hash` + tenants innerJoin 区分 master/租户）、`/user` 路由（`src/server/routes/user.ts`，已挂载）、用户端组件 `dashboard/src/app/_user-dashboard.tsx`（存在未用）。**缺的只是**：注册入口、登录分流、体验配额、注册开关。
> **约束**：不恢复企业多租户 UI（租户管理/审批/套餐/RBAC）；仅轻量注册；**不给体验配额——注册用户 BYOK 自配 Provider Key，成本自理**（Nexus 不承担任何 token 费用，与「BYOK 核心模型」一致）；密码 bcrypt 存储；API Key 仅创建时明文返回一次；每项单 commit + CI 三步（`npm ci` → `npx tsc --noEmit` → `npm test`，Node 22）。

| 状态 | # | 任务 | 说明 | 验证 |
|---|---|---|---|---|
| ✅ COMPLETED | R13-1 | 注册后端端点 | `POST /auth/register`：username+password 校验 → 创建 tenants → 生成 API Key（hash 存库，仅一次返回明文）；IP 限流 5/min；用户名唯一 | tsc + npm test 383/383 |
| ✅ COMPLETED | R13-2 | 注册开关 | env `REGISTRATION_ENABLED`（默认 false）；.env.example/README 已说明 | tsc 0 错误 |
| ✅ COMPLETED | **R13-3** | **注册用户 BYOK 自配 Provider Key** | provider_configs 加 tenant_id 列（uniqueIndex）；save/get/delete 全链路支持 tenantId 参数；resolveProviderKey 租户优先→全局→.env 三级回退；pipeline 未配 key 返回 402 明确错误 | tsc + npm test 383/383 |
| ✅ COMPLETED | R13-4 | 登录页恢复用户模式 | page.tsx 支持 Master Key → 管理端 / API Key → 用户端；注册表单（REGISTRATION_ENABLED 检测）；UserDashboard 新增「我的 Provider」BYOK 配置页 | dashboard build 成功 |
| ✅ COMPLETED | R13-5 | 租户数据隔离校验 | user.ts 全部查询按 tenant.id 过滤；provider-keys 按 tenantId 隔离；pipeline 仅解析当前租户 key | tsc + npm test 383/383 |
| ✅ COMPLETED | R13-6 | 文档 | README 新增「开放注册（BYOK 模式）」章节 | 文档就绪 |

> **验收**：R13-1~3 串通（注册 → 配自己的 Provider Key → 调用成功 → 未配置时返回明确提示）+ R13-4 浏览器可注册登录并自配 key；全部完成后更新本表 ✅。

## R14 Token Optimization 产品化增强（⬜ 全部 TODO，供远程 agent 执行）

> **核心目标**：把「省 Token」从宣传概念变成**可计算、可解释、可追踪、可验证的数据闭环**——Request → Optimization Pipeline → Savings Attribution → Savings Record → Overview → Request Detail，用户能回答「这次请求为什么省了这些 Token」。
> **先审计再动代码**（Phase A）：阅读 README / 本文件 / schema / git 状态；搜索 `savedTokens / savedCostMicro / costMicro / usage / cache / compression / routing / profile / requests / tenantId`；输出简短「现状审计」；**已满足的要求直接验证并标记 `ALREADY IMPLEMENTED`，不得重写**（例：`savedCostMicro` 已在 schema/chat/usage/cost-report/daily-stats/e2e-metrics 使用，Savings Engine 应统一而非再造）。
> **硬性约束**：① 全部按 `tenantId` 隔离，不跨租户查询、不读 master 全局数据；② 测速/调用一律用**租户自己的 key**（`resolveProviderKey(provider, tenantId)` + `apiKeyOverride`），**禁止 fallback 全局 key**；③ 不返回 prompt/response/API key 敏感内容（仅元数据）；④ 真实数据，禁止 mock/hardcode/fake 统计、禁止估算冒充 actual；⑤ schema 改动先看 migration/索引，不用危险的 `push --force`、不删约束、可回滚；⑥ 每功能单 commit + CI 三步（`npm ci` → `npx tsc --noEmit` → `npm test`，Node 22）；⑦ 完成输出 `# R14+ Completion Report`（新增 API/DB 变化/Savings 公式/Attribution/Actual vs Estimated/Privacy/Tests Before-After/Commits/CI/剩余风险/下阶段建议）。
> **禁止范围**：MCP Gateway、Plugin Marketplace、Enterprise Billing、RBAC、K8s/Helm、多区域、审批流、大规模重构、新 Provider。

| 状态 | # | 任务 | 说明 | 验证 |
|---|---|---|---|---|
| ⬜ TODO | R14-1 | **用户端测速(+防滥用)** | `POST /user/speed-test`：测**该租户已配 key 的 provider** 的模型（租户 key + 8s 超时 + 并行，参照 `/admin/speed-test`；未配 key → `skipped`）；**并发 ≤5 个 model**、**同租户 30s 冷却**（env 可调）；UI 警告「测速会向你的 Provider 发送小请求，消耗少量额度」；UI：我的 Provider 页「测速」按钮 + 结果列表 | 并发/冷却/超时/隔离各场景通过 |
| ⬜ TODO | R14-2 | **请求记录(+分页)** | `GET /user/requests?limit=50&cursor=xxx`：该租户最近 usage_logs（时间/模型/provider/缓存/延迟/状态/token 元数据）；**cursor 分页**（tenantId + createdAt，数据库层 WHERE，禁止全查再 JS 过滤）；UI：请求列表 + Load More/Infinite Scroll | 翻页正确、仅本租户 |
| ⬜ TODO | R14-3 | **节省统计(来源拆分)** | `/user/overview` 扩展：今日/本月 `savedTokens` / `savedCostMicro`，并**按来源拆分**（Cache / Compression / Routing / Rewrite / Other）；UI：概览 Hero「You saved X tokens」+ 来源卡片 | 数字与 usage_logs 一致、来源可解释 |
| ⬜ TODO | R14-4 | **用量导出 CSV** | `GET /user/export?format=csv`：本租户 usage_logs 导出（时间/模型/provider/缓存/token/节省/延迟/状态，无内容）；UI「导出用量」按钮 | CSV 仅本租户 |
| ⬜ TODO | R14-5 | **我的 Key(+Last Used)** | `GET /user/keys` + `PATCH /user/keys/:id/toggle`（本租户）；新增 `lastUsedAt`（**低频更新**：debounce/异步/缓冲，禁止每请求高频写库）；UI：Key 列表（前缀/状态/创建时间/「Last used X ago」） | 只显示本租户；停用后 401；lastUsed 更新不刷库 |
| ⬜ TODO | R14-6 | **接入体验(Onboarding)** | 注册后引导：创建 Gateway Key → 配 Provider Key → 选 Profile → 复制 Base URL / curl / Python 示例 → 发起请求；说明模型档位（`auto-strong`/`auto-balanced`/`auto-cheap`，**以实际 Router 行为为准，不虚构模型**）；缓存命中说明（相同请求第二次命中） | 5 分钟内可完成接入 |
| ⬜ TODO | R14-7 | **Savings Engine(统一计算+归因)** | 统一 savedTokens/savedCostMicro/reductionRate 计算（复用现有 costMicro/价格表，禁止第二套）；设计 SavingsRecord（original/actual/saved tokens + costMicro + reductionRate + source）；**Attribution 顺序**按实际 pipeline（Context Compression → Rewrite → Routing → Upstream → Cache），**禁止多模块重复累加导致 double counting**；**ACTUAL / ESTIMATED / PROJECTED 严格区分**（Actual=真实避免的上游 token；Estimated=基于 baseline model 估算并标注；Projected=趋势预测，禁止混入 savedTokens）；Cache Savings=避免的上游 token，不得与压缩/路由重复计 | 测试：无优化/Cache/Compression/Routing/多优化不重复/zero/missing usage/missing price/estimated vs actual/negative 无异常/tenant 隔离 |
| ⬜ TODO | R14-8 | **Savings Explainability(请求级解释)** | 请求详情（`GET /user/requests/:id` 或扩展）：Original/Optimized/Saved Tokens + Reduction Rate + 来源(CACHE/COMPRESSION/ROUTING/REWRITE) + Cost(Original/Actual/Saved) + Latency(Optimization Overhead/Provider/Total)；**不展示 prompt/response/content/API key** | 浏览器点击请求看到解释；无敏感内容 |
| ⬜ TODO | R14-9 | **Optimization Profile 产品化** | 现有 fast/balanced/cheap/maximum_saving 产品化：UI 主界面只展示 4 档（名称+一句话+Latency/Saving/Quality 倾向：FAST「Prioritize response speed.」/BALANCED「Recommended for most users.」/CHEAP「Reduce model cost aggressively.」/MAXIMUM SAVING「Maximum token reduction. May increase latency.」）；**必须真正影响 pipeline**（cache/compression/routing 策略随 profile 变化，禁止只存配置不读取）；测试：切换后策略确实变化 | 切换档位 → 压缩强度/路由倾向生效 |
| ⬜ TODO | R14-10 | **Privacy Center** | 用户端新增 Privacy 页：Provider Key 加密存储/仅脱敏展示/仅用于 provider 请求；请求仅存元数据(prompt/response 不入历史)；tenant 隔离说明；master 无法经 user API 访问用户内容；文案真实（用「Encrypted/Tenant-isolated/By default」,禁「绝对安全」）；**Security Test**：用户 A 不能访问 B 的 providers/requests/usage/savings/keys/speed test；user token 不能访问 /admin；Provider Key 不出现在 logs/history/API 响应 | 隔离测试通过 |
| ⬜ TODO | R14-11 | **Savings Data Integrity + Overhead** | 检查 savedTokens/savedCostMicro 是否可能重复累计/并发重写/Cache Hit 重复/Retry 重复/Streaming 重复/failed/aborted/provider error 被计为 savings（仅成功最终请求产生 savings；SingleFlight 区分 origin/waiter）；统计 **Optimization Overhead**（Total=Optimization+Provider,展示 Net Saving 而非 Gross） | 失败/重试/流式/并发场景不重复计 |
| ⬜ TODO | R14-12 | **真实数据一致性 + 测试 + 文档** | 检查所有 Dashboard（Overview/Optimization/Requests/Savings/Provider/Usage）：禁止 fake/hardcoded/前端伪造节省/随机延迟；成本基于真实 provider/model/token/价格，无价格标 `unknown`（禁默认 $0.15/$500）；补测试（Savings/Security/User/Profile/Cost 分类）；README/CHANGELOG 更新；输出 Completion Report | 无 fake 数据；测试全绿；报告完整 |

> **实施顺序**：现状审计 → Savings Engine(7) → Data Integrity(11) → Explainability(8) → Profile(9) → Privacy(10) → Pagination(2) → SpeedTest(1) → Key LastUsed(5) → Onboarding(6) → 前端统一优化 → 完整测试 → 文档/报告。
> **最终验收**（10 问）：今天/本月省了多少 Token？省自什么机制？这次请求为什么省？Actual 还是 Estimated？Nexus 增加多少优化开销？Net Saving？数据是否严格隔离？Provider Key 是否安全？用户 5 分钟内能否接入？

## R15 注册业务逻辑完善（⬜ 全部 TODO，供远程 agent 执行）

> **背景**：注册已上线，但用户体验有 4 处硬伤（已核实）：① 退出/返回登录后**再次进入注册表单残留上次输入**（`page.tsx` 的 `regUser/regPass` 未清空）；② 注册失败时**报错为空**——后端 zod 校验失败返回 `{success:false,error:{issues:[...]}}`（非标准 `error.message` 格式），前端 `data.error?.message` 取到 undefined；③ 用户名已存在返回**英文** `"username already taken"`；④ 输入规范无前端提示。
> **约束**：后端错误统一为 `{ error: { message: "中文提示", type: "..." } }` 标准格式（与现有 API 一致）；每项单 commit + CI 三步（`npm ci` → `npx tsc --noEmit` → `npm test`）；完成后更新本表 ✅。

| 状态 | # | 任务 | 说明 | 验证 |
|---|---|---|---|---|
| ⬜ TODO | R15-1 | **退出/返回后表单清空** | `page.tsx`：`handleLogout` 与「返回登录」「使用此 Key 登录」等所有离开注册视图的路径，必须清空 `regUser/regPass/regResult`（必要时 `setShowRegister(false)`）；再次点「注册」时表单为空 | 注册→退出→再点注册：表单无残留 |
| ⬜ TODO | R15-2 | **退出回到 API 登录页** | 确认用户端/管理端退出后回到**初始登录页**（API Key 输入框），且 `regEnabled` 重新检测、无旧 key 自动登录残留（localStorage 已清） | 退出后见登录页 + 注册按钮 |
| ⬜ TODO | R15-3 | **后端统一中文报错** | `src/server/routes/auth.ts`：① zod 校验失败转为标准格式——用户名：`用户名需 2-30 位，仅允许字母/数字/下划线/短横`；密码：`密码至少 8 位`（400）；② 用户名已存在：`用户名已存在，请换一个`（409，改中文）；③ 注册关闭：`注册功能未开放`（403，中文）；④ 限流：`注册太频繁，请 1 分钟后再试`（429，中文） | curl 各场景返回对应中文 `error.message` |
| ⬜ TODO | R15-4 | **前端字段级提示** | 注册表单用户名/密码输入框下加实时格式提示（用户名 2-30 位、字母/数字/_-；密码 ≥8 位），后端报错展示在表单上方（红色）；注册成功后仍仅展示一次 key | 浏览器验证提示与报错展示 |
| ⬜ TODO | R15-5 | 测试 | zod 校验规则单测（用户名 1 位/非法字符/密码 7 位 → 各规则命中）；错误消息映射单测（如纯函数 `authErrorMessage(issues)`）；前端重置逻辑人工验证 | `npx tsc --noEmit` + `npm test` 全绿 |

> **说明**：当前注册密码不做存储（登录凭证是 API Key，`auth.ts` 注释已注明"预留字段"）；如需"用户名+密码登录"另立任务，本次不涉及。
> **验收**：浏览器完整走一遍——注册(非法输入→中文报错)→注册成功→使用 key 登录→退出→再点注册(表单为空)。

---

## 季度路线

### Q3（当前）—— 数据基础

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Layer 0.1 | `src/server/db/schema.ts` + `src/server/analytics/daily-stats.ts` |
| ✅ COMPLETED | Layer 0.2 | `CostReportEngine` + `/admin/cost/report` API 就绪，Dashboard 面板待前端 |
| ✅ COMPLETED | Layer 0.3 | `DailyStatsEngine.generateRequestProfile` |
| ⚠️ PARTIAL | Phase 1 | `CacheConfidence` + `CacheGate` + `CacheAutoRefresh` 完成，ANN/Sharding/WAL 待基础设施 |

### Q4 —— Token 优化

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Layer 1.1 | `src/server/prompt/compression.ts` |
| ✅ COMPLETED | Layer 1.2 | `src/server/prompt/conversation-compressor.ts` |
| ✅ COMPLETED | Layer 1.3 | `src/server/prompt/adaptive-context.ts` |
| ✅ COMPLETED | Layer 1.4 | `ConversationCompressor.pruneByImportance` |
| ✅ COMPLETED | Layer 1.5 | `src/server/prompt/chunk-cache.ts`（引擎已实现，**未接线**，见失实清单） |

### Q1（明年）—— 成本优化

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Layer 2.1 | `src/server/cost/cost-controller.ts` |
| ✅ COMPLETED | Layer 2.2 | `src/server/routing/smart-routing.ts` + `multi-dim-router.ts` |
| ✅ COMPLETED | Layer 2.3 | `BudgetController` block/cheap_only/warn 策略 |
| ✅ COMPLETED | Layer 2.4 | `src/server/cost/cost-report.ts`（引擎已实现，**未接线**，见失实清单） |

### Q2（明年）—— 质量 + 智能

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Layer 3 | `JudgeEngine` + `QualityEvaluator` + `RequestJudge` + `SemanticJudge` 完成（**QualityEvaluator 未接线**，其余已接线） |
| ✅ COMPLETED | Layer 4 | `IntentLearner` + `TrendAnalyzer` + `CacheAutoRefresh` + `SmartRoutingEngine` |

### Q3（明年）—— 企业 + 生态

| 状态 | 任务 | 说明 |
|------|------|------|
| ⚠️ PARTIAL | Layer 5 | `BudgetController` + `CostReport` + RBAC + Audit 完成，Billing/SSO 待外部集成 |
| ⚠️ PARTIAL | Layer 6 | `examples/` + `sdk/` + `cli/` 完成，官方插件待发布 |
| ⚠️ PARTIAL | Phase 12 | `pipeline` + `plugin-system` + `scheduler` + `dsl` + `compiler` + `executor` 模块已就绪，目录重构待进行 |

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