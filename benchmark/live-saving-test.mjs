/**
 * Nexus LLM Gateway - 实际节省效果批量测试(本地,1M token 指标)
 *
 * 模拟个人开发者"正常使用"约 1M token 的流量(长文档处理 / 重复调试 / 相似提问 / 长对话 / 问答 / 代码),
 * 对比"走网关"与"不优化直接调用"的成本,输出 TRR / CSR / 实际节省金额。
 *
 * 用法:
 *   node benchmark/live-saving-test.mjs            # 默认 ROUNDS=150 → 累计约 1M token
 *   ROUNDS=40 node benchmark/live-saving-test.mjs  # 自定义轮次
 *
 * 需要: 网关在 http://localhost:8787 运行 + 已配 deepseek/gemini key(dev key 可跑)。
 * 说明: 测试前后读取 /admin/optimization/stats 的差值,结果精确对应本次流量。
 */
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8787/v1";
const GATEWAY_KEY = process.env.GATEWAY_KEY || "";
const MASTER_KEY = process.env.GATEWAY_MASTER_KEY || "";
const MODEL = process.env.MODEL || "auto"; // 可用 deepseek-v4-flash 绕过 gemini 配额
const ROUNDS = parseInt(process.env.ROUNDS || "150", 10); // 长文档重复次数,150 → ~1M token

async function callChat(prompt, model = MODEL) {
  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GATEWAY_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: (data?.error?.message || res.status).slice(0, 60), usage: null, cached: false };
  return { ok: true, usage: data.usage || null, cached: !!data.nexus?.cached, provider: data.nexus?.provider };
}

async function fetchToday() {
  try {
    const res = await fetch(`${GATEWAY_URL.replace("/v1", "")}/admin/optimization/stats`, {
      headers: { Authorization: `Bearer ${MASTER_KEY}` },
    });
    const d = await res.json();
    return d?.today || {};
  } catch { return {}; }
}

// ===== 长文档(约 4K token):模拟 RAG / 长文档分析 =====
const longDocSection = `## 模块设计:分布式缓存层
本模块负责为网关提供多级缓存能力,目标是在高并发下保持低延迟。核心设计如下:
1. 第一级:内存缓存。使用 LRU 策略,容量限制 10 万条,过期时间 60 秒。命中率预期 70%。
2. 第二级:Redis 分布式缓存。key 采用 namespace:hash 结构,支持集群模式和哨兵模式。序列化使用 MessagePack,压缩使用 zstd。
3. 第三级:PostgreSQL 持久化。用于缓存预热和跨节点共享,查询通过 pgvector 做向量相似度匹配。
缓存失效策略采用主动失效 + 被动过期双通道:写入时更新版本号,读时校验版本;被动过期由后台任务扫描 TTL 列,批量清理过期条目。
防雪崩:随机过期时间(基准 TTL ± 15%),热点 key 自动延长;防击穿:SingleFlight 合并并发请求,只允许一个请求回源;防穿透:缓存空值并设置短 TTL。
监控:每次缓存操作记录命中/未命中/延迟,通过 Prometheus 指标暴露,面板展示命中率趋势和热点分布。`;
const longDoc = Array.from({ length: 10 }, (_, i) => `# 技术文档 第${i + 1} 节\n${longDocSection}\n\n本节要点:缓存分层、失效策略、防雪崩防击穿防穿透、监控指标。请基于文档内容回答。`).join("\n\n---\n\n");
const longDocQuestion = `\n\n问题: 基于以上技术文档,请总结该缓存层的三级架构设计,并分析防雪崩、防击穿、防穿透各自解决了什么问题,失效策略如何保证一致性。`;

// ===== 重复调试: 同 prompt 反复问 =====
const debugPrompt = `我的这个 TypeScript 函数总是报错,帮我看看哪里有问题:\n\`\`\`typescript\nasync function fetchAll(urls: string[]) {\n  const results = [];\n  for (const u of urls) {\n    const r = await fetch(u);\n    if (!r.ok) throw new Error("failed: " + u);\n    results.push(await r.json());\n  }\n  return results;\n}\n\`\`\`\n报错信息: fetch failed at index 3。请分析原因并给出修复方案。`;

// ===== 相似提问(语义缓存) =====
const similarQuestions = [
  "用一句话解释什么是反向传播",
  "请简单说明一下反向传播算法的原理",
  "什么是反向传播?请简短解释",
  "帮我讲讲反向传播的基本思想",
  "反向传播是什么,用一句话描述",
  "简要说明反向传播的工作原理是什么",
  "什么是 backpropagation?简单说说",
  "请用通俗的话解释反向传播",
  "反向传播的核心思想是什么,简短回答",
  "一句话解释:反向传播是如何工作的",
];

// ===== 长对话(历史摘要) =====
const chatHistory = Array.from({ length: 6 }, (_, i) =>
  `第 ${i + 1} 轮对话的上下文内容是: 我们在讨论一个 Node.js 项目的架构设计,包括模块划分、错误处理、日志和缓存策略。前面已经确定了使用 Hono 框架和 Drizzle ORM,现在继续讨论${i === 5 ? "缓存层的 Redis 使用方案,以及如何设计缓存失效策略来保证数据一致性" : "路由层如何组织,以及中间件的执行顺序"}。请基于以上上下文继续。`,
);

// ===== 简单问答 =====
const quickQuestions = [
  "什么是 REST API?", "Docker 和虚拟机有什么区别?", "解释一下 SQL 索引的工作原理",
  "什么是函数式编程?", "HTTPS 和 HTTP 的区别是什么?", "什么是微服务架构?",
  "Git rebase 和 merge 的区别?", "解释一下浏览器缓存机制", "什么是 WebSocket?",
  "CSS Flexbox 和 Grid 的区别?", "什么是消息队列?", "JWT 和 Session 的区别?",
];

// ===== 复杂任务(难度感知 → 强模型) =====
const hardTasks = [
  `分析下面算法的时间复杂度并优化: 给定一个数组,找出所有和为 target 的三元组。当前实现是三重循环 O(n^3),请给出更优方案并证明复杂度,解释为什么你的方案正确,包括去重边界处理。`,
  `请重构这个有 bug 的函数并分析错误处理: \`\`\`typescript\nfunction parseConfig(raw: string): Config {\n  const lines = raw.split("\\n");\n  const cfg = {};\n  for (const line of lines) { const [k, v] = line.split("="); cfg[k] = JSON.parse(v); }\n  return cfg;\n}\n\`\`\`\n请分析异常处理、性能、健壮性问题,设计更完善的方案并解释设计决策。`,
];

// ===== 执行 =====
const stats = { total: 0, ok: 0, cached: 0, miss: 0, errors: 0 };
const startTime = Date.now();

async function run() {
  const before = await fetchToday();
  const beforeTokens = before.totalTokens || 0;
  console.log(`=== Nexus 实际节省批量测试 (ROUNDS=${ROUNDS}, 目标累计 ~1M token) ===`);
  console.log(`测试前基线: totalTokens=${beforeTokens}\n`);

  // 场景 1: 长文档处理 ×ROUNDS(缓存记账大头,单次 ~4.5K token)
  console.log(`[1/6] 长文档处理 ×${ROUNDS} (累计 ${(ROUNDS * 4.5 / 1000).toFixed(1)}K token 级)...`);
  for (let i = 0; i < ROUNDS; i++) {
    const r = await callChat(longDoc + longDocQuestion);
    stats.total++; r.ok ? stats.ok++ : stats.errors++;
    if (r.cached) stats.cached++; else stats.miss++;
  }

  // 场景 2: 重复调试 ×10
  console.log(`[2/6] 重复调试 ×10 (缓存命中)...`);
  for (let i = 0; i < 10; i++) {
    const r = await callChat(debugPrompt);
    stats.total++; r.ok ? stats.ok++ : stats.errors++;
    if (r.cached) stats.cached++; else stats.miss++;
  }

  // 场景 3: 相似提问 ×2 轮(语义缓存)
  console.log(`[3/6] 相似提问 ×${similarQuestions.length * 2} (语义缓存)...`);
  for (let round = 0; round < 1; round++) {
    for (const q of similarQuestions) {
      const r = await callChat(q);
      stats.total++; r.ok ? stats.ok++ : stats.errors++;
      if (r.cached) stats.cached++; else stats.miss++;
    }
  }

  // 场景 4: 长对话 ×6(上下文压缩)
  console.log(`[4/6] 长对话 ×${chatHistory.length} (上下文压缩)...`);
  for (const turn of chatHistory) {
    const r = await callChat(turn);
    stats.total++; r.ok ? stats.ok++ : stats.errors++;
    if (r.cached) stats.cached++; else stats.miss++;
  }

  // 场景 5: 简单问答 ×3 轮
  console.log(`[5/6] 简单问答 ×${quickQuestions.length * 3} (路由/压缩)...`);
  for (let round = 0; round < 1; round++) {
    for (const q of quickQuestions) {
      const r = await callChat(q);
      stats.total++; r.ok ? stats.ok++ : stats.errors++;
      if (r.cached) stats.cached++; else stats.miss++;
    }
  }

  // 场景 6: 复杂任务(难度感知升级)
  console.log(`[6/6] 复杂任务 ×${hardTasks.length} (难度感知 → 强模型)...`);
  for (const t of hardTasks) {
    const r = await callChat(t, "auto");
    stats.total++; r.ok ? stats.ok++ : stats.errors++;
    if (r.cached) stats.cached++; else stats.miss++;
  }

  // ===== 汇总(测试前后差值 = 本次流量) =====
  const after = await fetchToday();
  const totalTokens = (after.totalTokens || 0) - beforeTokens;
  const savedTokens = after.savedTokens || 0;
  const totalCost = parseFloat(after.totalCost || "0");
  const savedCost = parseFloat(after.savedCost || "0");
  const trr = totalTokens + savedTokens > 0 ? savedTokens / (totalTokens + savedTokens) : 0;
  const csr = totalCost + savedCost > 0 ? savedCost / (totalCost + savedCost) : 0;

  console.log(`\n========== 实测结果(本次 ${stats.total} 请求) ==========`);
  console.log(`缓存命中率:        ${(stats.cached / (stats.total || 1) * 100).toFixed(1)}%`);
  console.log(`\n—— 不优化(直接调用上游) ——`);
  console.log(`预计总 Token:      ${(totalTokens + savedTokens).toLocaleString()}`);
  console.log(`预计总成本:        $${(totalCost + savedCost).toFixed(4)}`);
  console.log(`\n—— 走 Nexus 网关 ——`);
  console.log(`实际处理 Token:    ${totalTokens.toLocaleString()}`);
  console.log(`节省 Token:        ${savedTokens.toLocaleString()}`);
  console.log(`实际成本:          $${totalCost.toFixed(4)}`);
  console.log(`节省成本:          $${savedCost.toFixed(4)}`);
  console.log(`\n—— 节省效果 ——`);
  console.log(`TRR (Token 节省率): ${(trr * 100).toFixed(1)}%`);
  console.log(`CSR (成本节省率):  ${(csr * 100).toFixed(1)}%`);
  console.log(`耗时:              ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  console.log(`\n说明: 直接调用按 deepseek/gemini 价格表估算;缓存命中计为"本应产生的成本"。`);
}

run().catch((e) => { console.error("测试失败:", e.message); process.exit(1); });
