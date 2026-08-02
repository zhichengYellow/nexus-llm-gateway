# Nexus LLM Gateway - Roadmap

> 基于当前 v1.1.2 状态（CI 全绿、34/34 测试、工程级缓存 + 容错 + 代理支持），后续按产品定位演进。

## 已完成功能

- [x] 工程级语义缓存（Canonical Key、SingleFlight、分类 TTL、防毒化）
- [x] 容错三件套（Circuit Breaker、Weighted Router、Retry）
- [x] Health Probe 四态
- [x] Capability Discovery（无 key 自动禁用）
- [x] Prometheus /metrics
- [x] Provider 级代理支持（clash）
- [x] CLI 工具、离线基准测试、性能压测
- [x] CI 每日基准工作流
- [x] 时区修复（Asia/Shanghai）

---

## 版本路线

### v1.2 —— AI Native Gateway

- [ ] **Intent Router**：Prompt → Intent Classifier → Best Provider
- [ ] **Cost Optimizer**：`model=auto` 时估算 token/预算/历史成功率/当前价格，自动选最便宜 provider
- [ ] **Quality Score Router**：综合 Quality(0.5) + Latency(0.3) + Cost(0.2) 实时选择
- [ ] **Adaptive TTL**：按问题类型自动判断 TTL（天气 5min / 知识 30天）

### v1.3 —— LLMOps

- [ ] **Prompt Version**：Prompt 版本管理 + Rollback
- [ ] **Prompt Playground**：网页调 Prompt，保存/导出/分享
- [ ] **Prompt Evaluation**：自动用 Judge Model 评分
- [ ] **A/B Testing**：50% Prompt A / 50% Prompt B，统计 Cost/Latency/Quality

### v1.4 —— Enterprise

- [ ] **RBAC**：Owner / Admin / Developer / Viewer / Auditor 细粒度权限
- [ ] **Budget Center**：租户预算/已花/预测/预警
- [ ] **审批流**：Key 申请 / Token 申请，Leader 审批
- [ ] **审计中心**：记录所有敏感操作

### v2.0 —— AI Infrastructure

- [ ] **MCP Gateway**：Client → Gateway → MCP → Database/Search/Browser 统一管理
- [ ] **Tool Registry**：GitHub/Google/Slack/Notion/MySQL 统一注册
- [ ] **Policy Engine**：PII Mask / Secret Detector / DLP
- [ ] **插件市场**：Provider/Cache/Router/Auth 插件发布

---

## 研究方向

- [ ] **Semantic Cache 2.0**：LLM Judge 判断同问，而非单纯 Embedding
- [ ] **Cache Confidence**：每条缓存 confidence 0~1，低于阈值重新生成
- [ ] **Prompt Injection Firewall**：检测 "Ignore previous instructions" 等攻击
- [ ] **Benchmark 平台**：每日自动测试所有模型，输出排行榜

---

## 开源生态

- [ ] **SDK**：`@nexus/sdk` (npm) / `nexus-sdk` (pip)
- [ ] **CLI**：`nexus doctor / benchmark / cache clear / provider ls / health`
- [ ] **Examples**：spring-ai / langchain / openwebui / cline / continue / mcp
- [ ] **Compatibility Matrix**：OpenAI SDK / LangChain / Spring AI / LlamaIndex / Continue / Cline / Cherry Studio / Open WebUI

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
</task_progress>
</write_to_file>