# Nexus Token Optimization Benchmark

- **Date**: 2026-08-10
- **Version**: 2.3.0
- **Commit**: `8a0bfd8`
- **Gateway**: https://nexus-llm-gateway-5te0.onrender.com/v1

## Environment

| Key | Value |
|---|---|
| Provider | 网关路由（auto） |
| Model | auto |
| Temperature | 默认 |
| Max tokens | 300 |
| Reps per prompt | 1 |
| Timeout | 40000ms |

## Methodology

- **Baseline**：x-nexus-profile: fast + x-nexus-no-cache: 1（接近直连：不压缩、不缓存、不重写；仍经网关最小处理）
- **Nexus**：完整优化链路（默认 balanced / cheap / maximum_saving 三档）
- 每个 workload 在 baseline 与每个 profile 下各执行 39 个 prompt（按场景分配）。
- 原始数据：`benchmark/results/2026-08-10.json`（每请求明细，可复现）。
- 重跑：`GATEWAY_URL=<网关/v1> GATEWAY_KEY=<key> node benchmark/benchmark-runner.mjs`

## Results

| Workload | Profile | OK/Total | Tokens | Saved | Reduction | Latency | Cache |
|----------|---------|----------|--------|-------|-----------|---------|-------|
| Short QA | baseline | 5/5 | 1574 | 0 | — | 3283ms | 0 |
| Short QA | balanced | 5/5 | 1574 | 0 | 0% | 3361ms | 0 |
| Short QA | cheap | 5/5 | 1574 | 0 | 0% | 7772ms | 0 |
| Short QA | maximum_saving | 5/5 | 1574 | 0 | 0% | 3408ms | 0 |
| Long Context | baseline | 4/4 | 1512 | 0 | — | 4050ms | 0 |
| Long Context | balanced | 4/4 | 1467 | 407 | 29.9% | 1383ms | 3 |
| Long Context | cheap | 4/4 | 1467 | 679 | 47.9% | 1476ms | 3 |
| Long Context | maximum_saving | 4/4 | 1467 | 679 | 47.9% | 1276ms | 3 |
| Coding | baseline | 5/5 | 1574 | 0 | — | 3086ms | 0 |
| Coding | balanced | 5/5 | 1574 | 0 | 0% | 3198ms | 0 |
| Coding | cheap | 5/5 | 1574 | 0 | 0% | 2959ms | 0 |
| Coding | maximum_saving | 5/5 | 1574 | 0 | 0% | 3062ms | 0 |
| Chinese | baseline | 5/5 | 124 | 0 | — | 1601ms | 0 |
| Chinese | balanced | 5/5 | 124 | 124 | 100% | 322ms | 5 |
| Chinese | cheap | 5/5 | 124 | 124 | 100% | 307ms | 5 |
| Chinese | maximum_saving | 5/5 | 124 | 124 | 100% | 306ms | 5 |
| English | baseline | 2/2 | 367 | 0 | — | 2551ms | 0 |
| English | balanced | 2/2 | 367 | 25 | 6.8% | 228ms | 2 |
| English | cheap | 2/2 | 367 | 25 | 6.8% | 247ms | 2 |
| English | maximum_saving | 2/2 | 367 | 25 | 6.8% | 438ms | 2 |
| Conversation | baseline | 5/5 | 1401 | 0 | — | 4533ms | 0 |
| Conversation | balanced | 5/5 | 1355 | 424 | 33.5% | 3227ms | 2 |
| Conversation | cheap | 5/5 | 1354 | 424 | 33.6% | 3214ms | 2 |
| Conversation | maximum_saving | 5/5 | 1355 | 424 | 33.5% | 3001ms | 2 |
| Document QA | baseline | 5/5 | 1426 | 0 | — | 3883ms | 0 |
| Document QA | balanced | 5/5 | 1378 | 748 | 55.8% | 1934ms | 3 |
| Document QA | cheap | 5/5 | 1378 | 748 | 55.8% | 1888ms | 3 |
| Document QA | maximum_saving | 5/5 | 1435 | 490 | 33.7% | 2526ms | 2 |
| Repeated Prompt | baseline | 3/3 | 39 | 0 | — | 1478ms | 0 |
| Repeated Prompt | balanced | 3/3 | 39 | 39 | 100% | 233ms | 3 |
| Repeated Prompt | cheap | 3/3 | 39 | 39 | 100% | 249ms | 3 |
| Repeated Prompt | maximum_saving | 3/3 | 39 | 39 | 100% | 230ms | 3 |
| Short Prompt | baseline | 5/5 | 127 | 0 | — | 1701ms | 0 |
| Short Prompt | balanced | 5/5 | 125 | 16 | 14.2% | 1137ms | 2 |
| Short Prompt | cheap | 5/5 | 87 | 16 | 44.1% | 1299ms | 2 |
| Short Prompt | maximum_saving | 5/5 | 115 | 16 | 22% | 1150ms | 2 |
| Concurrent Duplicate | balanced | 3/3 | 948 | 0 | — | 3281ms | 0 |

## Attribution

> 各请求的节省来源（Cache/Compression/Dedup/Routing/Rewrite）由网关 `GET /user/requests/:id` 的 savings.source 提供；本报告记录 `savedTokens`（网关上报）与 raw 明细。

## Overhead

> baseline 与 nexus 的 latency 差可视为优化开销（含缓存查询/压缩/路由等）。详见 results JSON 的每请求 latency。

## Limitations

- Results depend on provider/model behavior, workload distribution, cache state and optimization profile. These results should not be interpreted as a universal token-saving guarantee.
- Baseline 经网关 fast 模式（非完全直连 Provider），仍含网关最小处理开销。
- 缓存场景结果依赖预热状态；重复运行可能因缓存命中而变化。
- 未移除任何失败/不理想数据；全部原始数据见 results/。
