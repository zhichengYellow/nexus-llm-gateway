/**
 * Nexus LLM Gateway - 管理路由
 * 需要 master key。用于创建租户、API Key，查看用量等。
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, sql, and, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { apiKeys, tenants, usageLogs, modelRoutes } from "../db/schema.js";
import { hashKey } from "../middleware/auth.js";
import { getSemanticCache } from "../cache/semantic-cache.js";
import { getRegistry } from "../providers/registry.js";
import type { AuthEnv } from "../middleware/auth.js";
import type { LoggingEnv } from "../middleware/logging.js";

type AdminEnv = AuthEnv & LoggingEnv;

export const adminRoute = new Hono<AdminEnv>();

// 仅 master key 可访问
adminRoute.use("*", async (c, next) => {
  const isMaster = c.get("isMaster");
  if (!isMaster) {
    return c.json({ error: { message: "master key required", type: "auth_error" } }, 403);
  }
  await next();
});

// ===== 租户 =====
adminRoute.post(
  "/tenants",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1),
      monthlyTokenQuota: z.number().int().positive().optional(),
    }),
  ),
  async (c) => {
    const { name, monthlyTokenQuota } = c.req.valid("json");
    const [row] = await db.insert(tenants).values({ name, monthlyTokenQuota }).returning();
    if (!row) return c.json({ error: { message: "insert failed" } }, 500);
    return c.json({ tenant: { id: row.id, name: row.name, monthlyTokenQuota: row.monthlyTokenQuota } }, 201);
  },
);

adminRoute.get("/tenants", async (c) => {
  const rows = await db.select().from(tenants);
  return c.json({ tenants: rows });
});

// ===== Premium Cache 审批 =====
// 租户申请付费缓存
adminRoute.patch("/tenants/:id/request-premium", async (c) => {
  const id = c.req.param("id");
  const [tenant] = await db.select({ id: tenants.id, cachePlan: tenants.cachePlan }).from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) return c.json({ error: { message: "not found" } }, 404);
  if (tenant.cachePlan !== "free") {
    return c.json({ error: { message: "已有付费申请在审核中或已通过" } }, 400);
  }
  await db.update(tenants).set({ cachePlan: "premium_pending", premiumRequestedAt: new Date() }).where(eq(tenants.id, id));

  // Agent 自动审批：如果租户最近 7 天用量>1000 次请求，自动通过
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [stats] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(usageLogs)
    .where(and(eq(usageLogs.tenantId, id), gte(usageLogs.createdAt, since)));
  
  const autoApproved = (stats?.cnt ?? 0) >= 1000;
  if (autoApproved) {
    await db.update(tenants).set({
      cachePlan: "premium_approved",
      premiumApprovedBy: "agent",
      premiumApprovedAt: new Date(),
      cacheThreshold: 85, // 0.85
    }).where(eq(tenants.id, id));
    return c.json({ tenant: { id, cachePlan: "premium_approved", approvedBy: "agent", autoApproved: true, recentRequests: stats?.cnt ?? 0 } });
  }

  return c.json({ tenant: { id, cachePlan: "premium_pending", recentRequests: stats?.cnt ?? 0, autoApproved: false } });
});

// 管理员审批
adminRoute.patch("/tenants/:id/approve-premium", async (c) => {
  const id = c.req.param("id");
  const [tenant] = await db.select({ id: tenants.id, cachePlan: tenants.cachePlan }).from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) return c.json({ error: { message: "not found" } }, 404);
  await db.update(tenants).set({
    cachePlan: "premium_approved",
    premiumApprovedBy: "admin",
    premiumApprovedAt: new Date(),
    cacheThreshold: 85,
  }).where(eq(tenants.id, id));
  return c.json({ tenant: { id, cachePlan: "premium_approved", approvedBy: "admin" } });
});

// 管理员拒绝
adminRoute.patch("/tenants/:id/reject-premium", async (c) => {
  const id = c.req.param("id");
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) return c.json({ error: { message: "not found" } }, 404);
  await db.update(tenants).set({ cachePlan: "premium_rejected" }).where(eq(tenants.id, id));
  return c.json({ tenant: { id, cachePlan: "premium_rejected" } });
});

// ===== API Key =====
const createKeySchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1),
});

adminRoute.post("/api-keys", zValidator("json", createKeySchema), async (c) => {
  const { tenantId, name } = c.req.valid("json");
  // 校验租户存在
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) {
    return c.json({ error: { message: "tenant not found", type: "not_found" } }, 404);
  }

  const rawKey = `sk-nexus-${nanoid(32)}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  const [row] = await db.insert(apiKeys).values({ tenantId, name, keyHash, keyPrefix }).returning();
  if (!row) return c.json({ error: { message: "insert failed" } }, 500);

  // 仅此一次返回完整 key
  return c.json(
    {
      apiKey: {
        id: row.id,
        tenantId: row.tenantId,
        name: row.name,
        keyPrefix: row.keyPrefix,
        key: rawKey,
        enabled: row.enabled,
        createdAt: row.createdAt,
      },
    },
    201,
  );
});

adminRoute.get("/api-keys", async (c) => {
  const rows = await db
    .select({
      id: apiKeys.id,
      tenantId: apiKeys.tenantId,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      enabled: apiKeys.enabled,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys);
  return c.json({ apiKeys: rows });
});

adminRoute.delete("/api-keys/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  if (!row) return c.json({ error: { message: "not found" } }, 404);
  await db.delete(apiKeys).where(eq(apiKeys.id, id));
  return c.json({ ok: true });
});

adminRoute.patch("/api-keys/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const [current] = await db.select({ enabled: apiKeys.enabled }).from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  if (!current) return c.json({ error: { message: "not found" } }, 404);
  const [row] = await db.update(apiKeys).set({ enabled: !current.enabled }).where(eq(apiKeys.id, id)).returning();
  if (!row) return c.json({ error: { message: "update failed" } }, 500);
  return c.json({ apiKey: { id: row.id, enabled: row.enabled } });
});

// ===== 用量统计 =====
adminRoute.get("/usage/summary", async (c) => {
  // 最近 24h 聚合
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      provider: usageLogs.provider,
      model: usageLogs.model,
      totalRequests: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      promptTokens: sql<number>`coalesce(sum(${usageLogs.promptTokens}), 0)::bigint::int`,
      completionTokens: sql<number>`coalesce(sum(${usageLogs.completionTokens}), 0)::bigint::int`,
      cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
      avgLatencyMs: sql<number>`coalesce(avg(${usageLogs.latencyMs}), 0)::int`,
    })
    .from(usageLogs)
    .where(gte(usageLogs.createdAt, since))
    .groupBy(usageLogs.provider, usageLogs.model);

  return c.json({ window: "24h", since: since.toISOString(), summary: rows });
});

adminRoute.get("/usage/timeline", async (c) => {
  // 按小时聚合最近 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      hour: sql<string>`date_trunc('hour', ${usageLogs.createdAt})::text`,
      totalRequests: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
    })
    .from(usageLogs)
    .where(gte(usageLogs.createdAt, since))
    .groupBy(sql`date_trunc('hour', ${usageLogs.createdAt})`)
    .orderBy(sql`date_trunc('hour', ${usageLogs.createdAt})`);

  return c.json({ window: "24h", since: since.toISOString(), timeline: rows });
});

// ===== 模型路由管理 =====
adminRoute.get("/model-routes", async (c) => {
  const rows = await db.select().from(modelRoutes).orderBy(modelRoutes.alias);
  return c.json({ routes: rows });
});

adminRoute.post(
  "/model-routes",
  zValidator(
    "json",
    z.object({
      alias: z.string().min(1),
      provider: z.string().min(1),
      upstreamModel: z.string().min(1),
      priceInput: z.number().int().min(0).optional(),
      priceOutput: z.number().int().min(0).optional(),
    }),
  ),
  async (c) => {
    const { alias, provider, upstreamModel, priceInput, priceOutput } = c.req.valid("json");
    // 检查别名是否已存在
    const [existing] = await db.select({ id: modelRoutes.id }).from(modelRoutes).where(eq(modelRoutes.alias, alias)).limit(1);
    if (existing) {
      return c.json({ error: { message: "别名已存在" } }, 409);
    }
    const [row] = await db
      .insert(modelRoutes)
      .values({ alias, provider, upstreamModel, priceInput: priceInput ?? 0, priceOutput: priceOutput ?? 0 })
      .returning();
    if (!row) return c.json({ error: { message: "插入失败" } }, 500);
    return c.json({ route: row }, 201);
  },
);

adminRoute.delete("/model-routes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select({ id: modelRoutes.id }).from(modelRoutes).where(eq(modelRoutes.id, id)).limit(1);
  if (!row) return c.json({ error: { message: "not found" } }, 404);
  await db.delete(modelRoutes).where(eq(modelRoutes.id, id));
  return c.json({ ok: true });
});

// ===== Provider 测速 =====
adminRoute.post("/speed-test", async (c) => {
  const registry = getRegistry();
  const allModels = registry.listAllModels();
  const results: Array<{ model: string; status: "ok" | "error"; latencyMs: number; error?: string }> = [];

  for (const model of allModels) {
    const start = Date.now();
    try {
      const resolved = registry.resolve(model.id);
      // 发送一个最简单的请求测速
      await resolved.provider.chat(
        { model: model.id, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
        resolved.upstreamModel,
      );
      results.push({ model: model.id, status: "ok", latencyMs: Date.now() - start });
    } catch (e) {
      results.push({
        model: model.id,
        status: "error",
        latencyMs: Date.now() - start,
        error: (e as Error).message.slice(0, 100),
      });
    }
  }

  return c.json({ results });
});

// ===== 缓存统计 =====
adminRoute.get("/cache/stats", async (c) => {
  const cache = getSemanticCache();
  const stats = await cache.stats();
  return c.json({ cache: stats });
});

// ===== 租户用量（配额检查）=====
adminRoute.get("/tenants/:id/usage", async (c) => {
  const tenantId = c.req.param("id");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [row] = await db
    .select({
      monthTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      monthCost: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
      requestCount: sql<number>`count(*)::int`,
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.tenantId, tenantId), gte(usageLogs.createdAt, monthStart)));

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return c.json({ error: { message: "tenant not found" } }, 404);

  return c.json({
    tenant: { id: tenant.id, name: tenant.name, monthlyTokenQuota: tenant.monthlyTokenQuota },
    period: { start: monthStart.toISOString(), end: now.toISOString() },
    usage: {
      monthTokens: row?.monthTokens ?? 0,
      monthCostMicro: row?.monthCost ?? 0,
      requestCount: row?.requestCount ?? 0,
      quotaExceeded: tenant.monthlyTokenQuota !== null && (row?.monthTokens ?? 0) >= tenant.monthlyTokenQuota,
    },
  });
});