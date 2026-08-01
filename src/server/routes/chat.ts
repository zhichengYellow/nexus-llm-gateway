/**
 * Nexus LLM Gateway - Chat Completions 路由
 * OpenAI 兼容：POST /v1/chat/completions
 * 含模型路由、故障转移、流式/非流式、用量记录。
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getRegistry } from "../providers/registry.js";
import { getSemanticCache } from "../cache/semantic-cache.js";
import { checkRateLimit, checkQuota } from "../quota/rate-limiter.js";
import { recordUsage } from "../billing/usage.js";
import { ProviderError } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";
import type { AuthEnv } from "../middleware/auth.js";
import type { LoggingEnv } from "../middleware/logging.js";

const chatSchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.union([z.string(), z.array(z.any())]),
      name: z.string().optional(),
      tool_call_id: z.string().optional(),
    }),
  ),
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
  if (Array.isArray(content)) {
    return content.map((part: any) => (typeof part.text === "string" ? part.text : JSON.stringify(part))).join("\n");
  }
  return String(content ?? "");
}

async function cacheToSSE(c: Context<ChatEnv>, response: any, _requestId: string) {
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
      const sse = {
        id: response.id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: response.model,
        choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
      };
      await writer.write(encoder.encode(`data: ${JSON.stringify(sse)}\n\n`));
    }
    const final = {
      id: response.id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: response.usage,
    };
    await writer.write(encoder.encode(`data: ${JSON.stringify(final)}\n\n`));
    await writer.write(encoder.encode("data: [DONE]\n\n"));
    await writer.close();
  })();

  return c.body(readable);
}

chatRoute.post("/", zValidator("json", chatSchema), async (c) => {
  const raw = c.req.valid("json") as z.infer<typeof chatSchema> & { [k: string]: unknown };
  const req = { ...raw, messages: raw.messages.map((m) => ({ ...m, content: normalizeContent(m.content) })) };
  const requestId = c.get("requestId");
  const tenant = c.get("tenant");
  const apiKey = c.get("apiKey");
  const registry = getRegistry();

  let resolved;
  try {
    resolved = registry.resolve(req.model);
  } catch (e) {
    const status: ContentfulStatusCode = e instanceof ProviderError ? (e.status as ContentfulStatusCode) : 500;
    return c.json({ error: { message: (e as Error).message, type: "model_error" } }, status);
  }

  const stream = req.stream ?? false;
  const start = Date.now();

  if (!c.get("isMaster") && apiKey) {
    const rl = await checkRateLimit(apiKey.id, 60);
    c.header("X-RateLimit-Remaining", String(rl.remaining));
    if (!rl.allowed) {
      return c.json({ error: { message: `rate limit exceeded, retry in ${rl.resetIn}s`, type: "rate_limit_error" } }, 429);
    }
  }

  if (!c.get("isMaster") && tenant) {
    const quota = await checkQuota(tenant.id);
    if (!quota.allowed) {
      return c.json({ error: { message: `monthly token quota exceeded (${quota.used}/${quota.quota})`, type: "quota_error" } }, 429);
    }
  }

  const chain = [
    { provider: resolved.provider, providerType: resolved.providerType, upstreamModel: resolved.upstreamModel },
    ...resolved.fallbacks.map((f) => ({
      provider: registry.getProvider(f.providerType),
      providerType: f.providerType,
      upstreamModel: f.upstreamModel,
    })),
  ];

  // Cache lookup before stream split（支持 x-nexus-no-cache 请求头强制跳过缓存，防止缓存毒化持续命中）
  const bypassCache = c.req.header("x-nexus-no-cache") === "1" || c.req.header("x-nexus-no-cache") === "true";
  const cache = getSemanticCache();
  const tenantId = tenant?.id ?? null;
  const cacheResult = bypassCache ? { hit: false } : await cache.lookup(req, req.model, tenantId);
  if (cacheResult.hit && cacheResult.response) {
    const latencyMs = Date.now() - start;
    const res = cacheResult.response;
    res.nexus.requestId = requestId;
    // 缓存命中：没调外部 API，token 记为 0，节省指标在看板单独算
    recordUsage({ requestId, tenantId, apiKeyId: apiKey?.id ?? null, provider: "cache", model: req.model, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, latencyMs, cached: true, stream: false, status: 200 });
    logger.info({ requestId, model: req.model, latencyMs }, "served from cache");
    if (stream) return cacheToSSE(c, res, requestId);
    return c.json(res);
  }

  // Always use non-stream handler (writes cache, returns JSON or SSE)
  if (stream) {
    return handleStream(c, req, chain, { requestId, tenant, apiKey, start });
  }
  return handleNonStream(c, req, chain, { requestId, tenant, apiKey, start });
});

interface Ctx {
  requestId: string;
  tenant: { id: string; name: string; monthlyTokenQuota: number | null } | null;
  apiKey: { id: string; tenantId: string; name: string; keyPrefix: string } | null;
  start: number;
}

async function handleNonStream(
  c: Context<ChatEnv>,
  req: z.infer<typeof chatSchema> & { [k: string]: unknown },
  chain: Array<{ provider: any; providerType: string; upstreamModel: string }>,
  ctx: Ctx,
) {
  const cache = getSemanticCache();
  const tenantId = ctx.tenant?.id ?? null;
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if (!node?.provider) continue;
    try {
      const res = await node.provider.chat(req, node.upstreamModel);
      const latencyMs = Date.now() - ctx.start;
      res.nexus.requestId = ctx.requestId;
      recordUsage({ requestId: ctx.requestId, tenantId, apiKeyId: ctx.apiKey?.id ?? null, provider: node.providerType, model: req.model, upstreamModel: node.upstreamModel, usage: res.usage, latencyMs, cached: false, stream: false, status: 200 });
      await cache.store(req, req.model, res, tenantId).catch(() => undefined);
      return c.json(res);
    } catch (e) {
      lastErr = e;
      logger.warn({ err: (e as Error).message, provider: node.providerType, model: node.upstreamModel, attempt: i + 1 }, "provider failed, trying fallback");
    }
  }
  const status: ContentfulStatusCode = lastErr instanceof ProviderError ? (lastErr.status as ContentfulStatusCode) : 502;
  return c.json({ error: { message: `all providers failed: ${(lastErr as Error)?.message ?? "unknown"}`, type: "upstream_error" } }, status);
}

async function handleStream(
  c: Context<ChatEnv>,
  req: z.infer<typeof chatSchema> & { [k: string]: unknown },
  chain: Array<{ provider: any; providerType: string; upstreamModel: string }>,
  ctx: Ctx,
) {
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if (!node?.provider) continue;
    try {
      const iterable = node.provider.chatStream(req, node.upstreamModel);
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
      let firstSent = false;
      let collectedContent = "";

      const send = async (chunk: any) => {
        if (chunk.usage) totalUsage = chunk.usage;
        const delta = chunk.choices?.[0]?.delta?.content || "";
        collectedContent += delta;
        if (!firstSent) {
          await writer.write(encoder.encode(`data: ${JSON.stringify(first.value)}\n\n`));
          firstSent = true;
          if (!first.done) {
            await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
        } else {
          await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
      };

      (async () => {
        try {
          if (!first.done) await send(first.value);
          while (true) {
            const { done, value } = await iter.next();
            if (done) break;
            await send(value);
          }
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          const latencyMs = Date.now() - ctx.start;
          recordUsage({ requestId: ctx.requestId, tenantId: ctx.tenant?.id ?? null, apiKeyId: ctx.apiKey?.id ?? null, provider: node.providerType, model: req.model, upstreamModel: node.upstreamModel, usage: totalUsage, latencyMs, cached: false, stream: true, status: 200 });

          // Write cache
          const cache = getSemanticCache();
          const tenantId = ctx.tenant?.id ?? null;
          const fullResponse = {
            id: ctx.requestId,
            object: "chat.completion" as const,
            created: Math.floor(Date.now() / 1000),
            model: req.model,
            choices: [{ index: 0, message: { role: "assistant" as const, content: collectedContent }, finish_reason: "stop" }],
            usage: totalUsage,
            nexus: { provider: node.providerType, upstreamModel: node.upstreamModel },
          };
          await cache.store(req, req.model, fullResponse, tenantId).catch(() => {});
        } catch (e) {
          logger.error({ err: (e as Error).message, requestId: ctx.requestId }, "stream error");
        } finally {
          await writer.close();
        }
      })();
      return c.body(readable);
    } catch (e) {
      logger.warn({ err: (e as Error).message, provider: node.providerType, model: node.upstreamModel, attempt: i + 1 }, "stream provider failed, trying fallback");
      lastStreamErr = e;
    }
  }
  const status: ContentfulStatusCode = lastStreamErr instanceof ProviderError ? (lastStreamErr.status as ContentfulStatusCode) : 502;
  return c.json({ error: { message: `all stream providers failed: ${(lastStreamErr as Error)?.message ?? "unknown"}`, type: "upstream_error" } }, status);
}

let lastStreamErr: unknown;
