/**
 * Nexus LLM Gateway - Auto Benchmark Platform
 *
 * Phase 9: 多模型 × 多 Provider 自动化基准测试 + 排行榜生成。
 *
 * 测试维度：Latency (P50/P95/P99)、Accuracy (Judge)、Cost、Cache Hit
 *
 * 用法：
 *   node benchmark/auto-benchmark.mjs
 */
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const GATEWAY = process.env.GATEWAY_URL || "http://localhost:8787/v1";
const KEY = process.env.GATEWAY_KEY || ""; // 必填: GATEWAY_KEY=<master_key> 运行

// 标准测试 Prompt 集
const PROMPTS = [
  { id: "code-1", text: "写一个 Python 快速排序算法", category: "code" },
  { id: "code-2", text: "用 JavaScript 实现二分查找", category: "code" },
  { id: "math-1", text: "解释什么是微积分", category: "math" },
  { id: "math-2", text: "证明勾股定理", category: "math" },
  { id: "trans-1", text: "将以下中文翻译成英文：人工智能正在改变世界", category: "translation" },
  { id: "trans-2", text: "Translate to Chinese: Machine learning is fascinating", category: "translation" },
  { id: "creative-1", text: "写一首关于春天的五言诗", category: "creative" },
  { id: "creative-2", text: "写一个100字的科幻小故事", category: "creative" },
  { id: "general-1", text: "你好，介绍一下你自己", category: "general" },
  { id: "general-2", text: "推荐三本值得读的书", category: "general" },
  { id: "reason-1", text: "分析一下人工智能对就业市场的影响", category: "reasoning" },
  { id: "reason-2", text: "量子计算和经典计算有什么区别", category: "reasoning" },
  { id: "summary-1", text: "用一段话总结机器学习的核心概念", category: "summary" },
  { id: "price-1", text: "今天比特币价格是多少", category: "price" },
  { id: "weather-1", text: "今天北京天气怎么样", category: "weather" },
];

// 测试模型
const MODELS = [
  "deepseek-v4-flash",
  "gemini-flash-lite",
  "auto",
];

// ===== Judge 引擎（内嵌） =====
function judgeScore(prompt, response) {
  let relevance = 0.7, accuracy = 0.85, fluency = 0.8, safety = 0.95, completeness = 0.7;

  // 相关性
  const promptWords = new Set(prompt.toLowerCase().split(/\s+/).filter(w => w.length > 1));
  let hits = 0;
  for (const w of promptWords) { if (response.toLowerCase().includes(w)) hits++; }
  relevance = Math.max(0.3, hits / Math.max(1, promptWords.size));

  // 准确性
  if (/error|sorry|抱歉|无法|cannot/i.test(response)) accuracy = 0.4;

  // 流畅度
  const sentences = response.split(/[.!?。！？\n]+/).filter(s => s.trim());
  fluency = Math.min(1, sentences.length / 3);

  // 完整性
  if (/总的来说|总结|in summary|希望.*帮助/i.test(response)) completeness = 0.9;
  if (response.length < 30) completeness = 0.3;

  return {
    relevance, accuracy, fluency, safety, completeness,
    overall: relevance * 0.35 + accuracy * 0.25 + fluency * 0.15 + safety * 0.15 + completeness * 0.10,
  };
}

// ===== 单次请求 =====
async function singleRequest(model, prompt, maxTokens = 100) {
  const start = performance.now();
  try {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens }),
    });
    const data = await res.json();
    const latency = performance.now() - start;
    const cached = data?.nexus?.cached ?? false;
    const content = data?.choices?.[0]?.message?.content ?? "";
    const score = judgeScore(prompt, content);

    return { success: true, latency, cached, content, score, error: null };
  } catch (e) {
    return { success: false, latency: performance.now() - start, cached: false, content: "", score: { overall: 0 }, error: e.message };
  }
}

// ===== 主流程 =====
async function main() {
  console.log("=".repeat(60));
  console.log("  Nexus Auto Benchmark Platform");
  console.log(`  Gateway: ${GATEWAY}`);
  console.log(`  Models: ${MODELS.join(", ")}`);
  console.log(`  Prompts: ${PROMPTS.length}`);
  console.log("=".repeat(60));
  console.log();

  const allResults = [];

  for (const model of MODELS) {
    console.log(`\n--- Testing model: ${model} ---`);
    const modelResults = [];

    for (const prompt of PROMPTS) {
      // 第一次：miss cache
      const r1 = await singleRequest(model, prompt.text);
      // 等缓存写入
      await new Promise(r => setTimeout(r, 200));
      // 第二次：hit cache
      const r2 = await singleRequest(model, prompt.text);

      modelResults.push({
        model,
        promptId: prompt.id,
        category: prompt.category,
        firstCall: { latency: r1.latency, cached: r1.cached, score: r1.score.overall, error: r1.error },
        secondCall: { latency: r2.latency, cached: r2.cached, score: r2.score.overall, error: r2.error },
      });

      const icon = r1.success ? (r2.cached ? "✅" : "⚠️") : "❌";
      console.log(`  ${icon} ${prompt.id} → ${r1.latency.toFixed(0)}ms / ${r2.latency.toFixed(0)}ms (cache=${r2.cached})`);
    }

    allResults.push(...modelResults);
  }

  // ===== 统计 =====
  console.log("\n" + "=".repeat(60));
  console.log("  Benchmark Results");
  console.log("=".repeat(60));

  const byModel = {};
  for (const r of allResults) {
    if (!byModel[r.model]) byModel[r.model] = { latencies: [], scores: [], cacheHits: 0, total: 0, errors: 0 };
    const m = byModel[r.model];
    if (r.firstCall.error) m.errors++;
    else {
      m.latencies.push(r.firstCall.latency);
      m.scores.push(r.firstCall.score);
    }
    if (r.secondCall.cached) m.cacheHits++;
    m.total++;
  }

  console.log("\n| Model | Avg Latency | P95 | Avg Score | Cache Hit | Errors |");
  console.log("|-------|------------|-----|-----------|-----------|--------|");

  const leaderboard = [];
  for (const [model, stats] of Object.entries(byModel)) {
    const avgLat = stats.latencies.length ? Math.round(stats.latencies.reduce((a,b)=>a+b,0) / stats.latencies.length) : 0;
    const p95 = stats.latencies.length ? stats.latencies.sort((a,b)=>a-b)[Math.floor(stats.latencies.length * 0.95)] : 0;
    const avgScore = stats.scores.length ? (stats.scores.reduce((a,b)=>a+b,0) / stats.scores.length).toFixed(2) : "N/A";
    const cacheRate = ((stats.cacheHits / stats.total) * 100).toFixed(0) + "%";
    console.log(`| ${model} | ${avgLat}ms | ${p95}ms | ${avgScore} | ${cacheRate} | ${stats.errors} |`);
    leaderboard.push({ model, avgLat, p95, avgScore, cacheRate, errors: stats.errors });
  }

  // 保存结果
  const report = {
    timestamp: new Date().toISOString(),
    gateway: GATEWAY,
    models: MODELS,
    promptCount: PROMPTS.length,
    leaderboard,
    details: allResults,
  };
  writeFileSync("benchmark-results.json", JSON.stringify(report, null, 2));
  console.log("\n✅ Results saved to benchmark-results.json");
}

main().catch(e => { console.error(e); process.exit(1); });
