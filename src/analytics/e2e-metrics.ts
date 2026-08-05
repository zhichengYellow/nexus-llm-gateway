/**
 * Nexus LLM Gateway - E2E Metrics（端到端 TRR/CSR/QPS 测量）
 *
 * R4.2: 在请求链路中注入测量点，计算全链路压缩前/后的真实 TRR、CSR、QPS。
 *
 * 测量点：
 * - entry: 原始 prompt tokens（压缩前）
 * - after_compress: 压缩/优化后 tokens
 * - after_response: 实际输出 tokens + 成本
 * - after_judge: 质量评分
 *
 * 计算公式：
 * - TRR = (entryTokens - optimizedTokens) / entryTokens
 * - CSR = savedCost / totalCost
 * - QPS = avg quality score
 */

import { db } from "../server/db/client.js";
import { optimizationStats } from "../server/db/schema.js";
import { logger } from "../shared/logger.js";

export interface MetricPoint {
  requestId: string;
  timestamp: number;
  /** 原始 prompt tokens */
  entryTokens: number;
  /** 优化后 tokens */
  optimizedTokens: number;
  /** 响应输出 tokens */
  outputTokens: number;
  /** 总成本（micro） */
  totalCostMicro: number;
  /** 节省成本（micro） */
  savedCostMicro: number;
  /** 质量评分 */
  qualityScore: number;
  /** 延迟 ms */
  latencyMs: number;
  /** 节省来源 */
  savingsBreakdown: {
    compression: number;
    cache: number;
    routing: number;
  };
}

export interface E2EMetrics {
  /** Token Reduction Rate */
  trr: number;
  /** Cost Saving Rate */
  csr: number;
  /** Quality Preservation Score */
  qps: number;
  /** 原始 tokens */
  entryTokens: number;
  /** 优化后 tokens */
  optimizedTokens: number;
  /** 总节省 tokens */
  savedTokens: number;
  /** 总成本 */
  totalCostMicro: number;
  /** 节省成本 */
  savedCostMicro: number;
  /** 请求总数 */
  requestCount: number;
  /** 平均质量分 */
  avgQualityScore: number;
  /** 平均延迟 */
  avgLatencyMs: number;
}

export class E2EMetricsCollector {
  private points: MetricPoint[] = [];
  private maxPoints = 1000;
  private persistEnabled = true;

  /**
   * 记录一个测量点
   */
  record(point: MetricPoint): void {
    this.points.push(point);
    if (this.points.length > this.maxPoints) this.points.shift();

    // 异步持久化到 optimizationStats 表
    if (this.persistEnabled) {
      this.persist(point).catch((e) =>
        logger.warn({ err: (e as Error).message }, "e2e metrics persist failed"),
      );
    }
  }

  /**
   * 计算当前窗口内 TRR/CSR/QPS
   */
  compute(windowMs = 3600_000): E2EMetrics {
    const cutoff = Date.now() - windowMs;
    const windowPoints = this.points.filter((p) => p.timestamp >= cutoff);

    if (windowPoints.length === 0) {
      return {
        trr: 0, csr: 0, qps: 1,
        entryTokens: 0, optimizedTokens: 0, savedTokens: 0,
        totalCostMicro: 0, savedCostMicro: 0,
        requestCount: 0, avgQualityScore: 0, avgLatencyMs: 0,
      };
    }

    let entryTokens = 0, optimizedTokens = 0, outputTokens = 0;
    let totalCost = 0, savedCost = 0;
    let totalQuality = 0, totalLatency = 0;

    for (const p of windowPoints) {
      entryTokens += p.entryTokens;
      optimizedTokens += p.optimizedTokens;
      outputTokens += p.outputTokens;
      totalCost += p.totalCostMicro;
      savedCost += p.savedCostMicro;
      totalQuality += p.qualityScore;
      totalLatency += p.latencyMs;
    }

    const count = windowPoints.length;
    const saved = entryTokens - optimizedTokens;

    return {
      trr: entryTokens > 0 ? saved / entryTokens : 0,
      csr: totalCost > 0 ? savedCost / totalCost : 0,
      qps: count > 0 ? totalQuality / count : 1,
      entryTokens,
      optimizedTokens,
      savedTokens: Math.max(0, saved),
      totalCostMicro: totalCost,
      savedCostMicro: Math.max(0, savedCost),
      requestCount: count,
      avgQualityScore: count > 0 ? totalQuality / count : 0,
      avgLatencyMs: count > 0 ? Math.round(totalLatency / count) : 0,
    };
  }

  /**
   * 获取最近 N 个测量点的摘要
   */
  getRecentPoints(limit = 20): MetricPoint[] {
    return this.points.slice(-limit).reverse();
  }

  /**
   * 持久化到 optimizationStats 表
   */
  private async persist(point: MetricPoint): Promise<void> {
    const trr = point.entryTokens > 0
      ? (point.entryTokens - point.optimizedTokens) / point.entryTokens
      : 0;
    const csr = point.totalCostMicro > 0
      ? point.savedCostMicro / point.totalCostMicro
      : 0;

    await db.insert(optimizationStats).values({
      date: new Date().toISOString().slice(0, 10),
      trr,
      csr,
      qps: point.qualityScore,
      entryTokens: point.entryTokens,
      optimizedTokens: point.optimizedTokens,
      savedTokens: point.entryTokens - point.optimizedTokens,
      totalCostMicro: point.totalCostMicro,
      savedCostMicro: point.savedCostMicro,
      requestCount: 1,
      avgLatencyMs: point.latencyMs,
    } as any).catch(() => undefined);
  }

  /** 清空内存记录 */
  reset(): void {
    this.points = [];
  }

  /** 禁用持久化（测试用） */
  disablePersistence(): void {
    this.persistEnabled = false;
  }
}

let _collector: E2EMetricsCollector | null = null;
export function getE2ECollector(): E2EMetricsCollector {
  if (!_collector) _collector = new E2EMetricsCollector();
  return _collector;
}
export function resetE2ECollector(): void { _collector = null; }
