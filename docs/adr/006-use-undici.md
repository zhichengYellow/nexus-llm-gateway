# ADR 006: 使用 undici 而非 node-fetch

- **状态**: ✅ 已采纳
- **日期**: 2025-02
- **决策者**: Nexus Team

## 背景

需要从 Node.js 后端向 LLM Provider 发送 HTTP 请求，同时支持 HTTP 代理（国内访问海外 API）。

## 决策

选择 **undici** 作为 HTTP 客户端。

## 理由

1. **Node.js 原生 fetch 的底层实现**：undici 是 Node.js 内置 `fetch` 的底层库，API 兼容
2. **ProxyAgent 支持**：`undici.ProxyAgent` 与 `undici.fetch` 同源，无需引入额外代理库
3. **高性能**：比 `node-fetch` 和 `axios` 更快，连接复用更高效
4. **维护活跃**：Node.js 核心团队维护

## 替代方案

### node-fetch
- ✅ 流行的 fetch polyfill
- ❌ 不支持 ProxyAgent，代理需要额外配置

### axios
- ✅ 功能丰富（拦截器、请求取消）
- ❌ 包体积大
- ❌ 类型系统不如原生 fetch 简洁

### 仅使用全局 fetch
- ✅ 零依赖
- ❌ Node.js 的 `ProxyAgent` 与全局 `fetch` 类型不兼容（`dispatcher` 参数不被标准 RequestInit 接受）
- ❌ 无法使用 `undici.fetch` 的代理功能

## 影响

- Provider 基类使用 `undici.fetch` + `ProxyAgent` 实现代理
- 有代理配置时走 `ufetch(url, { ...init, dispatcher })`
- 无代理时走全局 `fetch(url, init)`
- 仅在 `OpenAiLikeProvider` 中使用，不影响其他模块
