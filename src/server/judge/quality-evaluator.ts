/**
 * Nexus LLM Gateway - Quality Evaluator（质量评估器）
 *
 * 语义保持验证 + 摘要质量评估 + Token 预估误差评估
 */

export interface SemanticPreservationResult {
  preserved: boolean;
  score: number;       // 0-1
  originalTokens: number;
  compressedTokens: number;
  keyTermsRetained: number;
  keyTermsTotal: number;
}

export interface SummaryQualityResult {
  score: number;       // 0-1
  completeness: number;
  conciseness: number;
  accuracy: number;
  issues: string[];
}

export interface TokenEstimationResult {
  estimated: number;
  actual: number;
  error: number;       // 绝对误差
  errorRate: number;   // 误差率
}

export class QualityEvaluator {
  /**
   * 语义保持验证：压缩后的文本是否保留了关键信息
   */
  evaluateSemanticPreservation(original: string, compressed: string): SemanticPreservationResult {
    // 提取关键术语（名词 + 专业词汇）
    const keyTerms = this.extractKeyTerms(original);
    let retained = 0;

    for (const term of keyTerms) {
      if (compressed.toLowerCase().includes(term.toLowerCase())) {
        retained++;
      }
    }

    const originalTokens = Math.ceil(original.length / 4);
    const compressedTokens = Math.ceil(compressed.length / 4);
    const retentionRate = keyTerms.length > 0 ? retained / keyTerms.length : 1;
    const compressionRatio = compressedTokens / Math.max(1, originalTokens);

    // 综合评分：保留率 + 压缩率平衡
    const score = retentionRate * 0.7 + Math.min(1, 1 - compressionRatio) * 0.3;

    return {
      preserved: score >= 0.7,
      score,
      originalTokens,
      compressedTokens,
      keyTermsRetained: retained,
      keyTermsTotal: keyTerms.length,
    };
  }

  /**
   * 摘要质量评估
   */
  evaluateSummaryQuality(originalMessages: Array<{ content: string }>, summary: string): SummaryQualityResult {
    const issues: string[] = [];

    // 完整性：摘要是否覆盖了原始内容的关键点
    const keyTerms = new Set<string>();
    for (const msg of originalMessages) {
      for (const term of this.extractKeyTerms(msg.content)) {
        keyTerms.add(term);
      }
    }
    let covered = 0;
    for (const term of keyTerms) {
      if (summary.toLowerCase().includes(term.toLowerCase())) covered++;
    }
    const completeness = keyTerms.size > 0 ? covered / keyTerms.size : 0.5;
    if (completeness < 0.5) issues.push("摘要可能遗漏关键信息");

    // 简洁性：摘要是否足够简洁
    const originalTokens = originalMessages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0);
    const summaryTokens = Math.ceil(summary.length / 4);
    const conciseness = Math.max(0, 1 - summaryTokens / Math.max(1, originalTokens));
    if (summaryTokens > originalTokens * 0.5) issues.push("摘要不够简洁");

    // 准确性：摘要不包含明显错误（启发式）
    let accuracy = 0.9;
    if (/error|错误|失败|抱歉|无法/i.test(summary)) accuracy -= 0.3;

    const score = completeness * 0.4 + conciseness * 0.3 + accuracy * 0.3;

    return {
      score: Math.max(0, Math.min(1, score)),
      completeness,
      conciseness,
      accuracy,
      issues,
    };
  }

  /**
   * Token 预估误差评估
   */
  evaluateTokenEstimation(estimated: number, actual: number): TokenEstimationResult {
    const error = Math.abs(estimated - actual);
    const errorRate = actual > 0 ? error / actual : 0;

    return { estimated, actual, error, errorRate };
  }

  /**
   * 提取关键术语
   */
  private extractKeyTerms(text: string): string[] {
    const terms: string[] = [];
    // 中英文混合分词
    const segments = text.split(/[\s,，。.！!？?、：:；;（）()【】\[\]""'']+/).filter((s) => s.length > 0);
    
    for (const seg of segments) {
      // 英文单词直接保留
      if (/^[a-zA-Z]+$/.test(seg)) {
        if (seg.length >= 2) terms.push(seg);
        continue;
      }
      // 中文按 2-gram 切分
      if (/[\u4e00-\u9fff]/.test(seg)) {
        const chars = [...seg];
        for (let i = 0; i < chars.length - 1; i++) {
          terms.push(chars[i]! + chars[i + 1]!);
        }
        // 单字也加入
        for (const ch of chars) {
          if (ch.length >= 1) terms.push(ch);
        }
      }
    }

    // 过滤停用词
    const stopWords = new Set([
      "的", "了", "是", "在", "和", "也", "都", "就", "要", "会", "有", "不", "人", "我", "你", "他", "她", "它",
      "这", "那", "这个", "那个", "可以", "能够", "应该", "可能", "已经", "还", "更", "最",
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does", "did",
      "will", "would", "could", "should", "may", "might", "can", "to", "of", "in", "on", "at", "for", "with",
    ]);

    return [...new Set(terms.filter((t) => !stopWords.has(t.toLowerCase()) && t.length >= 1))].slice(0, 30);
  }
}

let _evaluator: QualityEvaluator | null = null;
export function getQualityEvaluator(): QualityEvaluator {
  if (!_evaluator) _evaluator = new QualityEvaluator();
  return _evaluator;
}
export function resetQualityEvaluator(): void { _evaluator = null; }
