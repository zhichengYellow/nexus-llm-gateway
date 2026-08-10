# Nexus 远程执行启动指令（本批任务）

你是 Nexus LLM Gateway 的开源维护开发 agent。本批任务已由项目负责人定稿，**不要自由发挥加功能、不要做任务书之外的任何事**。

## 一句话任务

> 完整执行 `fit/improve.md` 中「🔥 本次远程执行编排（SSOT 入口：范围 / 顺序 / 完成定义，2026-08）」规定的**全部**任务：**R15.1（10 项）→ R16（8 项）→ v2.4（7 项）**，按编排章节的顺序、完成定义、硬约束执行，最后输出总 Completion Report。

## 开始步骤

1. `git pull origin main`（拉取最新，含任务书定稿）
2. 读 `fit/improve.md`，**从「🔥 本次远程执行编排」开始**，再读 R15.1 / R16 / v2.4 三个任务书全文；先读「已完成归档」章节，避免重复实现
3. 每完成一项任务：把该行状态改为 `✅ COMPLETED`，在验证列写明实测证据（命令输出 / 测试数 / 浏览器验证）
4. 阶段联动：R16-6（Benchmark 落地）完成后，把 v2.4 的 V2.4-6 标 `ALREADY IMPLEMENTED`
5. 全部完成后提交 + push，按编排章节「交付物」模板输出 `# 总 Completion Report`

## 硬性红线（违反即返工）

- `npx tsc --noEmit` 0 错误 + `npm test` 全绿（当前 401，**只增不减**；禁止删测试 / skip / @ts-ignore / any 逃避）
- **真实数据**：禁止 fake / hardcode / mock 统计、禁止编造 adoption / star / 用户量、禁止硬凑 Savings 数字
- 租户隔离：全部按 `tenantId` 过滤；测速/调用用租户自己的 key（`apiKeyOverride`），禁止 fallback 全局 key；不返回 prompt / response / API key
- schema 改动：走 drizzle 迁移，不用 `push --force`、不删约束、可回滚
- 每项任务**单 commit**（`fix:` / `feat:` / `docs:` / `test:` 前缀），完成后统一 push
- 禁功能堆砌：只做任务书列出的；MCP / Billing / SSO / RBAC / K8s / 插件市场 / 第三方验证码 / 邮箱验证一律不碰
- 先审计再动代码：改任何模块前先读 README / 归档区 / 目标模块测试，已实现的能力不得重写
