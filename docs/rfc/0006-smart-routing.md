# RFC 0006: Smart Routing（智能路由 + 成本控制）

- **状态**: 🏁 已完成
- **日期**: 2026-08-04
- **作者**: @binyellow
- **源文件**: `src/optimizer/routing/smart-routing.ts` + `src/optimizer/cost/cost-controller.ts`

---

## 1. 目标

`model=auto` 时基于 Intent + Cost + Quality + Latency 四维自动选择最优 Provider，并支持预算控制和降级策略。

## 2. 动机

用户不知道哪个 Provider 最合适。手动切换麻烦。没有成本控制容易超支。

## 3. 三问评估

| 指标 | 预估值 | 说明 |
|------|--------|------|
| TRR | 间接 | 路由到缓存友好的 Provider |
| CSR | 20~40% | 自动选择便宜的 Provider + 预算控制 |
| QPS | ≥ 95% | 质量评分兜底，低质量 Provider 自动降权 |

## 4. 方案设计

- MultiDimRouter：Score = 0.3×Intent + 0.3×(1-Cost/MaxCost) + 0.25×Quality + 0.15×(1-Latency/MaxLatency)
- SmartRoutingEngine：画像同步 + 降级策略(4种) + 反馈自优化
- BudgetController：block/cheap_only/warn 三档
- CostEstimator：9 个 Provider 价格表 + Token 预估

## 5. Benchmark 依据

`benchmark/quality-benchmark.mjs` 中 auto 模式平均成本降低约 25%。

## 6. 替代方案

- 固定路由：无成本优化
- 纯成本路由：忽略质量

## 7. 风险与回滚

- 路由决策错误 → 反馈自优化自动调整
- 逃生开关 `x-nexus-no-optimize: 1`

## 8. 验收标准

- [x] 四维路由正确
- [x] 4 种降级策略可用
- [x] 预算控制三档生效
- [x] 逃生开关可用
