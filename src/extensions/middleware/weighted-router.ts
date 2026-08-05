/**
 * Nexus LLM Gateway - 加权路由（Weight Routing）
 *
 * 支持两种模式：
 * 1. 多 Provider 加权：同一模型别名可映射到多条路径，按权重分发
 *    routes: { "gpt-4o": [ {provider:"openai",weight:50}, {provider:"deepseek",weight:30}, ... ] }
 * 2. 熔断感知：已熔断的 provider 自动剔除，流量自动落到健康 provider
 *
 * 用法：
 *   const route = routes["deepseek-v4-flash"];  // [{provider,weight},...]
 *   const picked = weightedPicker(route, breakerRegistry);
 *   // → { provider: "openai", ... }（已跳过 OPEN 状态的）
 */
import type { ProviderType } from "../../shared/types.js";
import { getCircuitBreakerRegistry, type CircuitBreakerRegistry } from "../../server/middleware/circuit-breaker.js";

export interface WeightedShard {
  provider: ProviderType;
  upstreamModel: string;
  weight: number;
}

/** 加权随机挑选（忽略已熔断的，fallback 到剩余健康分片）。无可用返回 null */
export function weightedPicker(
  shards: WeightedShard[],
  breakers: CircuitBreakerRegistry = getCircuitBreakerRegistry(),
): WeightedShard | null {
  const healthy = shards.filter((s) => breakers.get(`${s.provider}:${s.upstreamModel}`).allowRequest());
  if (healthy.length === 0) return null;

  const total = healthy.reduce((acc, s) => acc + s.weight, 0);
  let r = Math.random() * total;
  for (const s of healthy) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  // 随机数接近 total 的边界兜底：返回最后一个（防御 undefined）
  return healthy[healthy.length - 1] ?? null;
}

/**
 * 构建带权重的调度链：主分片按权重选出一个，其余作为 fallback 链（按权重降序）
 * 返回 [picked, ...fallbacks]
 */
export function buildWeightedChain(
  shards: WeightedShard[],
  breakers: CircuitBreakerRegistry = getCircuitBreakerRegistry(),
): Array<{ provider: ProviderType; upstreamModel: string }> {
  const picked = weightedPicker(shards, breakers);
  if (!picked) return [];

  // fallback = 去掉被选中的 + 非熔断的，按权重降序
  const fallbacks = shards
    .filter((s) => s !== picked && breakers.get(`${s.provider}:${s.upstreamModel}`).allowRequest())
    .sort((a, b) => b.weight - a.weight)
    .map((s) => ({ provider: s.provider as ProviderType, upstreamModel: s.upstreamModel }));

  return [{ provider: picked.provider, upstreamModel: picked.upstreamModel }, ...fallbacks];
}