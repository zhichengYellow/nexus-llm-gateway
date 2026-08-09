# Nexus v2.4 Token Efficiency — 远程执行提示词

你现在负责继续开发 **Nexus LLM Gateway**（OpenAI Compatible Gateway + BYOK + 缓存/压缩/路由优化）。
这是一个进入成熟期的项目，**本任务不是让你重新设计或自由发挥加功能**，而是执行 `fit/improve.md` 中已审计好的 **v2.4 Token Efficiency 任务书**，把 Nexus 推进为「能真实、透明、可验证地证明自己省 Token 和成本」的 Token Optimization Gateway。

## 一、项目定位（本阶段红线）

- 定位：个人开发者 BYOK 工具。**不做** Enterprise Billing / SSO / RBAC / 企业审批流 / K8s / Helm / 插件市场 / MCP Marketplace。
- 核心 KPI：Token Reduction、Optimization Overhead、Net Saving、Savings Attribution 准确性、Quality Impact —— 不是"新增了多少功能"。
- 纪律：**禁止功能堆砌**。新功能必须直接提升 Token Reduction / Cost Reduction / Optimization Transparency / Reliability / Developer Experience 之一。不提升这些的（MCP、Billing、SSO、无需求 Provider、大型 Dashboard、无意义 CRUD）一律不碰。

## 二、开始前必读（按顺序）

1. `fit/improve.md` —— **重点读「## v2.4 Token Efficiency 任务书」章节（V2.4-1 ~ V2.4-7）**，本任务就是执行它；同时读 R13/R14/R15 章节了解已完成的上下文。
2. `README.md` —— 当前能力清单与版本。
3. `docs/SPEC.md` —— 对应模块设计。
4. `package.json` —— scripts（build/test/typecheck）。
5. `src/server/middleware/pipeline.ts` —— 主请求流水线（阶段计时 V2.4-1 的主战场）。
6. `src/analytics/savings-attribution.ts` —— 归因模块（V2.4-2/5/7 的主战场）。
7. `src/server/routes/user.ts` + `dashboard/src/app/_user-dashboard.tsx` —— 用户端 API 与 UI（V2.4-2/3/4/5 展示层）。
8. `src/server/routes/admin.ts` —— 控制台 API（优化开关在此）。
9. DB schema：`drizzle` 目录或 `src/db/*`（usage_logs / requests 表结构，V2.4-1 需扩展字段）。
10. 现有测试：`src/**/*.test.ts`、`dashboard` 下若有测试。

## 三、现状快照（2026-08，基线）

- 当前版本：**v2.3.0**（tag + GitHub Release 已同步）。
- HEAD 基线：`f6c1727`；测试基线：**54 个测试文件 / 401 个测试全过**（`npx tsc --noEmit` + `npm test`）。
- **已在 R14 实现、勿重做**：
  - Savings Attribution 互斥归因（`savings-attribution.ts`：CACHE/COMPRESSION/ROUTING/REWRITE，ACTUAL vs ESTIMATED）
  - Privacy Center、Request cursor 分页（`GET /user/requests?limit&cursor`）
  - Speed Test 并发/冷却防滥用、Optimization Profile 4 档（fast/balanced/cheap/maximum_saving）接线
  - Gateway Key Last Used、真实数据核查（无 fake data）
- 工作区未跟踪文件 `.playwright-mcp/` `.reasonix/` `aider.conf.yml` 是本地工具配置，**不要碰、不要提交**。

## 四、执行步骤（严格按此顺序）

### Step 0：Pre-Implementation Audit（必做，先输出再编码）

读完上面文档后，先输出：

```
# Pre-Implementation Audit
## Existing Implementation   —— 列出已有功能（与任务相关的）
## Reusable Components       —— 可直接复用的模块（如 summarizeSavings、pipeline 中间件、cache-deduplicate 等）
## Missing Pieces            —— 真正缺失的部分
## Potential Conflicts       —— 可能重复或冲突的逻辑（重点：V2.4-1 的计时如何与现有 latency 字段共存；V2.4-2 与 R14-7 归因的关系；V2.4-3 与现有 savedCost 的关系）
```

### Step 1：V2.4-1 Optimization Overhead（阶段计时）—— 最高优先级

- 对实际 pipeline 各阶段计时，**只记录真实执行的阶段**（Cache Lookup / Intent Router / Prompt Rewrite / Compression / Semantic Cache / Routing / Provider Request / Response Processing 中实际存在的）。不要机械添加不存在的阶段。
- 数据结构：**优先扩展现有 usage_logs/requests 记录**（加 `optimizationLatencyMs`、`providerLatencyMs`、`totalLatencyMs` + stage-level），**不要创建第二套独立请求记录系统**。
- 建立 **Optimization Overhead Ratio = Optimization Time / Total Request Time**。
- UI（用户端）：展示 Optimization Overhead(ms)，例如 "Optimization 69ms / Provider 820ms / Total 889ms"。
- 测试：无优化 / cache / compression / routing / rewrite / 多优化组合 / failed / retry / streaming / SingleFlight / cache hit 的延迟拆分。

### Step 2：V2.4-2 Net Saving

- 明确 **Gross Saving − Optimization Cost = Net Saving**。若优化自身调模型（如 Rewrite 用模型），必须计 Optimization Cost；否则为 0。
- **禁止出现负 savings**；负值只能明确标记为 loss/overhead。
- UI：Today You Saved 卡片展示 Gross Saving / Optimization Cost / Net Saving / Optimization Overhead 四项。
- 测试：optimization cost > gross saving 的极端场景。

### Step 3：V2.4-3 PROJECTED 月度预测

- 基于当月 usage + 近 7/30 天趋势预测本月节省。
- **严格区分 ACTUAL / ESTIMATED / PROJECTED**，禁止混入同一个 savedCost 字段；UI 必须明确标注 "Projected"。
- 测试：预测值由趋势推导，且不与 ACTUAL 混字段。

### Step 4：V2.4-4 SingleFlight Dedup 可视化

- 请求分类：`ORIGIN / DEDUP_WAITER / CACHE_HIT / UPSTREAM`。
- pipeline 已标记 waiter（`deduplicated` 等，先 grep 确认现有标记），补 usage_logs 分类字段或由现有字段派生。
- UI 请求列表：DEDUP_WAITER 显示「Deduplicated · Shared an in-flight request」，**不要当作普通 cache hit**。
- 测试：并发请求后列表出现 dedup 分类。

### Step 5：V2.4-5 Savings Source 可视化

- 用户端概览按来源展示（Cache/Compression/Routing/Rewrite 真实占比），**复用 `summarizeSavings` / `savings-attribution.ts`**。
- **禁止前端 fake 百分比**。

### Step 6：V2.4-6 Benchmark 设计（v2.5 前置，可轻量实现）

- 固定数据集 8 类：Short QA / Long Context / Coding / Chinese / English / Conversation / Repeated Prompt / Document QA。
- Runner：Provider Direct（baseline） vs Nexus（balanced / cheap / maximum_saving）。
- 统计：Input/Output/Total Tokens、Token Reduction、Latency、Optimization Overhead、Provider Latency、Cost、Gross Saving、Optimization Cost、Net Saving、Quality Score。
- 产物：`benchmark-report.json` + `benchmark-report.md`（如方便加 html）。
- **原则：结果如实记录，不删不理想结果，可重复**（记录 Model/Provider/Temperature/Dataset/Date/Version/Profile/Parameters）。

### Step 7：V2.4-7 DEDUP/MULTI 归因补全

- `savings-attribution.ts` 补 `DEDUP`（waiter 场景，可选）与 `MULTI`（多来源组合标注）枚举。
- **不破坏现有互斥归因**（CACHE/COMPRESSION/ROUTING/REWRITE 不得 double counting）。

## 五、每步验收（每完成一个功能必须）

1. `npx tsc --noEmit`（无新错误）
2. `npm test`（全绿，**禁止删除/修改既有测试让它通过、禁止 skip、禁止 @ts-ignore、禁止 any 逃避类型**）
3. 检查 `git diff`：无硬编码 key / 无 API Key 明文返回 / 无绕过 tenantId / 无 fake savings
4. 单 commit（`fix:`/`feat:`/`test:`/`docs:` 前缀，如 `feat(metrics): add optimization overhead profiling`）
5. 全部完成后再统一 push

## 六、最终输出（全部完成后）

```
# Nexus Development Completion Report
## 1. Version
## 2. Completed（V2.4-1~7 逐项状态）
## 3. Savings Engine（最终计算逻辑）
## 4. Savings Attribution（各来源如何归因，防 double counting）
## 5. Actual / Estimated / Projected（如何区分）
## 6. Optimization Overhead（如何计算）
## 7. Net Saving（如何计算）
## 8. Privacy（tenant isolation 与敏感数据保护）
## 9. Benchmark Readiness（是否具备 v2.5 条件）
## 10. Tests（Before: 401 → After: N，新增哪些）
## 11. CI（真实结果）
## 12. Git Commits（列出）
## 13. Remaining Risks（真实风险，禁止写 "No risks."）
## 14. Recommended Next Step（只给下一阶段建议，不要自动继续开发）
```

## 七、最终指令

Nexus 当前最重要的事不是变大，而是**更有效率、更透明、更可验证、更能证明自己省 Token**。先稳定 v2.3，再集中建设 v2.4 Token Efficiency，用真实数据说话：

> Nexus should not merely claim that it saves tokens. Nexus should be able to prove it.
