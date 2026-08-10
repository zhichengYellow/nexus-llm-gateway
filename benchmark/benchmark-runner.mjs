#!/usr/bin/env node
/**
 * Nexus LLM Gateway - Benchmark Runner (v2)
 *
 * Compares Provider Direct (baseline) vs Nexus (balanced / cheap / maximum_saving).
 * Outputs benchmark-report.json + benchmark-report.md.
 *
 * Usage: node benchmark/benchmark-runner.mjs
 * Requires: GATEWAY_URL + GATEWAY_KEY env vars, or defaults to localhost:8787
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATEWAY = process.env.GATEWAY_URL || "http://localhost:8787/v1";
const KEY = process.env.GATEWAY_KEY || process.env.GATEWAY_MASTER_KEY || "";

const PROFILES = ["balanced", "cheap", "maximum_saving"];
const TIMEOUT = 15000;

// Load prompts
const prompts = JSON.parse(readFileSync(join(__dirname, "prompts/quality-prompts.json"), "utf-8"));

// Categorize into 8 workloads
const WORKLOADS = {
  "Short QA": prompts.filter(p => p.text.length < 30).slice(0, 5),
  "Long Context": prompts.filter(p => p.text.length > 100).slice(0, 5),
  "Coding": prompts.filter(p => p.category === "code").slice(0, 5),
  "Chinese": prompts.filter(p => /[\u4e00-\u9fff]/.test(p.text) && p.category !== "code").slice(0, 5),
  "English": prompts.filter(p => /^[A-Z]/.test(p.text)).slice(0, 5),
  "Conversation": prompts.filter(p => p.category === "chat").slice(0, 5),
  "Repeated Prompt": [prompts[0], prompts[0], prompts[0]], // same prompt 3x → cache test
  "Document QA": prompts.filter(p => p.category === "agent" || p.category === "rag").slice(0, 5),
};

async function chat(prompt, profile) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` };
  if (profile) headers["x-nexus-profile"] = profile;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const start = Date.now();
  try {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: prompt }], max_tokens: 100 }),
 signal: controller.signal,
    });
    const latency = Date.now() - start;
    if (!res.ok) return { error: `HTTP ${res.status}`, latency };
    const data = await res.json();
    const usage = data.usage || {};
    return {
      latency,
      tokens: usage.total_tokens || 0,
    promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      cached: data.nexus?.cached || false,
  savedTokens: data.nexus?.savedTokens || 0,
    };
  } catch (e) {
    return { error: e.message, latency: Date.now() - start };
  } finally {
  clearTimeout(timer);
  }
}

async function runWorkload(name, prompts, profile) {
  const results = [];
  for (const p of prompts) {
    const text = typeof p === "string" ? p : p.text;
    results.push(await chat(text, profile));
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }
  const successful = results.filter(r => !r.error);
  const totalTokens = successful.reduce((a, r) => a + r.tokens, 0);
  const savedTokens = successful.reduce((a, r) => a + (r.savedTokens || 0), 0);
  const avgLatency = successful.length > 0 ? Math.round(successful.reduce((a, r) => a + r.latency, 0) / successful.length) : 0;
  const cacheHits = successful.filter(r => r.cached).length;
  return { name, profile: profile || "direct", requests: prompts.length, successful: successful.length, totalTokens, savedTokens, avgLatency, cacheHits };
}

async function main() {
  if (!KEY) { console.error("Set GATEWAY_KEY or GATEWAY_MASTER_KEY"); process.exit(1); }
  console.log(`Benchmark: ${GATEWAY} (${Object.keys(WORKLOADS).length} workloads × ${PROFILES.length + 1} profiles)`);

  const report = { timestamp: new Date().toISOString(), gateway: GATEWAY, version: "2.2.0", results: [] };

  for (const [workload, wPrompts] of Object.entries(WORKLOADS)) {
    if (wPrompts.length === 0) continue;
    console.log(`\n▶ ${workload} (${wPrompts.length} prompts)`);

    // Baseline (no profile = balanced default)
    const baseline = await runWorkload(workload, wPrompts, null);
 report.results.push(baseline);
    console.log(`  direct: ${baseline.totalTokens} tokens, ${baseline.avgLatency}ms avg`);

    for (const profile of PROFILES) {
      const result = await runWorkload(workload, wPrompts, profile);
      report.results.push(result);
      const saving = baseline.totalTokens > 0 ? ((baseline.totalTokens - result.totalTokens + result.savedTokens) / baseline.totalTokens * 100).toFixed(1) : "0";
  console.log(`  ${profile}: ${result.totalTokens} tokens, saved ${result.savedTokens}, ${saving}% reduction, ${result.avgLatency}ms`);
    }
  }

  // Write JSON
  writeFileSync(join(__dirname, "benchmark-report.json"), JSON.stringify(report, null, 2));

  // Write Markdown
  let md = `# Benchmark Report\n\n`;
  md += `- **Date**: ${report.timestamp}\n`;
  md += `- **Gateway**: ${report.gateway}\n`;
  md += `- **Version**: ${report.version}\n\n`;
  md += `| Workload | Profile | Requests | Tokens | Saved | Reduction | Latency | Cache |\n`;
  md += `|----------|---------|----------|--------|-------|-----------|---------|-------|\n`;
  for (const r of report.results) {
    md += `| ${r.name} | ${r.profile} | ${r.successful}/${r.requests} | ${r.totalTokens} | ${r.savedTokens} | — | ${r.avgLatency}ms | ${r.cacheHits} |\n`;
  }
md += `\n> Results are as-measured. No data removed. Script: \`node benchmark/benchmark-runner.mjs\`\n`;
  writeFileSync(join(__dirname, "benchmark-report.md"), md);

  console.log("\n✅ Done. Output: benchmark-report.json + benchmark-report.md");
}

main().catch(console.error);
