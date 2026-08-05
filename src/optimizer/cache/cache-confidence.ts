/**
 * Nexus LLM Gateway - Cache Confidence（缓存置信度评分）
 *
 * Phase 1 核心：为每条缓存记录计算 confidence 分数（0~1），
 * 低于阈值时重新生成而非直接返回缓存。
 *
 * 评分因子：
 * - age：缓存年龄（越旧越低）
 * - hits：命中次数（越多越高）
 * - category：问题类型（时效性问题降低）
 * - freshness：内容新鲜度（是否有实时信息）
 *
 * 阈值：
 * - confidence >= 0.9：直接返回缓存
 * - 0.7 <= confidence < 0.9：返回缓存 + 异步刷新
 * - confidence < 0.7：重新生成
 */

export interface ConfidenceResult {
  /** 置信度 0~1 */
  confidence: number;
  /** 是否建议使用缓存 */
  useCache: boolean;
  /** 是否建议异步刷新 */
  asyncRefresh: boolean;
  /** 各因子得分 */
  factors: {
    ageScore: number;
    hitsScore: number;
    categoryScore: number;
    freshnessScore: number;
  };
  reason: string;
}

export interface CacheEntry {
  /** 缓存创建时间 */
  createdAt: number;
  /** 最后访问时间 */
  lastAccessedAt: number | null;
  /** 命中次数 */
  hits: number;
  /** 缓存 TTL (秒) */
  ttl: number;
  /** 问题类别 */
  category?: string;
  /** 原始 TTL */
  originalTtl?: number;
}

export class CacheConfidence {
  /** 高置信度阈值 */
  private highThreshold: number;
  /** 低置信度阈值 */
  private lowThreshold: number;

  constructor(highThreshold = 0.9, lowThreshold = 0.7) {
    this.highThreshold = highThreshold;
    this.lowThreshold = lowThreshold;
  }

  /**
   * 计算缓存条目的置信度
   */
  evaluate(entry: CacheEntry): ConfidenceResult {
    const now = Date.now();
    const ageSeconds = (now - entry.createdAt) / 1000;

    // 1. 年龄评分：越旧越低
    const ageRatio = Math.min(ageSeconds / (entry.originalTtl ?? entry.ttl), 1);
    const ageScore = Math.max(0, 1 - ageRatio * 0.8);

    // 2. 命中评分：越多越高
    const hitsScore = Math.min(1, (entry.hits ?? 0) / 10);

    // 3. 类别评分：时效性问题降低
    let categoryScore = 1.0;
    const timeSensitiveCategories = ["price", "weather", "news", "politics"];
    if (entry.category && timeSensitiveCategories.includes(entry.category)) {
      // 时效性问题在超过 50% TTL 后大幅降分
      const ratio = ageSeconds / (entry.ttl || 86400);
      categoryScore = Math.max(0.1, 1 - ratio * 1.5);
    }

    // 4. 新鲜度评分：基于最后访问时间
    let freshnessScore = 0.5;
    if (entry.lastAccessedAt) {
      const idleSeconds = (now - entry.lastAccessedAt) / 1000;
      const idleRatio = Math.min(idleSeconds / (entry.ttl || 86400), 1);
      freshnessScore = Math.max(0.2, 1 - idleRatio);
    }

    // 加权综合
    const confidence =
      ageScore * 0.3 +
      hitsScore * 0.3 +
      categoryScore * 0.25 +
      freshnessScore * 0.15;

    const useCache = confidence >= this.lowThreshold;
    const asyncRefresh = confidence >= this.lowThreshold && confidence < this.highThreshold;

    const reason = confidence >= this.highThreshold
      ? `high confidence (${(confidence * 100).toFixed(0)}%), using cache`
      : confidence >= this.lowThreshold
        ? `medium confidence (${(confidence * 100).toFixed(0)}%), using cache + async refresh`
        : `low confidence (${(confidence * 100).toFixed(0)}%), regenerating`;

    return {
      confidence,
      useCache,
      asyncRefresh,
      factors: { ageScore, hitsScore, categoryScore, freshnessScore },
      reason,
    };
  }

  /** 快速判断是否可用缓存 */
  shouldUseCache(entry: CacheEntry): boolean {
    const result = this.evaluate(entry);
    return result.useCache;
  }

  /** 是否需要异步刷新 */
  shouldAsyncRefresh(entry: CacheEntry): boolean {
    const result = this.evaluate(entry);
    return result.asyncRefresh;
  }
}

// ===== 全局单例 =====

let _confidence: CacheConfidence | null = null;

export function getCacheConfidence(): CacheConfidence {
  if (!_confidence) _confidence = new CacheConfidence();
  return _confidence;
}

export function resetCacheConfidence(): void {
  _confidence = null;
}
