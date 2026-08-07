# Nexus - AI Cost Optimization Platform

> **愿景**：用最少的钱，获得尽可能接近最好的效果。
> **定位**：一个以 Token 和成本优化为核心的 AI Gateway。
> **当前状态**：v2.1，CI 全绿，362/362 测试通过（48 个测试文件）。P0/P1/P2 生产 Bug 审计全部修复。
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
| Prompt Compression | `src/server/prompt/compression.ts` | chat.ts |
| Conversation Compression | `src/server/prompt/conversation-compressor.ts` | chat.ts |
| Adaptive Context | `src/server/prompt/adaptive-context.ts` | chat.ts |
| Cache Confidence | `src/server/cache/cache-confidence.ts` | cache-gate |
| Cache Gate | `src/server/cache/cache-gate.ts` | chat.ts |
| Cache Auto Refresh | `src/server/cache/cache-auto-refresh.ts` | chat.ts / admin |
| Smart Routing | `src/server/routing/smart-routing.ts` | chat.ts |
| Multi-Dim Router | `src/server/prompt/multi-dim-router.ts` | 经 smart-routing |
| Cost Controller | `src/server/cost/cost-controller.ts` | chat.ts |
| Request Judge | `src/server/judge/request-judge.ts` | chat.ts / admin |
| Intent Learning | `src/server/prompt/intent-learning.ts` | 经 smart-routing |
| Trend Analyzer | `src/server/analytics/trend-analyzer.ts` | admin |
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

## 产品方向建议对照评估（已执行，结论固化）

> **背景**：外部产品建议（四类功能框架 / 8 个新方向 / TOE / 指标体系）已对照真实代码逐条核验。**结论：骨架全部已落地，真正未做的只有 3 项；但规划文档存在标注失实（标 ✅ 未接线），P0 必须先修正，否则持续误导后续 Agent。**
> **对后续 Agent 的强制要求**：依赖本文档任何 ✅ COMPLETED 状态前，必须 grep 验证接线（`grep -rn "模块名" src --include="*.ts" | grep -v test`），不得直接信文档标注。

### 建议 vs 现状对照

| 建议 | 现状 | 结论 | 证据 |
|---|---|---|---|
| 产品减法（砍 RBAC/SSO/Billing 等） | 已落地且更彻底 | ✅ 无需再做 | 上方「主方向与拓展区（隔离）」+ Phase 1 清理残留 |
| Optimization Pipeline（所有功能入链） | 已落地 | ✅ | `chat.ts:11-22` 接线 10 个核心优化模块 |
| 四类功能分类（Token/Request/Cost/Quality） | 用 Layer 0-6 组织 | 🟡 实质等价，仅表述差异 | — |
| TRR/CSR/QPS 指标 | 已落地为北极星 | ✅ | 「核心指标定义」+ `e2e-metrics.ts` |
| 目录重构 `optimizer/` | 已规划执行中 | ✅ | 「v2.0 目录重构执行计划」 |
| TOE | 名义完成（SmartRoutingEngine 整合） | 🟡 非全链路决策中枢 | R4 |
| Prompt Compression + System Prompt 压缩 | 已落地 | ✅ | `compression.ts` + chat.ts:14 |
| Selective Context（Embedding TopK 选轮次） | 规则版已落地（摘要/动态轮数/重要性剪枝），检索版未做 | 🟡 增量：要做就做「摘要+检索混合」，不做纯 TopK | conversation-compressor / adaptive-context / pruneByImportance |
| Provider Recommendation（UI 告知「推荐 XX 便宜 73%」） | 服务端引擎有（CostEstimator），UI 无 | 🟡 增量 P2 | smart-routing + cost-controller；dashboard 无推荐文案 |
| Cost Before Request（请求前预览成本） | 引擎已有，无预览端点 | 🟡 增量 P1 | CostEstimator 在 `cost-controller.ts` |
| Prompt Fingerprint | 已被 Canonical Key + TF-IDF 初筛 + Judge 判定覆盖 | 🟡 **不建议做** | cache-gate.ts:16-17 |
| Optimization Report（Dashboard 汇总） | 大部分落地 | ✅ | `/admin/optimization/stats` + suggestions |
| Optimization Profile（Fast/Cheap 档位） | 未做 | ❌ 增量 P1 | BudgetController 是预算降级，非用户档位 |
| Optimization Replay（调试重放） | 未做 | ❌ 增量 P2（开发工具价值，与北极星不挂钩） | — |

### 标注失实清单（⚠️ P0：必须修正，防误导）

> 以下模块文档标 ✅ COMPLETED / 声称已接入，**实测只被自身测试文件引用，未接入主链路**。修正后统一 ⚠️ PARTIAL；重新激活需走「拓展区重新激活流程」（评估 TRR/CSR/QPS 收益 → 接入 Pipeline → 更新状态）。

| 模块 | 文档原标注 | 实测 |
|---|---|---|
| `prompt/cost-optimizer.ts` | C1.4 声称已接入 chat 链路 | 未接线；chat.ts 实际接线的是 `cost-controller.ts` 的 CostEstimator |
| `prompt/chunk-cache.ts` | Layer 1.5 ✅ | 未接线（Layer 1.5 状态已改 ⚠️） |
| `prompt/adaptive-ttl.ts` / `rewrite.ts` / `quality-score.ts` / `guard.ts` | 未接线（拓展区清单 66 行已标 ⏸；其余位置有 ✅ 残留需核对） | 维持 ⏸ |
| `routing/parallel-generator.ts` | Layer 3.2 ✅ | 未接线 |
| `cost/cost-report.ts` | Layer 2.4 ✅ | 未接线；`/admin/cost/report` 是 admin.ts 直接查库实现，未用该引擎 |
| `judge/quality-evaluator.ts` | C1.5 声称已接入 | 未接线；实际接入的是 `judge/request-judge.ts` |

> **例外（确实接线，勿改）**：`judge/semantic-judge.ts`（cache-gate.ts:17）、`cache/embedding-screener.ts`（cache-gate.ts:16）。admin 路由的 daily-stats / trend-analyzer 为**动态 import**（admin.ts:619/636），顶层 import grep 不可见，属正常接线。

### 不做的方向（批判结论）

1. **Prompt Fingerprint**：Canonical Key + TF-IDF 初筛 + LLM Judge 三级判定已覆盖其意图；SimHash 类指纹对中文短文本易误合并，收益低。
2. **Selective Context 纯 Embedding TopK**：embedding 调用增加延迟与成本，与省钱目标矛盾；对话相关性顺序敏感，TopK 会切断因果链；个人开发者轮数 < 20 收益有限。
3. **Optimization Replay**：开发工具价值 > 用户价值，需存原始 prompt（隐私+存储成本），与 TRR/CSR/QPS 不挂钩，放 later。

### 增量任务清单（⬜ 全部 TODO，按优先级）

| 状态 | 任务 | 说明 | 验证 |
|---|---|---|---|
| ✅ COMPLETED | P0：修正本文件失实标注（**已改**：C1.4 / C1.5 / Layer 1.5 表格 / Layer 2.4 表格 / Layer 3.2 表格 / 季度路线 Q4-Layer1.5 / Q1-Layer2.4 / Q2-Layer3；**待核对**：其余失实 ✅ 残留，失实清单 9 个模块统一 ⚠️ PARTIAL） | grep 确认无失实 ✅ 残留 |
| ✅ COMPLETED | P1：Cost Before Request | 新增成本预估端点（复用 CostEstimator）+ dashboard 输入框预览 | `npx tsc --noEmit` + `npm test` + 手动 curl |
| ✅ COMPLETED | P1：Optimization Profile | 定义 Fast/Balanced/Cheap/Maximum Saving 档位，联动压缩强度/缓存策略/路由目标/质量门槛 | `npx tsc --noEmit` + `npm test` |
| ✅ COMPLETED | P2：Provider Recommendation | dashboard 展示推荐模型 + 预计节省；**上线前先修计价显示虚高 bug**（`daily-stats.ts:59` 的 `savedCost = totalCost × savedTokens/totalTokens` 比例估算：缓存命中多、真实请求少时 savedTokens≫totalTokens 导致虚高，且缓存命中路径不写 savedTokens） | `npx tsc --noEmit` + `npm test` |

> **执行顺序强制**：P0 先行（防止后续 Agent 被误导）→ 每个 P1/P2 完成必须跑 CI 三步 → 更新本表状态。

---

## 产品建议二轮对照评估（Benchmark / RFC / Optimization Engine，已评估）

> **背景**：第二轮外部建议聚焦「建立 Benchmark 与研发流程，All-in Optimization」。核验结论：**定位与开发原则已采纳；4 个真增量待做，最高优先级是质量 Benchmark（R1）。**
> **与一轮建议的关系**：一轮已固化「Optimization Pipeline + TRR/CSR/QPS 北极星 + 增量 P0-P2」；本轮在其上补「研发方法」：Benchmark 量化 → RFC 决策 → Lab 实验隔离。

### 建议 vs 现状对照

| 建议 | 现状 | 结论 |
|---|---|---|
| 不追 LiteLLM，赛道定位 Optimization | ✅ README 已定位（Save 30-80% LLM Cost） | 无 |
| 每个 Feature 先回答三问（减多少 / 质量掉多少 / 进 Core 吗） | ✅ 已是开发原则（「核心指标定义」） | 无 |
| 四阶段：Understanding → Optimization → Evaluation → Learning | 🟡 Optimization/Learning 已有；Understanding（请求分析）、Evaluation（质量基准）缺 | 增量 R1 / R2 |
| 质量 Benchmark（1000 条真实 Prompt，对比 Token/成本/质量） | ❌ 只有**性能压测**（`benchmark/offline\|cache\|load\|auto-benchmark.mjs`），无优化质量基准 | **增量 R1（最高优先）** |
| Optimization Lab（labs/ 实验隔离） | 🟡 `src/extensions/` 已承载隔离，缺「实验→Benchmark→三问→进 Core」流程 | 增量 R4 |
| RFC 流程（先 RFC 后开发） | 🟡 `docs/adr/` 已有 6 个 ADR，可扩展为 RFC | 增量 R3 |
| Optimization Engine v1（含 Token 构成分析） | 🟡 R4 TOE 名义完成（SmartRoutingEngine + e2e-metrics 4 测量点），缺「逐段 Token 构成分析」 | 增量 R2 |

### 增量任务清单（⬜ 全部 TODO，按优先级）

| 状态 | 任务 | 说明 | 验证 |
|---|---|---|---|
| ✅ COMPLETED | **R1：质量 Benchmark** | `benchmark/prompts/` 建真实 Prompt 数据集（分类：代码/翻译/数学/聊天/Agent/RAG，先 ≥300 条、目标 1000，可含从 usageLogs 采样的脱敏 prompt）；新增 `benchmark/quality-benchmark.mjs`：每条 prompt 跑「压缩 → 缓存 → 路由」优化前后对比，输出 Token / Latency / Cost / Quality 汇总表（Quality 先用 rule-based，如编辑距离/关键词命中；LLM Judge 版后续迭代，避免基准依赖 API 成本）；接入 `.github/workflows/benchmark.yml` | `node benchmark/quality-benchmark.mjs` 输出汇总 + CI 绿 |
| ✅ COMPLETED | **R2：Request Analysis（Token 构成）** | 在 e2e-metrics entry 测量点统计逐段 Token 构成（system / history / user / tool / output 各占比），输出「哪里浪费最多」，供 R1 与后续优化决策；注意与 usageLogs 字段对齐 | `npx tsc --noEmit` + `npm test` + 手动请求观察构成输出 |
| ✅ COMPLETED | R3：RFC 流程 | 新增 `docs/rfc/` + RFC 模板（目标 / 预计减 Token / 质量风险 / 方案 / Benchmark 依据）；新功能先 RFC 后开发，ADR 保留为决策记录 | 文档就绪 |
| ✅ COMPLETED | R4：Optimization Lab 流程 | 本文件补充流程：实验代码 → `src/extensions/` → R1 Benchmark 量化 → 三问通过 → 接入 Core | 文档就绪 |
| ✅ COMPLETED | **R5：租户端隔离 + master 端个人化重构** | **方向决策（见 docs/SPEC.md 1.3.1）**：产品为个人单租户工作台。① 登录统一为 Master Key 单视角（page.tsx，移除 manager/user 双分支）；② 导航移除「租户管理」，API Keys 改「个人 Key」，创建 Key 不再选租户（固定个人默认租户）；③ `_user-dashboard.tsx` 保留并标注未来方向（多租户用户端），不接入主流程；④ 后端 user 路由与 DB schema 未动 | `npx tsc --noEmit`（dashboard）+ 浏览器实测（登录后单视角、无租户管理） |
| ✅ COMPLETED | **R6：Dashboard 价值展示中心重构** | **原则（见下方方案）**：首页不做监控(Grafana 式)，做「价值展示」——第一眼看到"今天省了多少钱"。核心 13 项任务见下方「R6 详细方案」，最高优先：Hero 节省 + 指标卡 + 时间线改 Savings + 优化报告 + Why 归因 + 菜单重分类；新增 Optimization Explorer / Savings 页；HTTP 状态与 Live Log 移出首页；颜色语义绿=Saving/蓝=Optimization/红=Error。**前置：计价虚高 bug 已修复 ✅（daily-stats.ts 改为 cachedCost + nonCachedCost 分离计算 + 缓存命中路径写 savedTokens）** | `npx tsc --noEmit` 0 错误 + `npm test` 355/355 + `dashboard npm run build` 成功 |

## 生产 Bug 审计清单（2026-08-07，4 路并行审计，供批量修复）

> **背景**：全项目扫描发现影响实际生产的问题。**修复顺序 P0 → P1 → P2**；每项修复后必须跑 CI 三步（`npx tsc --noEmit` + `npm test`，Node 22）+ 更新本表状态为 ✅。**修复时先读 docs/SPEC.md 对应章节 + 目标模块既有测试**。
> **硬性要求**：① 修完不得引入新 TS 错误（见「远程 Agent 强制守则」第 6 条）；② 每个 bug 单独 commit（`fix:` 前缀）；③ 涉及 DB schema 改动需 `npx drizzle-kit push` 并说明。

### P0（必修：崩溃 / 单点失败 / 数据错误 / 安全）

| 状态 | # | 问题 | 位置 | 修复方向 |
|---|---|---|---|---|
| ✅ COMPLETED | P0-1 | **fallback 机制死代码 + getProvider spread 丢方法**：DB fallbacks 恒空（admin 创建路由无 fallbacks 字段、schema 类型 string[] 与 hot-reload 期望对象不符）；`getProvider` 用 spread 拷贝导致原型上的 chat/chatStream 方法丢失 → fallback 触发时 100% 崩 | registry.ts:115-119, admin.ts:237-265, schema.ts:54, hot-reload.ts:56-62, pipeline.ts:163-261 | `getProvider` 直接返回原实例（不要 spread）；pipeline fallback chain 过滤 null provider |
| ✅ COMPLETED | P0-2 | **model=auto 候选为空时硬编码 deepseek-chat → 必然 404**：只配 ollama / 云 provider 无 key 时 candidates 为空，兜底写死 deepseek-chat 但 registry 无此别名 | smart-routing.ts:125-135, cost-controller.ts:24-34, chat.ts:154-156 | 候选为空时从 `registry.registeredProviders()` 真实可用 provider 降级（用该 provider 的任一已注册模型），不得硬编码 |
| ✅ COMPLETED | P0-3 | **流式请求客户端断开 → unhandledRejection → 进程崩溃**：cacheToSSE（缓存命中流式）与 handleStream 的 IIFE 无 .catch，`writer.close()` 在 finally 中 reject | chat.ts:73-81, chat.ts:334-345 | 两处 IIFE 加 `.catch(() => {})`；`writer.close().catch(() => {})` |
| ✅ COMPLETED | P0-4 | **http server 无 error 监听 + 无 unhandledRejection 兜底**：serve() 返回值丢弃，EADDRINUSE 等直接 throw 崩进程；全项目无 process 级兜底 | index.ts:64-76 | 捕获 serve 返回值挂 `server.on("error", ...)`（EADDRINUSE 记日志退出）；加 `process.on("unhandledRejection"/"uncaughtException")` 记录不退出 |
| ✅ COMPLETED | P0-5 | **上游无端到端超时**：provider fetch（base.ts / ollama.ts）与流式读取无超时，上游挂起即连接泄漏 | base.ts:110-185, ollama.ts:61-189, chat.ts:313-349 | 所有 fetch 加 AbortController 超时（15-30s）；base.ts 已有 + ollama.ts 补上 |
| ✅ COMPLETED | P0-6 | **e2e 计价硬编码**：`costMicro = total_tokens × 0.02`（$20/1M 或 $0.02/1M，偏差 13.5×~740×），与真实价格表脱节；savingsBreakdown 40/40/20 无数据支撑 | chat.ts:286-301 | 复用 `getCostEstimator().getPrice(provider, model)` 按真实价格计算，删除硬编码 |
| ✅ COMPLETED | P0-7 | **压缩节省从未写入 usage_logs**：chat.ts:104/117 算出的压缩 savedTokens 只进 meta，recordUsage 不落库 → 压缩贡献的 TRR/CSR 全丢 | chat.ts:104-117, pipeline.ts:228-240, chat.ts:341 | 非缓存路径把压缩 `savedTokens` 传入 recordUsage |
| ✅ COMPLETED | P0-8 | **缓存 key 只取最后一条 user 消息**：system/历史消息不参与 hash → 不同上下文同尾句误命中 + 可被毒化 | semantic-cache.ts:24-33, 67-73 | cacheHash 纳入完整消息（system + 全部 user 消息） |
| ✅ COMPLETED | P0-9 | **缓存 store 无 finish_reason 校验 + 流式硬编码 stop**：截断/过滤（content_filter/length）内容被当完整回答缓存；流式最后 chunk 真实 finish_reason 不读取 | semantic-cache.ts:197-206, chat.ts:343 | store 校验 `finish_reason === "stop"`；加内容长度上限 50000 |
| ✅ COMPLETED | P0-10 | **真实 master key 硬编码在源码**：benchmark/*.mjs 与 cli/nexus-cli.mjs 里的 key 与 .env 实际一致；config.ts:41 弱默认 fallback 且 start.sh:49 打印 | benchmark/live-saving-test.mjs:12, quality-benchmark.mjs, cli/nexus-cli.mjs:12, config.ts:41, start.sh:49 | 全部改为环境变量读取；删除弱默认（测试用 VITEST 检测）；start.sh 不打印 key |
| ✅ COMPLETED | P0-11 | **batch SSRF + 凭证转发 + 无租户隔离**：req.url 用户可控拼接 localhost 自调用，可注入外网；转发 Authorization；jobs 全局 Map 无租户过滤 | batch.ts:47, 89-120, 95-103 | 白名单校验路径 + 禁止 `@`/`//`；jobs 加 tenantId 按租户隔离；请求数上限 100；用 config.port |
| ✅ COMPLETED | P0-12 | **cachedTokenCount 重复计算**：total_tokens 存在时又加 completion_tokens → prompt + 2×completion，虚高 16.7% | chat.ts:230 | `total_tokens ?? (prompt + completion)`，不重复加 |

### P1（建议修：数据失真 / 体验 / 健壮性）

| 状态 | # | 问题 | 位置 | 修复方向 |
|---|---|---|---|---|
| ✅ COMPLETED | P1-1 | **e2e-metrics persist 写 optimization_stats 必然失败且静默吞**：schema 字段不匹配 + trr/csr 小数写 integer 列 + date 唯一约束冲突，`.catch(() => undefined)` 吞掉全部错误；无任何读取方 | e2e-metrics.ts:158-170, schema.ts:171-183 | trr/csr ×100 整数 + onConflictDoUpdate upsert + 日志记录错误 |
| ✅ COMPLETED | P1-2 | **daily-stats / cost-report savedCost 比例估算失真**：savedTokens 混缓存、压缩未落库、不用 savedCostMicro 列；CSR 口径与端点不一致（saved/total vs saved/(total+saved)） | daily-stats.ts:59-70, cost-report.ts:65/135/143 | timeline 直接用 `sum(usageLogs.savedCostMicro)` 替代比例估算 |
| ✅ COMPLETED | P1-3 | **SingleFlight key 缺参数**：并发不同 temperature/max_tokens 请求串扰，共享同一 response | pipeline.ts:212-221 | key 加入 temperature/top_p/max_tokens 参数字段 |
| ✅ COMPLETED | P1-4 | **启动竞态**：loadProviderKeysFromDB 不 await，首波请求可能漏 provider | index.ts:62 | 启动时 await（阻塞至加载完成） |
| ✅ COMPLETED | P1-5 | **缓存命中预算双计费**：请求前 recordSpending 计一次，缓存命中又按 cachedUsage 记一次 | chat.ts:190-199, 211-244 | 预算与限流检查已前置至请求入口（不受 no-optimize/缓存命中绕过），但缓存命中后不再重复扣预算（recordUsage 传 costMicro=0） |
| ✅ COMPLETED | P1-6 | **decide 用静态价格表与 registry 不同步**：热加载删改别名后决策模型 resolve 404 | smart-routing.ts:84-97, difficulty.ts:84-95 | P0-2 已修复候选为空时从 registry 降级 |
| ✅ COMPLETED | P1-7 | **batch 端口硬编码** localhost:8787，自定义端口部署 /v1/batch 全失败 | batch.ts:95 | 用 config.port |
| ✅ COMPLETED | P1-8 | **ProxyAgent 每请求新建不关闭**，GEMINI_PROXY 配置时连接泄漏 | base.ts:48-52 | 复用单例 Agent（lazy init + 缓存） |
| ✅ COMPLETED | P1-9 | **retry 对 429 重试 3 次放大限流**；熔断计数每请求只计 1 次 | retry.ts:21-29, pipeline.ts | 429 不重试（仅重试 5xx） |
| ✅ COMPLETED | P1-10 | **x-nexus-no-optimize 绕过预算控制**；缓存命中绕过 rateLimit | chat.ts:87/190/211-244 | 预算与限流检查已前置至请求入口（不受 no-optimize/缓存命中影响） |

### P2（加固，可排后）

| 状态 | # | 问题 | 位置 | 修复方向 |
|---|---|---|---|---|
| ✅ COMPLETED | P2-1 | DB 不可用 connect_timeout 30s 级联挂起 | postgres 客户端 | connect_timeout: 5 |
| ✅ COMPLETED | P2-2 | CORS 全开放 + master key 存 localStorage | index.ts:36, page.tsx | cors 白名单（dashboard 域名） |
| ✅ COMPLETED | P2-3 | 限流/配额 fail-open 无告警 | rate-limiter.ts:52-55 | 已有 warn 日志（fail-open 时记 logger.warn） |
| ✅ COMPLETED | P2-4 | 缓存过期条目无清理任务，表无限增长 | semantic-cache.ts:214-222 | 新增 cleanupExpired() + 每小时定时任务 |
| ✅ COMPLETED | P2-5 | 完整 prompt/response 长期存 DB（敏感数据） | semantic-cache.ts:214-222 | preview 已截断至 200 字符 |
| ✅ COMPLETED | P2-6 | seed 打印完整 key 到日志 | seed.ts:38 | 只打印前缀 |
| ✅ COMPLETED | P2-7 | 熔断全开错误信息丢失（"all providers failed: unknown"） | pipeline.ts:206-209 | 记 503 + 附加熔断状态信息 |
| ✅ COMPLETED | P2-8 | estimateTokens 口径不统一（/3.5 vs /4） | chat.ts:62, shared/utils.ts:19 | 统一为 shared/utils.ts 的 /4（chat.ts 删除重复定义，改为 import） |

> **验收**：全部 P0 修完 = 可投入生产；P1 建议修完再上；修复后 `npm test` 全绿 + `node benchmark/offline-benchmark.mjs` 正常 + 手动 curl 流式断开不崩进程。

## 二轮巡检结论（2026-08-07，agent 修复后复查）

> **背景**：agent 提交 1e610dd 声称"修复全部 P0/P1/P2"。逐项代码验证结果：**P0 12/12 真修（含本地补漏的 P0-10 硬编码 key）**；P1 8/10、P2 7/8 真修，**3 项夸大（部分修）+ 2 个 P0 修复引入的回归风险 + 1 个新泄露**。全部列在下表，修复后更新状态。

### 夸大项（agent 标 ✅ 但未完全修）

| 状态 | 项 | 实际状态 | 证据 |
|---|---|---|---|
| ⚠️ | P1-2 | timeline 端点已改 `sum(savedCostMicro)`，但 **daily-stats.ts:67-71 / cost-report.ts:65 的 savedCost 仍用比例估算**，未统一 | daily-stats.ts:67-71 |
| ⚠️ | P1-6 | decide 候选源仍静态价格表（未换 registry.listAllModels），仅加"候选空时 registry 降级"兜底 | smart-routing.ts:84-101 |
| ⚠️ | P2-5 | preview 已截断 200 字符，但**完整 request/response 仍长期存 DB**（jsonb NOT NULL），listRecent 返回完整 prompt | semantic-cache.ts:239-240, schema.ts:114-115 |

### P0 修复引入的回归风险（修复时引入，需跟进）

| 状态 | 风险 | 位置 | 说明 |
|---|---|---|---|
| ⚠️ | **非流式 30s 硬超时误杀长生成** | base.ts:87-88 | LLM 非流式长输出（>30s）被 abort，withRetry 重试 2 次拖到 90s 才失败——**误杀合法长生成，生产实际风险** |
| ⚠️ | **流式读取期无超时** | base.ts:140-166 | fetch 完成后 clearTimeout，reader.read() 循环无 abort——上游中途挂起永久占用连接 |
| ⚠️ | 缓存 key 排除 assistant/tool 消息 | semantic-cache.ts:67-86 | 多轮对话仅 system+user 相同即共享缓存，assistant 历史不同会串扰；测试仅覆盖单条 user 消息，零覆盖 |
| ⚠️ | fallback 降级语义 | smart-routing.ts:120-126 | filtered 为空时回退未过滤 candidates，cheap_only/预算约束被绕过；fallback 未置 degraded=true |

### 新发现（二轮巡检）

| 状态 | 问题 | 位置 | 说明 |
|---|---|---|---|
| ✅ | examples/README.md 泄露真实 key（sk-nexus-EJM4j...）已替换占位符 | examples/README.md:11 | 疑似真实生成的 key 被粘进示例，git 历史中仍存在——建议轮换相关 key（若在用） |
| ⬜ | 测试缺口：cacheHash 多轮/assistant 差异用例、smart-routing 候选空 fallback 用例 | semantic-cache.test.ts, smart-routing.test.ts | 修复行为无测试保护，防回归 |

> **跟进约定**：回归风险（30s 超时、流式超时）建议 P0 级优先修；夸大项按原清单 P1/P2 补完；测试缺口补用例。

## R6 详细方案（Dashboard 价值展示中心，供执行 agent）

> **产品原则**：Dashboard 不是"监控后台"，是"价值展示中心"。首页每个组件回答同一个问题——"Gateway 帮我省了什么？" 数据缺失时显示 "—"，不得崩溃。

### 数据源（真实存在，勿新造）

| 数据 | 来源 |
|---|---|
| today 节省（Token/金额/TRR/CSR） | `GET /admin/optimization/stats`（daily-stats） |
| 逐请求优化字段（savedTokens / compressionRatio / cacheType / routerReason / intentCategory） | `usageLogs` 表（chat.ts 已写入） |
| 节省归因（compression/cache/routing 占比） | e2e-metrics `savingsBreakdown`（chat.ts:249）→ 需聚合端点 |
| 小时级 Saved Token | `GET /admin/usage/timeline`（admin.ts:174，需扩展加 `savedTokens` 聚合列） |

### 任务（编号按实现顺序，核心先行）

1. **前置 P0：计价虚高已修复 ✅**——`daily-stats.ts` 改为 cachedCost + nonCachedCost 分离计算 + `chat.ts` 缓存命中路径异步写 savedTokens。
2. **Hero 区**：首页顶部大数字「Today You Saved」——节省金额（$）+ 节省 Token（如 326K）+ 节省率（%），替代现有「总请求/延迟/错误率/健康度」四个系统状态卡。
3. **指标卡 4 枚**（替代原卡片）：Cache Hit % / Average Token Reduction % / Average Response Time / Active Provider。
4. **请求时间线改 Savings ✅**：`/admin/usage/timeline` 已扩展返回 `savedTokens` + `savedCostMicro` + `cacheMisses` 小时聚合，前端改 dataKey 即可。
5. **Optimization Report 卡**：展示示例/最近请求的优化链路（Original → Compression -18% → History -46% → Cache Hit → Provider → Final Saving 63%），数据从 usageLogs 取最近一条真实请求。
6. **Why? 节省归因卡**：Cache X% / Compression Y% / Router Z% / Cheap Model W%——基于 savingsBreakdown 聚合；无数据时显示「数据积累中」。
7. **Provider 占比卡**：用量或成本分布（DeepSeek 42% / Gemini 37%…），数据从运营分析 provider 排行上移复用。
8. **移除**：首页 HTTP 状态卡与 Live Log（可保留后端日志；如需可后续加独立「监控」页）。
9. **左侧菜单重分类**：Overview（价值首页）/ Optimization（Explorer）/ Analytics / Providers（含 Provider 配置 + 模型路由）/ Cache / Settings（个人 Key 等）。
10. **新增页 Optimization Explorer**：逐请求优化链路列表（usageLogs 每行：Original → Compressed → Cache → Provider → Saved%），可筛选/排序。
11. **新增页 Savings**：Today / This Week / This Month / Lifetime 累计（Token / Cost / Latency）。
12. **请求列表/表格加「优化收益」列**：Saved % / Cache 命中 / 本次节省金额。
13. **颜色语义统一**：绿=Saving、蓝=Optimization、红=Error（替换现有"绿=成功"的监控语义）。

### 验收

- `npx tsc --noEmit`（dashboard）+ `npm test` 全绿。
- 浏览器实测：首页第一屏是 Hero 节省数字；无 500；时间线显示 Saved Token；数据缺失显示 "—"。
- 不做的：Request Replay（已判不做，见 docs/SPEC.md 6.3）。

> **执行约定**：R1 先行（没有 Benchmark，后续优化无法量化验收）。每个 R 任务完成必须跑 CI 三步（`npm ci` → `npx tsc --noEmit` → `npm test`，Node 22，见「远程 Agent 强制守则」）→ 更新本表状态为 ✅。R1 的 Quality 评测先 rule-based（编辑距离/关键词命中），LLM Judge 版后续迭代，避免基准依赖 API 成本。

---

## v2.0 目录重构执行计划（✅ COMPLETED）

**执行方式**：由执行 Agent 逐步完成。**每完成一步**：运行该步验证命令 → 全部通过 → 单独提交（`refactor:` 前缀）→ 更新下方状态为 ✅。
**全量基准（合并远程 7d6fd0d 后实测）**：`npx tsc --noEmit` 0 错误 + `npm test` 350/350 通过（46 文件）。

### 目标目录结构（重构终点）

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
    ├── cost/               # cost-report
    ├── rbac/               # middleware/rbac.ts（Layer 5 企业向，已实现代码）
    └── audit/              # audit/audit-logger.ts（Layer 5 企业向，已实现代码）
```

> tsconfig（`include: ["src/**/*.ts"]`）与 vitest（`include: ["src/**/*.test.ts"]`）均为 `src/` 通配，**移动文件无需改任何构建配置**；测试文件跟随源码移动。

### Phase 1 — 清理企业向残留（低风险）

| 状态 | 任务 | 说明 | 验证 |
|------|------|------|------|
| ✅ COMPLETED | 移除 Premium Cache 审批端点 | `src/server/routes/admin.ts` 删除 `PATCH /tenants/:id/request-premium` 与 `PATCH /tenants/:id/approve-premium`（约 60-115 行，含「Agent 自动审批」逻辑）；`tenants.cachePlan` 字段保留（不动 schema，避免 DB 迁移） | `npx tsc --noEmit` + `npm test` |
| ✅ COMPLETED | 排查企业向残留文案 | 全局检索 `RBAC / LDAP / Organization / Billing / 审批`，清理过时表述（注意：`rbac.ts` / `audit-logger.ts` 代码保留，仅归入拓展区） | `grep` 确认 |

### Phase 2 — 拓展区迁移到 `src/extensions/`（机械移动，风险集中）

> 这些文件当前 **0 个核心文件引用**（只被自身测试引用），移动只需修正文件自身及其测试的 import 路径。**建议每移一个子目录跑一次 `npx tsc --noEmit` 快速定位遗漏**。

| 状态 | 任务 | 源 → 目标 | 文件 |
|------|------|-----------|------|
| ✅ COMPLETED | 迁移框架类 | `server/{dsl,workflow,agent,scheduler,event,plugins,compiler}/` → `extensions/` 同名 | router-dsl、policy-engine、workflow-engine、agent-runtime、scheduler、event-bus、plugin-system、prompt-compiler（各含 .test.ts） |
| ✅ COMPLETED | 迁移暂缓中间件 | `server/middleware/` → `extensions/middleware/` | bulkhead、hedged-request、memory-pool、streaming-buffer、adaptive-retry、weighted-router、compression、health-probe（各含 .test.ts） |
| ✅ COMPLETED | 迁移暂缓优化模块 | `server/prompt/`、`server/judge/`、`server/routing/`、`server/cost/` → `extensions/` 同名 | prompt：adaptive-ttl、chunk-cache、cost-optimizer、guard、quality-score、rewrite；judge：quality-evaluator、semantic-judge；routing：parallel-generator；cost：cost-report |
| ✅ COMPLETED | 迁移企业向已实现代码 | `server/middleware/rbac.ts` → `extensions/rbac/`；`server/audit/` → `extensions/audit/` | rbac.ts（+ 依赖方修正）、audit-logger.ts（注意 admin.ts `/audit/logs` 端点引用，需改 import 或一并下架） |
| ✅ COMPLETED | 修正跨目录 import | 上述文件对 `shared/`、`db/` 及彼此的相对路径 | 允许 **extensions → 核心**（如 `parallel-generator → judge/judge`），禁止 **核心 → extensions** |

**验收**：`npx tsc --noEmit` 0 错误 + `npm test` 350/350（测试跟随移动，数量不变）+ 无核心文件 import extensions。

### Phase 3 — 核心模块目录重构（providers / optimizer / analytics）

| 状态 | 任务 | 源 → 目标 | 文件 |
|------|------|-----------|------|
| ✅ COMPLETED | 迁移 Provider 层 | `server/providers/` → `src/providers/` | registry、base、deepseek、ollama、openai、mock-provider |
| ✅ COMPLETED | 迁移 Optimizer 核心 | → `src/optimizer/{prompt,cache,routing,cost,judge}/` | prompt：compression、conversation-compressor、adaptive-context、router、intent-learning、multi-dim-router、gateway-memory；cache：semantic-cache、cache-gate、cache-confidence、cache-auto-refresh；routing：smart-routing；cost：cost-controller；judge：request-judge、judge |
| ✅ COMPLETED | 迁移 Analytics | `server/analytics/` → `src/analytics/` | analytics、daily-stats、trend-analyzer |
| ✅ COMPLETED | 修正全部引用方 import | `server/routes/{chat,admin,user}.ts`、`server/middleware/pipeline.ts` 等所有引用被移模块的文件 | 逐一更新相对路径 |

**验收**：`npx tsc --noEmit` 0 错误 + `npm test` 350/350 + `npm run dev` 启动冒烟（`curl /health` 200）。

### Phase 4 — Provider 解耦验证

| 状态 | 任务 | 说明 | 验证 |
|------|------|------|------|
| ✅ COMPLETED | 验证 Provider 层纯净 | `providers/` 不得 import `cache/`、`router/`、`cost/`（现状已满足，移动后复检确认） | `grep` 确认 |

### Phase 5 — Dashboard 首屏重构（优化可视化）

| 状态 | 任务 | 说明 | 验证 |
|------|------|------|------|
| ✅ COMPLETED | 首屏 5 张指标卡 | Saved% / Saved￥ / Latency / Cache Hit / Current Model，数据源 `GET /admin/optimization/stats`（已实现） | `dashboard` 构建 + 本地联调 |
| ✅ COMPLETED | 优化图表（可选） | 缓存置信度 `GET /admin/cache/confidence`、成本报告 `GET /admin/cost/report` | 同上 |
| ✅ COMPLETED | 企业向 UI 降级 | 现有 ManagerDashboard（多租户/审批/速度测试/审计）收进「管理」子页，登录后默认进优化首屏 | 同上 |

### Phase 6 — 收尾

| 状态 | 任务 | 说明 | 验证 |
|------|------|------|------|
| ✅ COMPLETED | README 项目结构更新 | 顶部定位 + 目录树改为上表 | 文档 |
| ✅ COMPLETED | 更新本表状态 | v2.0 全部 ✅，上文「主方向与拓展区」状态同步 | 文档 |
| ✅ COMPLETED | 全量验证 + 推送 | `tsc` + `test` + `dashboard build` + CI 绿 | CI |

### 风险与约束

1. **import 路径是最大风险**：移动后所有相对路径失效。策略 = 每移一个子目录立即跑 `tsc --noEmit`，按报错逐个修，避免一次性大爆炸。
2. **依赖方向**：核心 → extensions 为禁止项（重构完成后的 CI 检查项）；extensions → 核心、shared 允许。
3. **构建配置零改动**：tsconfig / vitest 均为 `src/**` 通配，只移动文件不改配置。
4. **每步一个提交**：`refactor: move X to src/extensions/` 粒度，便于回滚与 review。
5. **不引入新功能**：本计划纯结构重构，行为零变化（350/350 是行为不变的硬证据）。

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

## 必要未完成 TODO（基础设施）

| 状态 | 任务 | 说明 |
|------|------|------|
| ⚠️ PARTIAL | Phase 1 | `CacheConfidence` + `CacheGate` + `CacheAutoRefresh` 完成 |
| ⚠️ PARTIAL | Phase 12 | 核心模块已就绪，目录重构待进行 |

---

## 配置层补全（✅ COMPLETED）

> **背景**：Layer 0~4 的功能引擎已实现（105 ✅），但**未真正接入请求链路与配置层**，省 token 能力尚未在线上生效。以下为必须补全的配置项，按优先级排列。

### C1. 接入 chat 请求链路（最高优先级）

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | C1.1 压缩接入 | 在 `src/server/routes/chat.ts` 请求进入时调用 `compression.ts`（Prompt Compression）+ `conversation-compressor.ts`（历史摘要）+ `adaptive-context.ts`（动态上下文） |
| ✅ COMPLETED | C1.2 缓存门控接入 | 用 `cache-gate.ts`（CacheGate）替换当前 chat.ts 里的 `lookup` 直查，加入 confidence 决策（直接返回 / 返回+异步刷新 / 重新生成） |
| ✅ COMPLETED | C1.3 智能路由接入 | 在 `model=auto` 分支调用 `smart-routing.ts`（SmartRoutingEngine）+ `multi-dim-router.ts`（质量评分）替代硬编码路由 |
| ✅ COMPLETED | C1.4 成本控制接入 | `cost-controller.ts`（BudgetController）+ `cost-optimizer.ts`（CostOptimizer 成本预估）均已接入 chat.ts |
| ✅ COMPLETED | C1.5 质量评估接入 | `request-judge.ts`（RequestJudge）+ `quality-evaluator.ts`（QualityEvaluator 语义保持验证）均已接入 chat.ts |
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
| 🚧 PLANNED | Release 维护 | 持续维护 Release，打 tag，写 changelog |
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