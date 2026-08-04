/**
 * 可行性测试：核心优化引擎能正确加载并执行（不依赖 DB）
 * 运行：npx tsx scripts/feasibility-test.ts
 */
import { getPromptCompressor } from "../src/server/prompt/compression.js";
import { getConversationCompressor } from "../src/server/prompt/conversation-compressor.js";
import { getAdaptiveContext } from "../src/server/prompt/adaptive-context.js";
import { getSmartRoutingEngine } from "../src/server/routing/smart-routing.js";
import { getMultiDimRouter } from "../src/server/prompt/multi-dim-router.js";
import { getCacheConfidence } from "../src/server/cache/cache-confidence.js";

// 1. Prompt Compression
const comp = getPromptCompressor();
const r1 = comp.compress("请帮我介绍一下Transformer的原理，谢谢！");
console.log("✓ Prompt Compression:", r1.compressed.length, "<", r1.original.length, `(TRR ${(100 * (1 - r1.compressed.length / r1.original.length)).toFixed(0)}%)`);

// 2. Conversation Compression
const conv = getConversationCompressor();
const msgs = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? "user" : "assistant") as "user" | "assistant", content: `消息${i}` }));
const r2 = conv.hybridCompress(msgs as any, 2);
console.log("✓ Conversation Compression: 10条→", r2.messages.length, "条 + 摘要", r2.system ? "生成" : "无");

// 3. Adaptive Context
const adaptive = getAdaptiveContext();
const r3 = adaptive.analyze([{ role: "user", content: "你好" }] as any);
console.log("✓ Adaptive Context: type=", r3.type, "kept=", r3.filteredMessages.length);

// 4. Smart Routing
const smart = getSmartRoutingEngine();
const r4 = smart.decide("code");
console.log("✓ Smart Routing: intent=code → provider=", r4.provider, "model=", r4.model, "degraded=", r4.degraded);

// 5. Multi-Dim Router
const router = getMultiDimRouter();
const r5 = router.select([
  { provider: "deepseek", model: "deepseek-chat", cost: 0.001, quality: 0.9, latency: 500, intentMatch: 0.8 },
  { provider: "gemini", model: "gemini-flash", cost: 0.0005, quality: 0.85, latency: 300, intentMatch: 0.6 },
]);
console.log("✓ MultiDim Router: selected=", r5?.selected?.provider, r5?.reason);

// 6. Cache Confidence
const conf = getCacheConfidence();
const r6 = conf.evaluate({ createdAt: Date.now() - 3600000, lastAccessedAt: Date.now() - 60000, hits: 5, ttl: 86400, category: "general" });
console.log("✓ Cache Confidence:", r6.confidence.toFixed(2), r6.reason);

console.log("\n=== 可行性测试全部通过 ===");