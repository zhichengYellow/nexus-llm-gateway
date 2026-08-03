# Nexus Runtime - 长远路线图

> **愿景**：从 LLM Gateway 演进为 Universal AI Runtime —— 所有 AI App 跑在 Nexus Runtime 上。
> **当前状态**：v1.3（Observability + Analytics + Memory），CI 全绿，206/206 测试通过。
> **原则**：不再以"新增功能"为单位，而是以"基础设施抽象"为单位。每个阶段是一个需要数周打磨的 Research/Infra 工程。

---

## 项目当前状态

- **版本**：v1.3（Observability + Analytics + Memory）
- **CI**：GitHub Actions 全绿，206/206 测试通过（21 个测试文件）
- **lockfile**：自洽（esbuild 0.28.1 / @emnapi 2.0.0-alpha.3 齐全）
- **时区**：pino-pretty 固定 Asia/Shanghai
- **代理**：git 走 clash 代理 (127.0.0.1:7897)

### 已完成功能清单

#### 基础能力（v1.0~v1.1.2）

- [x] 工程级语义缓存（Canonical Key、SingleFlight、分类 TTL、防毒化）
- [x] 容错三件套（Circuit Breaker、Weighted Router、Retry）
- [x] Health Probe 四态（UNKNOWN/HEALTHY/DEGRADED/UNREACHABLE）
- [x] Capability Discovery（无 key 自动禁用云 provider）
- [x] Prometheus /metrics 端点
- [x] Provider 级代理支持（`<TYPE>_PROXY` 环境变量）
- [x] CLI 工具、离线基准测试、性能压测
- [x] CI 每日基准工作流
- [x] 时区修复（Asia/Shanghai）

#### v1.2 AI Native Gateway

- [x] **Intent Router**（`src/server/prompt/router.ts`）：Prompt → Intent Classifier → Best Provider，支持 `model=auto`
- [x] **Cost Optimizer**（`src/server/prompt/cost-optimizer.ts`）：估算 token/预算/历史成功率/价格，自动选最便宜 provider
- [x] **Quality Score Router**（`src/server/prompt/quality-score.ts`）：Score = 0.5×Quality + 0.3×Latency + 0.2×Cost
- [x] **Adaptive TTL**（`src/server/prompt/adaptive-ttl.ts`）：按问题类型自动判断 TTL（天气 5min / 知识 30天）

#### 架构

- [x] **Middleware Pipeline**（`src/server/middleware/pipeline.ts`）：Auth → RateLimit → Cache → Router → Retry → Provider → Metrics → Logger，支持插拔
- [x] **Plugin System**（`src/server/plugins/plugin-system.ts`）：Provider/Router/Cache/Auth/Metrics 插件化
- [x] **Config Hot Reload**（`src/server/config/hot-reload.ts`）：Dashboard 修改权重/路由，无需重启

#### 可靠性

- [x] **Bulkhead**（`src/server/middleware/bulkhead.ts`）：Provider 连接池隔离，互不影响
- [x] **Hedged Request**（`src/server/middleware/hedged-request.ts`）：超时未返回时同时发备用 provider，谁快用谁
- [x] **Adaptive Retry**（`src/server/middleware/adaptive-retry.ts`）：429/500/503 不同退避策略

#### AI Native

- [x] **Prompt Guard**（`src/server/prompt/guard.ts`）：PII 自动 Mask
- [x] **Prompt Rewrite**（`src/server/prompt/rewrite.ts`）：System + Tenant + User Prompt 统一

#### 性能

- [x] **Streaming Buffer**（`src/server/middleware/streaming-buffer.ts`）：SSE 缓冲 32ms 后 flush
- [x] **Memory Pool**（`src/server/middleware/memory-pool.ts`）：减少 JSON Parse / 对象创建
- [x] **Compression**（`src/server/middleware/compression.ts`）：SSE Gzip

#### v1.3 Observability + Analytics

- [x] **LLM Observability**（`src/server/middleware/observability.ts`）：全链路 Trace + Waterfall + Span 记录
- [x] **LLM Analytics**（`src/server/analytics/analytics.ts`）：Top10 / 趋势 / 分布统计
- [x] **Gateway Memory**（`src/server/prompt/gateway-memory.ts`）：租户历史/偏好学习/衰减优化
- [x] **CI 修复**：Daily Benchmark sed 错误修复 + Node 20 弃用警告修复

#### 测试

- [x] **Provider Mock**（`src/server/providers/mock-provider.ts`）：单元测试不依赖真实 API
- [x] **Utils 测试**（`src/shared/utils.test.ts`）
- [x] **Registry 测试**（`src/server/providers/registry.test.ts`）

---

## 长远路线：Nexus Runtime 演进

### Phase 1: 分布式语义缓存（★★★★★）

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
1. **Embedding 自动生成**：集成 embedding 模型（text-embedding-3-small / bge-small），自动为每个 prompt 生成 embedding。
2. **ANN Index**：集成 Faiss 或 HNSW，支持近似最近邻搜索，替代当前的 Redis 向量搜索。
3. **Cache Confidence**：为每条缓存记录 confidence 分数（0~1），低于阈值时重新生成而非直接返回。
4. **Auto Refresh**：后台定时刷新热门缓存的 embedding，保持时效性。
5. **多节点同步**：缓存节点间通过 Redis Pub/Sub 或 Raft 协议同步索引。
6. **分片（Sharding）**：按 hash(prompt) 分片，支持水平扩展。
7. **Snapshot + WAL**：定期快照 + Write-Ahead Log，支持崩溃恢复。
8. **独立服务**：将缓存从 Gateway 中拆出，成为独立的 Semantic Cache Service。

**验收标准**：
- 缓存查询延迟 P99 ≤ 10ms。
- 支持至少 3 节点集群。
- 崩溃恢复后数据零丢失。
- 缓存命中率 ≥ 60%（相同 prompt）。

**预估工作量**：5000+ 行，2~3 周。

---

### Phase 2: 自研 Router DSL Engine（★★★★★）

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

**动态规则示例**：
```yaml
policies:
  - if: "latency > 1000"
    then: "disable provider"
  - if: "error_rate > 0.05"
    then: "circuit_break"
```

**实现步骤**：
1. **DSL 设计**：定义 YAML schema，支持条件表达式（intent/latency/cost/context_length/error_rate）。
2. **DSL Parser**：实现 YAML → AST 解析器。
3. **DSL Compiler**：AST → 可执行的路由规则。
4. **DSL Runtime**：运行时引擎，支持热加载 YAML。
5. **规则验证**：启动时校验 DSL 语法和逻辑。
6. **Dashboard 集成**：在 Dashboard 中可视化编辑 DSL。
7. **版本管理**：DSL 变更支持版本管理和回滚。

**验收标准**：
- DSL 语法覆盖所有路由场景。
- 热加载延迟 ≤ 1s。
- DSL 解析错误有清晰报错。
- 支持 50+ 规则无性能下降。

**预估工作量**：3000+ 行，1~2 周。

---

### Phase 3: Workflow Engine（★★★★★）

**背景**：当前请求流程是固定的 Pipeline，无法支持复杂的多步推理。

**目标**：像 LangGraph 一样，每一步是 Node，真正 Flow。

**目标架构**：
```
Prompt → Router → Judge → Retry → Rewrite → LLM → Judge → Cache
```

**实现步骤**：
1. **Node 抽象**：定义 `WorkflowNode` 接口（input/output/execute）。
2. **Edge 定义**：定义节点间的连接（条件跳转、循环、并行）。
3. **Workflow DSL**：YAML 定义工作流。
4. **Workflow Runtime**：执行引擎，支持 DAG 调度。
5. **条件分支**：支持 if/else、switch 分支。
6. **循环**：支持 retry 循环、judge 循环。
7. **并行**：支持多节点并行执行（如同时调用多个 provider）。
8. **可视化**：在 Dashboard 中展示 Workflow DAG 图。

**验收标准**：
- 支持至少 10 种 Node 类型。
- DAG 调度无死锁。
- 支持循环和并行。
- 可视化清晰。

**预估工作量**：4000+ 行，2~3 周。

---

### Phase 4: Prompt Compiler（★★★★★）

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
1. **Prompt AST**：定义 Prompt 的抽象语法树。
2. **编译 Pass**：每个阶段是一个编译 Pass（Rewrite/Merge/Tool/Safety/Provider）。
3. **优化**：Token 压缩、冗余去除、上下文窗口管理。
4. **Provider 适配**：不同 Provider 的 Prompt 格式自动转换。
5. **缓存**：编译结果缓存，相同输入直接复用。
6. **Debug**：编译过程可视化，每一步的中间结果可查看。

**验收标准**：
- 编译 Pass 可插拔。
- Token 压缩率 ≥ 15%。
- Provider 适配覆盖所有支持的 Provider。
- 编译过程可 Debug。

**预估工作量**：3000+ 行，1~2 周。

---

### Phase 5: Policy Engine（★★★★★）

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
1. **Policy DSL**：定义 YAML schema，支持表达式（contains_pii/contains_secret/contains_injection）。
2. **Policy Compiler**：DSL → 可执行规则。
3. **Policy Runtime**：运行时引擎，在请求链路中插入检查。
4. **PII 检测**：身份证/银行卡/手机号/邮箱。
5. **Secret 检测**：API Key/密码/Token。
6. **Injection 检测**：Prompt 注入攻击模式。
7. **DLP**：数据泄露防护（敏感数据不出域）。
8. **审计**：所有 Policy 触发记录审计日志。

**验收标准**：
- PII 检测准确率 ≥ 95%。
- Secret 检测准确率 ≥ 99%。
- Injection 检测覆盖已知攻击模式。
- Policy 热加载延迟 ≤ 1s。

**预估工作量**：2500+ 行，1~2 周。

---

### Phase 6: Query Planner（Agent Runtime）（★★★★★）

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
1. **Planner**：根据 Prompt 规划执行步骤（ReAct / Plan-and-Execute）。
2. **Tool Registry**：工具注册/发现/调用。
3. **Memory**：短期记忆（对话上下文）+ 长期记忆（向量检索）。
4. **Executor**：执行引擎，支持串行/并行/循环。
5. **Judge**：结果评估，决定是否重试或继续。
6. **MCP 集成**：支持 MCP 协议调用外部工具。
7. **Sandbox**：工具执行沙箱，限制权限。

**验收标准**：
- 支持至少 5 种工具（搜索/代码执行/数据库查询/API 调用/文件操作）。
- Planner 规划准确率 ≥ 80%。
- 工具执行成功率 ≥ 95%。
- 支持多步推理（≥ 5 步）。

**预估工作量**：5000+ 行，2~3 周。

---

### Phase 7: Event Bus（★★★★☆）

**背景**：整个 Gateway 是同步调用链，无法支持异步事件驱动。

**目标**：Event Driven，插件监听 Event。

**事件类型**：
```
RequestStart → Retry → CacheHit → ProviderSwitch → CostChanged → ResponseEnd
```

**实现步骤**：
1. **Event 定义**：定义所有事件类型和 payload。
2. **Event Bus**：实现 Pub/Sub 模式。
3. **Event Store**：事件持久化（可选）。
4. **Plugin 监听**：插件可订阅任意事件。
5. **Event Replay**：支持事件回放（调试/恢复）。
6. **Webhook**：支持外部 Webhook 订阅。

**验收标准**：
- 事件投递延迟 ≤ 10ms。
- 支持至少 20 种事件类型。
- 插件订阅无性能影响。

**预估工作量**：2000+ 行，1 周。

---

### Phase 8: Scheduler（★★★★☆）

**背景**：后台任务（Benchmark/Health Check/TTL Refresh）散落各处，无统一管理。

**目标**：统一 Scheduler，支持 Cron 表达式。

**实现步骤**：
1. **Cron 引擎**：支持 Cron 表达式定义任务。
2. **任务注册**：Benchmark / Health Check / TTL Refresh / Embedding Refresh / Report。
3. **任务管理**：启动/停止/暂停/查看状态。
4. **失败重试**：任务失败自动重试。
5. **Dashboard 集成**：在 Dashboard 中管理任务。

**验收标准**：
- Cron 表达式支持标准语法。
- 任务执行不阻塞主线程。
- 失败重试可配置。

**预估工作量**：1500+ 行，3~5 天。

---

### Phase 9: Auto Benchmark Platform（★★★★★）

**背景**：当前 Benchmark 只是简单的延迟测试，无法全面评估。

**目标**：每天 100+ Prompt × 20 Model × 10 Provider，统计 Latency/Accuracy/Cost/Cache/Judge Score，生成网页。

**实现步骤**：
1. **Prompt 集**：收集 100+ 标准测试 Prompt（代码/数学/翻译/推理/创作）。
2. **多模型测试**：每个 Prompt 对所有支持的模型测试。
3. **多 Provider 测试**：每个模型对所有 Provider 测试。
4. **Judge 评分**：用 Judge Model 对每个响应评分。
5. **统计报告**：Latency P50/P95/P99、Accuracy、Cost、Cache Hit。
6. **网页生成**：自动生成排行榜网页，部署到 GitHub Pages。
7. **历史趋势**：保存历史数据，展示趋势图。

**验收标准**：
- 每日自动运行。
- 覆盖 100+ Prompt × 20+ Model。
- Judge 评分一致性 ≥ 85%。
- 网页自动更新。

**预估工作量**：3000+ 行，1~2 周。

---

### Phase 10: LLM Judge Framework（★★★★★）

**背景**：需要客观评估不同 LLM 的输出质量。

**目标**：
```
Prompt → OpenAI / Claude / Gemini → Judge → Score
```

**实现步骤**：
1. **Judge Model 集成**：支持 GPT-4 / Claude / Gemini 作为 Judge。
2. **评分维度**：相关性、准确性、流畅度、安全性、完整性。
3. **批量评估**：支持批量评估 100+ 响应。
4. **对比报告**：多模型对比，输出排行榜。
5. **自定义评分**：支持自定义评分标准。
6. **API**：提供 `/api/judge` 接口。

**验收标准**：
- 评分一致性 ≥ 85%。
- 批量评估 100 条 ≤ 30s。
- 支持至少 3 个 Judge Model。

**预估工作量**：2000+ 行，1 周。

---

### Phase 11: Gateway Evolution → Universal AI Gateway（★★★★★）

**背景**：Gateway 不只是 Chat，而是支持所有 OpenAI API。

**目标**：支持 Chat / Completion / Embedding / Image / Speech / Realtime / MCP / Agent / Workflow / Judge / Batch / FineTune。

**实现步骤**：
1. **Chat/Completion**：已有。
2. **Embedding**：已有，增加缓存。
3. **Image**：支持 DALL-E / Stable Diffusion / Midjourney。
4. **Speech**：支持 Whisper / TTS。
5. **Realtime**：支持 WebSocket 实时对话。
6. **MCP**：支持 MCP 协议。
7. **Agent**：支持 Agent Runtime。
8. **Workflow**：支持 Workflow Engine。
9. **Judge**：支持 LLM Judge。
10. **Batch**：支持批量请求。
11. **FineTune**：支持微调任务管理。

**验收标准**：
- 覆盖所有 OpenAI API 端点。
- 每种 API 都有缓存/限流/计费。
- 统一的 Dashboard 管理。

**预估工作量**：5000+ 行，2~3 周。

---

### Phase 12: 内核重构 → Nexus Runtime（★★★★★）

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
1. **Kernel**：生命周期管理（init/start/stop）、依赖注入容器。
2. **Runtime**：请求上下文管理、执行栈、错误处理。
3. **Pipeline**：从 middleware 重构为 pipeline。
4. **Scheduler**：统一调度器。
5. **Plugin**：插件系统重构。
6. **DSL**：统一 DSL 引擎。
7. **Compiler**：Prompt Compiler。
8. **Executor**：Agent Runtime + Workflow Engine。
9. **Storage**：分布式缓存 + 向量索引。

**验收标准**：
- 所有现有功能在新架构下正常工作。
- 测试覆盖率 ≥ 80%。
- 性能不下降。
- 插件兼容旧接口。

**预估工作量**：8000+ 行，3~4 周。

---

## 季度路线

### Q3（当前）—— 文档与 Benchmark

- [ ] **Documentation**：完善 README、API 文档、架构图。
- [ ] **Tutorial**：5 分钟快速开始教程。
- [ ] **Video**：录制演示视频。
- [ ] **Examples**：spring-ai / langchain / openwebui / cline / continue / mcp 接入示例。
- [ ] **Benchmark**：修复 Daily Benchmark CI，README 自动更新每日结果。
- [ ] **ADR**：建立 `docs/adr/` 记录设计决策。

### Q4 —— Research Phase 1~3

- [ ] **Phase 1**：分布式语义缓存（Faiss/HNSW + 多节点 + Snapshot/WAL）。
- [ ] **Phase 2**：Router DSL Engine（YAML DSL + Parser + Compiler + Runtime）。
- [ ] **Phase 3**：Workflow Engine（Node/Edge/DAG + 条件分支 + 循环 + 并行）。

### Q1（明年）—— Research Phase 4~6

- [ ] **Phase 4**：Prompt Compiler（AST + 编译 Pass + 优化 + Provider 适配）。
- [ ] **Phase 5**：Policy Engine（DSL + PII/Secret/Injection 检测 + DLP）。
- [ ] **Phase 6**：Query Planner / Agent Runtime（Planner + Tool + Memory + Judge + MCP）。

### Q2（明年）—— Infra Phase 7~9

- [ ] **Phase 7**：Event Bus（Pub/Sub + Event Store + Webhook）。
- [ ] **Phase 8**：Scheduler（Cron + 任务管理 + 失败重试）。
- [ ] **Phase 9**：Auto Benchmark Platform（100+ Prompt × 20 Model + Judge + 网页）。

### Q3（明年）—— Evolution Phase 10~12

- [ ] **Phase 10**：LLM Judge Framework（多 Judge Model + 评分维度 + 对比报告）。
- [ ] **Phase 11**：Universal AI Gateway（Image/Speech/Realtime/MCP/Agent/Workflow/Batch/FineTune）。
- [ ] **Phase 12**：内核重构 → Nexus Runtime（kernel/runtime/pipeline/scheduler/plugin/dsl/compiler/executor/storage）。

---

## 影响力建设（与开发同等重要）

- [ ] **技术博客**：写高质量技术博客（设计缓存、路由、容错、DSL、Compiler 的思路）。
- [ ] **架构图**：制作清晰的架构图和性能分析。
- [ ] **Issues & PR**：持续回应 Issues 和接受 PR。
- [ ] **Release 维护**：持续维护 Release，打 tag，写 changelog。
- [ ] **Compatibility Matrix**：在 README 中维护客户端兼容性矩阵。
- [ ] **CONTRIBUTING.md**：编写贡献指南，降低贡献门槛。
- [ ] **GitHub Discussions**：开启讨论区。

---

## 开发约定

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

> 备注：当前 `git config --local http.proxy` 已配置走 clash 代理，推送正常。CI 已全绿（206/206 测试通过）。Daily Benchmark CI 已修复（改用 Node.js 脚本）。后续按 Phase 1~12 逐步演进，每个 Phase 是一个独立的 Research/Infra 工程。