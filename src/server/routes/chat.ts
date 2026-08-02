/**
 * Nexus LLM Gateway - Chat Completions 路由
 * OpenAI 兼容：POST /v1/chat/completions
 * 使用 MiddlewarePipeline 实现可插拔的处理链。
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { createDefaultPipeline, type PipelineContext } from "../middleware/pipeline.js";
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

/** 缓存结果转 SSE */
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
  const req = {
    ...raw,
    messages: raw.messages.map((m) => ({ ...m, content: normalizeContent(m.content) })),
  };

  const ctx: PipelineContext = {
    c,
    model: req.model,
    request: req,
    requestId: c.get("requestId"),
    tenant: c.get("tenant"),
    apiKey: c.get("apiKey"),
    isMaster: c.get("isMaster"),
    stream: req.stream ?? false,
    startTime: Date.now(),
    meta: {},
  };

  // 执行管道
  const pipeline = createDefaultPipeline();
  const result = await pipeline.execute(ctx);

  // 管道中断（缓存命中/限流/错误）
  if (result?.break) {
    if (ctx.cacheResult) {
      // 缓存命中
      if (ctx.stream) return cacheToSSE(c, ctx.cacheResult);
      return c.json(ctx.cacheResult);
    }
    // 错误响应
    return c.json({ error: result.error }, (result.status ?? 500) as ContentfulStatusCode);
  }

  // 管道完成，Provider 成功响应
  const response = ctx.meta.providerResponse;
  if (response) {
    if (ctx.stream) {
      return handleStream(c, ctx);
    }
    return c.json(response);
  }

  return c.json({ error: { message: "no response from pipeline", type: "internal_error" } }, 500);
});

/** 流式处理 */
async function handleStream(
  c: Context<ChatEnv>,
  ctx: PipelineContext,
) {
  const chain = ctx.chain;
  if (!chain) {
    return c.json({ error: { message: "no providers available", type: "upstream_error" } }, 502);
  }

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

      const send = async (chunk: any) => {
        if (chunk.usage) totalUsage = chunk.usage;
        const delta = chunk.choices?.[0]?.delta?.content || "";
        collectedContent += delta;
        await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
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

          const latencyMs = Date.now() - ctx.startTime;
          const { recordUsage } = await import("../billing/usage.js");
          recordUsage({
            requestId: ctx.requestId,
            tenantId: ctx.tenant?.id ?? null,
            apiKeyId: ctx.apiKey?.id ?? null,
            provider: node.providerType,
            model: ctx.model,
            upstreamModel: node.upstreamModel,
            usage: totalUsage,
            latencyMs,
            cached: false,
            stream: true,
            status: 200,
          });

          const { getSemanticCache } = await import("../cache/semantic-cache.js");
          const cache = getSemanticCache();
          const tenantId = ctx.tenant?.id ?? null;
          const fullResponse = {
            id: ctx.requestId,
            object: "chat.completion" as const,
            created: Math.floor(Date.now() / 1000),
            model: ctx.model,
            choices: [{ index: 0, message: { role: "assistant" as const, content: collectedContent }, finish_reason: "stop" }],
            usage: totalUsage,
            nexus: { provider: node.providerType, upstreamModel: node.upstreamModel },
          };
          await cache.store(ctx.request, ctx.model, node.providerType, fullResponse, tenantId).catch(() => {});
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
    }
  }
  return c.json({ error: { message: "all stream providers failed", type: "upstream_error" } }, 502);
}
