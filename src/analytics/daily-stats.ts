/**
 * Nexus LLM Gateway - Daily Stats（每日统计聚合）
 *
 * Layer 0.2 + 0.3: 聚合每日 Token/成本/节省数据 + 请求画像统计。
 */
import { eq, gte, sql, and } from "drizzle-orm";
import { db } from "../server/db/client.js";
import { usageLogs } from "../server/db/schema.js";

export interface DailyStats {
  date: string;
  totalRequests: number;
  totalTokens: number;
  savedTokens: number;
  /** Token Reduction Ratio */
  trr: number;
  /** Cost Saving Ratio */
  csr: number;
  totalCostMicro: number;
  savedCostMicro: number;
  cacheHits: number;
  cacheHitRate: number;
  avgLatencyMs: number;
  avgTtftMs: number;
}

export interface RequestProfile {
  intents: Record<string, number>;
  models: Record<string, number>;
  providers: Record<string, number>;
  cacheTypes: Record<string, number>;
}

export class DailyStatsEngine {
  /**
   * 生成每日统计
   */
  async generateDailyStats(date?: Date): Promise<DailyStats> {
    const target = date ?? new Date();
    const dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const [row] = await db
      .select({
        totalRequests: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::bigint::int`,
        savedTokens: sql<number>`coalesce(sum(${usageLogs.savedTokens}), 0)::bigint::int`,
        totalCostMicro: sql<number>`coalesce(sum(${usageLogs.costMicro}), 0)::bigint::int`,
        cacheHits: sql<number>`coalesce(sum(case when ${usageLogs.cached} then 1 else 0 end), 0)::int`,
        avgLatencyMs: sql<number>`coalesce(avg(${usageLogs.latencyMs}), 0)::int`,
        avgTtftMs: sql<number>`coalesce(avg(${usageLogs.ttftMs}), 0)::int`,
      })
      .from(usageLogs)
      .where(and(gte(usageLogs.createdAt, dayStart), sql`${usageLogs.createdAt} < ${dayEnd}`));

    const totalTokens = row?.totalTokens ?? 0;
    const savedTokens = Math.min(row?.savedTokens ?? 0, totalTokens); // 防止缓存命中时 savedTokens > totalTokens
    const totalCost = row?.totalCostMicro ?? 0;
    const savedCost = totalCost > 0 && totalTokens > 0
      ? Math.round(totalCost * (savedTokens / totalTokens))
      : 0;

    return {
      date: dayStart.toISOString().slice(0, 10),
      totalRequests: row?.totalRequests ?? 0,
      totalTokens,
      savedTokens,
      trr: totalTokens > 0 ? savedTokens / totalTokens : 0,
      csr: totalCost > 0 ? savedCost / totalCost : 0,
      totalCostMicro: totalCost,
      savedCostMicro: savedCost,
      cacheHits: row?.cacheHits ?? 0,
      cacheHitRate: (row?.totalRequests ?? 0) > 0 ? (row?.cacheHits ?? 0) / (row?.totalRequests ?? 1) : 0,
      avgLatencyMs: row?.avgLatencyMs ?? 0,
      avgTtftMs: row?.avgTtftMs ?? 0,
    };
  }

  /**
   * 生成请求画像
   */
  async generateRequestProfile(days = 7): Promise<RequestProfile> {
    const since = new Date(Date.now() - days * 86400000);

    const intents = await db
      .select({
        intent: usageLogs.intentCategory,
        count: sql<number>`count(*)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.intentCategory);

    const models = await db
      .select({
        model: usageLogs.model,
        count: sql<number>`count(*)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.model);

    const providers = await db
      .select({
        provider: usageLogs.provider,
        count: sql<number>`count(*)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.provider);

    const cacheTypes = await db
      .select({
        cacheType: usageLogs.cacheType,
        count: sql<number>`count(*)::int`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.cacheType);

    const toMap = (rows: Array<Record<string, any>>, key: string): Record<string, number> => {
      const map: Record<string, number> = {};
      for (const r of rows) {
        const k = r[key] ?? "unknown";
        map[k] = r.count ?? 0;
      }
      return map;
    };

    return {
      intents: toMap(intents, "intent"),
      models: toMap(models, "model"),
      providers: toMap(providers, "provider"),
      cacheTypes: toMap(cacheTypes, "cacheType"),
    };
  }

  /**
   * 节省来源归因
   */
  async getSavingsBreakdown(days = 7): Promise<{
    cache: { tokens: number; cost: number };
    compression: { tokens: number; cost: number };
    routing: { tokens: number; cost: number };
  }> {
    const since = new Date(Date.now() - days * 86400000);

    // 缓存节省
    const [cacheRow] = await db
      .select({
        tokens: sql<number>`coalesce(sum(${usageLogs.savedTokens}), 0)::bigint::int`,
        requests: sql<number>`count(*)::int`,
      })
      .from(usageLogs)
      .where(and(gte(usageLogs.createdAt, since), eq(usageLogs.cached, true)));

    // 压缩节省（compressionRatio > 0）
    const [compressionRow] = await db
      .select({
        requests: sql<number>`count(*)::int`,
        avgRatio: sql<number>`coalesce(avg(${usageLogs.compressionRatio}), 0)::int`,
      })
      .from(usageLogs)
      .where(and(gte(usageLogs.createdAt, since), sql`${usageLogs.compressionRatio} > 0`));

    const totalCacheTokens = cacheRow?.tokens ?? 0;
    const compTokens = compressionRow?.requests
      ? Math.round((compressionRow.requests * (compressionRow.avgRatio ?? 0)) / 100)
      : 0;

    return {
      cache: { tokens: totalCacheTokens, cost: Math.round(totalCacheTokens * 0.000001) },
      compression: { tokens: compTokens, cost: Math.round(compTokens * 0.000001) },
      routing: { tokens: 0, cost: 0 }, // 路由节省较难直接量化
    };
  }
}

let _dailyStats: DailyStatsEngine | null = null;
export function getDailyStatsEngine(): DailyStatsEngine {
  if (!_dailyStats) _dailyStats = new DailyStatsEngine();
  return _dailyStats;
}
export function resetDailyStatsEngine(): void { _dailyStats = null; }
