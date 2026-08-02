# Nexus LLM Gateway - Roadmap

> 基于当前 v1.1.2 状态（CI 全绿、34/34 测试、工程级缓存 + 容错 + 代理支持），后续按优先级与性价比排序。

## P0（必须）

- [ ] **测试覆盖率提升**：Provider Mock 服务、集成测试、性能压测。
- [ ] **文档完善**：快速开始教程、Provider 配置示例、代理配置说明、架构图。
- [ ] **Benchmark**：GitHub Action 每日 benchmark，README 自动更新。
- [ ] **ADR（Architecture Decision Records）**：`docs/adr/` 记录设计决策，便于后续 Agent 理解项目。

## P1（架构）

- [ ] **Middleware Pipeline**：Auth → RateLimit → Cache → Router → Retry → Provider → Metrics → Logger，支持插拔。
- [ ] **Plugin System**：Provider/Router/Cache/Auth/Metrics 插件化，`npm install @nexus/provider-openai` 自动注册。
- [ ] **Config Hot Reload**：Dashboard 修改权重/路由，无需重启。

## P2（可靠性）

- [ ] **Bulkhead**：Provider 连接池隔离，互不影响。
- [ ] **Hedged Request**：超时未返回时同时发备用 provider，谁快用谁。
- [ ] **Adaptive Retry**：429/500/503 不同退避策略。

## P3（AI Native）

- [ ] **Prompt Router**：Prompt → Classifier → Router → Provider，按意图智能分发。
- [ ] **Prompt Guard**：PII 自动 Mask。
- [ ] **Prompt Rewrite**：System + Tenant + User Prompt 统一。

## P4（生态)

- [ ] **SDK**：`@nexus/sdk` (npm) / `nexus-sdk` (pip)。
- [ ] **CLI**：`nexus doctor / benchmark / cache clear / provider ls / health`。
- [ ] **Examples**：spring-ai / langchain / openwebui / cline / continue / mcp。
- [ ] **Compatibility Matrix**：OpenAI SDK / LangChain / Spring AI / LlamaIndex / Continue / Cline / Cherry Studio / Open WebUI。

## P5（企业)

- [ ] **Admin API**：`/admin/providers`、`/admin/cache`、`/admin/router`、`/admin/tenant`、`/admin/metrics`。
- [ ] **Tenant Quota**：按 Token 数限流，套餐 Free/Pro/Enterprise。
- [ ] **Provider Cost Center**：每日/月度消费统计，导出 CSV。

## P6（性能)

- [ ] **Streaming Buffer**：SSE 缓冲 32ms 后 flush，更稳。
- [ ] **Memory Pool**：减少 JSON Parse / 对象创建。
- [ ] **Compression**：SSE Gzip。

---

> 备注：当前 `git config --local http.proxy` 已配置走 clash 代理，推送正常。CI 已全绿。
</arg_value>
<task_progress>
- [x] 轮换 Master Key + 租户 Key（安全）
- [x] v1.0 容错三件套（熔断/加权路由/重试）+ 13 测试
- [x] v2 无 key 自动禁用（Capability Discovery）
- [x] Health Probe 四态健康探测
- [x] 34/34 测试全绿
- [x] GitHub push（v1.1.1/v1.1.2 tags）
- [x] 增强缓存权限模型修正（用户申请/管理员审核&取消）
- [x] Prometheus /metrics + CI 工作流
- [x] Provider 级代理支持（GEMINI_PROXY 走 clash）
- [x] Gemini 通过网关调用成功（gemini-flash-lite）
- [x] 代理配置写入 .env.example/production + README（去隐私化）
- [x] 定位 CI npm ci 失败根因：lockfile 缺 esbuild 0.28/@emnapi 解析条目（自相矛盥）
- [x] 删除 node_modules + lockfile，官方 registry 全新重建自洽 lockfile
- [x] 本地验证 npm ci 成功（esbuild 0.28.1 / @emnapi 齐全）
- [x] 本地验证 tsc + 34/34 通过
- [x] 提交重建的 lockfile（c41903c），CI 的 npm ci 已通过
- [x] 修复 flaky 测试：buildWeightedChain 用 mock Math.random 固定 picked
- [x] 提交推送 flaky 测试修复（63ddf99）
- [x] 确认 CI 变绿（run 30709007735 success）
- [x] 修复日志时区：pino-pretty 加入 timeZone: Asia/Shanghai
- [x] 编写 fit/improve.md 完善方向清单（按 P0~P6 优先级组织）
</task_progress>
</write_to_file>