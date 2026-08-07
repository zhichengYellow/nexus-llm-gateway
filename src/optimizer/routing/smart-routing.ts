/**
 * Nexus LLM Gateway - Smart Routing（智能路由引擎）
 *
 * 整合画像数据 + 动态价格表 + 路由决策记录 + 降级策略配置
 */
import type { ProviderType } from "../../shared/types.js";
import { getMultiDimRouter, type RouteOption } from "../prompt/multi-dim-router.js";
import { getCostEstimator } from "../cost/cost-controller.js";
import { getIntentLearner } from "../prompt/intent-learning.js";
import { getRegistry } from "../../providers/registry.js";
import { logger } from "../../shared/logger.js";

export interface RoutingProfile {
  intentDistribution: Record<string, number>;
  preferredProviders: Record<string, number>;
  avgLatencyByProvider: Record<string, number>;
  costSensitivity: number; // 0-1
}

export interface DegradationStrategy {
  type: "none" | "cheap_only" | "fallback" | "cache_only";
  maxCost: number;
  maxLatency: number;
  minQuality: number;
}

export interface RoutingDecision {
  provider: ProviderType;
  model: string;
  reason: string;
  cost: number;
  estimatedLatency: number;
  confidence: number;
  degraded: boolean;
}

export class SmartRoutingEngine {
  private profile: RoutingProfile = {
    intentDistribution: {},
    preferredProviders: {},
    avgLatencyByProvider: {},
    costSensitivity: 0.5,
  };

  private degradation: DegradationStrategy = {
    type: "none",
    maxCost: Infinity,
    maxLatency: Infinity,
    minQuality: 0,
  };

  private decisions: RoutingDecision[] = [];

  /** 更新路由画像 */
  updateProfile(profile: Partial<RoutingProfile>): void {
    Object.assign(this.profile, profile);
  }

  /** 从 IntentLearner 同步画像 */
  syncFromLearner(): void {
    const learner = getIntentLearner();
    this.profile.intentDistribution = learner.getDistribution();
  }

  /** 设置降级策略 */
  setDegradation(strategy: Partial<DegradationStrategy>): void {
    Object.assign(this.degradation, strategy);
    logger.info({ strategy: this.degradation }, "degradation strategy updated");
  }

  /** 获取降级策略 */
  getDegradation(): DegradationStrategy {
    return { ...this.degradation };
  }

  /**
   * 智能路由决策
   */
  decide(intent: string, budget?: number, available?: Set<ProviderType>): RoutingDecision {
    const router = getMultiDimRouter();
    const estimator = getCostEstimator();

    // 构建候选列表：从 registry 获取实际模型，从 estimator 获取价格
    const registry = getRegistry();
    const allModels = registry.listAllModels();
    const candidates: RouteOption[] = allModels
      .filter((m) => !available || m.owned_by ? available?.has(m.owned_by as ProviderType) : true)
      .map((m) => {
        const price = estimator.getPrice(m.owned_by as ProviderType, m.id) ?? {
          inputPrice: 0,
          outputPrice: 0,
          provider: m.owned_by as ProviderType,
          model: m.id,
        } as any;
        // 意图匹配度（基于画像）
        const intentMatch = this.profile.intentDistribution[intent] ?? 0.3;
        const preference = this.profile.preferredProviders[m.owned_by] ?? 0.5;
        return {
          provider: m.owned_by as ProviderType,
          model: m.id,
          cost: (price.inputPrice + price.outputPrice) / 2_000_000,
          quality: Math.max(0.5, preference),
          latency: this.profile.avgLatencyByProvider[m.owned_by] ?? 500,
          intentMatch: Math.max(0.3, intentMatch),
        };
      });

    // 候选为空时 → registry 降级兜底（去掉 available 过滤）
    if (candidates.length === 0) {
      candidates.push(
        ...allModels.map((m) => {
          const provider = m.owned_by as ProviderType;
          const price = estimator.getPrice(provider, m.id) ?? { inputPrice: 0, outputPrice: 0, provider, model: m.id } as any;
          return {
            provider,
            model: m.id,
            cost: (price.inputPrice + price.outputPrice) / 2_000_000,
            quality: 0.5,
            latency: this.profile.avgLatencyByProvider[provider] ?? 500,
            intentMatch: 0.3,
          };
        }),
      );
    }

    // 降级过滤
    let filtered = candidates;
    let degraded = false;
    let constraintRelaxed = false;

    if (this.degradation.type === "cheap_only") {
      filtered = candidates.filter((c) => c.cost <= this.degradation.maxCost);
      if (filtered.length === 0) {
        // cheap_only 过滤后为空 → 选 cost 最低的候选（不选超 maxCost 的）
        const sorted = [...candidates].sort((a, b) => a.cost - b.cost);
        filtered = sorted.slice(0, 1);
        constraintRelaxed = true;
        logger.warn({ maxCost: this.degradation.maxCost, cheapest: filtered[0]?.cost }, "cheap_only: all candidates exceed maxCost, selecting cheapest");
      }
      degraded = true;
    } else if (this.degradation.type === "cache_only") {
      // 只返回缓存，不调 LLM
      degraded = true;
    } else if (this.degradation.type === "fallback") {
      filtered = candidates.filter(
        (c) => c.latency <= this.degradation.maxLatency && c.quality >= this.degradation.minQuality,
      );
      if (filtered.length === 0) {
        // fallback 过滤后为空 → 选延迟最低的
        const sorted = [...candidates].sort((a, b) => a.latency - b.latency);
        filtered = sorted.slice(0, 1);
        constraintRelaxed = true;
      }
      degraded = true;
    }

    // 预算过滤
    if (budget && budget > 0) {
      const budgetFiltered = filtered.filter((c) => c.cost <= budget);
      if (budgetFiltered.length === 0) {
        // 预算过滤后为空 → 返回明确错误或选最低成本候选
        const cheapest = [...filtered].sort((a, b) => a.cost - b.cost)[0];
        if (cheapest) {
          filtered = [cheapest];
          constraintRelaxed = true;
          logger.warn({ budget, cheapest: cheapest.cost }, "budget exceeded, selecting cheapest candidate");
        }
      } else {
        filtered = budgetFiltered;
      }
    }

    // 多维路由选择（不再回退到未过滤 candidates）
    const decision = router.select(filtered);

    // 候选为空时从 registry 真实可用 provider 降级（不硬编码）
    let fallbackProvider = "unknown";
    let fallbackModel = "unknown";
    if (!decision || !decision.selected) {
      const reg = getRegistry();
      const availableProviders = reg.registeredProviders();
      if (availableProviders.length > 0) {
        const firstProv = availableProviders[0]!;
        const aliases = reg.listAllAliases().filter((a) => {
          try { const r = reg.resolve(a); return r.providerType === firstProv; } catch { return false; }
        });
        fallbackProvider = firstProv;
        fallbackModel = aliases.length > 0 ? aliases[0]! : "unknown";
        logger.warn({ fallbackProvider, fallbackModel, candidates: candidates.length }, "smart-routing: no candidates, falling back to available provider");
      }
    }

    const result: RoutingDecision = {
      provider: (decision?.selected.provider ?? fallbackProvider) as ProviderType,
      model: decision?.selected.model ?? fallbackModel,
      reason: decision?.reason ?? (constraintRelaxed ? "constraint-relaxed-fallback" : fallbackProvider !== "unknown" ? "fallback-to-available" : "default"),
      cost: decision?.selected.cost ?? 0,
      estimatedLatency: decision?.selected.latency ?? 500,
      confidence: decision?.selected.intentMatch ?? 0.5,
      degraded: degraded || constraintRelaxed,
    };

    this.decisions.push(result);
    if (this.decisions.length > 100) this.decisions.shift();

    return result;
  }

  /** 获取路由决策历史 */
  getDecisionHistory(limit = 20): RoutingDecision[] {
    return this.decisions.slice(-limit).reverse();
  }

  /** 动态更新价格表 */
  updatePrice(provider: ProviderType, model: string, inputPrice: number, outputPrice: number): void {
    const estimator = getCostEstimator();
    estimator.updatePrice({ provider, model, inputPrice, outputPrice });
    logger.info({ provider, model, inputPrice, outputPrice }, "price updated");
  }

  /** 记录路由反馈，自动优化 */
  recordFeedback(provider: ProviderType, model: string, success: boolean, latencyMs: number): void {
    // 更新 Provider 偏好
    const currentPref = this.profile.preferredProviders[provider] ?? 0.5;
    const adjustment = success ? 0.05 : -0.1;
    this.profile.preferredProviders[provider] = Math.max(0.1, Math.min(1, currentPref + adjustment));

    // 更新延迟统计
    const currentLat = this.profile.avgLatencyByProvider[provider] ?? latencyMs;
    this.profile.avgLatencyByProvider[provider] = currentLat * 0.7 + latencyMs * 0.3;

    // 反馈给多维路由器
    getMultiDimRouter().recordFeedback(provider, model, success ? 0.8 : 0.2);
  }

  /** 获取路由统计 */
  getStats() {
    const total = this.decisions.length;
    const degraded = this.decisions.filter((d) => d.degraded).length;
    return {
      totalDecisions: total,
      degradedRate: total > 0 ? degraded / total : 0,
      currentDegradation: this.degradation.type,
      profile: {
        intents: Object.keys(this.profile.intentDistribution).length,
        providers: Object.keys(this.profile.preferredProviders).length,
      },
    };
  }
}

let _smartRouting: SmartRoutingEngine | null = null;
export function getSmartRoutingEngine(): SmartRoutingEngine {
  if (!_smartRouting) _smartRouting = new SmartRoutingEngine();
  return _smartRouting;
}
export function resetSmartRoutingEngine(): void { _smartRouting = null; }
