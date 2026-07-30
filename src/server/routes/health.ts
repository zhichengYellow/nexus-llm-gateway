/**
 * Nexus LLM Gateway - 健康检查路由
 */
import { Hono } from "hono";
import { dbHealthCheck } from "../db/client.js";
import { redisHealthCheck } from "../db/redis.js";

export const healthRoute = new Hono();

healthRoute.get("/", async (c) => {
  const [db, redis] = await Promise.all([dbHealthCheck(), redisHealthCheck()]);
  const ok = db && redis;
  return c.json({ status: ok ? "ok" : "degraded", db, redis }, ok ? 200 : 503);
});

healthRoute.get("/live", (c) => c.json({ status: "alive" }));