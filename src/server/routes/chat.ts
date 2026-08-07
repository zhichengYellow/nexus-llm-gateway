/**
 * Nexus LLM Gateway - Chat Completions 路由 v2.0
 * OpenAI 兼容：POST /v1/chat/completions
 * 集成：压缩 → 缓存门控 → 智能路由 → 成本控制 → 质量评估
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { createDefaultPipeline, type PipelineContext } from "../middleware/pipeline.js";
import { getRegistry } from "../../providers/registry.js";
import type { ProviderType } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";
import { getPromptRouter } from "../../optimizer/prompt/router.js";
import { getPromptCompressor } from "../../optimizer/prompt/compression.js";
import { getConversationCompressor } from "../../optimizer/prompt/conversation-compressor.js";
import { getAdaptiveContext } from "../../optimizer/prompt/adaptive-context.js";
import { getCacheGate } from "../../optimizer/cache/cache-gate.js";
import { getCacheAutoRefresh } from "../../optimizer/cache/cache-auto-refresh.js";
import { getSmartRoutingEngine } from "../../optimizer/routing/smart-routing.js";
import { scoreDifficulty, pickStrongModel, pickCheapModel } from "../../optimizer/routing/difficulty.js";
import { getBudgetController } from "../../optimizer/cost/cost-controller.js";
import { getCostOptimizer } from "../../extensions/prompt/cost-optimizer.js";
import { getRequestJudge } from "../../optimizer/judge/request-judge.js";
import { getQualityEvaluator } from "../../extensions/judge/quality-evaluator.js";
import { getE2ECollector } from "../../analytics/e2e-metrics.js";
import type { AuthEnv } from "../middleware/auth.js";
import type { LoggingEnv } from "../middleware/logging.js";
import type { ChatCompletionRequest } from "../../shared/types.js";

const chatSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.union([z.string(), z.array(z.any())]),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
  })),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  user: z.string().optional(),
});

type ChatEnv = AuthEnv & LoggingEnv;
export const chatRoute = new Hono<ChatEnv>();

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p: any) => (typeof p.text === "string" ? p.text : JSON.stringify(p))).join("\n");
  return String(content ?? "");
}

/** 粗略估算 tokens（中英文混合，~3.5 chars/token） */
function estimateTokens(text: string): number {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return Math.max(1, Math.ceil(cleaned.length / 3.5));
}

function cacheToSSE(c: Context<ChatEnv>, response: any) {
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const content = response.choices?.[0]?.message?.content ?? "";
  (async () => {
    const chunks = content.match(/.{1,20}/g) || [content];
    for (const chunk of chunks) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ id: response.id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: response.model, choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] })}\n\n`));
    }
    await writer.write(encoder.encode(`data: ${JSON.stringify({ id: response.id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: response.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: response.usage })}\n\n`));
    await writer.write(encoder.encode("data: [DONE]\n\n"));
    await writer.close();
  })();
  return c.body(readable);
}

chatRoute.post("/", zValidator("json", chatSchema), async (c) => {
  const raw = c.req.valid("json") as z.infer<typeof chatSchema> & { [k: string]: unknown };
  const bypassOptimize = c.req.header("x-nexus-no-optimize") === "1";
  const requestId = c.get("requestId");
  const tenant = c.get("tenant");
  const apiKey = c.get("apiKey");

  // ===== C1.6: 门控逃生开关 =====
  if (bypassOptimize) {
    logger.info({ requestId }, "optimization bypassed via x-nexus-no-optimize header");
  }

  // ===== R4.2: E2E 测量 — 记录原始输入 tokens =====
  const originalPrompt = raw.messages.map((m: any) => normalizeContent(m.content)).join("\n");
  const entryTokens = estimateTokens(originalPrompt);
  const e2e = bypassOptimize ? null : getE2ECollector();

  // ===== C1.1: Prompt Compression + Conversation Compression + Adaptive Context =====
  let messages = raw.messages.map((m) => ({ ...m, content: normalizeContent(m.content) }));
  let savedTokens = 0;

  if (!bypassOptimize) {
    // Adaptive Context: 动态截断历史
    const adaptiveCtx = getAdaptiveContext();
    const ctxResult = adaptiveCtx.analyze(messages as any);
    messages = ctxResult.filteredMessages as any;
    logger.debug({ requestId, type: ctxResult.type, kept: messages.length }, "adaptive context applied");

    // Prompt Compression: 礼貌语删除
    const compressor = getPromptCompressor();
    const userMsg = messages.filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n");
    const compResult = compressor.compress(userMsg);
    savedTokens += compResult.originalTokens - compResult.compressedTokens;
    if (compResult.steps.length > 0) {
      logger.debug({ requestId, saved: compResult.originalTokens - compResult.compressedTokens }, "prompt compressed");
    }

    // Conversation Compression: 历史摘要
    if (messages.length > 4) {
      const convCompressor = getConversationCompressor();
      const hybrid = convCompressor.hybridCompress(messages as any, 2);
      if (hybrid.system) {
        messages = [{ role: "system", content: hybrid.system }, ...hybrid.messages] as any;
      }
    }
  }

  const req = { ...raw, messages } as ChatCompletionRequest & { [k: string]: unknown };

  // ===== model=auto 智能路由 =====
  let model = req.model;
  let cacheProvider = "unknown";
  let intentResult = null;
  if (model === "auto" && !bypassOptimize) {
    const smartRouting = getSmartRoutingEngine();
    const userPrompt = (messages as any[]).filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n");
    const promptRouter = getPromptRouter();
    intentResult = promptRouter.classify(userPrompt);
    const available = new Set<ProviderType>(getRegistry().registeredProviders());
    const decision = smartRouting.decide(intentResult.category, undefined, available);
    model = decision.model ?? intentResult.model ?? intentResult.provider;
    cacheProvider = decision.provider;

    // A+B: 难度感知 + 档位覆盖(x-nexus-model-tier: cheap | balanced | strong)
    const tier = (c.req.header("x-nexus-model-tier") ?? "").toLowerCase();
    const diff = scoreDifficulty(userPrompt);
    if (tier === "strong" || (diff.level === "hard" && tier !== "cheap")) {
      const strongModel = pickStrongModel(decision.provider);
      if (strongModel && strongModel !== model) {
        logger.info({ requestId, difficulty: diff.level, score: diff.score, signals: diff.signals, from: model, to: strongModel }, "upgraded to strong model");
        model = strongModel;
      }
    } else if (tier === "cheap") {
      const cheapModel = pickCheapModel(decision.provider);
      if (cheapModel && cheapModel !== model) {
        logger.info({ requestId, from: model, to: cheapModel }, "downgraded to cheap model (tier=cheap)");
        model = cheapModel;
      }
    }

    logger.info({ requestId, intent: intentResult.category, provider: decision.provider, model, degraded: decision.degraded, difficulty: diff.level }, "smart-routed");
  } else if (model === "auto") {
    const userPrompt = (messages as any[]).filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n");
    const router = getPromptRouter();
    intentResult = router.classify(userPrompt);
    model = intentResult.model ?? intentResult.provider;
  } else {
    // 显式模型：反查 provider（与 pipeline store 的 providerType 对齐）
    try {
      cacheProvider = getRegistry().resolve(model).providerType;
    } catch { /* 无效模型会走 404,缓存键用 unknown 兜底 */ }
  }

  // ===== C1.4: 成本控制接入 =====
  if (!c.get("isMaster") && tenant && !bypassOptimize) {
    const budgetCtrl = getBudgetController();
    const costOptimizer = getCostOptimizer();
    const userPrompt = (messages as any[]).filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n");
    const estimatedCost = costOptimizer.estimateCost(userPrompt, model as any, model);
    const budgetResult = budgetCtrl.recordSpending(tenant.id, estimatedCost);
    if (!budgetResult.allowed) {
      return c.json({ error: { message: budgetResult.reason, type: "budget_error" } }, 402);
    }
  }

  const ctx: PipelineContext = {
    c, model, request: req, requestId,
    tenant, apiKey,
    isMaster: c.get("isMaster"),
    stream: req.stream ?? false,
    startTime: Date.now(),
    meta: { intentResult, savedTokens },
  };

  // ===== C1.2: 缓存门控接入 =====
  if (!bypassOptimize && !c.req.header("x-nexus-no-cache")) {
    const cacheGate = getCacheGate();
    const gateResult = await cacheGate.evaluate(req as ChatCompletionRequest, model, cacheProvider);
    if (gateResult.hit && gateResult.response) {
      const latencyMs = Date.now() - ctx.startTime;
      const autoRefresh = getCacheAutoRefresh();
      autoRefresh.recordHit((messages as any[]).filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n"), latencyMs);

      if (gateResult.asyncRefresh) {
        logger.info({ requestId, confidence: gateResult.confidence }, "cache hit with async refresh scheduled");
      } else {
        logger.info({ requestId, confidence: gateResult.confidence }, "cache hit");
      }

      gateResult.response.nexus.requestId = requestId;
      gateResult.response.nexus.cached = true;

      // 修复计价虚高：缓存命中时异步记录 savedTokens 与虚拟成本
      const cachedUsage = (gateResult.response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }) as any;
      const cachedTokenCount = (cachedUsage.total_tokens ?? cachedUsage.prompt_tokens ?? 0) + (cachedUsage.completion_tokens ?? 0);
      if (cachedTokenCount > 0) {
        const { recordUsage } = await import("../billing/usage.js");
        recordUsage({
          requestId, tenantId: tenant?.id ?? null, apiKeyId: apiKey?.id ?? null,
          provider: cacheProvider, model, usage: cachedUsage,
          latencyMs: Date.now() - ctx.startTime, cached: true, stream: false, status: 200,
          savedTokens: cachedTokenCount,
        });
      }

      if (ctx.stream) return cacheToSSE(c, gateResult.response);
      return c.json(gateResult.response);
    }
  }

  // 执行管道
  const pipeline = createDefaultPipeline();
  const result = await pipeline.execute(ctx);

  if (result?.break) {
    if (ctx.cacheResult) {
      if (ctx.stream) return cacheToSSE(c, ctx.cacheResult);
      return c.json(ctx.cacheResult);
    }
    return c.json({ error: result.error }, (result.status ?? 500) as ContentfulStatusCode);
  }

  const response = ctx.meta.providerResponse as any;
  if (response) {
    // ===== C1.5: 质量评估接入 =====
    let qualityScore = 0.95; // 默认
    if (!bypassOptimize && !c.get("isMaster")) {
      const provider = response.nexus?.provider ?? "unknown";
      const modelName = response.model ?? model;
      const prompt = (messages as any[]).filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n");
      const content = response.choices?.[0]?.message?.content ?? "";
      const latency = Date.now() - ctx.startTime;
      try {
        const judgeResult = getRequestJudge().evaluate(requestId, provider as any, modelName, prompt, content, latency);
        qualityScore = judgeResult.score;
        // 额外调用 quality-evaluator 做语义保持验证
        const qualityEval = getQualityEvaluator();
        const semanticResult = qualityEval.evaluateSemanticPreservation(prompt, content);
        if (!semanticResult.preserved) {
          logger.warn({ requestId, semanticScore: semanticResult.score }, "semantic preservation low");
        }
      } catch { /* non-critical */ }
    }

    // ===== R4.2: E2E 测量 — 记录全链路指标 =====
    if (e2e) {
      const optimizedPrompt = (messages as any[]).filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n");
      const optimizedTokens = estimateTokens(optimizedPrompt);
      const outputContent = response.choices?.[0]?.message?.content ?? "";
      const outputTokens = estimateTokens(outputContent);
      const costMicro = (response.usage?.total_tokens ?? 0) * 0.02; // 估算成本
      const savedTokenCount = Math.max(0, entryTokens - optimizedTokens);
      e2e.record({
        requestId,
        timestamp: Date.now(),
        entryTokens,
        optimizedTokens,
        outputTokens,
        totalCostMicro: costMicro,
        savedCostMicro: entryTokens > 0 ? Math.round(costMicro * (savedTokenCount / entryTokens)) : 0,
        qualityScore,
        latencyMs: Date.now() - ctx.startTime,
        savingsBreakdown: {
          compression: Math.round(savedTokenCount * 0.4),
          cache: Math.round(savedTokenCount * 0.4),
          routing: Math.round(savedTokenCount * 0.2),
        },
      });
    }

    if (ctx.stream) return handleStream(c, ctx);
    return c.json(response);
  }

  return c.json({ error: { message: "no response from pipeline", type: "internal_error" } }, 500);
});

async function handleStream(c: Context<ChatEnv>, ctx: PipelineContext) {
  const chain = ctx.chain;
  if (!chain) return c.json({ error: { message: "no providers", type: "upstream_error" } }, 502);

  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if (!node?.provider) continue;
    try {
      const iterable = node.provider.chatStream(ctx.request, node.upstreamModel);
      const iter = iterable[Symbol.asyncIterator]();
      const first = await iter.next();
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      c.header("X-Accel-Buffering", "no");
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      let collectedContent = "";
      const send = async (chunk: any) => { if (chunk.usage) totalUsage = chunk.usage; collectedContent += chunk.choices?.[0]?.delta?.content || ""; await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)); };
      (async () => {
        try {
          if (!first.done) await send(first.value);
          while (true) { const { done, value } = await iter.next(); if (done) break; await send(value); }
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          const latencyMs = Date.now() - ctx.startTime;
          const { recordUsage } = await import("../billing/usage.js");
          recordUsage({ requestId: ctx.requestId, tenantId: ctx.tenant?.id ?? null, apiKeyId: ctx.apiKey?.id ?? null, provider: node.providerType, model: ctx.model, upstreamModel: node.upstreamModel, usage: totalUsage, latencyMs, cached: false, stream: true, status: 200 });
          const { getSemanticCache } = await import("../../optimizer/cache/semantic-cache.js");
          await getSemanticCache().store(ctx.request, ctx.model, node.providerType, { id: ctx.requestId, object: "chat.completion" as const, created: Math.floor(Date.now() / 1000), model: ctx.model, choices: [{ index: 0, message: { role: "assistant" as const, content: collectedContent }, finish_reason: "stop" }], usage: totalUsage, nexus: { provider: node.providerType, upstreamModel: node.upstreamModel } }, ctx.tenant?.id ?? null).catch(() => {});
        } catch (e) { logger.error({ err: (e as Error).message, requestId: ctx.requestId }, "stream error"); } finally { await writer.close(); }
      })();
      return c.body(readable);
    } catch (e) { logger.warn({ err: (e as Error).message, provider: node.providerType, attempt: i + 1 }, "stream failed"); }
  }
  return c.json({ error: { message: "all stream providers failed", type: "upstream_error" } }, 502);
}
