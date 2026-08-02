# 代理配置

国内网络环境下访问 Google Gemini、OpenAI 等海外 API 需要通过 HTTP 代理。Nexus Gateway 支持**按 Provider 独立配置代理**，已配置代理的 Provider 走代理，其余直连。

## 为什么需要代理？

```
国内服务器 ──❌ 直连超时──→ api.openai.com
国内服务器 ──✅ 代理转发──→ api.openai.com
```

## 配置方法

在 `.env` 中为需要代理的 Provider 添加 `{PROVIDER}_PROXY` 变量：

```bash
# 格式：{PROVIDER_TYPE}_PROXY=http://127.0.0.1:{代理端口}

# Gemini 走 Clash 代理
GEMINI_PROXY=http://127.0.0.1:7897

# OpenAI 也走代理（如需要）
OPENAI_PROXY=http://127.0.0.1:7897
```

## 支持的代理类型

| 代理工具 | 默认端口 | 配置示例 |
|---------|---------|---------|
| Clash / Clash Verge | 7897 (mixed) | `GEMINI_PROXY=http://127.0.0.1:7897` |
| Clash | 7890 (HTTP) | `GEMINI_PROXY=http://127.0.0.1:7890` |
| V2Ray | 10809 | `GEMINI_PROXY=http://127.0.0.1:10809` |
| 任意 HTTP 代理 | 自定义 | `GEMINI_PROXY=http://host:port` |

## 工作原理

```
请求流程：
客户端 → 网关(8787) → [有 PROXY] → 代理(7897) → 海外 API
                    → [无 PROXY] → 直连 → 国内 API (DeepSeek/通义等)
```

- 只有**明确配置了 `_PROXY` 环境变量**的 Provider 才走代理
- 未配置的 Provider 保持直连（如 DeepSeek、通义千问等国内服务）
- 网关使用 `undici.ProxyAgent` 实现代理，与 `undici.fetch` 同源

## 验证代理是否生效

```bash
# 1. 配置代理后重启网关
# 2. 发送 Gemini 请求测试
curl http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-flash-lite","messages":[{"role":"user","content":"hi"}]}'

# 成功响应示例：
# {"provider":"gemini","content":"Hi there!"}

# 如果失败（代理不通）：
# {"error":{"message":"all providers failed: fetch failed"}}
```

## 常见问题

### Gemini 返回 429 (Too Many Requests)

使用共享代理 IP 时，Google 可能对该 IP 限流。解决方法：
- 切换到独享/原生节点
- 降低请求频率
- 使用 `gemini-flash-lite` 代替 `gemini-2.0-flash`（免费额度更宽裕）

### 代理连接超时

1. 确认代理服务正在运行
2. 检查代理端口是否正确
3. 确认代理支持 HTTPS 流量

### 不需要代理

如果你的网络环境已经可以直连海外 API（如使用了 TUN 模式的代理软件），将 `_PROXY` 变量设为空或删除即可：

```bash
GEMINI_PROXY=
# 或不写这行
```
