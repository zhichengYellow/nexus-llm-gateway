# ADR 001: 使用 Hono 作为 Web 框架

- **状态**: ✅ 已采纳
- **日期**: 2025-01
- **决策者**: Nexus Team

## 背景

需要选择一个 Node.js Web 框架来构建 LLM Gateway。候选方案包括 Express、Fastify、Hono。

## 决策

选择 **Hono** 作为 Web 框架。

## 理由

1. **TypeScript 原生**：Hono 从一开始就为 TypeScript 设计，类型推断优秀，无需额外类型包
2. **轻量高性能**：路由匹配性能优于 Express，接近 Fastify
3. **中间件生态**：内置 CORS、Zod 校验等中间件，开箱即用
4. **边缘计算兼容**：可运行在 Cloudflare Workers、Deno 等环境，为未来部署留下灵活性
5. **API 设计简洁**：`c.json()` / `c.req.header()` 等 API 直观易用

## 替代方案

### Express
- ❌ 缺乏 TypeScript 原生支持
- ❌ 中间件模型老旧（回调式）
- ❌ 性能一般

### Fastify
- ✅ 性能优秀
- ❌ 插件系统复杂
- ❌ 类型系统不如 Hono 简洁

## 影响

- 所有路由使用 Hono 的 `app.route()` 注册
- 中间件使用 `app.use()` 或子路由 `api.use()`
- 类型通过 `Hono<AppEnv>` 泛型传递
