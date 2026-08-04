/**
 * Nexus LLM Gateway - Semantic Judge（语义等价判断器）
 *
 * LLM Judge 语义等价判断 + Cache Confidence 最终决策。
 *
 * 判断两个 Prompt 是否语义等价：
 * "Transformer介绍一下" ≈ "Transformer是什么" → LLM 认为一样 → 直接缓存
 *
 * 不依赖外部 LLM，使用规则引擎 + 关键术语匹配。
 */
import { logger } from "../../shared/logger.js";

export interface SemanticEquivalence {
  equivalent: boolean;
  score: number;          // 0-1
  reason: string;
  sharedTerms: number;
  totalTerms: number;
}

export interface CacheDecision {
  useCache: boolean;
  asyncRefresh: boolean;
  confidence: number;
  action: "return_cache" | "return_and_refresh" | "regenerate";
  reason: string;
}

export class SemanticJudge {
  /**
   * 判断两个 Prompt 是否语义等价
   */
  isEquivalent(prompt1: string, prompt2: string, threshold = 0.7): SemanticEquivalence {
    const terms1 = this.extractKeyTerms(prompt1);
    const terms2 = this.extractKeyTerms(prompt2);

    // Jaccard 相似度
    const set1 = new Set(terms1);
    const set2 = new Set(terms2);
    const intersection = [...set1].filter((t) => set2.has(t));
    const union = new Set([...set1, ...set2]);

    const score = union.size > 0 ? intersection.length / union.size : 0;
    const equivalent = score >= threshold;

    return {
      equivalent,
      score,
      reason: equivalent
        ? `semantically equivalent (${(score * 100).toFixed(0)}% term overlap)`
        : `not equivalent (${(score * 100).toFixed(0)}% term overlap, threshold ${(threshold * 100).toFixed(0)}%)`,
      sharedTerms: intersection.length,
      totalTerms: union.size,
    };
  }

  /**
   * Cache Confidence 最终决策
   */
  decide(confidence: number, semanticScore: number, cacheAge: number, ttl: number): CacheDecision {
    // 综合评分
    const ageRatio = Math.min(1, cacheAge / Math.max(1, ttl));
    const combinedScore = confidence * 0.4 + semanticScore * 0.4 + (1 - ageRatio) * 0.2;

    if (combinedScore >= 0.85) {
      return {
        useCache: true, asyncRefresh: false, confidence: combinedScore,
        action: "return_cache",
        reason: `high combined score (${(combinedScore * 100).toFixed(0)}%), using cache directly`,
      };
    }

    if (combinedScore >= 0.6) {
      return {
        useCache: true, asyncRefresh: true, confidence: combinedScore,
        action: "return_and_refresh",
        reason: `medium combined score (${(combinedScore * 100).toFixed(0)}%), using cache + async refresh`,
      };
    }

    return {
      useCache: false, asyncRefresh: false, confidence: combinedScore,
      action: "regenerate",
      reason: `low combined score (${(combinedScore * 100).toFixed(0)}%), regenerating`,
    };
  }

  /**
   * 快速缓存决策（一行调用）
   */
  quickDecide(originalPrompt: string, cachedPrompt: string, confidence: number, cacheAge: number, ttl: number): CacheDecision {
    const semantic = this.isEquivalent(originalPrompt, cachedPrompt);
    return this.decide(confidence, semantic.score, cacheAge, ttl);
  }

  private extractKeyTerms(text: string): string[] {
    const terms: string[] = [];
    const segments = text.split(/[\s,，。.！!？?、：:；;（）()【】\[\]""'']+/).filter((s) => s.length > 0);
    
    for (const seg of segments) {
      if (/^[a-zA-Z]+$/.test(seg)) {
        if (seg.length >= 2) terms.push(seg.toLowerCase());
        continue;
      }
      if (/[\u4e00-\u9fff]/.test(seg)) {
        const chars = [...seg];
        for (let i = 0; i < chars.length - 1; i++) {
          terms.push(chars[i]! + chars[i + 1]!);
        }
      }
    }

    const stopWords = new Set(["的", "了", "是", "在", "和", "也", "都", "就", "要", "会", "有", "不", "the", "a", "an", "is"]);
    return [...new Set(terms.filter((t) => !stopWords.has(t.toLowerCase()) && t.length >= 1))];
  }
}

let _semanticJudge: SemanticJudge | null = null;
export function getSemanticJudge(): SemanticJudge {
  if (!_semanticJudge) _semanticJudge = new SemanticJudge();
  return _semanticJudge;
}
export function resetSemanticJudge(): void { _semanticJudge = null; }
