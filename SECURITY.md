# Security

Nexus LLM Gateway 的安全设计与实践。

## API Key 处理

### Provider API Key（DeepSeek / Gemini / OpenAI / ...）

- **静态加密**：存入数据库前用 AES-256-GCM 加密，存储格式 `enc:v1:<iv>.<tag>.<ciphertext>`（见 `src/shared/crypto.ts`）。
- **加密密钥**：环境变量 `ENCRYPTION_KEY`（64 位 hex 或任意字符串，字符串经 SHA-256 派生）。生产环境缺失时**拒绝保存** Provider Key（不降级为明文）。
- **不落明文**：
  - 普通 GET API 只返回 `configured / source / masked`（如 `sk-****abcd`），不返回完整 key。
  - 日志全局脱敏（pino redact）：`apiKey / api_key / authorization / password / secret` 字段一律输出 `[REDACTED]`（`src/shared/logger.ts`）。
  - 上游错误信息中的 key 会被 `sk-***` 替换后再记录。
- **内存**：运行时解密后仅驻留进程内存（registry），不写日志、不进遥测。

### Gateway Key（调用网关的 key）

- 数据库只存 SHA-256 哈希（`auth.ts hashKey`），不存明文。
- 创建时仅返回一次明文，之后无法通过 API 再次获取。

## 日志策略

- 默认不记录请求/响应 body。
- 全局 redact 覆盖嵌套字段（`*.apiKey`、`*.*.apiKey` 等深度变体）。
- 若需排查问题，日志中不得出现完整凭据。

## 隐私边界

见 [PRIVACY.md](./PRIVACY.md)。核心：

- **无远程遥测**：项目不发送任何遥测数据到外部；`observability.ts` 仅本地结构化日志/指标，且不记录 prompt / response / authorization。
- 用户 Prompt / Response 不进入任何指标或日志字段。

## 生产部署清单

- 设置强随机 `ENCRYPTION_KEY`（`openssl rand -hex 32`）。
- 设置强随机 `GATEWAY_MASTER_KEY`。
- 数据库 / Redis 使用强密码，不暴露公网端口。
- 所有凭据通过环境变量注入，不写入源码 / README / git 历史。

## 漏洞报告

发现安全问题请通过 GitHub Issues（标题前缀 `[security]`）报告，或直接提交修复 PR。请勿在公开渠道泄露可利用的完整凭据。
