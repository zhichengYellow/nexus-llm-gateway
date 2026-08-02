#!/usr/bin/env node
/**
 * Nexus LLM Gateway - CLI 工具
 *
 * 用法：
 *   node cli/nexus-cli.mjs health
 *   node cli/nexus-cli.mjs provider ls
 *   node cli/nexus-cli.mjs cache clear
 *   node cli/nexus-cli.mjs benchmark
 */
const API = process.env.NEXUS_URL || "http://localhost:8787";
const KEY = process.env.NEXUS_KEY || "sk-nexus-master-9f3aK2mP7vXq4WsR";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${KEY}`,
};

async function fetchApi(path, method = "GET", body = null) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function bold(s) { return `\x1b[1m${s}\x1b[0m`; }

async function cmdHealth() {
  console.log(bold("=== Nexus Health Check ==="));
  const { data, status } = await fetchApi("/health");
  if (status === 200) {
    console.log(`  Status: ${green("OK")}`);
    console.log(`  DB:     ${data.db ? green("connected") : red("disconnected")}`);
    console.log(`  Redis:  ${data.redis ? green("connected") : red("disconnected")}`);
  } else {
    console.log(`  Status: ${red("FAIL")} (HTTP ${status})`);
  }
}

async function cmdModels() {
  console.log(bold("=== Available Models ==="));
  const { data } = await fetchApi("/v1/models");
  if (data.data) {
    for (const m of data.data) {
      console.log(`  ${green(m.id)} (${m.owned_by})`);
    }
  } else {
    console.log(red(data.error?.message ?? "unknown error"));
  }
}

async function cmdProvider(action) {
  console.log(bold("=== Provider Speed Test ==="));
  const { data } = await fetchApi("/admin/speed-test", "POST");
  if (data.results) {
    for (const r of data.results) {
      const icon = r.status === "ok" ? green("✓") : red("✗");
      const lat = r.status === "ok" ? `${r.latencyMs}ms` : r.error?.slice(0, 40) ?? "error";
      console.log(`  ${icon} ${r.model}: ${lat}`);
    }
  }
}

async function cmdCache(action) {
  if (action === "stats") {
    console.log(bold("=== Cache Statistics ==="));
    const { data } = await fetchApi("/admin/cache/stats");
    if (data.cache) {
      console.log(`  Total entries:    ${data.cache.totalEntries ?? "N/A"}`);
      console.log(`  Total hits:       ${data.cache.totalHits ?? "N/A"}`);
      console.log(`  Avg hits/entry:   ${data.cache.avgHits ?? "N/A"}`);
      console.log(`  Saved tokens:     ${data.cache.totalSavedTokens ?? "N/A"}`);
    }
  } else if (action === "clear") {
    console.log(yellow("Cache clear: send DELETE to /admin/cache"));
  }
}

async function cmdBenchmark() {
  console.log(bold("=== Running Offline Benchmark ==="));
  const { performance } = await import("node:perf_hooks");
  const { createHash } = await import("node:crypto");

  function canonicalText(text) {
    let s = text.trim().toLowerCase();
    s = s.replace(/[\s]+/g, " ");
    s = s.replace(/^[！!?？。，,.\s]+/, "").replace(/[！!?？。，,.\s]+$/, "");
    return s;
  }

  function cacheHash(provider, model, canonical, temperature) {
    const bucket = temperature < 0.3 ? 0 : temperature < 0.8 ? 0.5 : 1;
    return createHash("sha256").update(`${provider}|${model}|${canonical}|t${bucket}`).digest("hex");
  }

  const tests = [
    { name: "canonicalText", fn: () => canonicalText("  Hello World！  "), iter: 50000 },
    { name: "cacheHash", fn: () => cacheHash("deepseek", "chat", "hello", 0.7), iter: 50000 },
  ];

  for (const t of tests) {
    for (let i = 0; i < 100; i++) t.fn();
    const start = performance.now();
    for (let i = 0; i < t.iter; i++) t.fn();
    const elapsed = performance.now() - start;
    const ops = Math.round((t.iter / elapsed) * 1000);
    console.log(`  ${t.name}: ${ops.toLocaleString()} ops/s (${t.iter.toLocaleString()} iter, ${Math.round(elapsed)}ms)`);
  }
}

async function cmdDoctor() {
  console.log(bold("=== Nexus Doctor ==="));
  console.log(`  Gateway URL: ${API}`);

  // 1. Health
  const health = await fetchApi("/health");
  console.log(`  Health:  ${health.status === 200 ? green("OK") : red("FAIL")}`);

  // 2. Models
  const models = await fetchApi("/v1/models");
  console.log(`  Models:  ${models.data.data ? green(`${models.data.data.length} models`) : red("FAIL")}`);

  // 3. Cache
  const cache = await fetchApi("/admin/cache/stats");
  console.log(`  Cache:   ${cache.data.cache ? green("OK") : red("FAIL")}`);

  // 4. Provider speed test
  const speed = await fetchApi("/admin/speed-test", "POST");
  const okCount = speed.data.results?.filter((r) => r.status === "ok").length ?? 0;
  const total = speed.data.results?.length ?? 0;
  console.log(`  Provider: ${green(`${okCount}/${total} healthy`)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const sub = args[1];

  console.log(`Nexus CLI - ${API}\n`);

  switch (cmd) {
    case "health":    return cmdHealth();
    case "models":    return cmdModels();
    case "provider":  return cmdProvider(sub);
    case "cache":     return cmdCache(sub ?? "stats");
    case "benchmark": return cmdBenchmark();
    case "doctor":    return cmdDoctor();
    default:
      console.log("Usage: node cli/nexus-cli.mjs <command>");
      console.log("Commands:");
      console.log("  health         Health check");
      console.log("  models         List available models");
      console.log("  provider ls    Speed test all providers");
      console.log("  cache stats    Cache statistics");
      console.log("  cache clear    Clear cache");
      console.log("  benchmark      Offline benchmark");
      console.log("  doctor         Full diagnostics");
      console.log(`\nEnv: NEXUS_URL=${API}  NEXUS_KEY=<your-key>`);
  }
}

main().catch((e) => {
  console.error(red(`Error: ${e.message}`));
  process.exit(1);
});
