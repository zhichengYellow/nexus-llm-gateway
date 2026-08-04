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
import { logger } from "../../shared/logger.js";
import { getPromptRouter } from "../prompt/router.js";
import { getPromptCompressor } from "../prompt/compression.js";
import { getConversationCompressor } from "../prompt/conversation-compressor.js";
import { getAdaptiveContext } from "../prompt/adaptive-context.js";
import { getCacheGate } from "../cache/cache-gate.js";
import { getCacheAutoRefresh } from "../cache/cache-auto-refresh.js";
import { getSmartRoutingEngine } from "../routing/smart-routing.js";
import { getBudgetController } from "../cost/cost-controller.js";
import { getRequestJudge } from "../judge/request-judge.js";
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
  let intentResult = null;
  if (model === "auto" && !bypassOptimize) {
    const smartRouting = getSmartRoutingEngine();
    const userPrompt = (messages as any[]).filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n");
    const promptRouter = getPromptRouter();
    intentResult = promptRouter.classify(userPrompt);
    const decision = smartRouting.decide(intentResult.category);
    model = decision.model ?? intentResult.model ?? intentResult.provider;
    logger.info({ requestId, intent: intentResult.category, provider: decision.provider, model, degraded: decision.degraded }, "smart-routed");
  } else if (model === "auto") {
    const userPrompt = (messages as any[]).filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n");
    const router = getPromptRouter();
    intentResult = router.classify(userPrompt);
    model = intentResult.model ?? intentResult.provider;
  }

  // ===== C1.4: 成本控制接入 =====
  if (!c.get("isMaster") && tenant && !bypassOptimize) {
    const budgetCtrl = getBudgetController();
    const budgetResult = budgetCtrl.recordSpending(tenant.id, 0.001); // 预估
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
    const gateResult = await cacheGate.evaluate(req as ChatCompletionRequest, model, "auto");
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

  const response = ctx.meta.providerResponse;
  if (response) {
    // ===== C1.5: 质量评估接入 =====
    if (!bypassOptimize && !c.get("isMaster")) {
      const provider = response.nexus?.provider ?? "unknown";
      const modelName = response.model ?? model;
      const prompt = (messages as any[]).filter((m: any) => m.role === "user").map((m: any) => normalizeContent(m.content)).join("\n");
      const content = response.choices?.[0]?.message?.content ?? "";
      const latency = Date.now() - ctx.startTime;
      try {
        getRequestJudge().evaluate(requestId, provider as any, modelName, prompt, content, latency);
      } catch { /* non-critical */ }
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
          const { getSemanticCache } = await import("../cache/semantic-cache.js");
          await getSemanticCache().store(ctx.request, ctx.model, node.providerType, { id: ctx.requestId, object: "chat.completion" as const, created: Math.floor(Date.now() / 1000), model: ctx.model, choices: [{ index: 0, message: { role: "assistant" as const, content: collectedContent }, finish_reason: "stop" }], usage: totalUsage, nexus: { provider: node.providerType, upstreamModel: node.upstreamModel } }, ctx.tenant?.id ?? null).catch(() => {});
        } catch (e) { logger.error({ err: (e as Error).message, requestId: ctx.requestId }, "stream error"); } finally { await writer.close(); }
      })();
      return c.body(readable);
    } catch (e) { logger.warn({ err: (e as Error).message, provider: node.providerType, attempt: i + 1 }, "stream failed"); }
  }
  return c.json({ error: { message: "all stream providers failed", type: "upstream_error" } }, 502);
}
