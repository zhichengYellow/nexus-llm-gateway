/**
 * Nexus LLM Gateway - Cost Optimizer（成本优化器）
 *
 * 目的：model=auto 时，在候选 Provider 中选择性价比最高的。
 *
 * 决策因子：
 * - Token 估算（基于文本长度）
 * - Provider 价格表（per 1M tokens）
 * - 历史成功率
 * - 租户预算
 *
 * 公式：
 *   Score = Quality × 0.5 + Latency × 0.3 + Cost × 0.2（越低越好）
 */
import type { ProviderType } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

/** Provider 价格（每百万 token，美元） */
export interface ProviderPrice {
  provider: ProviderType;
  model: string;
  inputPrice: number;    // 每 1M input tokens
  outputPrice: number;   // 每 1M output tokens
}

/** 候选 Provider */
export interface Candidate {
  provider: ProviderType;
  model: string;
  price: ProviderPrice;
  successRate: number;   // 0-1
  avgLatencyMs: number;
}

export interface OptimizeResult {
  provider: ProviderType;
  model: string;
  estimatedCost: number;  // 美元
  score: number;
  reason: string;
}

/** 默认价格表（per 1M tokens, USD） */
const DEFAULT_PRICES: ProviderPrice[] = [
  { provider: "deepseek", model: "deepseek-chat", inputPrice: 0.27, outputPrice: 1.10 },
  { provider: "deepseek", model: "deepseek-reasoner", inputPrice: 0.55, outputPrice: 2.19 },
  { provider: "gemini", model: "gemini-flash-lite-latest", inputPrice: 0.075, outputPrice: 0.30 },
  { provider: "gemini", model: "gemini-2.0-flash", inputPrice: 0.10, outputPrice: 0.40 },
  { provider: "openai", model: "gpt-4o-mini", inputPrice: 0.15, outputPrice: 0.60 },
  { provider: "openai", model: "gpt-4o", inputPrice: 2.50, outputPrice: 10.00 },
  { provider: "qwen", model: "qwen-max", inputPrice: 2.80, outputPrice: 11.20 },
  { provider: "qwen", model: "qwen-plus", inputPrice: 0.55, outputPrice: 2.20 },
  { provider: "qwen", model: "qwen-turbo", inputPrice: 0.27, outputPrice: 0.83 },
  { provider: "moonshot", model: "kimi-k2", inputPrice: 12.00, outputPrice: 12.00 },
  { provider: "zhipu", model: "glm-4-flash", inputPrice: 0, outputPrice: 0 },
];

/**
 * Cost Optimizer
 */
export class CostOptimizer {
  private prices: ProviderPrice[];
  /** 历史指标缓存 */
  private metrics = new Map<string, { successRate: number; avgLatencyMs: number }>();

  constructor(prices?: ProviderPrice[]) {
    this.prices = prices ?? DEFAULT_PRICES;
  }

  /** 更新 Provider 价格 */
  updatePrice(price: ProviderPrice): void {
    const idx = this.prices.findIndex((p) => p.provider === price.provider && p.model === price.model);
    if (idx >= 0) {
      this.prices[idx] = price;
    } else {
      this.prices.push(price);
    }
  }

  /** 更新历史指标 */
  updateMetrics(provider: ProviderType, model: string, successRate: number, avgLatencyMs: number): void {
    this.metrics.set(`${provider}:${model}`, { successRate, avgLatencyMs });
  }

  /** 估算 token 数（4 字符 ≈ 1 token） */
  estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  /**
   * 估算请求成本
   * @returns 预估成本（美元）
   */
  estimateCost(
    prompt: string,
    provider: ProviderType,
    model: string,
    estimatedOutputTokens = 200,
  ): number {
    const price = this.prices.find((p) => p.provider === provider && p.model === model);
    if (!price) return 0;

    const inputTokens = this.estimateTokens(prompt);
    const inputCost = (inputTokens / 1_000_000) * price.inputPrice;
    const outputCost = (estimatedOutputTokens / 1_000_000) * price.outputPrice;

    return inputCost + outputCost;
  }

  /**
   * 选择最优 Provider
   * @param prompt 用户输入
   * @param candidates 候选 Provider 列表
   * @param budget 预算上限（美元，0 表示不限制）
   */
  optimize(
    prompt: string,
    candidates: Array<{ provider: ProviderType; model: string }>,
    budget = 0,
  ): OptimizeResult | null {
    if (candidates.length === 0) return null;

    const scored: Array<OptimizeResult & { _score: number }> = [];

    for (const c of candidates) {
      const cost = this.estimateCost(prompt, c.provider, c.model);

      // 预算检查
      if (budget > 0 && cost > budget) continue;

      const metrics = this.metrics.get(`${c.provider}:${c.model}`);
      const successRate = metrics?.successRate ?? 0.95; // 默认 95%
      const avgLatency = metrics?.avgLatencyMs ?? 1000;

      // Score = 0.5 × (1 - cost_normalized) + 0.3 × successRate + 0.2 × (1 - latency_normalized)
      const maxCost = 0.01; // 归一化基准 $0.01
      const costScore = Math.max(0, 1 - cost / maxCost);
      const latencyScore = Math.max(0, 1 - avgLatency / 5000);
      const score = 0.5 * costScore + 0.3 * successRate + 0.2 * latencyScore;

      scored.push({
        provider: c.provider,
        model: c.model,
        estimatedCost: cost,
        score,
        reason: `cost=$${cost.toFixed(6)} success=${(successRate * 100).toFixed(0)}% latency=${avgLatency}ms`,
        _score: score,
      });
    }

    if (scored.length === 0) return null;

    // 按 score 降序
    scored.sort((a, b) => b._score - a._score);

    const best = scored[0]!;
    logger.info({ provider: best.provider, model: best.model, score: best.score.toFixed(3), cost: best.estimatedCost }, "cost optimizer: best candidate");

    return {
      provider: best.provider,
      model: best.model,
      estimatedCost: best.estimatedCost,
      score: best.score,
      reason: best.reason,
    };
  }
}

/** 全局单例 */
let _optimizer: CostOptimizer | null = null;

export function getCostOptimizer(): CostOptimizer {
  if (!_optimizer) _optimizer = new CostOptimizer();
  return _optimizer;
}

export function resetCostOptimizer(): void {
  _optimizer = null;
}
