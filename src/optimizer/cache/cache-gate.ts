/**
 * Nexus LLM Gateway - Cache Gate（缓存门控 v2）
 *
 * Semantic Cache 2.0 三级判断：
 * 1. EmbeddingScreener → TF-IDF 向量相似度初筛
 * 2. SemanticJudge → 语义等价判断
 * 3. CacheConfidence → 最终决策（直接返回 / 返回+异步刷新 / 重新生成）
 *
 * 决策逻辑：
 * - confidence >= 0.9 → 直接返回缓存
 * - 0.7 <= confidence < 0.9 → 返回缓存 + 异步刷新
 * - confidence < 0.7 → 跳过缓存，重新生成
 */
import { getCacheConfidence } from "../cache/cache-confidence.js";
import { getSemanticCache } from "../cache/semantic-cache.js";
import { getEmbeddingScreener } from "../cache/embedding-screener.js";
import { getSemanticJudge } from "../../extensions/judge/semantic-judge.js";
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
    tenantId?: string | null,
  ): Promise<CacheGateResult> {
    const cache = getSemanticCache();
    const confidence = getCacheConfidence();
    const screener = getEmbeddingScreener();
    const judge = getSemanticJudge();

    // Level 1 / R1.1: Embedding 相似度初筛
    const screening = await screener.screen(req, model, provider, tenantId);
    if (screening.candidates.length === 0) {
      return { hit: false, asyncRefresh: false, confidence: 0, reason: "embedding screening: no similar cache found" };
    }

    const topCandidate = screening.candidates[0]!;

    // 查找精确缓存
    const cacheResult = await cache.lookup(req, model, provider, tenantId);
    if (!cacheResult.hit || !cacheResult.response) {
      return { hit: false, asyncRefresh: false, confidence: 0, reason: "cache miss" };
    }

    // 获取缓存条目信息
    const entry = await cache.getEntry(cacheResult.hash ?? "");
    if (!entry) {
      return { hit: false, asyncRefresh: false, confidence: 0, reason: "cache entry not found" };
    }

    // Level 2: 语义等价判断
    const semanticResult = judge.isEquivalent(
      (req.messages as Array<{ role: string; content: string }>)
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join(" "),
      topCandidate.prompt,
    );

    // Level 3: Cache Confidence + 复合评分
    const createdAt = entry.createdAt ? new Date(entry.createdAt as any).getTime() : Date.now();
    const lastAccessedAt = entry.lastAccessedAt ? new Date(entry.lastAccessedAt as any).getTime() : null;
    const evalResult = confidence.evaluate({
      createdAt,
      lastAccessedAt,
      hits: entry.hits ?? 0,
      ttl: entry.ttl ?? 86400,
    });

    // 综合评分：embedding 0.3 + semantic 0.3 + cache confidence 0.4
    const combinedScore =
      topCandidate.similarity * 0.3 +
      semanticResult.score * 0.3 +
      evalResult.confidence * 0.4;

    const useCache = combinedScore >= 0.7;
    const asyncRefresh = combinedScore >= 0.7 && combinedScore < 0.9;

    logger.debug({
      embeddingScore: topCandidate.similarity,
      semanticScore: semanticResult.score,
      cacheConfidence: evalResult.confidence,
      combinedScore,
      useCache,
      asyncRefresh,
    }, "cache gate v2: three-level decision");

    return {
      hit: useCache,
      response: cacheResult.response,
      asyncRefresh,
      confidence: +(combinedScore.toFixed(4)),
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
