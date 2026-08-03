# Nexus LLM Gateway - 产品路线图

> **目标转变**：从"做一个功能很多的 Gateway"转变为"做一个别人愿意真正使用、愿意贡献代码、愿意推荐的 Gateway"。
> **当前状态**：v1.2 AI Native Gateway，CI 全绿，192/192 测试通过，功能已足够丰富，后续聚焦产品化与影响力。

---

## 项目当前状态

- **版本**：v1.2（AI Native Gateway）
- **CI**：GitHub Actions 全绿，192/192 测试通过（19 个测试文件）
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

#### 测试

- [x] **Provider Mock**（`src/server/providers/mock-provider.ts`）：单元测试不依赖真实 API
- [x] **Utils 测试**（`src/shared/utils.test.ts`）
- [x] **Registry 测试**（`src/server/providers/registry.test.ts`）

---

## 未修复问题

- [ ] **Daily Benchmark CI 失败**：`sed` 命令语法错误（`sed: -e expression #1, char 100: extra characters after command`），在更新 README benchmark 结果区块时 `sed -i` 格式问题。需修复 `.github/workflows/` 中的 benchmark workflow 脚本。
- [ ] **Node 20 弃用警告**：`actions/checkout@v4` 和 `actions/setup-node@v4` 仍使用 Node 20，已被强制运行在 Node 24。需升级 action 版本或设置 `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`。

---

## 产品方向（10 条路线）

### 1. AI Gateway Benchmark（★★★★★ 最推荐）

**背景**：所有 Gateway（LiteLLM/OneAPI/OpenRouter/OpenWebUI/Nexus）几乎没人有长期公开 Benchmark。

**目标**：每天 GitHub Action 自动测试所有模型，统计 TTFT/Token/s/P95/Availability/Cost/Cache Hit/Success Rate，README 自动更新。

**实现步骤**：
1. 修复 Daily Benchmark CI 的 `sed` 命令语法错误。
2. 在 README 中添加 `<!-- BENCHMARK_START -->` / `<!-- BENCHMARK_END -->` 标记。
3. 扩展 benchmark 脚本，覆盖更多指标（TTFT、P95、Cache Hit）。
4. 确保每日自动运行 + 自动提交结果到 README。

**验收标准**：
- Daily Benchmark CI 每日成功运行。
- README 自动更新 "Today's Benchmark" 区块。

### 2. LLM Observability（★★★★★）

**背景**：不要只是 Prometheus，而是真正的全链路 Trace。

**目标**：
```
Request → Router → Cache → Retry → Provider → LLM → Streaming
全部 Trace，生成 Waterfall
```

**实现步骤**：
1. 集成 OpenTelemetry，为每个中间件添加 Span。
2. 生成 Waterfall 视图（Redis 12ms → Router 4ms → DeepSeek 612ms）。
3. 在 Dashboard 中展示 Trace 详情。

**验收标准**：
- 全链路 Trace 覆盖所有中间件。
- Waterfall 可视化清晰。

### 3. LLM Analytics（★★★★★）

**背景**：后台每天统计 Prompt Top10 / Model Top10 / Intent Distribution / Cost / Token / Latency。

**目标**：AI 自动总结趋势（如"今天编程请求上涨 18%，建议增加 Claude 权重"）。

**实现步骤**：
1. 设计 Analytics 数据聚合表。
2. 实现每日聚合统计。
3. 集成 AI 自动总结。
4. 在 Dashboard 中展示 Analytics 面板。

**验收标准**：
- Analytics 面板展示 Top10/分布/趋势。
- AI 总结准确且可操作。

### 4. OpenRouter 路线（Marketplace）

**背景**：不是 Gateway，而是 Marketplace。用户永远 `model=auto`，Gateway 负责调度，以后收费。

**实现步骤**：
1. 支持 100+ 模型注册。
2. 完善 `model=auto` 调度逻辑。
3. 设计计费模型。
4. 提供 API Key 管理面板。

### 5. AI Evaluation

**背景**：每个 Prompt 自动 Judge，输出 Quality/Latency/Cost。

**实现步骤**：
1. 集成 Judge Model。
2. 实现批量评估。
3. 输出对比报告。

### 6. Gateway Memory

**背景**：不是 Chat Memory，而是 Gateway Memory。Gateway 越来越聪明。

**实现步骤**：
1. 记录 Tenant History / Preference / Provider Optimization。
2. 基于历史优化路由。

### 7. Agent Runtime

**背景**：Gateway 还是 Chat，以后支持 Tool/Memory/Planner/Executor。

**实现步骤**：
1. 集成 Tool 调用。
2. 集成 Memory。
3. 实现 Planner/Executor。

### 8. 多节点 HA

**背景**：Gateway A/B/C → Redis Cluster → Shared Cache/Metrics。

**实现步骤**：
1. 支持多节点部署。
2. 共享 Redis Cluster。
3. 共享 Metrics。

### 9. 商业化

**背景**：真正 Billing/Stripe/Quota/Invoice/Organization。

**实现步骤**：
1. 集成 Stripe。
2. 实现 Quota 管理。
3. 实现 Invoice 生成。
4. 实现 Organization 管理。

### 10. 生态 Integration

**背景**：VSCode Plugin / JetBrains / Continue / Cline / Spring AI / LangChain 官方 Integration。

**实现步骤**：
1. 开发 VSCode 插件。
2. 编写各框架 Integration 文档。
3. 提交到各框架的官方列表。

---

## 季度路线

### Q3（当前季度）—— 文档与 Benchmark

- [ ] **Documentation**：完善 README、API 文档、架构图。
- [ ] **Tutorial**：5 分钟快速开始教程。
- [ ] **Video**：录制演示视频。
- [ ] **Examples**：spring-ai / langchain / openwebui / cline / continue / mcp 接入示例。
- [ ] **Benchmark**：修复 Daily Benchmark CI，README 自动更新每日结果。
- [ ] **ADR**：建立 `docs/adr/` 记录设计决策。

### Q4 —— 社区与贡献

- [ ] **Community**：回应 Issues，接受 PR。
- [ ] **Discussion**：开启 GitHub Discussions。
- [ ] **Contributor**：编写 CONTRIBUTING.md，降低贡献门槛。
- [ ] **Plugin**：完善插件开发文档，鼓励第三方插件。

### Q1（明年）—— 云与市场

- [ ] **Cloud**：支持云部署（Docker/K8s/Helm）。
- [ ] **Console**：完善 Dashboard 管理面板。
- [ ] **Marketplace**：支持 100+ 模型注册与调度。

### Q2（明年）—— 企业与商业化

- [ ] **Enterprise**：RBAC / Budget Center / 审批流 / 审计中心。
- [ ] **Billing**：Stripe 集成 / Quota / Invoice。
- [ ] **Organization**：多组织管理。

---

## 影响力建设（与功能同等重要）

- [ ] **技术博客**：写高质量技术博客（设计缓存、路由、容错的思路）。
- [ ] **架构图**：制作清晰的架构图和性能分析。
- [ ] **Issues & PR**：持续回应 Issues 和接受 PR。
- [ ] **Release 维护**：持续维护 Release，打 tag，写 changelog。
- [ ] **Compatibility Matrix**：在 README 中维护客户端兼容性矩阵。

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

---

> 备注：当前 `git config --local http.proxy` 已配置走 clash 代理，推送正常。CI 已全绿（192/192 测试通过）。Daily Benchmark CI 因 `sed` 语法错误待修复。