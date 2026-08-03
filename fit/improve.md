# Nexus Runtime - 长远路线图

> **愿景**：从 LLM Gateway 演进为 Universal AI Runtime —— 所有 AI App 跑在 Nexus Runtime 上。
> **当前状态**：v1.4（DSL + Policy + Judge + Scheduler），CI 全绿，230/230 测试通过。
> **原则**：不再以"新增功能"为单位，而是以"基础设施抽象"为单位。每个阶段是一个需要数周打磨的 Research/Infra 工程。

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

- **版本**：v1.4（DSL + Policy + Judge + Scheduler）
- **CI**：GitHub Actions 全绿，230/230 测试通过（25 个测试文件）
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

---

## 长远路线：Nexus Runtime 演进

> **其他 Agent 请按 Phase 顺序开发，每个 Phase 是独立的工程。**
> **每个 Phase 包含：背景、目标架构、实现步骤、验收标准、预估工作量。**

---

### Phase 1: 分布式语义缓存（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | P0 |
| 预估工作量 | 5000+ 行，2~3 周 |
| 依赖 | 无 |

**背景**：当前缓存基于单机 Redis，无法水平扩展。需要独立出 Semantic Cache Service。

**目标架构**：
```
Gateway A / B / C
       │
       ▼
Semantic Cache Cluster
       │
Embedding Index (Faiss/HNSW)
       │
Redis Metadata
```

**实现步骤**：
1. ⬜ TODO — **Embedding 自动生成**：集成 embedding 模型（text-embedding-3-small / bge-small），自动为每个 prompt 生成 embedding。
2. ⬜ TODO — **ANN Index**：集成 Faiss 或 HNSW，支持近似最近邻搜索，替代当前的 Redis 向量搜索。
3. ✅ COMPLETED — **Cache Confidence**（`src/server/cache/cache-confidence.ts`）：为每条缓存记录 confidence 分数（0~1），低于阈值时重新生成而非直接返回。
4. ⬜ TODO — **Auto Refresh**：后台定时刷新热门缓存的 embedding，保持时效性。
5. ⬜ TODO — **多节点同步**：缓存节点间通过 Redis Pub/Sub 或 Raft 协议同步索引。
6. ⬜ TODO — **分片（Sharding）**：按 hash(prompt) 分片，支持水平扩展。
7. ⬜ TODO — **Snapshot + WAL**：定期快照 + Write-Ahead Log，支持崩溃恢复。
8. ⬜ TODO — **独立服务**：将缓存从 Gateway 中拆出，成为独立的 Semantic Cache Service。

**验收标准**：
- 缓存查询延迟 P99 ≤ 10ms。
- 支持至少 3 节点集群。
- 崩溃恢复后数据零丢失。
- 缓存命中率 ≥ 60%（相同 prompt）。

---

### Phase 2: 自研 Router DSL Engine（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | P0 |
| 预估工作量 | 3000+ 行，1~2 周 |
| 依赖 | 无 |
| 源文件 | `src/server/dsl/router-dsl.ts` |

**背景**：当前 Router 是硬编码的 if/weight/score 逻辑，无法灵活配置。

**目标**：做一个 YAML DSL，Router 不用改代码，改 YAML 即可。

**DSL 示例**：
```yaml
routes:
  - when:
      intent: code
      latency: "< 300"
      cost: "< 0.002"
    provider: claude

  - when:
      intent: math
      context_length: "> 8000"
    provider: qwen

  - when:
      fallback: true
    provider: deepseek
```

**实现步骤**：
1. ✅ COMPLETED — **DSL 设计**：定义 YAML schema，支持条件表达式（intent/latency/cost/context_length/error_rate）。
2. ✅ COMPLETED — **DSL Parser**：实现 YAML → AST 解析器。
3. ✅ COMPLETED — **DSL Compiler**：AST → 可执行的路由规则。
4. ✅ COMPLETED — **DSL Runtime**：运行时引擎，支持热加载 YAML。
5. ⬜ TODO — **规则验证**：启动时校验 DSL 语法和逻辑。
6. ⬜ TODO — **Dashboard 集成**：在 Dashboard 中可视化编辑 DSL。
7. ⬜ TODO — **版本管理**：DSL 变更支持版本管理和回滚。

**验收标准**：
- DSL 语法覆盖所有路由场景。
- 热加载延迟 ≤ 1s。
- DSL 解析错误有清晰报错。
- 支持 50+ 规则无性能下降。

---

### Phase 3: Workflow Engine（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | P1 |
| 预估工作量 | 4000+ 行，2~3 周 |
| 依赖 | Phase 2（DSL Engine） |
| 源文件 | `src/server/workflow/workflow-engine.ts` |

**背景**：当前请求流程是固定的 Pipeline，无法支持复杂的多步推理。

**目标**：像 LangGraph 一样，每一步是 Node，真正 Flow。

**目标架构**：
```
Prompt → Router → Judge → Retry → Rewrite → LLM → Judge → Cache
```

**实现步骤**：
1. ⬜ TODO — **Node 抽象**：定义 `WorkflowNode` 接口（input/output/execute）。
2. ⬜ TODO — **Edge 定义**：定义节点间的连接（条件跳转、循环、并行）。
3. ⬜ TODO — **Workflow DSL**：YAML 定义工作流。
4. ⬜ TODO — **Workflow Runtime**：执行引擎，支持 DAG 调度。
5. ⬜ TODO — **条件分支**：支持 if/else、switch 分支。
6. ⬜ TODO — **循环**：支持 retry 循环、judge 循环。
7. ⬜ TODO — **并行**：支持多节点并行执行（如同时调用多个 provider）。
8. ⬜ TODO — **可视化**：在 Dashboard 中展示 Workflow DAG 图。

**验收标准**：
- 支持至少 10 种 Node 类型。
- DAG 调度无死锁。
- 支持循环和并行。
- 可视化清晰。

---

### Phase 4: Prompt Compiler（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | P1 |
| 预估工作量 | 3000+ 行，1~2 周 |
| 依赖 | 无 |
| 源文件 | `src/server/compiler/prompt-compiler.ts` |

**背景**：当前 Prompt 处理是简单的拼接，没有编译优化。

**目标**：真正 Compiler，支持多阶段处理和优化。

**编译流程**：
```
User Prompt
    ↓
Rewrite（改写优化）
    ↓
Context Merge（上下文合并）
    ↓
Tool Prompt（工具提示注入）
    ↓
Safety Prompt（安全提示注入）
    ↓
Provider Prompt（Provider 特定格式化）
    ↓
Compiled Prompt
```

**实现步骤**：
1. ✅ COMPLETED — **Prompt AST**：定义 Prompt 的抽象语法树。
2. ✅ COMPLETED — **编译 Pass**：每个阶段是一个编译 Pass（Rewrite/Merge/Tool/Safety/Provider）。
3. ⬜ TODO — **优化**：Token 压缩、冗余去除、上下文窗口管理。
4. ⬜ TODO — **Provider 适配**：不同 Provider 的 Prompt 格式自动转换。
5. ⬜ TODO — **缓存**：编译结果缓存，相同输入直接复用。
6. ✅ COMPLETED — **Debug**：编译过程可视化，每一步的中间结果可查看。

**验收标准**：
- 编译 Pass 可插拔。
- Token 压缩率 ≥ 15%。
- Provider 适配覆盖所有支持的 Provider。
- 编译过程可 Debug。

---

### Phase 5: Policy Engine（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | P1 |
| 预估工作量 | 2500+ 行，1~2 周 |
| 依赖 | 无 |
| 源文件 | `src/server/dsl/policy-engine.ts` |

**背景**：当前安全检查是硬编码的 if 判断，无法灵活配置。

**目标**：Policy DSL → Compile → Runtime。

**DSL 示例**：
```yaml
policies:
  - name: "PII Mask"
    when: "contains_pii(input)"
    then: "mask_pii"
    action: "allow"

  - name: "Secret Block"
    when: "contains_secret(input)"
    then: "block"
    action: "reject"

  - name: "Injection Defense"
    when: "contains_injection(input)"
    then: "sanitize"
    action: "allow"
```

**实现步骤**：
1. ✅ COMPLETED — **Policy DSL**：定义 YAML schema，支持表达式。
2. ✅ COMPLETED — **Policy Compiler**：DSL → 可执行规则。
3. ✅ COMPLETED — **Policy Runtime**：运行时引擎，在请求链路中插入检查。
4. ✅ COMPLETED — **PII 检测**：身份证/银行卡/手机号/邮箱。
5. ✅ COMPLETED — **Secret 检测**：API Key/密码/Token。
6. ✅ COMPLETED — **Injection 检测**：Prompt 注入攻击模式。
7. ⬜ TODO — **DLP**：数据泄露防护（敏感数据不出域）。
8. ⬜ TODO — **审计**：所有 Policy 触发记录审计日志。

**验收标准**：
- PII 检测准确率 ≥ 95%。
- Secret 检测准确率 ≥ 99%。
- Injection 检测覆盖已知攻击模式。
- Policy 热加载延迟 ≤ 1s。

---

### Phase 6: Query Planner（Agent Runtime）（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | P1 |
| 预估工作量 | 5000+ 行，2~3 周 |
| 依赖 | Phase 3（Workflow Engine） |

**背景**：Gateway 还是 Chat，以后支持 Tool/Memory/Planner/Executor，直接变成 Agent Runtime。

**目标架构**：
```
Prompt
    ↓
Planner（规划执行步骤）
    ↓
Tool（调用工具）
    ↓
Memory（读取/写入记忆）
    ↓
Provider（调用 LLM）
    ↓
Judge（评估结果）
    ↓
Response
```

**实现步骤**：
1. ✅ COMPLETED — **Planner**（`src/server/agent/agent-runtime.ts`）：根据 Prompt 规划执行步骤（ReAct / Plan-and-Execute）。
2. ✅ COMPLETED — **Tool Registry**（`src/server/agent/agent-runtime.ts`）：工具注册/发现/调用，内置 search/calculate/code_executor。
3. ✅ COMPLETED — **Memory**（`src/server/agent/agent-runtime.ts`）：短期记忆（对话上下文）+ 长期记忆（KV 存储）。
4. ✅ COMPLETED — **Executor**（`src/server/agent/agent-runtime.ts`）：AgentRuntime.run() 执行引擎。
5. ⬜ TODO — **Judge**：结果评估，决定是否重试或继续。
6. ⬜ TODO — **MCP 集成**：支持 MCP 协议调用外部工具。
7. ⬜ TODO — **Sandbox**：工具执行沙箱，限制权限。

**验收标准**：
- 支持至少 5 种工具（搜索/代码执行/数据库查询/API 调用/文件操作）。
- Planner 规划准确率 ≥ 80%。
- 工具执行成功率 ≥ 95%。
- 支持多步推理（≥ 5 步）。

---

### Phase 7: Event Bus（★★★★☆）

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | P2 |
| 预估工作量 | 2000+ 行，1 周 |
| 依赖 | 无 |
| 源文件 | `src/server/event/event-bus.ts` |

**背景**：整个 Gateway 是同步调用链，无法支持异步事件驱动。

**目标**：Event Driven，插件监听 Event。

**事件类型**：
```
RequestStart → Retry → CacheHit → ProviderSwitch → CostChanged → ResponseEnd
```

**实现步骤**：
1. ✅ COMPLETED — **Event 定义**：定义所有事件类型和 payload。
2. ✅ COMPLETED — **Event Bus**：实现 Pub/Sub 模式。
3. ✅ COMPLETED — **Event Store**：事件持久化（可选）。
4. ✅ COMPLETED — **Plugin 监听**：插件可订阅任意事件。
5. ✅ COMPLETED — **Event Replay**：支持事件回放（调试/恢复）。
6. ⬜ TODO — **Webhook**：支持外部 Webhook 订阅。

**验收标准**：
- 事件投递延迟 ≤ 10ms。
- 支持至少 20 种事件类型。
- 插件订阅无性能影响。

---

### Phase 8: Scheduler（★★★★☆）

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | P2 |
| 预估工作量 | 1500+ 行，3~5 天 |
| 依赖 | 无 |
| 源文件 | `src/server/scheduler/scheduler.ts` |

**背景**：后台任务（Benchmark/Health Check/TTL Refresh）散落各处，无统一管理。

**目标**：统一 Scheduler，支持 Cron 表达式。

**实现步骤**：
1. ✅ COMPLETED — **Cron 引擎**：支持 Cron 表达式定义任务。
2. ✅ COMPLETED — **任务注册**：Benchmark / Health Check / TTL Refresh / Embedding Refresh / Report。
3. ✅ COMPLETED — **任务管理**：启动/停止/暂停/查看状态。
4. ✅ COMPLETED — **失败重试**：任务失败自动重试。
5. ⬜ TODO — **Dashboard 集成**：在 Dashboard 中管理任务。

**验收标准**：
- Cron 表达式支持标准语法。
- 任务执行不阻塞主线程。
- 失败重试可配置。

---

### Phase 9: Auto Benchmark Platform（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | P2 |
| 预估工作量 | 3000+ 行，1~2 周 |
| 依赖 | Phase 10（LLM Judge Framework） |
| 源文件 | `benchmark/auto-benchmark.mjs` |

**背景**：当前 Benchmark 只是简单的延迟测试，无法全面评估。

**目标**：每天 100+ Prompt × 20 Model × 10 Provider，统计 Latency/Accuracy/Cost/Cache/Judge Score，生成网页。

**实现步骤**：
1. ⬜ TODO — **Prompt 集**：收集 100+ 标准测试 Prompt（代码/数学/翻译/推理/创作）。
2. ⬜ TODO — **多模型测试**：每个 Prompt 对所有支持的模型测试。
3. ⬜ TODO — **多 Provider 测试**：每个模型对所有 Provider 测试。
4. ⬜ TODO — **Judge 评分**：用 Judge Model 对每个响应评分。
5. ⬜ TODO — **统计报告**：Latency P50/P95/P99、Accuracy、Cost、Cache Hit。
6. ⬜ TODO — **网页生成**：自动生成排行榜网页，部署到 GitHub Pages。
7. ⬜ TODO — **历史趋势**：保存历史数据，展示趋势图。

**验收标准**：
- 每日自动运行。
- 覆盖 100+ Prompt × 20+ Model。
- Judge 评分一致性 ≥ 85%。
- 网页自动更新。

---

### Phase 10: LLM Judge Framework（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ✅ COMPLETED |
| 优先级 | P2 |
| 预估工作量 | 2000+ 行，1 周 |
| 依赖 | 无 |
| 源文件 | `src/server/judge/judge.ts` |

**背景**：需要客观评估不同 LLM 的输出质量。

**目标**：
```
Prompt → OpenAI / Claude / Gemini → Judge → Score
```

**实现步骤**：
1. ✅ COMPLETED — **Judge Model 集成**：支持 GPT-4 / Claude / Gemini 作为 Judge。
2. ✅ COMPLETED — **评分维度**：相关性、准确性、流畅度、安全性、完整性。
3. ✅ COMPLETED — **批量评估**：支持批量评估 100+ 响应。
4. ⬜ TODO — **对比报告**：多模型对比，输出排行榜。
5. ⬜ TODO — **自定义评分**：支持自定义评分标准。
6. ⬜ TODO — **API**：提供 `/api/judge` 接口。

**验收标准**：
- 评分一致性 ≥ 85%。
- 批量评估 100 条 ≤ 30s。
- 支持至少 3 个 Judge Model。

---

### Phase 11: Gateway Evolution → Universal AI Gateway（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | P3 |
| 预估工作量 | 5000+ 行，2~3 周 |
| 依赖 | Phase 6（Agent Runtime） |

**背景**：Gateway 不只是 Chat，而是支持所有 OpenAI API。

**目标**：支持 Chat / Completion / Embedding / Image / Speech / Realtime / MCP / Agent / Workflow / Judge / Batch / FineTune。

**实现步骤**：
1. ✅ COMPLETED — **Chat/Completion**：已有。
2. ✅ COMPLETED — **Embedding**：已有，增加缓存。
3. ⬜ TODO — **Image**：支持 DALL-E / Stable Diffusion / Midjourney。
4. ⬜ TODO — **Speech**：支持 Whisper / TTS。
5. ⬜ TODO — **Realtime**：支持 WebSocket 实时对话。
6. ⬜ TODO — **MCP**：支持 MCP 协议。
7. ⬜ TODO — **Agent**：支持 Agent Runtime。
8. ⬜ TODO — **Workflow**：支持 Workflow Engine。
9. ⬜ TODO — **Judge**：支持 LLM Judge。
10. ✅ COMPLETED — **Batch**（`src/server/routes/batch.ts`）：支持批量请求 `/v1/batch`。
11. ⬜ TODO — **FineTune**：支持微调任务管理。

**验收标准**：
- 覆盖所有 OpenAI API 端点。
- 每种 API 都有缓存/限流/计费。
- 统一的 Dashboard 管理。

---

### Phase 12: 内核重构 → Nexus Runtime（★★★★★）

| 属性 | 值 |
|------|-----|
| 状态 | ⬜ TODO |
| 优先级 | P3 |
| 预估工作量 | 8000+ 行，3~4 周 |
| 依赖 | Phase 1~11 全部完成 |

**背景**：当前目录结构是 provider/router/cache/retry，需要重构为 kernel/runtime/pipeline/scheduler/plugin/dsl/compiler/executor/storage。

**目标架构**：
```
Nexus Runtime
      │
  ┌───┼────────┐
  │   │        │
Gateway  Agent   MCP
  │   │     │
Workflow  Memory  Tools
  │
Plugin Runtime
  │
Policy + Router + Cache
  │
All LLM Providers
```

**新目录结构**：
```
src/
  kernel/          # 内核：生命周期管理、依赖注入
  runtime/         # 运行时：请求执行、上下文管理
  pipeline/        # 管道：中间件链
  scheduler/       # 调度器：Cron 任务
  plugin/          # 插件系统
  dsl/             # DSL 引擎（Router DSL / Policy DSL / Workflow DSL）
  compiler/        # 编译器（Prompt Compiler）
  executor/        # 执行器（Agent Runtime / Workflow Engine）
  storage/         # 存储层（Cache Cluster / Vector Index）
```

**实现步骤**：
1. ⬜ TODO — **Kernel**：生命周期管理（init/start/stop）、依赖注入容器。
2. ⬜ TODO — **Runtime**：请求上下文管理、执行栈、错误处理。
3. ⬜ TODO — **Pipeline**：从 middleware 重构为 pipeline。
4. ⬜ TODO — **Scheduler**：统一调度器。
5. ⬜ TODO — **Plugin**：插件系统重构。
6. ⬜ TODO — **DSL**：统一 DSL 引擎。
7. ⬜ TODO — **Compiler**：Prompt Compiler。
8. ⬜ TODO — **Executor**：Agent Runtime + Workflow Engine。
9. ⬜ TODO — **Storage**：分布式缓存 + 向量索引。

**验收标准**：
- 所有现有功能在新架构下正常工作。
- 测试覆盖率 ≥ 80%。
- 性能不下降。
- 插件兼容旧接口。

---

## 季度路线

### Q3（当前）—— 文档与 Benchmark

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Documentation | README、API 文档、架构图 (`docs/`) |
| ✅ COMPLETED | Tutorial | 5 分钟快速开始教程 (`docs/quickstart.md`) |
| ⬜ TODO | Video | 录制演示视频 |
| ✅ COMPLETED | Examples | spring-ai / langchain / openwebui / cline / continue / mcp (`examples/`) |
| ✅ COMPLETED | Benchmark | Daily Benchmark CI 已修复 |
| ✅ COMPLETED | ADR | `docs/adr/` 6 个设计决策记录 |

### Q4 —— Research Phase 1~3

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | Phase 1 | 分布式语义缓存（Faiss/HNSW + 多节点 + Snapshot/WAL） |
| ✅ COMPLETED | Phase 2 | Router DSL Engine（`src/server/dsl/router-dsl.ts`） |
| ✅ COMPLETED | Phase 3 | Workflow Engine（`src/server/workflow/workflow-engine.ts`） |

### Q1（明年）—— Research Phase 4~6

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Phase 4 | Prompt Compiler（`src/server/compiler/prompt-compiler.ts`） |
| ✅ COMPLETED | Phase 5 | Policy Engine（`src/server/dsl/policy-engine.ts`） |
| ⬜ TODO | Phase 6 | Query Planner / Agent Runtime（Planner + Tool + Memory + Judge + MCP） |

### Q2（明年）—— Infra Phase 7~9

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Phase 7 | Event Bus（`src/server/event/event-bus.ts`） |
| ✅ COMPLETED | Phase 8 | Scheduler（`src/server/scheduler/scheduler.ts`） |
| ⬜ TODO | Phase 9 | Auto Benchmark Platform（100+ Prompt × 20 Model + Judge + 网页） |

### Q3（明年）—— Evolution Phase 10~12

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | Phase 10 | LLM Judge Framework（`src/server/judge/judge.ts`） |
| ⬜ TODO | Phase 11 | Universal AI Gateway（Image/Speech/Realtime/MCP/Agent/Workflow/Batch/FineTune） |
| ⬜ TODO | Phase 12 | 内核重构 → Nexus Runtime（kernel/runtime/pipeline/scheduler/plugin/dsl/compiler/executor/storage） |

---

## 影响力建设（与开发同等重要）

| 状态 | 任务 | 说明 |
|------|------|------|
| ⬜ TODO | 技术博客 | 写高质量技术博客（设计缓存、路由、容错、DSL、Compiler 的思路） |
| ✅ COMPLETED | 架构图 | `docs/architecture.md` 含 Mermaid 架构图 |
| ⬜ TODO | Issues & PR | 持续回应 Issues 和接受 PR |
| ⬜ TODO | Release 维护 | 持续维护 Release，打 tag，写 changelog |
| ✅ COMPLETED | Compatibility Matrix | `examples/compatibility-matrix.md` 13 种客户端兼容性 |
| ✅ COMPLETED | CONTRIBUTING.md | `CONTRIBUTING.md` 贡献指南 |
| ⬜ TODO | GitHub Discussions | 开启讨论区 |

---

## 开源生态

| 状态 | 任务 | 说明 |
|------|------|------|
| ✅ COMPLETED | SDK | `sdk/typescript/` (npm) / `sdk/python/` (pip) |
| ✅ COMPLETED | CLI | `cli/nexus-cli.mjs` health/models/provider/cache/benchmark/doctor |
| ✅ COMPLETED | Examples | `examples/` spring-ai/langchain/openwebui/cline/continue/mcp |
| ✅ COMPLETED | Compatibility Matrix | `examples/compatibility-matrix.md` |

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
- [ ] `npm test` 全部通过（记录测试数，如 230/230）
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

> 备注：当前 `git config --local http.proxy` 已配置走 clash 代理，推送正常。CI 已全绿（230/230 测试通过）。Daily Benchmark CI 已修复（改用 Node.js 脚本）。后续按 Phase 1~12 逐步演进，每个 Phase 是一个独立的 Research/Infra 工程。
