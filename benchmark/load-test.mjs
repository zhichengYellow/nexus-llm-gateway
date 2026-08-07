/**
 * Nexus LLM Gateway - 性能压测脚本
 *
 * 用途：对网关进行并发压力测试，验证吞吐量和延迟表现。
 *
 * 用法：
 *   node benchmark/load-test.mjs
 *   # 自定义参数：
 *   CONCURRENT=50 DURATION=10 node benchmark/load-test.mjs
 *
 * 需要网关在 http://localhost:8787 运行。
 */
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8787/v1";
const GATEWAY_KEY = process.env.GATEWAY_KEY || ""; // 必填: GATEWAY_KEY=<master_key> 运行
const MODEL = process.env.GATEWAY_MODEL || "gemini-flash-lite";
const CONCURRENT = parseInt(process.env.CONCURRENT || "20", 10);
const DURATION = parseInt(process.env.DURATION || "5", 10); // 秒
const PROMPTS = [
  "你好",
  "解释一下什么是机器学习",
  "用一句话介绍人工智能",
  "今天天气怎么样",
  "推荐一本书",
  "什么是REST API",
  "写一个排序算法",
  "翻译成英文：你好世界",
  "解释量子计算",
  "什么是Docker",
];

async function sendRequest(prompt) {
  const start = Date.now();
  try {
    const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GATEWAY_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 10,
      }),
    });
    const data = await res.json();
    const latency = Date.now() - start;
    return {
      success: res.ok,
      status: res.status,
      latency,
      cached: data?.nexus?.cached ?? false,
      provider: data?.nexus?.provider,
      error: data?.error?.message,
    };
  } catch (e) {
    return {
      success: false,
      status: 0,
      latency: Date.now() - start,
      cached: false,
      provider: "error",
      error: e.message,
    };
  }
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  console.log("=".repeat(50));
  console.log("  Nexus LLM Gateway - 性能压测");
  console.log(`  URL: ${GATEWAY_URL}  Model: ${MODEL}`);
  console.log(`  并发: ${CONCURRENT}  持续时间: ${DURATION}s`);
  console.log("=".repeat(50));
  console.log();

  const results = [];
  const startTime = Date.now();
  const endTime = startTime + DURATION * 1000;
  let requestCount = 0;

  async function worker() {
    while (Date.now() < endTime) {
      const prompt = PROMPTS[requestCount % PROMPTS.length];
      requestCount++;
      const result = await sendRequest(prompt);
      results.push(result);
      // 短暂间隔避免打爆网关
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // 启动并发 worker
  const workers = Array.from({ length: CONCURRENT }, () => worker());
  await Promise.all(workers);

  const elapsed = (Date.now() - startTime) / 1000;

  // 统计
  const success = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const cached = results.filter((r) => r.cached);
  const latencies = results.map((r) => r.latency).sort((a, b) => a - b);

  console.log("--- 结果汇总 ---");
  console.log(`  总请求数:       ${results.length}`);
  console.log(`  成功:           ${success.length} (${((success.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`  失败:           ${failed.length}`);
  console.log(`  缓存命中:       ${cached.length} (${((cached.length / success.length) * 100).toFixed(1)}% of success)`);
  console.log(`  持续时间:       ${elapsed.toFixed(1)}s`);
  console.log(`  平均 QPS:       ${(results.length / elapsed).toFixed(1)}`);
  console.log();
  console.log("--- 延迟分布 (ms) ---");
  console.log(`  min:            ${latencies[0]}`);
  console.log(`  p50:            ${percentile(latencies, 50)}`);
  console.log(`  p90:            ${percentile(latencies, 90)}`);
  console.log(`  p95:            ${percentile(latencies, 95)}`);
  console.log(`  p99:            ${percentile(latencies, 99)}`);
  console.log(`  max:            ${latencies[latencies.length - 1]}`);
  console.log(`  avg:            ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)}`);
  console.log();

  if (failed.length > 0) {
    console.log("--- 失败详情 ---");
    const errorGroups = {};
    for (const f of failed) {
      const key = `${f.status}:${f.error}`;
      errorGroups[key] = (errorGroups[key] || 0) + 1;
    }
    for (const [key, count] of Object.entries(errorGroups)) {
      console.log(`  ${key}: ${count} 次`);
    }
  }

  console.log();
  console.log("=".repeat(50));
  console.log("  压测完成");
  console.log("=".repeat(50));
}

main().catch((e) => {
  console.error("压测失败:", e.message);
  process.exit(1);
});
