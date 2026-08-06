# RFC 0007: Quality Judge（质量评估 + 反馈优化）

- **状态**: 🏁 已完成
- **日期**: 2026-08-04
- **作者**: @binyellow
- **源文件**: `src/optimizer/judge/request-judge.ts` + `src/optimizer/judge/judge.ts` + `src/extensions/judge/quality-evaluator.ts`

---

## 1. 目标

对每次 LLM 响应进行质量评估，反馈给 Router 自动优化 Provider 选择。

## 2. 动机

没有质量反馈的 Router 是盲目的。需要量化评估每次响应的质量，持续优化路由决策。

## 3. 三问评估

| 指标 | 预估值 | 说明 |
|------|--------|------|
| TRR | 间接 | 质量差的 Provider 降权，减少无效调用 |
| CSR | 间接 | 减少低质量重试 |
| QPS | 提升 5~10% | 自动排除低质量 Provider |

## 4. 方案设计

- JudgeEngine：5 维度评分（relevance/accuracy/fluency/safety/completeness）
- RequestJudge：请求链路评估 + 自动反馈 Router 降权低质量 Provider
- QualityEvaluator：语义保持验证 + 摘要质量评估
- SemanticJudge：语义等价判断 + Cache Confidence 最终决策

## 5. Benchmark 依据

`benchmark/quality-benchmark.mjs` 中质量评分一致性约 85%。

## 6. 替代方案

- 人工评分：不可规模化
- LLM Judge：准确但成本高

## 7. 风险与回滚

- 评分不准确 → 仅影响权重微调，不阻塞请求
- 默认关闭（`QUALITY_JUDGE_ENABLED=false`），避免额外延迟

## 8. 验收标准

- [x] 5 维度评分正确
- [x] 低质量 Provider 自动降权
- [x] 语义等价判断可用
- [x] 默认关闭不影响性能
