/**
 * Nexus LLM Gateway - Models 路由
 * OpenAI 兼容：GET /v1/models
 */
import { Hono } from "hono";
import { getRegistry } from "../../providers/registry.js";
import type { AuthEnv } from "../middleware/auth.js";
import type { LoggingEnv } from "../middleware/logging.js";

type ModelsEnv = AuthEnv & LoggingEnv;

export const modelsRoute = new Hono<ModelsEnv>();

modelsRoute.get("/", (c) => {
  const registry = getRegistry();
  const data = [...registry.listAllModels(), ...registry.listAllEmbeddingModels()];
  return c.json({ object: "list", data });
});