/**
 * Nexus LLM Gateway - Cost Report（成本报告引擎）
 *
 * Layer 2.4: 每日成本聚合 + 节省来源归因 + 报告生成
 */
import { gte, sql } from "drizzle-orm";
import { db } from "../../server/db/client.js";
import { usageLogs } from "../../server/db/schema.js";

export interface CostReport {
  period: { start: string; end: string };
  summary: {
    totalCost: number;
    savedCost: number;
    savingsRate: number;
    totalTokens: number;
    savedTokens: number;
    totalRequests: number;
    cacheHitRate: number;
    avgLatencyMs: number;
  };
  breakdown: {
    byProvider: Record<string, { cost: number; tokens: number; requests: number }>;
    byModel: Record<string, { cost: number; tokens: number; requests: number }>;
    byIntent: Record<string, { cost: number; requests: number }>;
  };
  savings: {
    cache: { tokens: number; cost: number };
    compression: { tokens: number; cost: number };
  };
  daily: Array<{ date: string; cost: number; tokens: number; requests: number }>;
}

export class CostReportEngine {
  /**
   * 生成成本报告
   */
  async generate(range: "day" | "week" | "month" = "day"): Promise<CostReport> {
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
        totalCost: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
        savedCostMicro: sql<number>`coalesce(sum(${usageLogs.savedCostMicro}), 0)::bigint::int`,
        totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
        savedTokens: sql<number>`coalesce(sum(${usageLogs.savedTokens}), 0)::bigint::int`,
        totalRequests: sql<number>`count(*)::int`,
        cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
        avgLatencyMs: sql<number>`coalesce(avg(${usageLogs.latencyMs}), 0)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since));

    const totalCost = (summary?.totalCost ?? 0) / 1_000_000;
    const totalTokens = summary?.totalTokens ?? 0;
    const savedTokens = summary?.savedTokens ?? 0;
    // 直接使用 usageLogs 中记录的 savedCostMicro（真实节省），不做比例估算
    const savedCost = (summary?.savedCostMicro ?? 0) / 1_000_000;

    // By Provider
    const byProviderRows = await db
      .select({
        key: usageLogs.provider,
        cost: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
        tokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
        requests: sql<number>`count(*)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.provider);

    const byProvider: Record<string, any> = {};
    for (const r of byProviderRows) {
      byProvider[r.key ?? "unknown"] = { cost: (r.cost ?? 0) / 1_000_000, tokens: r.tokens ?? 0, requests: r.requests ?? 0 };
    }

    // By Model
    const byModelRows = await db
      .select({
        key: usageLogs.model,
        cost: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
        tokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
        requests: sql<number>`count(*)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.model);

    const byModel: Record<string, any> = {};
    for (const r of byModelRows) {
      byModel[r.key ?? "unknown"] = { cost: (r.cost ?? 0) / 1_000_000, tokens: r.tokens ?? 0, requests: r.requests ?? 0 };
    }

    // By Intent
    const byIntentRows = await db
      .select({
        key: usageLogs.intentCategory,
        cost: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
        requests: sql<number>`count(*)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.intentCategory);

    const byIntent: Record<string, any> = {};
    for (const r of byIntentRows) {
      byIntent[r.key ?? "unknown"] = { cost: (r.cost ?? 0) / 1_000_000, requests: r.requests ?? 0 };
    }

    // Daily trend
    const dailyRows = await db
      .select({
        date: sql<string>`date_trunc('day', ${usageLogs.createdAt})::text`,
        cost: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
        tokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
        requests: sql<number>`count(*)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(sql`date_trunc('day', ${usageLogs.createdAt})`)
      .orderBy(sql`date_trunc('day', ${usageLogs.createdAt})`);

    return {
      period: { start: since.toISOString(), end: now.toISOString() },
      summary: {
        totalCost,
        savedCost,
        savingsRate: totalCost > 0 ? savedCost / totalCost : 0,
        totalTokens,
        savedTokens,
        totalRequests: summary?.totalRequests ?? 0,
        cacheHitRate: (summary?.totalRequests ?? 0) > 0 ? (summary?.cacheHits ?? 0) / (summary?.totalRequests ?? 1) : 0,
        avgLatencyMs: summary?.avgLatencyMs ?? 0,
      },
      breakdown: { byProvider, byModel, byIntent },
      savings: {
        cache: { tokens: savedTokens, cost: savedCost },
        compression: { tokens: 0, cost: 0 },
      },
      daily: dailyRows.map((r: any) => ({
        date: r.date ?? "",
        cost: (Number(r.cost) || 0) / 1_000_000,
        tokens: Number(r.tokens) || 0,
        requests: Number(r.requests) || 0,
      })),
    };
  }
}

let _report: CostReportEngine | null = null;
export function getCostReportEngine(): CostReportEngine {
  if (!_report) _report = new CostReportEngine();
  return _report;
}
export function resetCostReportEngine(): void { _report = null; }
