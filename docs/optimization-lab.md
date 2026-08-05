# Optimization Lab 流程

## 概述

Optimization Lab 是 Nexus LLM Gateway 的优化实验流程。所有优化功能在进入 Core 之前，必须通过 Lab 验证。

## 流程图

```
实验想法
    ↓
RFC 文档（docs/rfc/）
    ↓
实验代码 → src/extensions/
    ↓
R1 Benchmark 量化（benchmark/quality-benchmark.mjs）
    ↓
三问通过？（TRR > 0 | CSR > 0 | QPS ≥ 95%）
    ↓ Yes
接入 Core（src/optimizer/ → src/server/routes/chat.ts）
    ↓
更新状态（fit/improve.md ✅ COMPLETED）
```

## 目录约定

| 目录 | 用途 | 状态 |
|------|------|------|
| `src/optimizer/` | Core 优化模块（已接入主链路） | ✅ Active |
| `src/extensions/` | 实验模块（待评估是否接入） | ⚠️ Experimental |
| `benchmark/` | Benchmark 脚本和数据 | ✅ Active |
| `docs/rfc/` | RFC 文档 | ✅ Active |

## 从 extensions 升级到 optimizer 的流程

1. 在 `src/extensions/` 完成实验代码
2. 运行 `node benchmark/quality-benchmark.mjs` 获取量化数据
3. 三问通过 → 创建 RFC
4. RFC 批准 → 迁移到 `src/optimizer/`
5. 接入 `src/server/routes/chat.ts`
6. 更新 `fit/improve.md` 状态为 ✅ COMPLETED

## 当前 extensions 中的模块

| 模块 | 路径 | 状态 |
|------|------|------|
| Cost Optimizer | `src/extensions/prompt/cost-optimizer.ts` | ✅ 已接入 Core |
| Quality Evaluator | `src/extensions/judge/quality-evaluator.ts` | ✅ 已接入 Core |

## 三问检查清单

每个优化功能上线前必须回答：

- [ ] TRR：能减少多少 Token？
- [ ] CSR：能节省多少成本？
- [ ] QPS：对回答质量影响多大？
- [ ] Benchmark：有量化数据支撑吗？
- [ ] 逃生开关：有 `x-nexus-no-optimize: 1` 绕过机制吗？
