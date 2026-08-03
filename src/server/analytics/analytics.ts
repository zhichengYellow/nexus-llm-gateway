/**
 * Nexus LLM Gateway - LLM Analytics（分析引擎）
 *
 * 目的：后台聚合统计 Prompt Top10 / Model Top10 / Intent Distribution / Cost / Token / Latency。
 *
 * 指标：
 * - 每日/每周/每月维度
 * - Provider 分布
 * - 模型使用排行
 * - 意图分布
 * - 成本趋势
 * - 延迟趋势
 */
import { eq, gte, sql, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { usageLogs, modelRoutes, tenants, apiKeys } from "../db/schema.js";
import { logger } from "../../shared/logger.js";

export interface AnalyticsReport {
  period: { start: string; end: string };
  summary: {
    totalRequests: number;
    totalTokens: number;
    totalCostMicro: number;
    cacheHitRate: string;
    avgLatencyMs: number;
  };
  topModels: Array<{ model: string; requests: number; tokens: number }>;
  topProviders: Array<{ provider: string; requests: number; cost: number }>;
  dailyTrend: Array<{ date: string; requests: number; tokens: number }>;
  tenantBreakdown: Array<{ tenant: string; requests: number; tokens: number }>;
}

export class AnalyticsEngine {
  /** 生成指定时间范围的报告 */
  async generateReport(range: "day" | "week" | "month" = "day"): Promise<AnalyticsReport> {
    const now = new Date();
    let since: Date;

    if (range === "day") {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === "week") {
      since = new Date(now.getTime() - 7 * 86400000);
    } else {
      since = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Summary
    const [summary] = await db
      .select({
        totalRequests: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
        totalCostMicro: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
        cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
        avgLatencyMs: sql<number>`coalesce(avg(${usageLogs.latencyMs}), 0)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since));

    // Top Models
    const topModels = await db
      .select({
        model: usageLogs.model,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.model)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // Top Providers
    const topProviders = await db
      .select({
        provider: usageLogs.provider,
        requests: sql<number>`count(*)::int`,
        cost: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.provider)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // Daily Trend
    const dailyTrend = await db
      .select({
        date: sql<string>`date_trunc('day', ${usageLogs.createdAt})::text`,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(sql`date_trunc('day', ${usageLogs.createdAt})`)
      .orderBy(sql`date_trunc('day', ${usageLogs.createdAt})`);

    // Tenant Breakdown
    const tenantBreakdown = await db
      .select({
        tenant: tenants.name,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
      })
      .from(usageLogs)
      .innerJoin(tenants, eq(usageLogs.tenantId, tenants.id))
      .where(gte(usageLogs.createdAt, since))
      .groupBy(tenants.name)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    return {
      period: { start: since.toISOString(), end: now.toISOString() },
      summary: {
        totalRequests: summary?.totalRequests ?? 0,
        totalTokens: summary?.totalTokens ?? 0,
        totalCostMicro: summary?.totalCostMicro ?? 0,
        cacheHitRate: summary?.totalRequests
          ? ((summary.cacheHits ?? 0) / summary.totalRequests * 100).toFixed(1) + "%"
          : "0%",
        avgLatencyMs: summary?.avgLatencyMs ?? 0,
      },
      topModels: topModels.map((r) => ({
        model: r.model ?? "unknown",
        requests: r.requests ?? 0,
        tokens: r.tokens ?? 0,
      })),
      topProviders: topProviders.map((r) => ({
        provider: r.provider ?? "unknown",
        requests: r.requests ?? 0,
        cost: r.cost ?? 0,
      })),
      dailyTrend: dailyTrend.map((r) => ({
        date: r.date ?? "",
        requests: r.requests ?? 0,
        tokens: r.tokens ?? 0,
      })),
      tenantBreakdown: tenantBreakdown.map((r) => ({
        tenant: r.tenant ?? "unknown",
        requests: r.requests ?? 0,
        tokens: r.tokens ?? 0,
      })),
    };
  }
}

/** 全局单例 */
let _analytics: AnalyticsEngine | null = null;

export function getAnalyticsEngine(): AnalyticsEngine {
  if (!_analytics) _analytics = new AnalyticsEngine();
  return _analytics;
}

export function resetAnalyticsEngine(): void {
  _analytics = null;
}
