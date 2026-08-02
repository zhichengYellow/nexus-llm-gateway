/**
 * Nexus LLM Gateway - 离线 Benchmark 脚本
 *
 * 目的：在不依赖真实网关/API 的情况下，对核心纯函数进行性能基准测试。
 * 可在 CI 中运行，输出标准化结果。
 *
 * 用法：node benchmark/offline-benchmark.mjs
 */
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";

// ===== 复制核心纯函数（避免 TypeScript 依赖）=====

function canonicalText(text) {
  if (!text) return "";
  let s = text.trim().toLowerCase();
  s = s.replace(/[\s]+/g, " ");
  // 首尾语气标点剔除
  s = s.replace(/^[！!?？。，,\.\s]+/, "").replace(/[！!?？。，,\.\s]+$/, "");
  return s;
}

function isCacheable(canonical, raw) {
  if (!canonical || !canonical.trim()) return false;
  const contextWords = /^(继续|谢谢|ok|嗯|哦|好|对|是的|没错|可以|行|好的|明白了|知道了)$/i;
  if (contextWords.test(canonical.trim())) return false;
  if (canonical.trim().length < 8 && !/^(hello|hi|hey|你好|您好|早上好|下午好|晚上好)$/i.test(canonical.trim())) {
    return false;
  }
  return true;
}

function cacheHash(provider, model, canonical, temperature) {
  const bucketT = typeof temperature === "number" ? (temperature < 0.3 ? 0 : temperature < 0.8 ? 0.5 : 1) : 0;
  const key = `${provider}|${model}|${canonical}|t${bucketT}`;
  return createHash("sha256").update(key).digest("hex");
}

function classifyTtl(text, defaultTtl) {
  const pricePattern = /(价格|行情|多少钱|费用|成本|报价)/;
  const weatherPattern = /(天气|气温|下雨|刮风|晴天|阴天)/;
  const newsPattern = /(新闻|最新|今日|今天|刚刚|突发)/;
  const politicsPattern = /(总统|主席|首相|政府|政策|国家|国际|政治)/;
  const greetingPattern = /^(hello|hi|hey|你好|您好|早上好|下午好|晚上好)/i;

  if (pricePattern.test(text)) return 30;
  if (weatherPattern.test(text)) return 600;
  if (newsPattern.test(text)) return 1800;
  if (politicsPattern.test(text)) return 3600;
  if (greetingPattern.test(text)) return 7 * 86400;
  return defaultTtl;
}

// ===== Benchmark 工具 =====

function benchmark(name, fn, iterations = 10000) {
  // 预热
  for (let i = 0; i < 100; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const opsPerSec = Math.round((iterations / elapsed) * 1000);
  const avgUs = ((elapsed / iterations) * 1000).toFixed(2);

  return { name, iterations, elapsed: Math.round(elapsed), opsPerSec, avgUs };
}

// ===== 运行基准 =====

console.log("=".repeat(60));
console.log("  Nexus LLM Gateway - 离线 Benchmark");
console.log("  Node.js " + process.version);
console.log("=".repeat(60));
console.log();

const results = [];

// canonicalText
results.push(benchmark("canonicalText (短文本)", () => {
  canonicalText("  Hello World！  ");
}));

results.push(benchmark("canonicalText (长文本)", () => {
  canonicalText("请详细解释一下什么是人工智能和机器学习之间的区别与联系？");
}));

// isCacheable
results.push(benchmark("isCacheable (可缓存)", () => {
  isCacheable("请解释一下什么是缓存", "请解释一下什么是缓存");
}));

results.push(benchmark("isCacheable (短词拒绝)", () => {
  isCacheable("继续", "继续");
}));

// cacheHash
results.push(benchmark("cacheHash", () => {
  cacheHash("deepseek", "deepseek-chat", "hello world", 0.7);
}));

// classifyTtl
results.push(benchmark("classifyTtl (常识)", () => {
  classifyTtl("你好", 86400);
}));

results.push(benchmark("classifyTtl (价格)", () => {
  classifyTtl("比特币价格查询", 86400);
}));

// SSE 解析
function parseSseLines(chunk) {
  const lines = [];
  for (const raw of chunk.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;
    if (payload) lines.push(payload);
  }
  return lines;
}

results.push(benchmark("parseSseLines", () => {
  parseSseLines('data: {"id":"1"}\ndata: {"id":"2"}\ndata: [DONE]\n');
}));

// Token 估算
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

results.push(benchmark("estimateTokens", () => {
  estimateTokens("Hello, this is a test message for token estimation.");
}));

// SHA-256 hash
results.push(benchmark("SHA-256 hash", () => {
  createHash("sha256").update("test message for hashing benchmark").digest("hex");
}));

// 输出表格
console.log("--- 结果 ---");
console.log("| 测试项 | 迭代次数 | 耗时(ms) | ops/s | 平均(μs) |");
console.log("|--------|---------|---------|-------|---------|");
for (const r of results) {
  console.log(`| ${r.name} | ${r.iterations} | ${r.elapsed} | ${r.opsPerSec} | ${r.avgUs} |`);
}

console.log();
console.log("=".repeat(60));
console.log("  Benchmark 完成");
console.log("=".repeat(60));
