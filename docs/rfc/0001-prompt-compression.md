# RFC 0001: Prompt Compression（礼貌语删除 + System Prompt 去重）

- **状态**: 🏁 已完成
- **日期**: 2026-08-04
- **作者**: @binyellow
- **源文件**: `src/optimizer/prompt/compression.ts`

---

## 1. 目标

通过删除礼貌语和压缩 System Prompt，减少不必要的 Token 消耗。

## 2. 动机

用户输入中大量包含"请帮我"、"谢谢"、"麻烦"等礼貌语，这些对 LLM 理解无帮助但消耗 Token。System Prompt 中常有重复指令，可以合并去重。

## 3. 三问评估

| 指标 | 预估值 | 说明 |
|------|--------|------|
| TRR | 10~20% | 礼貌语约占 5~10%，System Prompt 去重约占 5~10% |
| CSR | 10~20% | 与 TRR 成正比 |
| QPS | ≥ 98% | 礼貌语删除不影响语义，System Prompt 去重合并等价指令 |

## 4. 方案设计

- 正则匹配删除常见礼貌语模式（"请帮"、"谢谢"、"麻烦"等）
- 去除冗余修饰词（"非常"、"特别"等）
- System Prompt 按行去重（小写归一化比较）
- 通过 `x-nexus-no-optimize: 1` 请求头可跳过

## 5. Benchmark 依据

`benchmark/quality-benchmark.mjs` 中 55 条 Prompt 实测，平均 TRR 约 12%。

## 6. 替代方案

- LLM 压缩：效果更好但成本高，延迟大
- 不做压缩：Token 浪费

## 7. 风险与回滚

- 误删有意义的礼貌语 → 请求头 `x-nexus-no-optimize: 1` 绕过
- System Prompt 去重误删 → 只去完全相同的行

## 8. 验收标准

- [x] 礼貌语检测覆盖 10+ 种常见模式
- [x] System Prompt 去重正确率 100%
- [x] 逃生开关可用
