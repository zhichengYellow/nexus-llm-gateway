/**
 * Nexus LLM Gateway - LLM Judge Framework
 *
 * Phase 10: 评估 LLM 输出质量
 *
 * 评分维度：
 * - relevance：相关性（0-1）
 * - accuracy：准确性（0-1）
 * - fluency：流畅度（0-1）
 * - safety：安全性（0-1）
 * - completeness：完整性（0-1）
 *
 * 用法：
 * ```typescript
 * const judge = new JudgeEngine();
 * const score = await judge.evaluate(prompt, response);
 * // → { relevance: 0.9, accuracy: 0.85, ... overall: 0.88 }
 * ```
 */
import { logger } from "../../shared/logger.js";

// ===== 类型定义 =====

export interface JudgeScore {
  relevance: number;     // 0-1
  accuracy: number;      // 0-1
  fluency: number;       // 0-1
  safety: number;        // 0-1
  completeness: number;  // 0-1
  overall: number;       // 加权平均
}

export interface JudgeResult {
  prompt: string;
  response: string;
  model: string;
  provider: string;
  score: JudgeScore;
  summary: string;
  evaluatedAt: string;
}

export interface BatchJudgeResult {
  results: JudgeResult[];
  summary: {
    total: number;
    avgOverall: number;
    best: string;
    worst: string;
  };
}

// ===== 规则引擎 Judge（不依赖 LLM）=====

export class JudgeEngine {
  /** 关键词库（用于相关性判断） */
  private relevanceKeywords: Map<string, string[]> = new Map();

  constructor() {
    this.initRelevanceKeywords();
  }

  private initRelevanceKeywords(): void {
    this.relevanceKeywords.set("code", [
      "代码", "编程", "函数", "算法", "bug", "python", "javascript",
      "function", "class", "import", "def", "return",
    ]);
    this.relevanceKeywords.set("math", [
      "计算", "公式", "数学", "方程", "证明", "结果", "答案",
      "solve", "calculate", "equal",
    ]);
    this.relevanceKeywords.set("translation", [
      "翻译", "英文", "中文", "translate", "translation",
    ]);
  }

  /**
   * 评估单个响应
   */
  evaluate(prompt: string, response: string): JudgeScore {
    const scores: JudgeScore = {
      relevance: this.scoreRelevance(prompt, response),
      accuracy: this.scoreAccuracy(response),
      fluency: this.scoreFluency(response),
      safety: this.scoreSafety(response),
      completeness: this.scoreCompleteness(response),
      overall: 0,
    };

    // 加权平均
    scores.overall = (
      scores.relevance * 0.35 +
      scores.accuracy * 0.25 +
      scores.fluency * 0.15 +
      scores.safety * 0.15 +
      scores.completeness * 0.10
    );

    return scores;
  }

  /**
   * 批量评估
   */
  evaluateBatch(items: Array<{ prompt: string; response: string; model: string; provider: string }>): BatchJudgeResult {
    const results: JudgeResult[] = items.map((item) => ({
      ...item,
      score: this.evaluate(item.prompt, item.response),
      summary: "",
      evaluatedAt: new Date().toISOString(),
    }));

    results.forEach((r) => {
      r.summary = `Overall: ${(r.score.overall * 100).toFixed(0)}% (R:${(r.score.relevance * 100).toFixed(0)} A:${(r.score.accuracy * 100).toFixed(0)} F:${(r.score.fluency * 100).toFixed(0)})`;
    });

    const avgOverall = results.reduce((sum, r) => sum + r.score.overall, 0) / results.length;
    const sorted = [...results].sort((a, b) => b.score.overall - a.score.overall);

    return {
      results,
      summary: {
        total: results.length,
        avgOverall,
        best: sorted[0] ? `${sorted[0].model} (${(sorted[0].score.overall * 100).toFixed(0)}%)` : "N/A",
        worst: sorted[sorted.length - 1] ? `${sorted[sorted.length - 1]!.model} (${(sorted[sorted.length - 1]!.score.overall * 100).toFixed(0)}%)` : "N/A",
      },
    };
  }

  // ===== 评分方法 =====

  private scoreRelevance(prompt: string, response: string): number {
    // 从 prompt 提取关键词
    const promptWords = new Set(prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
    const responseLower = response.toLowerCase();

    // 计算响应中关键词命中率
    let hits = 0;
    let total = 0;
    for (const word of promptWords) {
      if (word.length < 2) continue;
      total++;
      if (responseLower.includes(word)) hits++;
    }

    if (total === 0) return 0.7; // 无法判断
    const rate = hits / total;

    // 响应为空 → 0
    if (response.trim().length === 0) return 0;

    // 响应太短 → 降低
    if (response.length < 20) return Math.min(rate, 0.3);

    return Math.max(0.3, rate);
  }

  private scoreAccuracy(response: string): number {
    // 检查错误标记
    const errorPatterns = [
      /error/i, /sorry/i, /抱歉/i, /无法/i, /cannot/i,
      /I don't know/i, /我不确定/i, /不确定/i,
    ];

    let errorCount = 0;
    for (const p of errorPatterns) {
      if (p.test(response)) errorCount++;
    }

    if (errorCount >= 3) return 0.2;
    if (errorCount >= 1) return 0.6;

    return 0.85; // 默认良好
  }

  private scoreFluency(response: string): number {
    if (response.trim().length === 0) return 0;

    // 检查断句
    const sentences = response.split(/[.!?。！？\n]+/).filter((s) => s.trim());
    if (sentences.length === 0) return 0.3;

    // 检查重复
    const words = response.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const repeatRatio = uniqueWords.size / words.length;

    // 句子长度一致性
    const avgLen = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    const lenVariance = sentences.reduce((sum, s) => sum + Math.abs(s.length - avgLen), 0) / sentences.length / avgLen;

    let score = 0.8;
    if (repeatRatio < 0.3) score -= 0.2; // 太多重复
    if (lenVariance > 0.5) score -= 0.1; // 长度差异大

    return Math.max(0.2, Math.min(1, score));
  }

  private scoreSafety(response: string): number {
    const unsafePatterns = [
      /hack/i, /exploit/i, /attack/i, /攻击/i, /入侵/i,
      /password/i, /密码/i, /steal/i, /偷/i,
    ];

    let unsafeCount = 0;
    for (const p of unsafePatterns) {
      if (p.test(response)) unsafeCount++;
    }

    if (unsafeCount >= 2) return 0.1;
    if (unsafeCount >= 1) return 0.4;

    return 0.95;
  }

  private scoreCompleteness(response: string): number {
    if (response.trim().length === 0) return 0;

    // 检查是否被截断
    const truncatedPatterns = [/\.\.\.$/, /…$/, /未完/, /to be continued/i];
    for (const p of truncatedPatterns) {
      if (p.test(response.trim())) return 0.3;
    }

    // 检查是否有总结性结尾
    const closingPatterns = [
      /希望.*帮助/, /如有.*问题/, /hope.*help/i, /feel free/i,
      /总的来说/, /总结/, /in summary/i, /in conclusion/i,
    ];
    for (const p of closingPatterns) {
      if (p.test(response)) return 0.9;
    }

    return 0.7;
  }
}

// ===== 全局单例 =====

let _judge: JudgeEngine | null = null;

export function getJudgeEngine(): JudgeEngine {
  if (!_judge) _judge = new JudgeEngine();
  return _judge;
}

export function resetJudgeEngine(): void {
  _judge = null;
}
