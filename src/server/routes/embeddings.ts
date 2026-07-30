/**
 * Nexus LLM Gateway - Embeddings 路由
 * OpenAI 兼容：POST /v1/embeddings
 */
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getRegistry } from "../providers/registry.js";
import { ProviderError } from "../../shared/types.js";
import type { AuthEnv } from "../middleware/auth.js";
import type { LoggingEnv } from "../middleware/logging.js";

const embedSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.string())]),
});

type EmbedEnv = AuthEnv & LoggingEnv;

export const embeddingsRoute = new Hono<EmbedEnv>();

embeddingsRoute.post("/", zValidator("json", embedSchema), async (c) => {
  const req = c.req.valid("json");
  const requestId = c.get("requestId");
  const registry = getRegistry();

  let resolved;
  try {
    resolved = registry.resolveEmbedding(req.model);
  } catch (e) {
    const status: ContentfulStatusCode = e instanceof ProviderError ? (e.status as ContentfulStatusCode) : 500;
    return c.json({ error: { message: (e as Error).message, type: "model_error" } }, status);
  }

  try {
    const res = await resolved.provider.embed(req, resolved.upstreamModel);
    res.nexus.requestId = requestId;
    return c.json(res);
  } catch (e) {
    const status: ContentfulStatusCode = e instanceof ProviderError ? (e.status as ContentfulStatusCode) : 502;
    return c.json(
      { error: { message: `embedding failed: ${(e as Error).message}`, type: "upstream_error" } },
      status,
    );
  }
});