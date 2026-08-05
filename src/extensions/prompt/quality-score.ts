/**
 * Nexus LLM Gateway - Quality Score Router（质量评分路由）
 *
 * 目的：基于 Provider 的历史表现（质量、延迟、成本）动态评分，选择最优。
 *
 * 评分公式：
 *   Score = 0.5 × Quality + 0.3 × Latency + 0.2 × Cost
 *
 * 其中：
 * - Quality：基于成功率、用户反馈
 * - Latency：P50/P95 延迟归一化
 * - Cost：价格归一化
 * - 历史数据带时间衰减（最近 1h 权重 1.0，24h 权重 0.5，7d 权重 0.2）
 */
import type { ProviderType } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

export interface QualityMetrics {
  provider: ProviderType;
  model: string;
  /** 总请求数 */
  totalRequests: number;
  /** 成功请求数 */
  successRequests: number;
  /** P50 延迟 (ms) */
  p50Latency: number;
  /** P95 延迟 (ms) */
  p95Latency: number;
  /** 平均每次成本 (USD) */
  avgCost: number;
  /** 最近更新时间 */
  updatedAt: number;
}

export interface ScoredProvider {
  provider: ProviderType;
  model: string;
  score: number;
  quality: number;
  latencyScore: number;
  costScore: number;
  metrics: QualityMetrics;
}

export class QualityScoreRouter {
  private metricsMap = new Map<string, QualityMetrics>();

  /** 记录请求结果 */
  record(provider: ProviderType, model: string, success: boolean, latencyMs: number, cost: number): void {
    const key = `${provider}:${model}`;
    let m = this.metricsMap.get(key);

    if (!m) {
      m = {
        provider,
        model,
        totalRequests: 0,
        successRequests: 0,
        p50Latency: latencyMs,
        p95Latency: latencyMs,
        avgCost: cost,
        updatedAt: Date.now(),
      };
      this.metricsMap.set(key, m);
    }

    m.totalRequests++;
    if (success) m.successRequests++;

    // 指数移动平均更新延迟
    const alpha = 0.3;
    m.p50Latency = m.p50Latency * (1 - alpha) + latencyMs * alpha;
    m.p95Latency = m.p95Latency * (1 - alpha) + latencyMs * 1.5 * alpha;

    // 指数移动平均更新成本
    m.avgCost = m.avgCost * (1 - alpha) + cost * alpha;
    m.updatedAt = Date.now();
  }

  /** 获取 Provider 的质量评分 */
  getQuality(provider: ProviderType, model: string): number {
    const m = this.metricsMap.get(`${provider}:${model}`);
    if (!m || m.totalRequests === 0) return 0.5; // 默认 0.5
    return m.successRequests / m.totalRequests;
  }

  /**
   * 计算 Provider 综合评分
   */
  score(provider: ProviderType, model: string): ScoredProvider | null {
    const key = `${provider}:${model}`;
    const m = this.metricsMap.get(key);

    const quality = this.getQuality(provider, model);

    // 延迟归一化（越低越好，基准 5000ms）
    const latency = m?.p50Latency ?? 1000;
    const latencyScore = Math.max(0, 1 - latency / 5000);

    // 成本归一化（越低越好，基准 $0.01）
    const cost = m?.avgCost ?? 0.001;
    const costScore = Math.max(0, 1 - cost / 0.01);

    // 时间衰减
    let timeDecay = 1.0;
    if (m) {
      const hoursSinceUpdate = (Date.now() - m.updatedAt) / 3600000;
      if (hoursSinceUpdate > 24) timeDecay = 0.2;
      else if (hoursSinceUpdate > 1) timeDecay = 0.5;
    }

    const score = (0.5 * quality + 0.3 * latencyScore + 0.2 * costScore) * timeDecay;

    return {
      provider,
      model,
      score,
      quality,
      latencyScore,
      costScore,
      metrics: m ?? {
        provider,
        model,
        totalRequests: 0,
        successRequests: 0,
        p50Latency: latency,
        p95Latency: latency * 1.5,
        avgCost: cost,
        updatedAt: Date.now(),
      },
    };
  }

  /**
   * 从候选中选择评分最高的
   */
  selectBest(candidates: Array<{ provider: ProviderType; model: string }>): ScoredProvider | null {
    let best: ScoredProvider | null = null;

    for (const c of candidates) {
      const s = this.score(c.provider, c.model);
      if (s && (!best || s.score > best.score)) {
        best = s;
      }
    }

    if (best) {
      logger.info({ provider: best.provider, model: best.model, score: best.score.toFixed(3) }, "quality score router: best");
    }

    return best;
  }

  /** 获取所有指标 */
  getAllMetrics(): QualityMetrics[] {
    return Array.from(this.metricsMap.values());
  }

  /** 清除旧指标（超过 7 天） */
  pruneOldMetrics(): void {
    const cutoff = Date.now() - 7 * 86400000;
    for (const [key, m] of this.metricsMap) {
      if (m.updatedAt < cutoff) {
        this.metricsMap.delete(key);
      }
    }
  }
}

/** 全局单例 */
let _qrouter: QualityScoreRouter | null = null;

export function getQualityScoreRouter(): QualityScoreRouter {
  if (!_qrouter) _qrouter = new QualityScoreRouter();
  return _qrouter;
}

export function resetQualityScoreRouter(): void {
  _qrouter = null;
}
