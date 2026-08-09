/**
 * Nexus LLM Gateway - 用户端路由
 * 用 API Key 认证，查看自己的用量、缓存状态等。
 */
import { Hono } from "hono";
import { eq, sql, and, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { usageLogs, tenants, apiKeys } from "../db/schema.js";
import { getSemanticCache } from "../../optimizer/cache/semantic-cache.js";
import { getTenantProviderKeys, saveProviderKey, deleteProviderKey } from "../config/provider-keys.js";
import { attributeSavings } from "../../analytics/savings-attribution.js";
import type { ProviderType } from "../../shared/types.js";
import type { AuthEnv } from "../middleware/auth.js";
import type { LoggingEnv } from "../middleware/logging.js";

type UserEnv = AuthEnv & LoggingEnv;

export const userRoute = new Hono<UserEnv>();

// 仅非 master key 可访问（普通租户 API Key）
userRoute.use("*", async (c, next) => {
  const isMaster = c.get("isMaster");
  if (isMaster) {
    return c.json({ error: { message: "此端点仅限用户 API Key 访问" } }, 403);
  }
  const tenant = c.get("tenant");
  if (!tenant) {
    return c.json({ error: { message: "需要有效的 API Key" } }, 401);
  }
  await next();
});

// 用户概览：自己的用量统计
userRoute.get("/overview", async (c) => {
  const tenant = c.get("tenant")!;
  const apiKey = c.get("apiKey");
  const now = new Date();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 24h 用量 + 节省
  const [dayStats] = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      savedTokens: sql<number>`coalesce(sum(${usageLogs.savedTokens}), 0)::bigint::int`,
      savedCostMicro: sql<number>`coalesce(sum(${usageLogs.savedCostMicro}), 0)::bigint::int`,
      cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
      compressionSaved: sql<number>`coalesce(sum(case when ${usageLogs.compressionRatio} > 0 then ${usageLogs.savedTokens} else 0 end), 0)::bigint::int`,
      cacheSaved: sql<number>`coalesce(sum(case when ${usageLogs.cached} then ${usageLogs.savedTokens} else 0 end), 0)::bigint::int`,
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.tenantId, tenant.id), gte(usageLogs.createdAt, since)));

  // 本月用量
  const [monthStats] = await db
    .select({
      monthTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      monthRequests: sql<number>`count(*)::int`,
      savedTokens: sql<number>`coalesce(sum(${usageLogs.savedTokens}), 0)::bigint::int`,
      savedCostMicro: sql<number>`coalesce(sum(${usageLogs.savedCostMicro}), 0)::bigint::int`,
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.tenantId, tenant.id), gte(usageLogs.createdAt, monthStart)));

  // 缓存统计
  const cache = getSemanticCache();
  const cacheStats = await cache.stats();

  const totalRequests = dayStats?.totalRequests ?? 0;
  const totalCacheHits = dayStats?.cacheHits ?? 0;
  const cacheRate = totalRequests > 0 ? ((totalCacheHits / totalRequests) * 100).toFixed(1) : "0.0";

  // 节省来源拆分
  const daySavedTokens = dayStats?.savedTokens ?? 0;
  const daySavedCost = ((dayStats?.savedCostMicro ?? 0) / 1_000_000).toFixed(6);
  const compressionSaved = dayStats?.compressionSaved ?? 0;
  const cacheSaved = dayStats?.cacheSaved ?? 0;
  const routingSaved = Math.max(0, daySavedTokens - compressionSaved - cacheSaved);
  const savingsBreakdown = {
    compression: compressionSaved,
    cache: cacheSaved,
    routing: routingSaved,
    other: 0,
  };

  // 读取租户缓存计划
  const [tenantRow] = await db
    .select({ cachePlan: tenants.cachePlan, cacheThreshold: tenants.cacheThreshold })
    .from(tenants)
    .where(eq(tenants.id, tenant.id))
    .limit(1);

  return c.json({
    tenant: { id: tenant.id, name: tenant.name, monthlyTokenQuota: tenant.monthlyTokenQuota, cachePlan: tenantRow?.cachePlan ?? "free" },
    apiKey: apiKey ? { name: apiKey.name, keyPrefix: apiKey.keyPrefix } : null,
    today: {
      requests: totalRequests,
      tokens: dayStats?.totalTokens ?? 0,
      cacheHits: totalCacheHits,
      cacheRate: `${cacheRate}%`,
      savedTokens: daySavedTokens,
      savedCost: daySavedCost,
      savingsBreakdown,
    },
    month: {
      tokens: monthStats?.monthTokens ?? 0,
      requests: monthStats?.monthRequests ?? 0,
      savedTokens: monthStats?.savedTokens ?? 0,
      savedCost: ((monthStats?.savedCostMicro ?? 0) / 1_000_000).toFixed(6),
      quotaExceeded: tenant.monthlyTokenQuota !== null && (monthStats?.monthTokens ?? 0) >= tenant.monthlyTokenQuota,
    },
    cache: cacheStats,
  });
});

// 用户用量时间线（补齐零值，支持 range）
userRoute.get("/timeline", async (c) => {
  const tenant = c.get("tenant")!;
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
    .where(and(eq(usageLogs.tenantId, tenant.id), gte(usageLogs.createdAt, since)))
    .groupBy(sql`date_trunc('hour', ${usageLogs.createdAt})`)
    .orderBy(sql`date_trunc('hour', ${usageLogs.createdAt})`);

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
    if (t.getTime() > Date.now() + 3600 * 1000) break;
    const key = t.toISOString();
    const existing = points.get(key);
    timeline.push(existing ?? { hour: key, totalRequests: 0, totalTokens: 0, cacheHits: 0 });
  }

  return c.json({ window: range, timeline });
});

// 租户申请增强缓存（仅用户 API key，非 master）
userRoute.post("/premium/request", async (c) => {
  const tenant = c.get("tenant")!;
  const [row] = await db
    .select({ cachePlan: tenants.cachePlan })
    .from(tenants)
    .where(eq(tenants.id, tenant.id))
    .limit(1);
  if (row && row.cachePlan === "premium_approved") {
    return c.json({ tenant: { id: tenant.id, cachePlan: "premium_approved" } });
  }
  if (row && row.cachePlan === "premium_pending") {
    return c.json({ tenant: { id: tenant.id, cachePlan: "premium_pending" } });
  }
  await db.update(tenants).set({ cachePlan: "premium_pending", premiumRequestedAt: new Date() }).where(eq(tenants.id, tenant.id));
  return c.json({ tenant: { id: tenant.id, cachePlan: "premium_pending" } });
});

// ===== 请求记录（cursor 分页）=====
userRoute.get("/requests", async (c) => {
  const tenant = c.get("tenant")!;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 100);
  const cursor = c.req.query("cursor"); // ISO timestamp

  const conditions: any[] = [eq(usageLogs.tenantId, tenant.id)];
  if (cursor) {
    conditions.push(sql`${usageLogs.createdAt} < ${cursor}`);
  }

  const rows = await db
    .select({
      requestId: usageLogs.requestId,
      createdAt: usageLogs.createdAt,
      model: usageLogs.model,
      provider: usageLogs.provider,
      totalTokens: usageLogs.totalTokens,
      savedTokens: usageLogs.savedTokens,
      latencyMs: usageLogs.latencyMs,
      cached: usageLogs.cached,
      status: usageLogs.status,
    })
    .from(usageLogs)
    .where(and(...conditions))
    .orderBy(sql`${usageLogs.createdAt} desc`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);  const nextCursor = data.length > 0 ? data[data.length - 1]!.createdAt : null;

  return c.json({
    requests: data.map((r) => ({
      requestId: r.requestId,
      time: r.createdAt,
      model: r.model,
      provider: r.provider,
      tokens: r.totalTokens,
      savedTokens: r.savedTokens,
      latencyMs: r.latencyMs,
      cached: r.cached,
      status: r.status,
    })),
    hasMore,
    nextCursor,
  });
});

// ===== 请求详情（Savings Explainability：元数据 + 归因，不含 prompt/response）=====
userRoute.get("/requests/:id", async (c) => {
  const tenant = c.get("tenant")!;
  const id = c.req.param("id");
  const rows = await db
    .select({
      requestId: usageLogs.requestId,
      createdAt: usageLogs.createdAt,
      provider: usageLogs.provider,
      model: usageLogs.model,
      upstreamModel: usageLogs.upstreamModel,
      promptTokens: usageLogs.promptTokens,
      completionTokens: usageLogs.completionTokens,
      totalTokens: usageLogs.totalTokens,
      savedTokens: usageLogs.savedTokens,
      savedCostMicro: usageLogs.savedCostMicro,
      costMicro: usageLogs.costMicro,
      latencyMs: usageLogs.latencyMs,
      ttftMs: usageLogs.ttftMs,
      cached: usageLogs.cached,
      stream: usageLogs.stream,
      compressionRatio: usageLogs.compressionRatio,
      cacheType: usageLogs.cacheType,
      routerReason: usageLogs.routerReason,
      intentCategory: usageLogs.intentCategory,
      status: usageLogs.status,
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.tenantId, tenant.id), eq(usageLogs.requestId, id)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return c.json({ error: { message: "request not found", type: "not_found" } }, 404);
  }
  const attribution = attributeSavings(row);
  const originalTokens = row.totalTokens + (row.savedTokens ?? 0);
  const reductionRate = originalTokens > 0 ? ((row.savedTokens ?? 0) / originalTokens) : 0;
  return c.json({
    request: {
      requestId: row.requestId,
      time: row.createdAt,
      provider: row.provider,
      model: row.model,
      upstreamModel: row.upstreamModel,
      status: row.status,
      stream: row.stream,
      // Tokens
      originalTokens,
      optimizedTokens: row.totalTokens,
      savedTokens: row.savedTokens ?? 0,
      reductionRate: Number(reductionRate.toFixed(4)),
      // Savings
      savings: {
        source: attribution.source,
        kind: attribution.kind,
        savedTokens: attribution.savedTokens,
        savedCostMicro: attribution.savedCostMicro,
      },
      // Cost（微美元；无价格时 costMicro=0 为 unknown，不冒充估算）
      costMicro: row.costMicro,
      savedCostMicro: row.savedCostMicro ?? 0,
      originalCostMicro: row.costMicro + (row.savedCostMicro ?? 0),
      // Latency
      latencyMs: row.latencyMs,
      ttftMs: row.ttftMs,
      // 优化元数据
      compressionRatio: row.compressionRatio,
      cacheType: row.cacheType,
      routerReason: row.routerReason,
      intentCategory: row.intentCategory,
    },
  });
});

// ===== 我的 Key（含 LastUsed）=====
userRoute.get("/keys", async (c) => {
  const tenant = c.get("tenant")!;
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      enabled: apiKeys.enabled,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenant.id))
    .orderBy(sql`${apiKeys.createdAt} desc`);

  return c.json({ keys });
});

userRoute.patch("/keys/:id/toggle", async (c) => {
  const tenant = c.get("tenant")!;
  const keyId = c.req.param("id");
  const [key] = await db
    .select({ enabled: apiKeys.enabled })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenant.id)))
    .limit(1);
  if (!key) return c.json({ error: { message: "Key 不存在" } }, 404);

  await db.update(apiKeys).set({ enabled: !key.enabled }).where(eq(apiKeys.id, keyId));
  return c.json({ ok: true, enabled: !key.enabled });
});

// ===== 用户端测速 =====
const SPEED_COOLDOWN_MS = 10_000;
const speedCooldowns = new Map<string, number>(); // key: `${tenantId}:${provider}`

/** 把上游错误映射成用户看得懂的中文 */
function mapSpeedError(status: number | undefined, raw: string): string {
  if (!status) {
    if (/abort|timeout/i.test(raw)) return "请求超时（8 秒）";
    if (/fetch|ENOTFOUND|ECONNREFUSED|socket/i.test(raw)) return "无法连接 Provider（网络/地址异常）";
    return raw;
  }
  if (status === 401 || status === 403) return "API Key 无效或权限不足";
  if (status === 404) return "接口或模型不存在";
  if (status === 429) return "Provider 限流，请稍后再试";
  if (status >= 500) return `Provider 服务异常（HTTP ${status}）`;
  return `HTTP ${status}`;
}

/** 单 provider 真实测速：最小 chat 请求（max_tokens=1），测端到端延迟与吞吐 */
async function speedTestProvider(providerType: ProviderType, tenantId: string, requestedModel?: string) {
  const base = { provider: providerType as string };

  const { resolveProviderKey } = await import("../config/provider-keys.js");
  const apiKey = await resolveProviderKey(providerType, tenantId);
  if (!apiKey) return { ...base, status: "skipped", error: "未配置 API Key" };

  const { getRegistry } = await import("../../providers/registry.js");
  const provider = getRegistry().getProvider(providerType);
  if (!provider) return { ...base, status: "error", error: "Provider 未注册" };

  const { getConfig } = await import("../../shared/config.js");
  const cfgModels = getConfig().providers[providerType]?.models ?? {};
  const model = requestedModel ?? Object.values(cfgModels)[0];
  if (!model) return { ...base, status: "error", error: "未配置测速模型" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const start = Date.now();
  try {
    // 直接调用 provider（不经过优化链路），用租户自己的 key
    const res = await provider.chat(
      {
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0,
      },
      model,
      apiKey,
    );
    const totalMs = Date.now() - start;
    const totalTokens = res.usage?.total_tokens ?? 0;
    const tokensPerSec = totalMs > 0 ? Math.round((totalTokens * 1000) / totalMs) : 0;
    return { ...base, model, status: "ok", totalMs, tokensPerSec, totalTokens };
  } catch (e) {
    const err = e as any;
    const status = typeof err?.status === "number" ? err.status : err?.response?.status;
    const raw = err?.message ?? String(e);
    return { ...base, status: "error", error: mapSpeedError(status, raw) };
  } finally {
    clearTimeout(timer);
  }
}

// 单 provider 测速（前端逐条调用，有进度反馈）
userRoute.post("/speed-test/:provider", async (c) => {
  const tenant = c.get("tenant")!;
  const providerType = c.req.param("provider") as ProviderType;
  const now = Date.now();

  // 按 tenant+provider 独立冷却
  const key = `${tenant.id}:${providerType}`;
  const last = speedCooldowns.get(key);
  if (last && now - last < SPEED_COOLDOWN_MS) {
    const retryAfterSec = Math.ceil((SPEED_COOLDOWN_MS - (now - last)) / 1000);
    return c.json({ error: { message: `测速太频繁，请 ${retryAfterSec} 秒后再试`, retryAfterSec } }, 429);
  }
  speedCooldowns.set(key, now);

  const body = await c.req.json().catch(() => ({}));
  const result = await speedTestProvider(providerType, tenant.id, typeof body?.model === "string" ? body.model : undefined);
  return c.json({ result });
});

// 批量测速（不传 providers = 测全部已配置；传了则按传入顺序逐个测）
userRoute.post("/speed-test", async (c) => {
  const tenant = c.get("tenant")!;
  const body = await c.req.json().catch(() => ({}));
  const requested: string[] | undefined = Array.isArray(body?.providers) ? body.providers : undefined;

  const allKeys = await getTenantProviderKeys(tenant.id);
  const configured = allKeys.filter((k) => k.configured).map((k) => k.provider as ProviderType);
  const targets = requested && requested.length > 0 ? requested.filter((p) => configured.includes(p as ProviderType)) as ProviderType[] : configured;

  if (targets.length === 0) {
    return c.json({ results: [], message: requested?.length ? "所选 Provider 未配置 API Key" : "请先配置至少一个 Provider API Key" });
  }

  const now = Date.now();
  const results = [];
  for (const p of targets) {
    const key = `${tenant.id}:${p}`;
    const last = speedCooldowns.get(key);
    if (last && now - last < SPEED_COOLDOWN_MS) {
      results.push({ provider: p, status: "cooldown", error: "冷却中（10 秒内已测过）" });
      continue;
    }
    speedCooldowns.set(key, now);
    results.push(await speedTestProvider(p, tenant.id));
  }
  return c.json({ results });
});

// ===== 用量导出 CSV =====
userRoute.get("/export", async (c) => {
  const tenant = c.get("tenant")!;
  const rows = await db
    .select({
      createdAt: usageLogs.createdAt,
      model: usageLogs.model,
      provider: usageLogs.provider,
      totalTokens: usageLogs.totalTokens,
      savedTokens: usageLogs.savedTokens,
      latencyMs: usageLogs.latencyMs,
      cached: usageLogs.cached,
      status: usageLogs.status,
    })
    .from(usageLogs)
    .where(eq(usageLogs.tenantId, tenant.id))
    .orderBy(sql`${usageLogs.createdAt} desc`)
    .limit(10000);

  const header = "time,model,provider,tokens,saved_tokens,latency_ms,cached,status";
  const body = rows.map((r) =>
    `${r.createdAt},${r.model},${r.provider},${r.totalTokens},${r.savedTokens},${r.latencyMs},${r.cached},${r.status}`
  ).join("\n");

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", "attachment; filename=nexus-usage.csv");
  return c.body(`${header}\n${body}\n`);
});

// ===== 我的 Provider Key（BYOK 自配）=====
userRoute.get("/providers/keys", async (c) => {
  const tenant = c.get("tenant")!;
  const keys = await getTenantProviderKeys(tenant.id);
  return c.json({ providers: keys });
});

userRoute.post("/providers/:type/key", async (c) => {
  const tenant = c.get("tenant")!;
  const type = c.req.param("type") as string;
  const body = await c.req.json().catch(() => ({}));
  const apiKey = (body?.apiKey ?? "").trim();
  if (!apiKey) return c.json({ error: { message: "apiKey required", type: "validation_error" } }, 400);
  await saveProviderKey(type as ProviderType, apiKey, tenant.id);
  return c.json({ ok: true, provider: type });
});

userRoute.delete("/providers/:type/key", async (c) => {
  const tenant = c.get("tenant")!;
  const type = c.req.param("type") as string;
  await deleteProviderKey(type as ProviderType, tenant.id);
  return c.json({ ok: true, provider: type });
});
