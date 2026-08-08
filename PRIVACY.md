# Privacy

Nexus 是 **Privacy by Architecture**：不是"作者承诺不偷看"，而是代码架构默认就不允许获取用户 Prompt / Response / API Key。

## 数据边界

| 数据 | 是否被 Nexus 记录 | 说明 |
|---|---|---|
| Provider API Key | 加密存储 | AES-256-GCM 静态加密（`src/shared/crypto.ts`），GET API 只返回脱敏值 |
| Gateway Key | 仅存哈希 | SHA-256，创建时只展示一次 |
| Prompt / Response 内容 | **不记录** | 不进入日志、指标、遥测的任何字段 |
| Authorization 头 | 不记录 | pino redact 全局脱敏 |
| 优化指标（token 数、缓存命中、延迟等） | 本地记录 | 见下表，供 Dashboard 展示 |

## 本地指标（允许记录）

仅记录聚合/统计类数据（用于优化面板）：

- provider / model
- input / output token 数、original / optimized token 数
- cacheHit、compressionRatio
- latencyMs、ttftMs
- optimizationStrategy / routerReason（策略名，不含内容）

**从不记录**：prompt、messages、content、response、completion、apiKey、authorization、cookie、原始请求/响应体。

## 遥测

- **无远程遥测**。Nexus 不向任何外部端点发送使用数据、Prompt 或指标。
- 若未来引入远程遥测，将默认关闭（`NEXUS_TELEMETRY_ENABLED=false`），且仅发送匿名聚合优化指标，并在此文档同步说明。

## 自托管

- 完整自托管支持：`git clone` + 本地 Docker（Postgres + Redis）即可运行，凭据完全由自己掌控。
- 云部署（Render）时 Provider Key 加密存储于你自己的数据库，加密密钥 `ENCRYPTION_KEY` 由你配置。

## 数据导出与删除

- 用量数据可通过 `/admin/cost/report?format=csv` 导出。
- 删除：清空 `usage_logs` / `provider_configs` 等表（或重建数据库）即可完全清除。
