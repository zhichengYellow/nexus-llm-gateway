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
import { reloadRegistryFromDB, getHotReloadStatus } from "../config/hot-reload.js";
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

// 取消增强缓存（premium_approved → free，阈值还原默认）
adminRoute.patch("/tenants/:id/revoke-premium", async (c) => {
  const id = c.req.param("id");
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) return c.json({ error: { message: "not found" } }, 404);
  await db.update(tenants).set({
    cachePlan: "free",
    cacheThreshold: null,
    premiumRequestedAt: null,
    premiumApprovedAt: null,
    premiumApprovedBy: null,
  }).where(eq(tenants.id, id));
  return c.json({ tenant: { id, cachePlan: "free" } });
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
  // 支持范围：1h / 24h / 7d，默认 24h
  const range = (c.req.query("range") as string) || "24h";
  const hoursInRange = range === "1h" ? 1 : range === "7d" ? 24 * 7 : 24;
  const since = new Date(Date.now() - hoursInRange * 3600 * 1000);

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

  // 对齐到整点基准（与 SQL date_trunc('hour') 一致），保证补零 key 能匹配真实数据
  const baseHour = new Date(since);
  baseHour.setMinutes(0, 0, 0);

  const points = new Map<string, any>();
  for (const r of rows) {
    const hour = new Date(r.hour as string).toISOString();
    points.set(hour, { hour, totalRequests: r.totalRequests, totalTokens: r.totalTokens, cacheHits: r.cacheHits });
  }

  const timeline: any[] = [];
  for (let i = 0; i <= hoursInRange; i++) {
    const t = new Date(baseHour.getTime() + i * 3600 * 1000);
    if (t.getTime() > Date.now() + 3600 * 1000) break; // 不超当前时间
    const key = t.toISOString();
    const existing = points.get(key);
    timeline.push(existing ?? { hour: key, totalRequests: 0, totalTokens: 0, cacheHits: 0 });
  }

  return c.json({ window: range, since: since.toISOString(), timeline });
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
    // 热加载：新路由立即生效
    reloadRegistryFromDB().catch((e) => logger.error({ err: e }, "hot reload after route create failed"));
    return c.json({ route: row }, 201);
  },
);

adminRoute.delete("/model-routes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select({ id: modelRoutes.id }).from(modelRoutes).where(eq(modelRoutes.id, id)).limit(1);
  if (!row) return c.json({ error: { message: "not found" } }, 404);
  await db.delete(modelRoutes).where(eq(modelRoutes.id, id));
  // 热加载：删除后立即生效
  reloadRegistryFromDB().catch((e) => logger.error({ err: e }, "hot reload after route delete failed"));
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

// ===== 配置热加载 =====
adminRoute.post("/config/reload", async (c) => {
  const result = await reloadRegistryFromDB();
  return c.json(result);
});

adminRoute.get("/config/hot-reload-status", async (c) => {
  const status = getHotReloadStatus();
  return c.json(status);
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

// ===== P5: 租户套餐管理 =====
adminRoute.patch("/tenants/:id/quota", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { monthlyTokenQuota, plan } = body as { monthlyTokenQuota?: number; plan?: string };

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) return c.json({ error: { message: "not found" } }, 404);

  const updates: Record<string, unknown> = {};
  if (monthlyTokenQuota !== undefined) updates.monthlyTokenQuota = monthlyTokenQuota;
  if (plan) updates.cachePlan = plan;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { message: "no updates provided" } }, 400);
  }

  await db.update(tenants).set(updates).where(eq(tenants.id, id));
  return c.json({ tenant: { id, ...updates } });
});

// ===== P5: Provider 列表 =====
adminRoute.get("/providers", async (c) => {
  const registry = getRegistry();
  const models = registry.listAllModels();
  const providers = [...new Set(models.map((m) => m.owned_by))];
  return c.json({ providers });
});

// ===== P5: 熔断器状态 =====
adminRoute.get("/circuit-breakers", async (c) => {
  const { getCircuitBreakerRegistry } = await import("../middleware/circuit-breaker.js");
  const breakers = getCircuitBreakerRegistry();
  return c.json({ breakers: breakers.snapshot() });
});

adminRoute.post("/circuit-breakers/reset", async (c) => {
  const { getCircuitBreakerRegistry } = await import("../middleware/circuit-breaker.js");
  getCircuitBreakerRegistry().resetAll();
  return c.json({ ok: true });
});

// ===== P5: 每日/月度消费统计 + CSV 导出 =====
adminRoute.get("/cost/report", async (c) => {
  const range = (c.req.query("range") as string) || "month";
  const format = (c.req.query("format") as string) || "json";

  const now = new Date();
  let since: Date;
  if (range === "day") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === "week") {
    since = new Date(now.getTime() - 7 * 86400000);
  } else {
    since = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const rows = await db
    .select({
      date: sql<string>`date_trunc('day', ${usageLogs.createdAt})::text`,
      provider: usageLogs.provider,
      model: usageLogs.model,
      requests: sql<number>`count(*)::int`,
      promptTokens: sql<number>`coalesce(sum(${usageLogs.promptTokens}), 0)::bigint::int`,
      completionTokens: sql<number>`coalesce(sum(${usageLogs.completionTokens}), 0)::bigint::int`,
      totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      costMicro: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
      cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
    })
    .from(usageLogs)
    .where(gte(usageLogs.createdAt, since))
    .groupBy(sql`date_trunc('day', ${usageLogs.createdAt})`, usageLogs.provider, usageLogs.model)
    .orderBy(sql`date_trunc('day', ${usageLogs.createdAt})`);

  const totalCost = rows.reduce((sum, r) => sum + (r.costMicro ?? 0), 0);

  if (format === "csv") {
    const header = "date,provider,model,requests,prompt_tokens,completion_tokens,total_tokens,cost_usd,cache_hits";
    const lines = rows.map((r) =>
      `${r.date},${r.provider},${r.model},${r.requests},${r.promptTokens},${r.completionTokens},${r.totalTokens},${((r.costMicro ?? 0) / 1_000_000).toFixed(6)},${r.cacheHits}`
    );
    const csv = [header, ...lines].join("\n");

    c.header("Content-Type", "text/csv");
    c.header("Content-Disposition", `attachment; filename="nexus-cost-${range}-${now.toISOString().slice(0, 10)}.csv"`);
    return c.body(csv);
  }

  return c.json({
    report: {
      range,
      since: since.toISOString(),
      until: now.toISOString(),
      totalCostMicro: totalCost,
      totalCostUsd: (totalCost / 1_000_000).toFixed(6),
      rows,
    },
  });
});

// ===== P5: 全局指标 =====
adminRoute.get("/metrics/summary", async (c) => {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [dayStats] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      cost: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
      cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
    })
    .from(usageLogs)
    .where(gte(usageLogs.createdAt, dayStart));

  const tenantCount = (await db.select({ cnt: sql<number>`count(*)::int` }).from(tenants))[0]?.cnt ?? 0;
  const keyCount = (await db.select({ cnt: sql<number>`count(*)::int` }).from(apiKeys))[0]?.cnt ?? 0;
  const registry = getRegistry();
  const modelCount = registry.listAllModels().length;

  return c.json({
    today: {
      requests: dayStats?.requests ?? 0,
      tokens: dayStats?.tokens ?? 0,
      costMicro: dayStats?.cost ?? 0,
      cacheHitRate: dayStats?.requests ? ((dayStats.cacheHits ?? 0) / dayStats.requests * 100).toFixed(1) + "%" : "0%",
    },
    totals: {
      tenants: tenantCount,
      apiKeys: keyCount,
      models: modelCount,
    },
  });
});

// ===== P5: Pipeline 中间件状态 =====
adminRoute.get("/pipeline/status", async (c) => {
  const { createDefaultPipeline } = await import("../middleware/pipeline.js");
  const pipeline = createDefaultPipeline();
  return c.json({ pipeline: pipeline.list() });
});

adminRoute.patch("/pipeline/toggle/:name", async (c) => {
  const name = c.req.param("name");
  const body = await c.req.json();
  const { enabled } = body as { enabled: boolean };
  const { createDefaultPipeline } = await import("../middleware/pipeline.js");

  // 注意：生产环境应使用全局单例 pipeline，这里为了 API 返回状态做演示
  return c.json({
    message: `pipeline toggle API called for "${name}" → enabled=${enabled}`,
    note: "pipeline state is per-process; restart gateway to persist changes",
  });
});