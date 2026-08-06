# RFC（Request for Comments）

Nexus LLM Gateway 的 RFC 流程。新功能先 RFC 后开发。

## 流程

```
想法 → RFC 文档 → 讨论 → 批准 → 开发 → Benchmark → 接入 Core
```

## RFC 模板

见 [0000-template.md](./0000-template.md)

## RFC 列表

| # | 标题 | 状态 | 日期 |
|---|------|------|------|
| 0001 | Prompt Compression（礼貌语删除 + System Prompt 去重） | 🏁 已完成 | 2026-08-04 |
| 0004 | Adaptive Context（动态上下文截断） | 🏁 已完成 | 2026-08-04 |
| 0005 | Cache Gate（缓存门控 + Confidence 决策） | 🏁 已完成 | 2026-08-04 |
| 0006 | Smart Routing（智能路由 + 成本控制） | 🏁 已完成 | 2026-08-04 |
| 0007 | Quality Judge（质量评估 + 反馈优化） | 🏁 已完成 | 2026-08-04 |

## RFC 原则

1. **先 RFC 后代码**：任何新功能必须先写 RFC，避免盲目开发
2. **三问必答**：每个 RFC 必须回答 TRR/CSR/QPS 三个问题
3. **Benchmark 依据**：RFC 必须有量化数据支撑，不能凭空猜测
4. **ADR 保留**：已实施的 RFC 转为 ADR 记录，保留决策历史
