# Nexus LLM Gateway - 开发路线图

> **目标**：将 Nexus LLM Gateway 从优秀开源项目提升为有特色、有竞争力的 AI 基础设施项目。
> **原则**：以产品定位为版本主题，不再以"新增功能"为单位。

---

## 项目当前状态

- **版本**：v1.2（AI Native Gateway）
- **CI**：GitHub Actions 全绿，192/192 测试通过（19 个测试文件）
- **lockfile**：自洽（esbuild 0.28.1 / @emnapi 2.0.0-alpha.3 齐全）
- **时区**：pino-pretty 固定 Asia/Shanghai
- **代理**：git 走 clash 代理 (127.0.0.1:7897)

### 已完成功能

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

#### P1 架构

- [x] **Middleware Pipeline**（`src/server/middleware/pipeline.ts`）：Auth → RateLimit → Cache → Router → Retry → Provider → Metrics → Logger，支持插拔
- [x] **Plugin System**（`src/server/plugins/plugin-system.ts`）：Provider/Router/Cache/Auth/Metrics 插件化
- [x] **Config Hot Reload**（`src/server/config/hot-reload.ts`）：Dashboard 修改权重/路由，无需重启

#### P2 可靠性

- [x] **Bulkhead**（`src/server/middleware/bulkhead.ts`）：Provider 连接池隔离，互不影响
- [x] **Hedged Request**（`src/server/middleware/hedged-request.ts`）：超时未返回时同时发备用 provider，谁快用谁
- [x] **Adaptive Retry**（`src/server/middleware/adaptive-retry.ts`）：429/500/503 不同退避策略

#### P3 AI Native

- [x] **Prompt Guard**（`src/server/prompt/guard.ts`）：PII 自动 Mask
- [x] **Prompt Rewrite**（`src/server/prompt/rewrite.ts`）：System + Tenant + User Prompt 统一

#### P6 性能

- [x] **Streaming Buffer**（`src/server/middleware/streaming-buffer.ts`）：SSE 缓冲 32ms 后 flush
- [x] **Memory Pool**（`src/server/middleware/memory-pool.ts`）：减少 JSON Parse / 对象创建
- [x] **Compression**（`src/server/middleware/compression.ts`）：SSE Gzip

#### P0 测试

- [x] **Provider Mock**（`src/server/providers/mock-provider.ts`）：单元测试不依赖真实 API
- [x] **Utils 测试**（`src/shared/utils.test.ts`）
- [x] **Registry 测试**（`src/server/providers/registry.test.ts`）

---

## 待实现版本路线

### v1.3 —— LLMOps

**主题**：Prompt 生命周期管理，让 Prompt 可版本、可测试、可评估。

#### 1. Prompt Version

**背景**：Prompt 变更无法追踪，无法回滚。

**目标**：
```
Prompt v1 → v2 → v3
支持 Rollback
```

**实现步骤**：
1. 设计 Prompt 版本表（id, name, content, version, created_at）。
2. 实现 CRUD API：`/api/prompts`。
3. 支持版本回滚接口。
4. 在 Chat 路由中集成，按版本使用 Prompt。

**验收标准**：
- 版本管理完整，回滚操作原子性。

#### 2. Prompt Playground

**背景**：用户无法在网页上直接调试 Prompt。

**目标**：网页调 Prompt，保存/导出/分享。

**实现步骤**：
1. 在 `dashboard/` 中添加 Playground 页面。
2. 集成聊天对话框 + Prompt 编辑器。
3. 支持保存 Prompt 到版本库。
4. 支持导出为 JSON / Markdown。
5. 支持生成分享链接。

**验收标准**：
- 页面加载 ≤ 2s。
- 保存/导出/分享功能正常。

#### 3. Prompt Evaluation

**背景**：无法量化 Prompt 质量。

**目标**：
```
Prompt → Judge Model → Score
```

**实现步骤**：
1. 集成 Judge Model（如 GPT-4 评分）。
2. 定义评分维度（相关性、准确性、流畅度）。
3. 实现批量评估接口。
4. 在 Dashboard 中展示评分趋势。

**验收标准**：
- 评估耗时 ≤ 30s/100条。
- 评分一致性 ≥ 85%。

#### 4. A/B Testing

**背景**：无法验证 Prompt 改动效果。

**目标**：
```
50% Prompt A / 50% Prompt B
统计 Cost / Latency / Quality
```

**实现步骤**：
1. 实现流量分发（按权重）。
2. 记录 A/B 组的指标。
3. 在 Dashboard 中展示对比报告。
4. 支持自动停止（某组明显优于另一组）。

**验收标准**：
- 流量分配准确率 ≥ 99%。
- 指标统计延迟 ≤ 1min。

---

### v1.4 —— Enterprise

**主题**：企业级治理，满足大型团队的安全、审批、预算需求。

#### 1. RBAC

**背景**：当前仅 Admin/User 两角色，权限粒度太粗。

**目标**：
```
Owner / Admin / Developer / Viewer / Auditor
```

**实现步骤**：
1. 设计角色枚举与权限矩阵。
2. 实现权限检查中间件。
3. 在 Admin API 中集成 RBAC。
4. 支持自定义角色。

**权限矩阵**：
| 角色 | 管理 Provider | 管理租户 | 查看指标 | 审批申请 | 审计日志 |
|------|--------------|----------|----------|----------|----------|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Developer | ❌ | ❌ | ✅ | ❌ | ❌ |
| Viewer | ❌ | ❌ | ✅ | ❌ | ❌ |
| Auditor | ❌ | ❌ | ✅ | ❌ | ✅ |

**验收标准**：
- 权限检查覆盖所有 Admin API。
- 自定义角色生效 ≤ 1min。

#### 2. Budget Center

**背景**：无法控制租户消费，可能超支。

**目标**：
```
预算：¥1000
已花：¥630
预测：月底 ¥1280
预警
```

**实现步骤**：
1. 设计租户预算表。
2. 实现实时消费统计。
3. 实现预测算法（基于历史趋势）。
4. 实现预警通知（邮件/钉钉）。
5. 在 Dashboard 中展示预算面板。

**验收标准**：
- 消费统计准确率 ≥ 99%。
- 预测误差 ≤ 15%。

#### 3. 审批流

**背景**：Key/Token 申请无法审批，存在安全风险。

**目标**：
```
申请 → 审批 → 生效 → 到期提醒
```

**实现步骤**：
1. 设计审批流程（申请/审批/生效/驳回/撤销）。
2. 实现审批接口。
3. 实现到期提醒。
4. 在 Dashboard 中展示审批列表。

**验收标准**：
- 审批流程完整，状态流转正确。
- 到期提醒准时（误差 ≤ 1min）。

#### 4. 审计中心

**背景**：无法追踪敏感操作，存在安全隐患。

**目标**：记录所有敏感操作。

**实现步骤**：
1. 定义审计日志表（user, action, resource, ip, timestamp）。
2. 在敏感操作点插入审计日志。
3. 实现审计日志查询接口。
4. 在 Dashboard 中展示审计列表。

**验收标准**：
- 审计日志覆盖所有敏感操作。
- 查询性能 ≤ 1s（1000条）。

---

### v2.0 —— AI Infrastructure

**主题**：从 LLM Gateway 升级为 AI 基础设施，支持 MCP、工具治理、插件生态。

#### 1. MCP Gateway

**背景**：未来不是 LLM Gateway，而是 Client → Gateway → MCP → 各种工具。

**目标**：
```
Client → Gateway → MCP → Database / Search / Browser
```

**实现步骤**：
1. 集成 MCP 协议支持。
2. 实现 MCP Server 注册与发现。
3. 实现 MCP 工具调用路由。
4. 在 Dashboard 中管理 MCP 服务器。

**验收标准**：
- MCP 协议兼容性 ≥ 95%。
- 工具调用成功率 ≥ 98%。

#### 2. Tool Registry

**背景**：工具分散在各处，难以管理。

**目标**：
```
GitHub / Google / Slack / Notion / MySQL
统一注册
```

**实现步骤**：
1. 设计 Tool 注册表。
2. 实现 Tool 注册/发现/调用接口。
3. 支持自定义 Tool。
4. 在 Dashboard 中管理 Tool。

**验收标准**：
- 注册表支持 ≥ 10 种常用工具。
- 工具调用成功率 ≥ 95%。

#### 3. Policy Engine

**背景**：企业需要数据安全保护。

**目标**：
```
PII Mask / Secret Detector / DLP
```

**实现步骤**：
1. 集成 PII 检测（身份证/银行卡/手机号）。
2. 集成 Secret 检测（API Key/密码）。
3. 实现 DLP 策略引擎。
4. 在请求链路中插入 Policy 检查。

**验收标准**：
- PII 检测准确率 ≥ 95%。
- Secret 检测准确率 ≥ 99%。

#### 4. 插件市场

**背景**：功能扩展依赖硬编码，难以定制。

**目标**：
```
Provider Plugin / Cache Plugin / Router Plugin / Auth Plugin
```

**实现步骤**：
1. 设计插件接口（Provider/Router/Cache/Auth/Metrics）。
2. 实现插件加载器。
3. 支持 `npm install @nexus/provider-openai` 自动注册。
4. 在 Dashboard 中管理插件。

**验收标准**：
- 插件加载成功率 ≥ 99%。
- 第三方插件兼容性 ≥ 90%。

---

## 研究方向

### 1. Semantic Cache 2.0

**背景**：当前缓存基于 Embedding 相似度，无法判断语义等价。

**目标**：
```
LLM Judge 判断同问，而非单纯 Embedding
```

**示例**：
```
"Transformer介绍一下" ≈ "Transformer是什么"
LLM 认为一样 → 直接缓存
```

**实现步骤**：
1. 集成 LLM Judge。
2. 实现语义等价判断。
3. 在 Cache 层集成。

### 2. Cache Confidence

**背景**：缓存命中无法评估质量。

**目标**：
```
confidence 0~1
0.99 → 直接返回
0.83 → 重新生成
```

**实现步骤**：
1. 为每条缓存记录 confidence。
2. 实现 confidence 阈值判断。
3. 低于阈值时重新生成。

### 3. Prompt Injection Firewall

**背景**：Prompt 注入攻击日益严重。

**目标**：检测 "Ignore previous instructions" 等攻击。

**实现步骤**：
1. 集成 Prompt 注入检测模型。
2. 在请求链路中插入检测。
3. 检测到攻击时拒绝请求。

### 4. Benchmark 平台

**背景**：无法量化 Gateway 性能。

**目标**：每日自动测试所有模型，输出排行榜。

**实现步骤**：
1. 设计 Benchmark 任务。
2. 实现自动化测试流程。
3. 在 Dashboard 中展示排行榜。

---

## 开源生态

### 1. SDK

**目标**：`@nexus/sdk` (npm) / `nexus-sdk` (pip)

**实现步骤**：
1. 设计 SDK 接口（chat/embeddings/models）。
2. 实现 npm 包。
3. 实现 pip 包。

### 2. CLI

**目标**：
```
nexus doctor
nexus benchmark
nexus cache clear
nexus provider ls
nexus health
```

**实现步骤**：
1. 设计 CLI 命令。
2. 实现命令逻辑。
3. 发布 npm 全局包。

### 3. Examples

**目标**：spring-ai / langchain / openwebui / cline / continue / mcp

**实现步骤**：
1. 创建 `examples/` 目录。
2. 实现各框架的接入示例。
3. 编写快速开始教程。

### 4. Compatibility Matrix

**目标**：
| Client | Support |
|--------|---------|
| OpenAI SDK | ✅ |
| LangChain | ✅ |
| Spring AI | ✅ |
| LlamaIndex | ✅ |
| Continue | ✅ |
| Cline | ✅ |
| Cherry Studio | ✅ |
| Open WebUI | ✅ |

**实现步骤**：
1. 验证各客户端兼容性。
2. 在 README 中维护矩阵。

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

> 备注：当前 `git config --local http.proxy` 已配置走 clash 代理，推送正常。CI 已全绿（192/192 测试通过）。