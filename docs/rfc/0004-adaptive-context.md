# RFC 0004: Adaptive Context（动态上下文截断）

- **状态**: 🏁 已完成
- **日期**: 2026-08-04
- **作者**: @binyellow
- **源文件**: `src/optimizer/prompt/adaptive-context.ts`

---

## 1. 目标

根据请求类型动态调整历史上下文长度，避免无意义的历史 Token 消耗。

## 2. 动机

"你好"不需要 20 轮历史，"继续"需要完整历史。当前固定保留所有历史，大量浪费 Token。

## 3. 三问评估

| 指标 | 预估值 | 说明 |
|------|--------|------|
| TRR | 30% | 问候语节省 100% 历史 Token，新对话节省 80%+ |
| CSR | 30% | 与 TRR 成正比 |
| QPS | ≥ 95% | 继续/引用保留足够上下文，质量不受影响 |

## 4. 方案设计

- 6 种请求类型检测：greeting / continuation / reference / code / new_conversation / unknown
- 问候语 → 0 轮历史
- 继续 → 20 轮历史
- 新对话 → 0 轮历史
- 代码 → 2 轮历史
- 默认 → 5 轮历史

## 5. Benchmark 依据

`benchmark/quality-benchmark.mjs` 实测，问候语类平均节省 90%+ 历史 Token。

## 6. 替代方案

- 固定 N 轮：简单但浪费
- LLM 判断：准确但成本高

## 7. 风险与回滚

- 误判导致上下文不足 → 引用检测保底
- 逃生开关 `x-nexus-no-optimize: 1`

## 8. 验收标准

- [x] 6 种类型检测准确率 ≥ 90%
- [x] 历史截断不丢失关键上下文
- [x] 逃生开关可用
