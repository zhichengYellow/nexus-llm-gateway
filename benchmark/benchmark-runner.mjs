#!/usr/bin/env node
/**
 * Nexus LLM Gateway - Reproducible Benchmark Runner (v3)
 *
 * 可复现 Token 优化基准实验：
 *   Baseline = 网关 fast 模式 + 关闭缓存（x-nexus-profile: fast + x-nexus-no-cache: 1），
 *             接近直连、不进行压缩/缓存/重写（在 methodology 中说明此语义）。
 *   Nexus    = balanced / cheap / maximum_saving 三档完整优化链路。
 *
 * 场景（10 类）：
 *   Short QA / Long Context / Coding / Chinese / English / Conversation /
 *   Document QA / Repeated Prompt(缓存) / Short Prompt(不强行优化验证) /
 *   Concurrent Duplicate(SingleFlight 去重)
 *
 * Usage:
 *   GATEWAY_URL=https://.../v1 GATEWAY_KEY=sk-... node benchmark/benchmark-runner.mjs
 * 输出:
 *   benchmark/results/<date>.json   —— 每请求原始明细（可复现）
 *   benchmark/benchmark-report.json —— 聚合
 *   benchmark/benchmark-report.md   —— 人类可读报告（含 Methodology/Limitations）
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATEWAY = process.env.GATEWAY_URL || "http://localhost:8787/v1";
const KEY = process.env.GATEWAY_KEY || process.env.GATEWAY_MASTER_KEY || "";
const TIMEOUT = Number(process.env.BENCH_TIMEOUT_MS || 20000);
const REPS = Number(process.env.BENCH_REPS || 1); // 每个 prompt 重复次数（默认 1）
const MODEL = process.env.BENCH_MODEL || "deepseek-v4-flash"; // 网关模型别名（默认 DeepSeek）

const PROFILES = ["balanced", "cheap", "maximum_saving"];

// 数据集：基于 prompts/quality-prompts.json（56 条）分类 + 内联补充
const prompts = JSON.parse(readFileSync(join(__dirname, "prompts/quality-prompts.json"), "utf-8"));

const WORKLOADS = {
  "Short QA": prompts.filter((p) => p.text && p.text.length < 30).slice(0, 5),
  "Long Context": prompts.filter((p) => p.text && p.text.length > 100).slice(0, 5),
  "Coding": prompts.filter((p) => p.category === "code").slice(0, 5),
  "Chinese": prompts.filter((p) => /[\u4e00-\u9fff]/.test(p.text) && p.category !== "code").slice(0, 5),
  "English": prompts.filter((p) => /^[A-Z]/.test(p.text || "")).slice(0, 5),
  "Conversation": prompts.filter((p) => p.category === "chat").slice(0, 5),
  "Document QA": prompts.filter((p) => p.category === "agent" || p.category === "rag").slice(0, 5),
  "Repeated Prompt": ["5+7=? 只输出数字", "5+7=? 只输出数字", "5+7=? 只输出数字"],
  "Short Prompt": ["hi", "hello", "ok", "yes", "thanks"].map((t) => ({ text: t, category: "short" })),
};

async function chat(prompt, { profile, bypass, concurrent = false }) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` };
  if (profile) headers["x-nexus-profile"] = profile;
  if (bypass) headers["x-nexus-no-cache"] = "1";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const start = Date.now();
  try {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 300 }),
      signal: controller.signal,
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { error: `HTTP ${res.status}: ${body.slice(0, 120)}`, latency };
    }
    const data = await res.json();
    const usage = data.usage || {};
    return {
      latency,
      tokens: usage.total_tokens || 0,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      cached: data.nexus?.cached || false,
      deduped: data.nexus?.deduped || false,
      savedTokens: data.nexus?.savedTokens || 0,
      requestId: data.nexus?.requestId || null,
    };
  } catch (e) {
    return { error: e.message, latency: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function runWorkload(name, wPrompts, profile, bypass) {
  const results = [];
  for (const p of wPrompts) {
    const text = typeof p === "string" ? p : p.text;
    for (let i = 0; i < REPS; i++) {
      results.push({ prompt: text.slice(0, 60), ...(await chat(text, { profile, bypass })) });
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return summarize(name, profile || "baseline", results);
}

async function runConcurrentDedup() {
  // 同一 prompt 并发 3 次 → SingleFlight 应共享在途请求（后到者延迟 ≈ 0）
  const prompt = typeof prompts[0] === "string" ? prompts[0] : prompts[0].text;
  const results = await Promise.all(
    [0, 1, 2].map(() => chat(prompt, { profile: "balanced" })),
  );
  return {
    name: "Concurrent Duplicate",
    profile: "balanced",
    requests: 3,
    successful: results.filter((r) => !r.error).length,
    totalTokens: results.reduce((a, r) => a + (r.tokens || 0), 0),
    savedTokens: results.reduce((a, r) => a + (r.savedTokens || 0), 0),
    avgLatency: Math.round(results.reduce((a, r) => a + r.latency, 0) / results.length),
    latencies: results.map((r) => r.latency),
    cacheHits: results.filter((r) => r.cached).length,
    deduped: results.filter((r) => r.deduped).length,
    errors: results.filter((r) => r.error).map((r) => r.error),
    note: "3 并发相同请求：若 SingleFlight 生效，后到请求延迟应显著低于首个（共享在途上游调用）",
  };
}

function summarize(name, profile, results) {
  const ok = results.filter((r) => !r.error);
  return {
    name,
    profile,
    requests: results.length,
    successful: ok.length,
    totalTokens: ok.reduce((a, r) => a + r.tokens, 0),
    savedTokens: ok.reduce((a, r) => a + (r.savedTokens || 0), 0),
    avgLatency: ok.length > 0 ? Math.round(ok.reduce((a, r) => a + r.latency, 0) / ok.length) : 0,
    cacheHits: ok.filter((r) => r.cached).length,
    errors: results.filter((r) => r.error).map((r) => r.error),
    raw: results,
  };
}

function gitInfo() {
  try {
    return {
      commit: execSync("git rev-parse --short HEAD", { cwd: join(__dirname, "..") }).toString().trim(),
      version: JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")).version,
    };
  } catch {
    return { commit: "unknown", version: "unknown" };
  }
}

function reduction(baseline, row) {
  if (!baseline || baseline.totalTokens <= 0) return null;
  // 节省 = baseline 原始 token − nexus 实际 token + nexus 上报节省（缓存命中时 nexus 自身 token 已为 0）
  const saved = Math.max(0, baseline.totalTokens - row.totalTokens + (row.savedTokens || 0));
  return { savedPct: Math.round((saved / baseline.totalTokens) * 1000) / 10, savedTokens: saved };
}

async function main() {
  if (!KEY) { console.error("Set GATEWAY_KEY or GATEWAY_MASTER_KEY"); process.exit(1); }
  const date = new Date().toISOString().slice(0, 10);
  console.log(`Nexus Benchmark v3 — ${GATEWAY} (${Object.keys(WORKLOADS).length + 1} 场景 × baseline + ${PROFILES.length} 档)`);

  const report = {
    date,
    gateway: GATEWAY,
    version: gitInfo().version,
    commit: gitInfo().commit,
    environment: { model: "auto (网关路由)", temperature: "默认", maxTokens: 100, reps: REPS, timeoutMs: TIMEOUT },
    methodology: {
      baseline: "x-nexus-profile: fast + x-nexus-no-cache: 1（接近直连：不压缩、不缓存、不重写；仍经网关最小处理）",
      nexus: "完整优化链路（默认 balanced / cheap / maximum_saving 三档）",
      note: "Repeated Prompt 用相同 prompt 多次请求验证缓存；Concurrent Duplicate 用并发相同请求验证 SingleFlight；Short Prompt 验证短消息不强行优化",
    },
    results: [],
  };

  for (const [name, wPrompts] of Object.entries(WORKLOADS)) {
    if (!wPrompts || wPrompts.length === 0) continue;
    console.log(`\n▶ ${name} (${wPrompts.length} prompts × ${REPS} reps)`);

    const baseline = await runWorkload(name, wPrompts, null, true);
    report.results.push(baseline);
    console.log(`  baseline: ${baseline.totalTokens} tok, ${baseline.avgLatency}ms avg`);

    for (const profile of PROFILES) {
      const result = await runWorkload(name, wPrompts, profile, false);
      const red = reduction(baseline, result);
      report.results.push(result);
      console.log(`  ${profile}: ${result.totalTokens} tok, saved ${result.savedTokens}, ${red ? red.savedPct + "%" : "—"} reduction, ${result.avgLatency}ms`);
    }
  }

  // 并发去重场景（单独，无 baseline）
  const dedup = await runConcurrentDedup();
  report.results.push(dedup);
  console.log(`\n▶ Concurrent Duplicate: ${dedup.avgLatency}ms avg, latencies=${dedup.latencies.join(",")}`);

  // 写原始数据（可复现）
  const resultsDir = join(__dirname, "results");
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, `${date}.json`), JSON.stringify(report, null, 2));

  // 聚合报告（不含 raw 明细）
  const aggregated = { ...report, results: report.results.map(({ raw, ...r }) => r) };
  writeFileSync(join(__dirname, "benchmark-report.json"), JSON.stringify(aggregated, null, 2));

  // Markdown 报告（完整结构）
  const baselines = Object.fromEntries(report.results.filter((r) => r.profile === "baseline").map((r) => [r.name, r]));
  let md = `# Nexus Token Optimization Benchmark\n\n`;
  md += `- **Date**: ${report.date}\n`;
  md += `- **Version**: ${report.version}\n`;
  md += `- **Commit**: \`${report.commit}\`\n`;
  md += `- **Gateway**: ${report.gateway}\n\n`;
  md += `## Environment\n\n`;
  md += `| Key | Value |\n|---|---|\n`;
  md += `| Provider | 网关路由（auto） |\n| Model | auto |\n| Temperature | 默认 |\n| Max tokens | 100 |\n| Reps per prompt | ${REPS} |\n| Timeout | ${TIMEOUT}ms |\n\n`;
  md += `## Methodology\n\n`;
  md += `- **Baseline**：${report.methodology.baseline}\n`;
  md += `- **Nexus**：${report.methodology.nexus}\n`;
  md += `- 每个 workload 在 baseline 与每个 profile 下各执行 ${Object.values(WORKLOADS).reduce((a, w) => a + (w?.length ?? 0), 0)} 个 prompt（按场景分配）${REPS > 1 ? ` × ${REPS} 次` : ""}。\n`;
  md += `- 原始数据：\`benchmark/results/${date}.json\`（每请求明细，可复现）。\n`;
  md += `- 重跑：\`GATEWAY_URL=<网关/v1> GATEWAY_KEY=<key> node benchmark/benchmark-runner.mjs\`\n\n`;
  md += `## Results\n\n`;
  md += `| Workload | Profile | OK/Total | Tokens | Saved | Reduction | Latency | Cache |\n`;
  md += `|----------|---------|----------|--------|-------|-----------|---------|-------|\n`;
  for (const r of report.results) {
    const red = r.profile !== "baseline" && r.profile !== "balanced" || r.profile === "balanced" ? reduction(baselines[r.name], r) : null;
    const redStr = red ? `${red.savedPct}%` : "—";
    md += `| ${r.name} | ${r.profile} | ${r.successful}/${r.requests} | ${r.totalTokens} | ${r.savedTokens} | ${redStr} | ${r.avgLatency}ms | ${r.cacheHits} |\n`;
  }
  md += `\n## Attribution\n\n`;
  md += `> 各请求的节省来源（Cache/Compression/Dedup/Routing/Rewrite）由网关 \`GET /user/requests/:id\` 的 savings.source 提供；本报告记录 \`savedTokens\`（网关上报）与 raw 明细。\n`;
  md += `\n## Overhead\n\n`;
  md += `> baseline 与 nexus 的 latency 差可视为优化开销（含缓存查询/压缩/路由等）。详见 results JSON 的每请求 latency。\n`;
  md += `\n## Limitations\n\n`;
  md += `- Results depend on provider/model behavior, workload distribution, cache state and optimization profile. These results should not be interpreted as a universal token-saving guarantee.\n`;
  md += `- Baseline 经网关 fast 模式（非完全直连 Provider），仍含网关最小处理开销。\n`;
  md += `- 缓存场景结果依赖预热状态；重复运行可能因缓存命中而变化。\n`;
  md += `- 未移除任何失败/不理想数据；全部原始数据见 results/。\n`;
  writeFileSync(join(__dirname, "benchmark-report.md"), md);

  console.log("\n✅ 完成。输出: benchmark/results/" + date + ".json + benchmark-report.json + benchmark-report.md");
}

main().catch((e) => { console.error(e); process.exit(1); });
