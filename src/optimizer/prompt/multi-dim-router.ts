/**
 * Nexus LLM Gateway - Multi-Dimension Router（多维路由器）
 *
 * Layer 2.2: 基于 Intent + Cost + Quality + Latency 的综合路由。
 *
 * 公式：
 *   Score = w1 * IntentMatch + w2 * (1 - Cost/MaxCost) + w3 * Quality + w4 * (1 - Latency/MaxLatency)
 *
 * 支持：
 * - 历史数据驱动的自动权重调整
 * - 路由决策记录
 * - 基于反馈自动调整权重
 */
import type { ProviderType } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

export interface RouteOption {
  provider: ProviderType;
  model: string;
  cost: number;          // 预估成本 USD
  quality: number;       // 0-1
  latency: number;       // 预估延迟 ms
  intentMatch: number;   // 意图匹配度 0-1
}

export interface RouteDecision {
  selected: RouteOption;
  candidates: RouteOption[];
  reason: string;
  weights: { intent: number; cost: number; quality: number; latency: number };
  timestamp: number;
}

export class MultiDimRouter {
  private weights = { intent: 0.3, cost: 0.3, quality: 0.25, latency: 0.15 };
  private decisionHistory: RouteDecision[] = [];
  private feedbackScores = new Map<string, number[]>();

  /** 选择最优路由 */
  select(options: RouteOption[]): RouteDecision | null {
    if (options.length === 0) return null;

    const maxCost = Math.max(...options.map((o) => o.cost), 0.001);
    const maxLatency = Math.max(...options.map((o) => o.latency), 1);

    const scored = options.map((o) => ({
      option: o,
      score:
        this.weights.intent * o.intentMatch +
        this.weights.cost * (1 - o.cost / maxCost) +
        this.weights.quality * o.quality +
        this.weights.latency * (1 - o.latency / maxLatency),
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]!;

    const decision: RouteDecision = {
      selected: best.option,
      candidates: options,
      reason: `score=${best.score.toFixed(3)} (intent=${(best.option.intentMatch * 100).toFixed(0)}% cost=$${best.option.cost.toFixed(6)} quality=${(best.option.quality * 100).toFixed(0)}% latency=${best.option.latency}ms)`,
      weights: { ...this.weights },
      timestamp: Date.now(),
    };

    this.decisionHistory.push(decision);
    if (this.decisionHistory.length > 100) this.decisionHistory.shift();

    logger.info({ provider: best.option.provider, model: best.option.model, score: best.score }, "multi-dim router: selected");
    return decision;
  }

  /** 记录用户反馈，自动调整权重 */
  recordFeedback(provider: ProviderType, model: string, score: number): void {
    const key = `${provider}:${model}`;
    const scores = this.feedbackScores.get(key) ?? [];
    scores.push(score);
    if (scores.length > 50) scores.shift();
    this.feedbackScores.set(key, scores);

    // 自动调整权重
    this.adjustWeights();
  }

  private adjustWeights(): void {
    // 基于反馈质量调整 quality 权重
    let totalFeedback = 0;
    let avgQuality = 0;
    for (const scores of this.feedbackScores.values()) {
      totalFeedback += scores.length;
      avgQuality += scores.reduce((a, b) => a + b, 0);
    }
    if (totalFeedback > 0) {
      avgQuality /= totalFeedback;
      // 质量反馈高 → 增加 quality 权重
      this.weights.quality = 0.25 + (avgQuality - 0.5) * 0.2;
      this.normalizeWeights();
    }
  }

  private normalizeWeights(): void {
    const sum = this.weights.intent + this.weights.cost + this.weights.quality + this.weights.latency;
    if (sum > 0) {
      this.weights.intent /= sum;
      this.weights.cost /= sum;
      this.weights.quality /= sum;
      this.weights.latency /= sum;
    }
  }

  /** 获取路由决策历史 */
  getHistory(limit = 20): RouteDecision[] {
    return this.decisionHistory.slice(-limit).reverse();
  }

  /** 获取当前权重 */
  getWeights() {
    return { ...this.weights };
  }

  /** 手动设置权重 */
  setWeights(w: Partial<{ intent: number; cost: number; quality: number; latency: number }>): void {
    Object.assign(this.weights, w);
    this.normalizeWeights();
  }
}

let _router: MultiDimRouter | null = null;
export function getMultiDimRouter(): MultiDimRouter {
  if (!_router) _router = new MultiDimRouter();
  return _router;
}
export function resetMultiDimRouter(): void { _router = null; }
