/**
 * Nexus LLM Gateway - 用户端路由
 * 用 API Key 认证，查看自己的用量、缓存状态等。
 */
import { Hono } from "hono";
import { eq, sql, and, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { usageLogs, tenants } from "../db/schema.js";
import { getSemanticCache } from "../cache/semantic-cache.js";
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

  // 24h 用量
  const [dayStats] = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.tenantId, tenant.id), gte(usageLogs.createdAt, since)));

  // 本月用量
  const [monthStats] = await db
    .select({
      monthTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      monthRequests: sql<number>`count(*)::int`,
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.tenantId, tenant.id), gte(usageLogs.createdAt, monthStart)));

  // 缓存统计
  const cache = getSemanticCache();
  const cacheStats = await cache.stats();

  const totalRequests = dayStats?.totalRequests ?? 0;
  const totalCacheHits = dayStats?.cacheHits ?? 0;
  const cacheRate = totalRequests > 0 ? ((totalCacheHits / totalRequests) * 100).toFixed(1) : "0.0";

  return c.json({
    tenant: { id: tenant.id, name: tenant.name, monthlyTokenQuota: tenant.monthlyTokenQuota },
    apiKey: apiKey ? { name: apiKey.name, keyPrefix: apiKey.keyPrefix } : null,
    day: {
      totalRequests,
      totalTokens: dayStats?.totalTokens ?? 0,
      cacheHits: totalCacheHits,
      cacheRate: `${cacheRate}%`,
    },
    month: {
      monthTokens: monthStats?.monthTokens ?? 0,
      monthRequests: monthStats?.monthRequests ?? 0,
      quotaExceeded: tenant.monthlyTokenQuota !== null && (monthStats?.monthTokens ?? 0) >= tenant.monthlyTokenQuota,
    },
    cache: cacheStats,
  });
});

// 用户用量时间线
userRoute.get("/timeline", async (c) => {
  const tenant = c.get("tenant")!;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
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

  return c.json({ timeline: rows });
});