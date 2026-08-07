/**
 * Nexus LLM Gateway - Quality Benchmark
 *
 * R1: 每条 prompt 跑「压缩 → 缓存 → 路由」优化前后对比
 * 输出 Token / Latency / Cost / Quality 汇总表
 */
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";

const GATEWAY = process.env.GATEWAY_URL || "http://localhost:8787/v1";
const KEY = process.env.GATEWAY_KEY || process.env.GATEWAY_MASTER_KEY || "";

// ===== 加载 Prompt 数据集 =====
const prompts = JSON.parse(readFileSync("./benchmark/prompts/quality-prompts.json", "utf-8"));
console.log(`Loaded ${prompts.length} prompts (${new Set(prompts.map(p => p.category)).size} categories)`);

// ===== Rule-based Quality Judge =====
function judgeQuality(prompt, response) {
  let score = 0;
  const lower = response.toLowerCase();

  // 关键词命中 (40%)
  const promptWords = new Set(prompt.toLowerCase().split(/\s+/).filter(w => w.length > 1));
  let hits = 0;
  for (const w of promptWords) { if (lower.includes(w)) hits++; }
  score += 0.4 * (hits / Math.max(1, promptWords.size));

  // 响应长度 (20%)
  score += 0.2 * Math.min(1, response.length / 100);

  // 无错误标记 (20%)
  if (!/error|sorry|抱歉|无法|cannot/i.test(response)) score += 0.2;

  // 完整性 (20%)
  if (/总结|结论|总之|希望.*帮助|in summary/i.test(response)) score += 0.2;

  return Math.min(1, score);
}

// ===== Token 估算 =====
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// ===== 单次请求 =====
async function sendRequest(prompt, model = "auto") {
  const start = performance.now();
  try {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 100 }),
    });
    const data = await res.json();
    const latency = performance.now() - start;
    const content = data?.choices?.[0]?.message?.content ?? "";
    const usage = data?.usage ?? {};
    const cached = data?.nexus?.cached ?? false;
    const provider = data?.nexus?.provider ?? "unknown";

    return { success: true, latency, content, usage, cached, provider, error: null };
  } catch (e) {
    return { success: false, latency: performance.now() - start, content: "", usage: {}, cached: false, provider: "error", error: e.message };
  }
}

// ===== 主流程 =====
async function main() {
  console.log("=".repeat(70));
  console.log("  Nexus Quality Benchmark");
  console.log(`  Gateway: ${GATEWAY}  |  Prompts: ${prompts.length}`);
  console.log("=".repeat(70));
  console.log();

  const results = [];
  const byCategory = {};

  for (const p of prompts) {
    // 第一次：model=auto（优化链路）
    const r1 = await sendRequest(p.text, "auto");
    // 等缓存写入
    await new Promise(r => setTimeout(r, 100));
    // 第二次：直接指定 deepseek（基准对比）
    const r2 = await sendRequest(p.text, "deepseek-v4-flash");

    const inputTokens = estimateTokens(p.text);
    const outputTokens1 = estimateTokens(r1.content);
    const outputTokens2 = estimateTokens(r2.content);
    const quality1 = judgeQuality(p.text, r1.content);
    const quality2 = judgeQuality(p.text, r2.content);

    const result = {
      id: p.id,
      category: p.category,
      optimized: {
        model: "auto",
        provider: r1.provider,
        inputTokens,
        outputTokens: outputTokens1,
        totalTokens: inputTokens + outputTokens1,
        latencyMs: Math.round(r1.latency),
        quality: quality1.toFixed(2),
        cached: r1.cached,
        error: r1.error,
      },
      baseline: {
        model: "deepseek-v4-flash",
        provider: r2.provider,
        inputTokens,
        outputTokens: outputTokens2,
        totalTokens: inputTokens + outputTokens2,
        latencyMs: Math.round(r2.latency),
        quality: quality2.toFixed(2),
        cached: r2.cached,
        error: r2.error,
      },
      delta: {
        tokenSaved: (inputTokens + outputTokens2) - (inputTokens + outputTokens1),
        latencySaved: Math.round(r2.latency - r1.latency),
        qualityDelta: (quality1 - quality2).toFixed(2),
      },
    };

    results.push(result);

    // 按分类聚合
    if (!byCategory[p.category]) byCategory[p.category] = { count: 0, totalTokenSaved: 0, avgQualityDelta: 0, avgLatencySaved: 0 };
    const cat = byCategory[p.category];
    cat.count++;
    cat.totalTokenSaved += result.delta.tokenSaved;
    cat.avgQualityDelta += parseFloat(result.delta.qualityDelta);
    cat.avgLatencySaved += result.delta.latencySaved;

    const icon = r1.success ? "✅" : "❌";
    console.log(`  ${icon} ${p.id} | saved=${result.delta.tokenSaved}t | latency=${result.delta.latencySaved}ms | quality=${result.delta.qualityDelta}`);
  }

  // ===== 汇总 =====
  console.log("\n" + "=".repeat(70));
  console.log("  Summary");
  console.log("=".repeat(70));

  const totalSaved = results.reduce((s, r) => s + r.delta.tokenSaved, 0);
  const totalLatencySaved = results.reduce((s, r) => s + r.delta.latencySaved, 0);
  const avgQualityDelta = (results.reduce((s, r) => s + parseFloat(r.delta.qualityDelta), 0) / results.length).toFixed(2);
  const cacheHits = results.filter(r => r.optimized.cached).length;

  console.log(`\n  Total Prompts: ${results.length}`);
  console.log(`  Total Token Saved: ${totalSaved}`);
  console.log(`  Total Latency Saved: ${totalLatencySaved}ms`);
  console.log(`  Avg Quality Delta: ${avgQualityDelta}`);
  console.log(`  Cache Hits: ${cacheHits}/${results.length} (${(cacheHits / results.length * 100).toFixed(0)}%)`);
  console.log(`  Errors: ${results.filter(r => r.optimized.error).length}`);

  console.log("\n  By Category:");
  for (const [cat, stats] of Object.entries(byCategory)) {
    const avgTok = (stats.totalTokenSaved / stats.count).toFixed(0);
    const avgQual = (stats.avgQualityDelta / stats.count).toFixed(2);
    console.log(`    ${cat.padEnd(15)} | avg saved ${avgTok}t | quality ${avgQual} | latency ${(stats.avgLatencySaved / stats.count).toFixed(0)}ms`);
  }

  // 保存结果
  const report = {
    timestamp: new Date().toISOString(),
    gateway: GATEWAY,
    promptCount: prompts.length,
    summary: {
      totalTokenSaved: totalSaved,
      totalLatencySaved: totalLatencySaved,
      avgQualityDelta,
      cacheHitRate: cacheHits / results.length,
    },
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, { ...v, avgTokenSaved: v.totalTokenSaved / v.count, avgQualityDelta: v.avgQualityDelta / v.count, avgLatencySaved: v.avgLatencySaved / v.count }])
    ),
    details: results,
  };

  writeFileSync("benchmark-results-quality.json", JSON.stringify(report, null, 2));
  console.log("\n✅ Results saved to benchmark-results-quality.json");
}

main().catch(e => { console.error(e); process.exit(1); });
