/**
 * Nexus LLM Gateway - Savings Attribution（节省归因）
 *
 * 从 usage_logs 单行记录派生「节省来源」，避免不同模块重复累加（double counting）。
 * 归因优先级（与实际 pipeline 顺序一致，互斥）：
 *   1. CACHE       —— cached=true：请求未发生上游调用，全部节省归缓存
 *   2. COMPRESSION —— compressionRatio > 0 且 savedTokens > 0（非缓存）：压缩节省
 *   3. ROUTING     —— 非缓存非压缩，但 routerReason 体现成本/档位决策（标注 estimated）
 *   4. NONE        —— 无优化
 *
 * 语义：ACTUAL = 真实避免的上游 token（CACHE/COMPRESSION）；ESTIMATED = 基于决策推算（ROUTING）。
 */
export type SavingsSource = "CACHE" | "COMPRESSION" | "ROUTING" | "REWRITE" | "DEDUP" | "MULTI" | "NONE";

export interface UsageRowLike {
  cached?: boolean;
  /** SingleFlight 去重等待者（共享了在途上游请求） */
  deduped?: boolean;
  compressionRatio?: number | null;
  savedTokens?: number | null;
  savedCostMicro?: number | null;
  routerReason?: string | null;
}

export interface SavingsAttribution {
  source: SavingsSource;
  savedTokens: number;
  savedCostMicro: number;
  /** ACTUAL = 真实避免的上游 token；ESTIMATED = 基于决策/基线推算 */
  kind: "ACTUAL" | "ESTIMATED";
}

const ROUTING_HINTS = /cost|cheap|cheapest|budget|save|quality|score/i;

/** 从 usage 记录行派生节省来源（互斥，不重复计数） */
export function attributeSavings(row: UsageRowLike): SavingsAttribution {
  const savedTokens = row.savedTokens ?? 0;
  const savedCostMicro = row.savedCostMicro ?? 0;

  // 1. SingleFlight 去重等待者：未打上游（共享在途请求），语义上避免了一次上游调用，但节省已由 origin 请求记录（不重复计费）
  if (row.deduped) {
    return { source: "DEDUP", savedTokens: 0, savedCostMicro: 0, kind: "ACTUAL" };
  }

  // 2. 缓存命中：未发生上游调用，全部节省归缓存（ACTUAL）
  if (row.cached) {
    return { source: "CACHE", savedTokens, savedCostMicro, kind: "ACTUAL" };
  }

  // 3. 压缩节省（ACTUAL）——压缩是真实 token 节省；若同时有路由决策，压缩仍占主（MULTI 枚举保留用于标注，不改变互斥）
  if ((row.compressionRatio ?? 0) > 0 && savedTokens > 0) {
    return { source: "COMPRESSION", savedTokens, savedCostMicro, kind: "ACTUAL" };
  }

  // 5. 路由决策（ESTIMATED：基于 baseline model 推算，非真实上游差值）
  if (savedTokens > 0 && row.routerReason && ROUTING_HINTS.test(row.routerReason)) {
    return { source: "ROUTING", savedTokens, savedCostMicro, kind: "ESTIMATED" };
  }

  // 6. 无优化（savedTokens 可能为 0 或无法归因的残值——残值不再累加，避免膨胀）
  return { source: savedTokens > 0 ? "REWRITE" : "NONE", savedTokens: savedTokens > 0 ? savedTokens : 0, savedCostMicro: 0, kind: "ACTUAL" };
}

/** 多行汇总：按来源分组（CACHE / COMPRESSION / ROUTING / REWRITE / OTHER） */
export function summarizeSavings(rows: UsageRowLike[]): Record<SavingsSource, { tokens: number; costMicro: number }> {
  const out: Record<string, { tokens: number; costMicro: number }> = {
    CACHE: { tokens: 0, costMicro: 0 },
    COMPRESSION: { tokens: 0, costMicro: 0 },
    ROUTING: { tokens: 0, costMicro: 0 },
    REWRITE: { tokens: 0, costMicro: 0 },
    DEDUP: { tokens: 0, costMicro: 0 },
    MULTI: { tokens: 0, costMicro: 0 },
    NONE: { tokens: 0, costMicro: 0 },
  };
  for (const row of rows) {
    const a = attributeSavings(row);
    const bucket = (out[a.source] ?? { tokens: 0, costMicro: 0 });
    bucket.tokens += a.savedTokens;
    bucket.costMicro += a.savedCostMicro;
    out[a.source] = bucket;
  }
  return out;
}
