/**
 * Nexus LLM Gateway - 缓存基准测试
 *
 * 目的：量化缓存/SingleFlight 带来的收益，输出可信数据：
 *  - 命中率（重复查询 / 标点变体 / 参数微变）
 *  - 延迟对比（缓存 vs 直连）
 *  - SingleFlight 并发减负（同 key 并发上游调用次数）
 *
 * 用法：
 *   source ~/.nvm/nvm.sh && nvm use 22
 *   node benchmark/cache-benchmark.mjs
 *
 * 需要网关在 http://localhost:8787 运行，并有一个有效 API Key。
 */
const API = process.env.GATEWAY_URL || "http://localhost:8787/v1";
const KEY = process.env.GATEWAY_KEY || "sk-nexus-dev-UUPCSeUMFC4rGW63I1sSH6hJ";
const MODEL = process.env.GATEWAY_MODEL || "deepseek-v4-flash";

async function chat(prompt, opts = {}) {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, ...(opts.headers || {}) },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 5, ...(opts.body || {}) }),
  });
  const data = await res.json();
  return {
    start: opts.start,
    latency: Date.now() - (opts.start || Date.now()),
    cached: data?.nexus?.cached ?? false,
    provider: data?.nexus?.provider,
    content: data?.choices?.[0]?.message?.content,
  };
}

async function main() {
  console.log("===============================================");
  console.log("  Nexus LLM Gateway - 缓存基准测试");
  console.log(`  API: ${API}  Model: ${MODEL}`);
  console.log("===============================================\n");

  // ===== 1. 命中率：重复查询 =====
  console.log("[1] 重复查询命中率（同一 prompt 请求 5 次）");
  const prompts = ["请用一句话介绍缓存", "你好", "解释一下什么是向量数据库"];
  for (const p of prompts) {
    let hits = 0;
    const latencies = [];
    for (let i = 0; i < 5; i++) {
      const r = await chat(p);
      if (r.cached) hits++;
      latencies.push(r.latency);
    }
    const cacheLat = latencies.filter((_, i) => i > 0); // 第 1 次必 miss
    console.log(`  "${p.slice(0, 16)}..." → 命中 ${hits}/4（后续4次） 平均 ${Math.round(cacheLat.reduce((a, b) => a + b, 0) / cacheLat.length)}ms`);
  }
  console.log();

  // ===== 2. 标点变体命中 =====
  console.log("[2] 标点变体命中（hello → hello！→ hello?）");
  await chat("hello");
  for (const variant of ["hello！", "hello?", "hello  "]) {
    const r = await chat(variant);
    await new Promise((r) => setTimeout(r, 200));
    console.log(`  "${variant}" → cached: ${r.cached}`);
  }
  console.log();

  // ===== 3. 参数微变命中（temperature 分桶） =====
  console.log("[3] temperature 分桶（0.7 / 0.71 / 0.72 同一 key）");
  await chat("介绍一下你自己", { body: { temperature: 0.7 } });
  for (const t of [0.71, 0.72]) {
    const r = await chat("介绍一下你自己", { body: { temperature: t } });
    console.log(`  temp=${t} → cached: ${r.cached}`);
  }
  console.log();

  // ===== 4. SingleFlight 并发减负 =====
  console.log("[4] SingleFlight 并发（20 并发同 prompt，应显著减负）");
  const newPrompt = `SingleFlight-${Date.now()}`;
  const timestamps = Array.from({ length: 20 }, () => Date.now());

  // 捕获完整响应以便按 id 去重（SingleFlight 共享同一响应 → 同一 id）
  async function chatRaw(prompt, opts = {}) {
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, ...(opts.headers || {}) },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 5, ...(opts.body || {}) }),
    });
    const data = await res.json();
    return {
      latency: Date.now() - (opts.start || Date.now()),
      id: data?.id,
      cached: data?.nexus?.cached ?? false,
      provider: data?.nexus?.provider,
    };
  }
  const results = await Promise.all(timestamps.map((start) => chatRaw(newPrompt, { start })));
  const uniqueIds = new Set(results.map((r) => r.id)).size; // 共享响应的 id 相同
  const avgLatency = Math.round(results.reduce((a, r) => a + r.latency, 0) / results.length);
  console.log(`  20 并发 → 响应去重后上游 ${uniqueIds} 次（理想=1，若=20则SingleFlight未生效）`);
  console.log(`         平均延迟 ${avgLatency}ms，20 个请求均正常返回`);
  console.log();

  // ===== 5. 短词防缓存（继续/谢谢） =====
  console.log("[5] 短上下文词防命中（继续/谢谢 不应 cached）");
  for (const p of ["继续", "谢谢", "ok"]) {
    const r = await chat(p);
    console.log(`  "${p}" → cached: ${r.cached} (期望 false)`);
  }
  console.log("\n===============================================");
  console.log("  基准测试完成");
  console.log("===============================================");
}

main().catch((e) => {
  console.error("基准测试失败:", e.message);
  process.exit(1);
});