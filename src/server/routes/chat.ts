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
      content: z.string(),
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

chatRoute.post("/", zValidator("json", chatSchema), async (c) => {
  const req = c.req.valid("json") as z.infer<typeof chatSchema> & { [k: string]: unknown };
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

  // ===== 限流检查（非 master key）=====
  if (!c.get("isMaster") && apiKey) {
    const rl = await checkRateLimit(apiKey.id, 60);
    c.header("X-RateLimit-Remaining", String(rl.remaining));
    if (!rl.allowed) {
      return c.json(
        { error: { message: `rate limit exceeded, retry in ${rl.resetIn}s`, type: "rate_limit_error" } },
        429,
      );
    }
  }

  // ===== 配额检查（非 master key）=====
  if (!c.get("isMaster") && tenant) {
    const quota = await checkQuota(tenant.id);
    if (!quota.allowed) {
      return c.json(
        { error: { message: `monthly token quota exceeded (${quota.used}/${quota.quota})`, type: "quota_error" } },
        429,
      );
    }
  }

  // 故障转移：主 + fallbacks
  const chain = [
    { provider: resolved.provider, providerType: resolved.providerType, upstreamModel: resolved.upstreamModel },
    ...resolved.fallbacks.map((f) => ({
      provider: registry.getProvider(f.providerType),
      providerType: f.providerType,
      upstreamModel: f.upstreamModel,
    })),
  ];

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
  // ===== 语义缓存查询 =====
  const cache = getSemanticCache();
  const tenantId = ctx.tenant?.id ?? null;
  const cacheResult = await cache.lookup(req, req.model, tenantId);
  if (cacheResult.hit && cacheResult.response) {
    const latencyMs = Date.now() - ctx.start;
    const res = cacheResult.response;
    res.nexus.requestId = ctx.requestId;

    recordUsage({
      requestId: ctx.requestId,
      tenantId,
      apiKeyId: ctx.apiKey?.id ?? null,
      provider: "cache",
      model: req.model,
      usage: res.usage,
      latencyMs,
      cached: true,
      stream: false,
      status: 200,
    });

    logger.info({ requestId: ctx.requestId, model: req.model, latencyMs }, "served from cache");
    return c.json(res);
  }

  // ===== 未命中，调用 LLM =====
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if (!node?.provider) continue;
    try {
      const res = await node.provider.chat(req, node.upstreamModel);
      const latencyMs = Date.now() - ctx.start;
      res.nexus.requestId = ctx.requestId;

      recordUsage({
        requestId: ctx.requestId,
        tenantId,
        apiKeyId: ctx.apiKey?.id ?? null,
        provider: node.providerType,
        model: req.model,
        upstreamModel: node.upstreamModel,
        usage: res.usage,
        latencyMs,
        cached: false,
        stream: false,
        status: 200,
      });

      // 异步写入语义缓存
      cache.store(req, req.model, res, tenantId).catch(() => undefined);

      return c.json(res);
    } catch (e) {
      lastErr = e;
      logger.warn(
        { err: (e as Error).message, provider: node.providerType, model: node.upstreamModel, attempt: i + 1 },
        "provider failed, trying fallback",
      );
    }
  }
  const status: ContentfulStatusCode = lastErr instanceof ProviderError ? (lastErr.status as ContentfulStatusCode) : 502;
  return c.json(
    { error: { message: `all providers failed: ${(lastErr as Error)?.message ?? "unknown"}`, type: "upstream_error" } },
    status,
  );
}

async function handleStream(
  c: Context<ChatEnv>,
  req: z.infer<typeof chatSchema> & { [k: string]: unknown },
  chain: Array<{ provider: any; providerType: string; upstreamModel: string }>,
  ctx: Ctx,
) {
  // 流式故障转移：首个 provider 失败立即切下一个；一旦开始输出则不再转移
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if (!node?.provider) continue;
    try {
      const iterable = node.provider.chatStream(req, node.upstreamModel);
      // 试探第一个 chunk（建立连接）
      const iter = iterable[Symbol.asyncIterator]();
      const first = await iter.next();

      // 成功建立流，开始 SSE 输出
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      c.header("X-Accel-Buffering", "no");

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      let firstSent = false;

      const send = async (chunk: any) => {
        if (chunk.usage) totalUsage = chunk.usage;
        if (!firstSent) {
          // 先发第一个 chunk
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
          if (!first.done) {
            await send(first.value);
          }
          while (true) {
            const { done, value } = await iter.next();
            if (done) break;
            await send(value);
          }
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          const latencyMs = Date.now() - ctx.start;
          recordUsage({
            requestId: ctx.requestId,
            tenantId: ctx.tenant?.id ?? null,
            apiKeyId: ctx.apiKey?.id ?? null,
            provider: node.providerType,
            model: req.model,
            upstreamModel: node.upstreamModel,
            usage: totalUsage,
            latencyMs,
            cached: false,
            stream: true,
            status: 200,
          });
        } catch (e) {
          logger.error({ err: (e as Error).message, requestId: ctx.requestId }, "stream error");
        } finally {
          await writer.close();
        }
      })();

      return c.body(readable);
    } catch (e) {
      logger.warn(
        { err: (e as Error).message, provider: node.providerType, model: node.upstreamModel, attempt: i + 1 },
        "stream provider failed, trying fallback",
      );
      lastStreamErr = e;
    }
  }
  const status: ContentfulStatusCode = lastStreamErr instanceof ProviderError ? (lastStreamErr.status as ContentfulStatusCode) : 502;
  return c.json(
    { error: { message: `all stream providers failed: ${(lastStreamErr as Error)?.message ?? "unknown"}`, type: "upstream_error" } },
    status,
  );
}

let lastStreamErr: unknown;
