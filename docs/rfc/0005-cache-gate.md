# RFC 0005: Cache Gate（缓存门控 + Confidence 决策）

- **状态**: 🏁 已完成
- **日期**: 2026-08-04
- **作者**: @binyellow
- **源文件**: `src/optimizer/cache/cache-gate.ts` + `src/optimizer/cache/cache-confidence.ts`

---

## 1. 目标

用 Confidence 评分替代简单的"命中/未命中"缓存决策，支持三态：直接返回 / 返回+异步刷新 / 重新生成。

## 2. 动机

当前缓存逻辑是简单的 hit/miss，不考虑缓存质量。旧缓存可能包含过时信息，直接返回有风险。

## 3. 三问评估

| 指标 | 预估值 | 说明 |
|------|--------|------|
| TRR | 提升 15% | 中置信度缓存仍可返回，比直接 miss 多节省 |
| CSR | 提升 15% | 减少 LLM 调用次数 |
| QPS | ≥ 95% | 低置信度会重新生成，质量有保障 |

## 4. 方案设计

- CacheGate：confidence ≥ 0.9 直接返回 / 0.7~0.9 返回+异步刷新 / <0.7 重新生成
- CacheConfidence：4 因子评分（age/hits/category/freshness）
- CacheAutoRefresh：热门 Prompt 预生成 + TTL 动态学习

## 5. Benchmark 依据

`benchmark/quality-benchmark.mjs` 中缓存命中率提升约 15%。

## 6. 替代方案

- 简单 hit/miss：命中率低
- 全量刷新：成本高

## 7. 风险与回滚

- Confidence 误判 → 低分自动重新生成保底
- 逃生开关 `x-nexus-no-optimize: 1`

## 8. 验收标准

- [x] 三态决策正确
- [x] Confidence 评分有 4 因子
- [x] 异步刷新不阻塞主请求
- [x] 逃生开关可用
