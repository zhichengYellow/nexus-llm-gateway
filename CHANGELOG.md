# Changelog

All notable changes to Nexus LLM Gateway.

## [2.3.0] - 2026-08-09

### Added
- 开放注册（BYOK）：`POST /auth/register`、注册开关 `REGISTRATION_ENABLED`、中文校验报错、表单重置
- 用户端体验：请求记录（cursor 分页）、我的 Key（启停）、测速（并发/冷却防滥用）、用量导出 CSV、请求详情（Savings Explainability）
- **Savings Engine**：统一节省归因（CACHE/COMPRESSION/ROUTING/REWRITE 互斥，防 double counting；ACTUAL vs ESTIMATED）
- 优化档位产品化：fast / balanced / cheap / maximum_saving 真正影响压缩与路由
- Privacy Center（用户端）
- 闲置租户数据定期清理（默认 30 天，`IDLE_TENANT_CLEANUP_DAYS`）

### Fixed
- **缓存命中节省从未落库**：pipeline 缓存分支 usage 全 0 且不传 savedTokens → 改用缓存响应真实 usage，节省真实累计
- **SingleFlight waiter 重复计费**：waiter 未打上游却记 full cost → waiter 置空 usage，不重复计费
- provider_configs 表结构迁移（id 主键 + tenant_id）
- /auth/register 被 api catch-all 拦截（路由顺序）
- DELETE provider key 后 registry 旧实例残留（`removeProvider`）

## [2.2.0] - 2026-08-07

### Fixed (二轮巡检修复)
- **R7**: 非流式/流式上游超时改为 inactivity-based（逐 chunk 重置计时器，默认 60s），不再硬杀长生成
- **R8-1**: daily-stats savedCost 直接使用 `sum(usageLogs.savedCostMicro)`，去掉比例估算
- **R8-2**: smart-routing decide 候选源改用 `registry.listAllModels()`
- **R8-3**: listRecent 不再返回完整 response（仅返回 promptPreview，隐私保护）
- **R10**: 降级/预算约束修复：filtered 空时选 cheapest 候选 + 标记 degraded/constraintRelaxed，不再回退未过滤 candidates
- **R9**: 补充 cacheHash 多轮对话测试 + smart-routing 候选空 fallback 测试

### Changed
- `tsconfig.json`: `rootDir` 从 `.` 改为 `src`，构建产物路径对齐
- `package.json`: version → 2.2.0，补 main/files/exports/repository/license/bin

## [2.1.0] - 2026-08-07

### Fixed (P0-P2 生产 Bug 审计)
- **P0-1**: fallback 机制死代码 + getProvider spread 丢方法修复
- **P0-2**: model=auto 候选为空时从 registry 真实降级
- **P0-3**: 流式客户端断开 unhandledRejection 修复（IIFE .catch + writer.close.catch）
- **P0-4**: http server error 监听 + process unhandledRejection/uncaughtException 兜底
- **P0-5**: ollama 上游无超时补 AbortController
- **P0-6**: e2e 计价硬编码改为真实价格计算
- **P0-7**: 压缩 savedTokens 写入 recordUsage
- **P0-8**: 缓存 key 纳入 system + 全部 user 消息
- **P0-9**: 缓存 store 校验 finish_reason + 内容长度上限
- **P0-10**: master key 硬编码清除（源码/start.sh）
- **P0-11**: batch SSRF + 凭证转发 + 租户隔离修复
- **P0-12**: cachedTokenCount 重复计算修复
- **P1-1~P1-10**: 数据失真/体验/健壮性修复
- **P2-1~P2-8**: 加固项（DB timeout/CORS/缓存清理/熔断错误信息等）

### Changed
- **R6**: Dashboard 价值展示中心重构（Hero 节省大数字 + 指标卡 + 时间线 Savings + 菜单重分类 + Optimization Explorer / Savings 页）

## [2.0.0] - 2026-07

### Added
- Optimization Pipeline 全链路接线（Compression → Cache Gate → Smart Routing → Cost Control → Quality Judge）
- v2.0 目录重构（src/providers/, src/optimizer/, src/analytics/, src/extensions/）
- R1-R6: 质量 Benchmark, Token 分析, RFC 流程, Optimization Lab, Dashboard 重构
- P0-P2: Cost Before Request, Optimization Profile, Provider Recommendation

### Changed
- 产品定位从通用 AI Gateway → AI Cost Optimization Platform
- 核心指标 TRR/CSR/QPS 落地
- 拓展区物理隔离（src/extensions/）

## [1.x] - 2026-01~2026-06

### Added
- 多 Provider 支持（OpenAI/DeepSeek/Ollama/Gemini 等）
- 语义缓存（Semantic Cache）+ 缓存门控（Cache Gate）+ 缓存置信度（Cache Confidence）
- 智能路由（Smart Routing）+ 多维度路由（Multi-Dim Router）
- 成本控制器（Cost Controller）+ 预算管理
- 请求质量评估（Request Judge）
- 意图学习（Intent Learning）+ 趋势分析（Trend Analyzer）
- Batch API（/v1/batch）
- CLI / SDK / Benchmark 工具
- Admin Dashboard

## [0.x] - 2025

### Added
- 基础 OpenAI 兼容 API（/v1/chat/completions, /v1/embeddings, /v1/models）
- 多租户 + API Key 管理
- 用量记录与分析
- 健康检查 + 基础中间件
