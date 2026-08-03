# Nexus LLM Gateway - 开发路线图

> **目标**：将 Nexus LLM Gateway 从优秀开源项目提升为有特色、有竞争力的 AI 基础设施项目。
> **原则**：以产品定位为版本主题，不再以"新增功能"为单位。

---

## 项目当前状态

- **版本**：v1.1.2
- **CI**：GitHub Actions 全绿，34/34 测试通过
- **lockfile**：自洽（esbuild 0.28.1 / @emnapi 2.0.0-alpha.3 齐全）
- **时区**：pino-pretty 固定 Asia/Shanghai
- **代理**：git 走 clash 代理 (127.0.0.1:7897)

### 已完成功能

- [x] 工程级语义缓存（Canonical Key、SingleFlight、分类 TTL、防毒化）
- [x] 容错三件套（Circuit Breaker、Weighted Router、Retry）
- [x] Health Probe 四态（UNKNOWN/HEALTHY/DEGRADED/UNREACHABLE）
- [x] Capability Discovery（无 key 自动禁用云 provider）
- [x] Prometheus /metrics 端点
- [x] Provider 级代理支持（`<TYPE>_PROXY` 环境变量）
- [x] CLI 工具、离线基准测试、性能压测
- [x] CI 每日基准工作流
- [x] 时区修复（Asia/Shanghai）
- [x] **v1.2 AI Native Gateway**：Intent Router + Cost Optimizer + Quality Score + Adaptive TTL

---

## 版本路线

### v1.2 —— AI Native Gateway

**主题**：让 Gateway 真正"懂"用户意图，自动选择最佳 Provider。

#### 1. Intent Router

**背景**：当前 Router 依赖用户指定 `model`，无法智能分发。

**目标**：
```
Prompt
    │
    ▼
Intent Classifier
    │
    ├── Code
    ├── Math
    ├── Translation
    ├── Vision
    ├── Long Context
    └── Cheap Chat
          │
          ▼
最佳 Provider
```

**实现步骤**：
1. 定义 Intent 分类枚举（Code/Math/Translation/Vision/LongContext/CheapChat）。
2. 实现 Intent Classifier：
   - 简单规则：关键词匹配（如 "代码" → Code）。
   - 进阶：调用本地小模型或 LLM 分类。
3. 配置 Intent → Provider 映射表（可热更新）。
4. 在 `src/server/routes/chat.ts` 中集成，替换当前的 `weightedPicker`。

**示例**：
```
"帮我写 Spring Boot" → Code → Claude
"解释线性代数" → Math → Qwen
"识别图片" → Vision → Gemini
```

**验收标准**：
- Intent 分类准确率 ≥ 90%。
- 路由决策耗时 ≤ 50ms。

#### 2. Cost Optimizer

**背景**：`model=auto` 时，用户希望自动选择性价比最高的 Provider。

**目标**：
```
估算 token
    ↓
预算
    ↓
历史成功率
    ↓
当前价格
    ↓
选择 Provider
```

**实现步骤**：
1. 集成 Token 计算器（基于 tiktoken 或简单词数估算）。
2. 配置 Provider 价格表（per 1k tokens）。
3. 配置租户预算上限。
4. 实现 Cost Optimizer：
   - 过滤超预算 Provider。
   - 按性价比（成功率 / 价格）排序。
   - 自动选择最优。

**示例**：
```
用户：model=auto
Gateway：预计花费 ¥0.012 → 自动切 DeepSeek
```

**验收标准**：
- 成本估算误差 ≤ 10%。
- 自动路由成功率 ≥ 95%。

#### 3. Quality Score Router

**背景**：单纯权重路由无法反映 Provider 实时表现。

**目标**：
```
Score = 0.5 × Quality + 0.3 × Latency + 0.2 × Cost
```

**实现步骤**：
1. 记录每个 Provider 的历史指标：
   - Quality：成功率 / 用户满意度。
   - Latency：平均响应时间。
   - Cost：平均每次消费。
2. 实现 Score 计算函数。
3. 在 Router 中按 Score 排序，选择最高分 Provider。
4. 支持 Score 衰减（老数据权重降低）。

**验收标准**：
- Score 更新延迟 ≤ 5min。
- 路由决策耗时 ≤ 100ms。

#### 4. Adaptive TTL

**背景**：当前缓存 TTL 固定，无法适应不同问题类型的时效性。

**目标**：
```
天气 → TTL 5min
Spring IOC → TTL 30天
```

**实现步骤**：
1. 定义问题类型 → TTL 映射表。
2. 在 Cache 层集成 Adaptive TTL 逻辑。
3. 支持手动覆盖（用户指定 TTL）。

**验收标准**：
- TTL 自动判断准确率 ≥ 95%。

---

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

> 备注：当前 `git config --local http.proxy` 已配置走 clash 代理，推送正常。CI 已全绿。
</arg_value>
<task_progress>
- [x] 轮换 Master Key + 租户 Key（安全）
- [x] v1.0 容错三件套（熔断/加权路由/重试）+ 13 测试
- [x] v2 无 key 自动禁用（Capability Discovery）
- [x] Health Probe 四态健底探测
- [x] 34/34 测试全绿
- [x] GitHub push（v1.1.1/v1.1.2 tags）
- [x] 增强缓存权限模型修正（用户申请/管理员审核&取消）
- [x] Prometheus /metrics + CI 工作流
- [x] Provider 级代理支持（GEMINI_PROXY 走 clash）
- [x] Gemini 通过网关调用成功（gemini-flash-lite）
- [x] 代理配置写入 .env.example/production + README（去隐私化）
- [x] 定位 CI npm ci 失败根因：lockfile 缺 esbuild 0.28/@emnapi 解析条目（自相矛）
- [x] 删除 node_modules + lockfile，官方 registry 全新重建自洽 lockfile
- [x] 本地验证 npm ci 成功（esbuild 0.28.1 / @emnapi 齐全）
- [x] 本地验证 tsc + 34/34 通过
- [x] 提交重建的 lockfile（c41903c），CI 的 npm ci 已通过
- [x] 修复 flaky 测试：buildWeightedChain 用 mock Math.random 固定 picked
- [x] 提交推送 flaky 测试修复（63ddf99）
- [x] 确认 CI 变绿（run 30709007735 success）
- [x] 修复日志时区：pino-pretty 加入 timeZone: Asia/Shanghai
- [x] 编写 fit/improve.md 完善方向清单（按 P0~P6 优先级组织）
- [x] 推送 improve.md + logger 时区修复到 GitHub（bd2cedf）
- [x] 停止本地服务进程
- [x] 从 GitHub 拉取同步项目到本地（3655616）
- [x] 重写 fit/improve.md 为版本路线（v1.2 AI Native / v1.3 LLMOps / v1.4 Enterprise / v2.0 AI Infra）
- [x] 推送重写后的 improve.md 到 GitHub（cd0e3ee）
- [x] 重写 fit/improve.md 为详细开发路线图（含背景/目标/步骤/验收标准）
</task_progress>
</write_to_file>