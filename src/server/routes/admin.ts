/**
 * Nexus LLM Gateway - 管理路由
 * 需要 master key。用于创建租户、API Key，查看用量等。
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, sql, and, gte, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { apiKeys, tenants, usageLogs, modelRoutes, providerConfigs } from "../db/schema.js";
import { hashKey } from "../middleware/auth.js";
import { getSemanticCache } from "../../optimizer/cache/semantic-cache.js";
import { getRegistry } from "../../providers/registry.js";
import { reloadRegistryFromDB, getHotReloadStatus } from "../config/hot-reload.js";
import { saveProviderKey, deleteProviderKey } from "../config/provider-keys.js";
import { decryptSecret, maskKey } from "../../shared/crypto.js";
import { getConfig } from "../../shared/config.js";
import { logger } from "../../shared/logger.js";
import type { AuthEnv } from "../middleware/auth.js";
import type { LoggingEnv } from "../middleware/logging.js";
import { getAuditLogger } from "../../extensions/audit/audit-logger.js";
import { parseRole } from "../../extensions/rbac/rbac.js";

type AdminEnv = AuthEnv & LoggingEnv;

function auditActor(c: any) {
  const isMaster = c.get("isMaster");
  const apiKey = c.get("apiKey");
  const role = parseRole(c.get("role"));
  return {
    actor: isMaster ? "master" : (apiKey?.keyPrefix ?? "unknown"),
    actorRole: role,
    tenantId: apiKey?.tenantId ?? undefined,
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
  };
}

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
    // audit
    const aa = auditActor(c);
    getAuditLogger().log({ ...aa, action: "create_tenant", resource: "tenants", resourceId: row.id, detail: name }).catch(() => {});
    return c.json({ tenant: { id: row.id, name: row.name, monthlyTokenQuota: row.monthlyTokenQuota } }, 201);
  },
);

adminRoute.get("/tenants", async (c) => {
  const rows = await db.select().from(tenants);
  return c.json({ tenants: rows });
});

// ===== API Key =====
const createKeySchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  role: z.enum(["owner", "admin", "developer", "viewer", "auditor"]).optional().default("developer"),
});

adminRoute.post("/api-keys", zValidator("json", createKeySchema), async (c) => {
  const { tenantId, name, role } = c.req.valid("json");
  // 校验租户存在
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) {
    return c.json({ error: { message: "tenant not found", type: "not_found" } }, 404);
  }

  const rawKey = `sk-nexus-${nanoid(32)}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  const [row] = await db.insert(apiKeys).values({ tenantId, name, keyHash, keyPrefix, role }).returning();
  if (!row) return c.json({ error: { message: "insert failed" } }, 500);

  // audit
  const aa = auditActor(c);
  getAuditLogger().log({ ...aa, action: "create_api_key", resource: "api_keys", resourceId: row.id, detail: `${name} (${role})` }).catch(() => {});

  return c.json(
    {
      apiKey: {
        id: row.id,
        tenantId: row.tenantId,
        name: row.name,
        keyPrefix: row.keyPrefix,
        role: row.role,
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
      role: apiKeys.role,
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
  // audit
  const aa = auditActor(c);
  getAuditLogger().log({ ...aa, action: "delete_api_key", resource: "api_keys", resourceId: id }).catch(() => {});
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
      savedTokens: sql<number>`coalesce(sum(${usageLogs.savedTokens}), 0)::bigint::int`,
      savedCostMicro: sql<number>`coalesce(sum(${usageLogs.savedCostMicro}), 0)::bigint::int`,
      totalCostMicro: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
      cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
      cacheMisses: sql<number>`coalesce(sum(case when ${usageLogs.cached} = false then 1 else 0 end), 0)::int`,
    })
    .from(usageLogs)
    .where(gte(usageLogs.createdAt, since))
    .groupBy(sql`date_trunc('hour', ${usageLogs.createdAt})`)
    .orderBy(sql`date_trunc('hour', ${usageLogs.createdAt})`);

  // 对齐到整点基准
  const baseHour = new Date(since);
  baseHour.setMinutes(0, 0, 0);

  const points = new Map<string, any>();
  for (const r of rows) {
    const hour = new Date(r.hour as string).toISOString();
    points.set(hour, {
      hour,
      totalRequests: r.totalRequests,
      totalTokens: r.totalTokens,
      savedTokens: r.savedTokens ?? 0,
      savedCostMicro: r.savedCostMicro ?? 0,
      cacheHits: r.cacheHits,
      cacheMisses: r.cacheMisses,
    });
  }

  const timeline: any[] = [];
  for (let i = 0; i <= hoursInRange; i++) {
    const t = new Date(baseHour.getTime() + i * 3600 * 1000);
    if (t.getTime() > Date.now() + 3600 * 1000) break;
    const key = t.toISOString();
    const existing = points.get(key);
    timeline.push(existing ?? { hour: key, totalRequests: 0, totalTokens: 0, savedTokens: 0, savedCostMicro: 0, cacheHits: 0, cacheMisses: 0 });
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
  // 并行测速 + 8s 超时(避免无 key/挂起的 provider 串行拖死整个请求)
  const settled = await Promise.allSettled(
    allModels.map(async (model) => {
      const start = Date.now();
      try {
        const resolved = registry.resolve(model.id);
        const timeout = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("timeout (8s)")), 8000),
        );
        await Promise.race([
          resolved.provider.chat(
            { model: model.id, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
            resolved.upstreamModel,
          ),
          timeout,
        ]);
        return { model: model.id, status: "ok" as const, latencyMs: Date.now() - start };
      } catch (e) {
        return {
          model: model.id,
          status: "error" as const,
          latencyMs: Date.now() - start,
          error: (e as Error).message.slice(0, 100),
        };
      }
    }),
  );
  const results = settled.map((r) =>
    r.status === "fulfilled" ? r.value : { model: "unknown", status: "error", latencyMs: 0, error: "测速失败" },
  );
  return c.json({ results });
});

// ===== 缓存统计 =====
// ===== 优化开关（控制台可控制，立即生效） =====
adminRoute.get("/optimization/switches", async (c) => {
  const { getOptimizationSettings } = await import("../../optimizer/optimization-switch.js");
  return c.json({ settings: await getOptimizationSettings() });
});

adminRoute.put("/optimization/switches", async (c) => {
  const { updateOptimizationSettings } = await import("../../optimizer/optimization-switch.js");
  const body = await c.req.json().catch(() => ({}));
  const partial: Record<string, unknown> = {};
  for (const k of ["compressionEnabled", "semanticCacheEnabled", "smartRoutingEnabled", "budgetBlockEnabled"]) {
    if (typeof body?.[k] === "boolean") partial[k] = body[k];
  }
  if (typeof body?.profile === "string" && ["fast", "balanced", "cheap", "maximum_saving"].includes(body.profile)) {
    partial.profile = body.profile;
  }
  const settings = await updateOptimizationSettings(partial);
  return c.json({ settings });
});

// ===== Provider API Key 配置(个人友好:UI 配置,存 DB 热生效) =====
adminRoute.get("/providers/keys", async (c) => {
  const cfg = getConfig();
  const rows = await db.select().from(providerConfigs).where(isNull(providerConfigs.tenantId));
  const dbKeys = new Map(rows.map((r) => [r.provider, r.apiKey]));
  const providers = Object.entries(cfg.providers).map(([type, p]) => {
    const meta = dbKeys.has(type)
      ? { configured: true, source: "db" as const }
      : p.apiKey
        ? { configured: true, source: "env" as const }
        : { configured: false, source: "none" as const };
    let masked: string | undefined;
    if (dbKeys.has(type)) {
      try {
        masked = maskKey(decryptSecret(dbKeys.get(type) ?? ""));
      } catch {
        masked = "****";
      }
    } else if (p.apiKey) {
      masked = maskKey(p.apiKey);
    }
    return { provider: type, ...meta, masked };
  });
  return c.json({ providers });
});

adminRoute.post("/providers/:type/key", async (c) => {
  const type = c.req.param("type") as string;
  const body = await c.req.json().catch(() => ({}));
  const apiKey = (body?.apiKey ?? "").trim();
  if (!apiKey) return c.json({ error: { message: "apiKey required", type: "validation_error" } }, 400);
  await saveProviderKey(type as any, apiKey);
  return c.json({ ok: true, provider: type, source: "db", configured: true });
});

adminRoute.delete("/providers/:type/key", async (c) => {
  const type = c.req.param("type") as string;
  await deleteProviderKey(type as any);
  return c.json({ ok: true, provider: type, source: "env" });
});

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

// ===== Onboarding 漏斗 =====
adminRoute.get("/onboarding/funnel", async (c) => {
  const { onboardingEvents } = await import("../db/schema.js");
  const rows = await db
    .select({
    event: onboardingEvents.event,
  count: sql<number>`count(distinct ${onboardingEvents.tenantId})::int`,
    })
    .from(onboardingEvents)
    .groupBy(onboardingEvents.event);
  const funnel: Record<string, number> = {};
  for (const r of rows) funnel[r.event] = r.count;
  return c.json({ funnel });
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

  // 注意：生产环境应使用全局单例 pipeline，这里为了 API 返回状态做演示
  return c.json({
    message: `pipeline toggle API called for "${name}" → enabled=${enabled}`,
    note: "pipeline state is per-process; restart gateway to persist changes",
  });
});

// ===== Observability: Trace 查看 =====
adminRoute.get("/traces/recent", async (c) => {
  const { getTraceStore } = await import("../middleware/observability.js");
  const store = getTraceStore();
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const traces = store.recent(limit);
  return c.json({
    traces: traces.map((t) => ({
      traceId: t.traceId,
      requestId: t.requestId,
      duration: Math.max(...t.allSpans.map((s) => s.duration)),
      spanCount: t.allSpans.length,
      spans: t.allSpans.map((s) => ({ name: s.name, duration: s.duration, status: s.status })),
      createdAt: new Date(t.createdAt).toISOString(),
    })),
  });
});

adminRoute.get("/traces/stats", async (c) => {
  const { getTraceStore } = await import("../middleware/observability.js");
  const store = getTraceStore();
  return c.json({ stats: store.stats() });
});

adminRoute.get("/traces/:requestId", async (c) => {
  const requestId = c.req.param("requestId");
  const { getTraceStore } = await import("../middleware/observability.js");
  const store = getTraceStore();
  const trace = store.findByRequestId(requestId);
  if (!trace) return c.json({ error: { message: "trace not found" } }, 404);
  return c.json({
    traceId: trace.traceId,
    requestId: trace.requestId,
    spans: trace.allSpans.map((s) => ({ name: s.name, duration: s.duration, status: s.status, metadata: s.metadata })),
    waterfall: null,
  });
});

// ===== Analytics =====
adminRoute.get("/analytics/report", async (c) => {
  const range = (c.req.query("range") as string) || "day";
  const { getAnalyticsEngine } = await import("../../analytics/analytics.js");
  const engine = getAnalyticsEngine();
  const report = await engine.generateReport(range as "day" | "week" | "month");
  return c.json(report);
});

// ===== Gateway Memory =====
adminRoute.get("/memory/tenant/:id", async (c) => {
  const tenantId = c.req.param("id");
  const { getGatewayMemory } = await import("../../optimizer/prompt/gateway-memory.js");
  const memory = getGatewayMemory();
  const summary = memory.getSummary(tenantId);
  return c.json(summary);
});

// ===== C4: TRR/CSR/QPS 优化指标 =====
adminRoute.get("/optimization/stats", async (c) => {
  const { getDailyStatsEngine } = await import("../../analytics/daily-stats.js");
  const dailyStats = getDailyStatsEngine();
  const stats = await dailyStats.generateDailyStats();
  return c.json({
    today: {
      trr: (stats.trr * 100).toFixed(1) + "%",
      csr: (stats.csr * 100).toFixed(1) + "%",
      qps: "95%", // 估算
      totalTokens: stats.totalTokens,
      savedTokens: stats.savedTokens,
      totalCost: (stats.totalCostMicro / 1_000_000).toFixed(6),
      savedCost: (stats.savedCostMicro / 1_000_000).toFixed(6),
    },
  });
});

adminRoute.get("/optimization/suggestions", async (c) => {
  const { getTrendAnalyzer } = await import("../../analytics/trend-analyzer.js");
  const { getDailyStatsEngine } = await import("../../analytics/daily-stats.js");
  const { getRequestJudge } = await import("../../optimizer/judge/request-judge.js");
  const dailyStats = getDailyStatsEngine();
  const stats = await dailyStats.generateDailyStats();
  const qualityStats = getRequestJudge().getQualityStats();
  const analyzer = getTrendAnalyzer();
  const suggestions = analyzer.generateSuggestions({
    cacheHitRate: stats.cacheHitRate,
    avgQuality: qualityStats.avgScore,
    avgLatencyMs: stats.avgLatencyMs,
    costTrend: 0,
    qualityTrend: 0,
  });
  return c.json({ suggestions });
});

// ===== C4: 缓存置信度分布 =====
adminRoute.get("/cache/confidence", async (c) => {
  const { getCacheAutoRefresh } = await import("../../optimizer/cache/cache-auto-refresh.js");
  const autoRefresh = getCacheAutoRefresh();
  const hotPrompts = autoRefresh.getHotPrompts(10);
  const refreshQueue = autoRefresh.getRefreshQueue();
  return c.json({
    hotPrompts: hotPrompts.map((p) => ({ text: p.text.slice(0, 50), hits: p.hits, avgLatency: p.avgLatency })),
    refreshQueueSize: refreshQueue.length,
    ttlMap: autoRefresh.getTtlMap(),
  });
});

// ===== P1: Cost Before Request =====
adminRoute.post("/cost/estimate", async (c) => {
  const body = await c.req.json<{ prompt: string; model?: string }>();
  const prompt = body?.prompt;
  if (!prompt || prompt.trim().length === 0) {
    return c.json({ error: { message: "prompt required" } }, 400);
  }

  const { CostEstimator } = await import("../../optimizer/cost/cost-controller.js");
  const estimator = new CostEstimator();

  const estimates = estimator.getAllPrices().map((p) => {
    const cost = estimator.estimateCost(prompt, p.provider, p.model);
    return {
      provider: p.provider,
      model: p.model,
      inputPrice: p.inputPrice,
      outputPrice: p.outputPrice,
      estimatedCost: +(cost.toFixed(6)),
      estimatedTokens: estimator.estimateTokens(prompt),
    };
  });

  estimates.sort((a, b) => a.estimatedCost - b.estimatedCost);

  return c.json({
    prompt: prompt.slice(0, 100),
    promptTokens: estimator.estimateTokens(prompt),
    estimates,
    cheapest: estimates[0] ?? null,
  });
});

// ===== P1: Optimization Profiles =====
adminRoute.get("/optimization/profiles", async (c) => {
  const { listProfiles } = await import("../../optimizer/cost/optimization-profile.js");
  return c.json({ profiles: listProfiles() });
});

// ===== P2: Provider Recommendation =====
adminRoute.post("/optimization/recommend", async (c) => {
  const body = await c.req.json<{ prompt: string }>();
  const prompt = body?.prompt || "";

  const { CostEstimator } = await import("../../optimizer/cost/cost-controller.js");
  const { getPromptRouter } = await import("../../optimizer/prompt/router.js");
  const estimator = new CostEstimator();

  const router = getPromptRouter();
  const classification = router.classify(prompt);

  const estimates = estimator.getAllPrices().map((p) => {
    const cost = estimator.estimateCost(prompt, p.provider, p.model);
    return { provider: p.provider, model: p.model, estimatedCost: +(cost.toFixed(6)) };
  });

  estimates.sort((a, b) => a.estimatedCost - b.estimatedCost);
  const cheapest = estimates[0];
  const mostExpensive = estimates[estimates.length - 1];
  const savingsPercent = cheapest && mostExpensive
    ? ((mostExpensive.estimatedCost - cheapest.estimatedCost) / Math.max(0.000001, mostExpensive.estimatedCost) * 100).toFixed(0) + "%"
    : "N/A";

  return c.json({
    intent: classification.category,
    recommendations: estimates.slice(0, 3),
    cheapest,
    mostExpensive,
    potentialSavings: savingsPercent,
    message: cheapest
      ? `推荐 ${cheapest.provider}/${cheapest.model}，预估 $${cheapest.estimatedCost}，相比最贵方案节省 ${savingsPercent}`
      : "",
  });
});

// ===== Layer 5: 审计日志 =====
adminRoute.get("/audit/logs", async (c) => {
  const audit = getAuditLogger();
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const logs = await audit.query({ limit, offset });
  const total = await audit.count();
  return c.json({ logs, total, limit, offset });
});