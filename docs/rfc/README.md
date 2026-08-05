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
| - | - | - | - |

## RFC 原则

1. **先 RFC 后代码**：任何新功能必须先写 RFC，避免盲目开发
2. **三问必答**：每个 RFC 必须回答 TRR/CSR/QPS 三个问题
3. **Benchmark 依据**：RFC 必须有量化数据支撑，不能凭空猜测
4. **ADR 保留**：已实施的 RFC 转为 ADR 记录，保留决策历史
