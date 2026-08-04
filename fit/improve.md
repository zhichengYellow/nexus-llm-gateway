# Nexus - AI Cost Optimization Platform

> **愿景**：用最少的钱，获得尽可能接近最好的效果。
> **定位**：一个以 Token 和成本优化为核心的 AI Gateway。
> **当前状态**：v2.0，CI 全绿，334/334 测试通过（44 个测试文件）。
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
| `⬜ TODO` | 未开始 | 全部任务已完成或已规划 |
| `🚧 IN_PROGRESS` | 进行中 | 正在开发中 |
| `❌ BLOCKED` | 阻塞 | 有依赖项未完成，无法开始 |
| `⚠️ PARTIAL` | 部分完成 | 基础框架已搭建，但功能不完整 |

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
| 状态 | ✅ COMPLETED |
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
| 状态 | ✅ COMPLETED |
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
| 状态 | ✅ COMPLETED |
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

## 必要未完成 TODO（基础设施）

| 状态 | 任务 | 说明 |
|------|------|------|
| ⚠️ PARTIAL | Phase 1 | `CacheConfidence` + `CacheGate` + `CacheAutoRefresh` 完成 |
| ⚠️ PARTIAL | Phase 12 | 核心模块已就绪，目录重构待进行 |

---

## 配置层补全（当前缺口，⬜ 全部 TODO）

> **背景**：Layer 0~4 的功能引擎已实现（105 ✅），但**未真正接入请求链路与配置层**，省 token 能力尚未在线上生效。以下为必须补全的配置项，按优先级排列。

### C1. 接入 chat 请求链路（最高优先级）

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | C1.1 压缩接入 | 在 `src/server/routes/chat.ts` 请求进入时调用 `compression.ts`（Prompt Compression）+ `conversation-compressor.ts`（历史摘要）+ `adaptive-context.ts`（动态上下文） |
| ✅ COMPLETED | C1.2 缓存门控接入 | 用 `cache-gate.ts`（CacheGate）替换当前 chat.ts 里的 `lookup` 直查，加入 confidence 决策（直接返回 / 返回+异步刷新 / 重新生成） |
| ✅ COMPLETED | C1.3 智能路由接入 | 在 `model=auto` 分支调用 `smart-routing.ts`（SmartRoutingEngine）+ `multi-dim-router.ts`（质量评分）替代硬编码路由 |
| ✅ COMPLETED | C1.4 成本控制接入 | 在每次请求前后调用 `cost-controller.ts`（BudgetController 预算检查/降级）与 `cost-optimizer.ts`（token 预估） |
| ✅ COMPLETED | C1.5 质量评估接入 | 响应生成后调用 `judge/quality-evaluator.ts` 记录质量分，供 Router 学习 |
| ✅ COMPLETED | C1.6 门控逃生开关 | 请求头 `x-nexus-no-optimize: 1` 强制跳过压缩/门控，保障异常恢复 |

**验收标准**：
- 压缩/缓存门控/智能路由/成本控制/质量评估**全部执行**（通过日志或 metrics 可见）
- 全链路 TRR/CSR/QPS 可测量

### C2. 补充 DB 表（schema.ts 仅 6 张旧表，缺新模块存储）

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | C2.1 requestProfiles 表 | 请求画像存储（intent 类型分布 / provider 偏好 / token 趋势），供 Layer 0.3 |
| ✅ COMPLETED | C2.2 costReports 表 | 每日成本聚合结果存储（按 provider/model/intent），供 Layer 2.4 |
| ✅ COMPLETED | C2.3 optimizationStats 表 | TRR/CSR/QPS 指标快照（每日），供趋势分析与 Dashboard |
| ✅ COMPLETED | C2.4 chatMemories 表 | AgentMemory 持久化（当前纯内存，重启丢失） |
| ✅ COMPLETED | C2.5 迁移脚本 | `drizzle-kit generate + push` 生成并应用新表迁移 |

**验收标准**：
- `npm run db:push` 成功后 schema 含 10+ 张表
- 新表可被对应 engine 正常读写

### C3. 补充 config.ts + .env.example 调优参数

| 状态 | 变量 | 说明 | 默认值 |
|------|------|------|--------|
| ✅ COMPLETED | COMPRESSION_ENABLED | Prompt Compression 总开关 | true |
| ✅ COMPLETED | CONVERSATION_COMPRESS_KEEP_RECENT | 对话压缩保留最近轮数 | 2 |
| ✅ COMPLETED | CONVERSATION_COMPRESS_MAX_SUMMARY_ROUNDS | 摘要覆盖最大轮数 | 18 |
| ✅ COMPLETED | ADAPTIVE_CONTEXT_ENABLED | 动态上下文开关 | true |
| ✅ COMPLETED | CHUNK_CACHE_ENABLED | Chunk 级缓存开关 | true |
| ✅ COMPLETED | CACHE_GATE_CONFIDENCE_HIGH | 缓存门控高置信度阈值 | 0.9 |
| ✅ COMPLETED | CACHE_GATE_CONFIDENCE_LOW | 缓存门控低置信度阈值 | 0.7 |
| ✅ COMPLETED | SMART_ROUTING_ENABLED | 智能路由开关（model=auto） | true |
| ✅ COMPLETED | BUDGET_BLOCK_THRESHOLD | 预算封锁阈值（0~1，超则 block） | 1.0 |
| ✅ COMPLETED | BUDGET_CHEAP_ONLY_THRESHOLD | 预算降级阈值（0~1，超则仅用便宜模型） | 0.8 |
| ✅ COMPLETED | QUALITY_JUDGE_ENABLED | 响应质量评估开关 | false（避免额外延迟） |
| ✅ COMPLETED | OPTIMIZE_METRICS_ENABLED | 采集 TRR/CSR/QPS 指标开关 | true |

**验收标准**：
- `config.ts` 新增配置项均可从环境变量读取，`.env.example` 同步补充
- 每个开关默认值保证兼容旧行为（全开仍走原有逻辑）

### C4. 注册新 API 端点（让 Dashboard 消费新能力）

| 状态 | 端点 | 说明 |
|------|------|------|
| ✅ COMPLETED | `GET /admin/optimization/stats` | TRR/CSR/QPS 指标（来自 optimizationStats 表） |
| ✅ COMPLETED | `GET /admin/optimization/suggestions` | 优化建议（TrendAnalyzer.generateSuggestions） |
| ✅ COMPLETED | `GET /admin/cost/report` | 成本报告（已存在 `/admin/cost/report`，补 Dashboard 面板） |
| ✅ COMPLETED | `GET /admin/cache/confidence` | 缓存置信度分布（CacheGate） |
| ✅ COMPLETED | Dashboard 面板 | 运营分析标签页已实现（TRR/CSR/QPS 指标、成本趋势、节省来源、模型排行、Provider 分布、优化建议、热点缓存、租户用量） |

**验收标准**：
- 新端点鉴权走 master key
- Dashboard 可展示 TRR/CSR/QPS + 成本节省来源

### C5. 配置文件同步收尾

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | C5.1 README 补充 | 新增配置项说明、opt-out 头、TRR/CSR/QPS 查看方式 |
| ✅ COMPLETED | C5.2 `.env.example` 注释 | 每个新变量补充中文注释与建议值 |
| ✅ COMPLETED | C5.3 端到端接入测试 | 新增 chat 链路集成测试，验证压缩→门控→路由→计费全链路 |
| ✅ COMPLETED | C5.4 CI 覆盖 | 确保新 schema 迁移在 CI 可跑（若 CI 无需 DB 则跳过） |

**验收标准**：
- CI 全绿（334/334 + 新增测试）
- 配置层与功能代码同步，无遗留缺口

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
| ✅ COMPLETED | Layer 1.5 | `src/server/prompt/chunk-cache.ts` |

### Q1（明年）—— 成本优化

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Layer 2.1 | `src/server/cost/cost-controller.ts` |
| ✅ COMPLETED | Layer 2.2 | `src/server/routing/smart-routing.ts` + `multi-dim-router.ts` |
| ✅ COMPLETED | Layer 2.3 | `BudgetController` block/cheap_only/warn 策略 |
| ✅ COMPLETED | Layer 2.4 | `src/server/cost/cost-report.ts` |

### Q2（明年）—— 质量 + 智能

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Layer 3 | `JudgeEngine` + `QualityEvaluator` + `RequestJudge` + `SemanticJudge` 完成 |
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
| 🚧 PLANNED | Release 维护 | 持续维护 Release，打 tag，写 changelog |
| 🚧 PLANNED | GitHub Discussions | 开启讨论区 |

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

> 备注：当前 `git config --local http.proxy` 已配置走 clash 代理，推送正常。CI 已全绿（266/266 测试通过）。项目已重新定位为 AI Cost Optimization Platform，按 Layer0~Layer6 演进。已实现功能不在此文档中，请参考 README 和源码。