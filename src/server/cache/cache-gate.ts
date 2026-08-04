/**
 * Nexus LLM Gateway - Cache Gate（缓存门控）
 *
 * 集成 cache-confidence.ts 到缓存链路：
 * - 查找缓存 → confidence 评估 → 决定是否返回/刷新/重新生成
 *
 * 决策逻辑：
 * - confidence >= 0.9 → 直接返回缓存
 * - 0.7 <= confidence < 0.9 → 返回缓存 + 异步刷新
 * - confidence < 0.7 → 跳过缓存，重新生成
 */
import { getCacheConfidence } from "../cache/cache-confidence.js";
import { getSemanticCache } from "../cache/semantic-cache.js";
import { logger } from "../../shared/logger.js";
import type { ChatCompletionRequest } from "../../shared/types.js";

export interface CacheGateResult {
  /** 是否命中缓存 */
  hit: boolean;
  /** 缓存响应 */
  response?: any;
  /** 是否需要异步刷新 */
  asyncRefresh: boolean;
  /** 置信度 */
  confidence: number;
  /** 决策原因 */
  reason: string;
}

export class CacheGate {
  /**
   * 缓存门控：决定是否使用缓存
   */
  async evaluate(
    req: ChatCompletionRequest,
    model: string,
    provider: string,
  ): Promise<CacheGateResult> {
    const cache = getSemanticCache();
    const confidence = getCacheConfidence();

    // 查找缓存
    const cacheResult = await cache.lookup(req, model, provider);
    if (!cacheResult.hit || !cacheResult.response) {
      return { hit: false, asyncRefresh: false, confidence: 0, reason: "cache miss" };
    }

    // 获取缓存条目信息
    const entry = await cache.getEntry(cacheResult.hash ?? "");
    if (!entry) {
      return { hit: false, asyncRefresh: false, confidence: 0, reason: "cache entry not found" };
    }

    // 置信度评估
    const evalResult = confidence.evaluate({
      createdAt: entry.createdAt ? new Date(entry.createdAt).getTime() : Date.now(),
      lastAccessedAt: entry.lastAccessedAt ? new Date(entry.lastAccessedAt).getTime() : null,
      hits: entry.hits ?? 0,
      ttl: entry.ttl ?? 86400,
    });

    const useCache = evalResult.confidence >= 0.7;
    const asyncRefresh = evalResult.confidence >= 0.7 && evalResult.confidence < 0.9;

    logger.debug({
      confidence: evalResult.confidence,
      useCache,
      asyncRefresh,
      factors: evalResult.factors,
    }, "cache gate: decision");

    return {
      hit: useCache,
      response: cacheResult.response,
      asyncRefresh,
      confidence: evalResult.confidence,
      reason: evalResult.reason,
    };
  }

  /**
   * 简单判断：是否应该使用缓存
   */
  async shouldUseCache(req: ChatCompletionRequest, model: string, provider: string): Promise<boolean> {
    const result = await this.evaluate(req, model, provider);
    return result.hit;
  }
}

let _gate: CacheGate | null = null;
export function getCacheGate(): CacheGate {
  if (!_gate) _gate = new CacheGate();
  return _gate;
}
export function resetCacheGate(): void { _gate = null; }
