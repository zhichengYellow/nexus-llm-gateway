/**
 * Nexus LLM Gateway - Embedding Screener（Embedding 相似度初筛）
 *
 * R1: Semantic Cache 2.0 — 第一步
 *
 * 用 TF-IDF 向量 + Cosine 相似度做初筛，返回候选缓存 + 相似度分数。
 * 高分候选进入 SemanticJudge 做语义等价判断，低分直接跳过。
 *
 * 不依赖外部 ML 库，纯 JS 实现，适合网关级轻量初筛。
 */

import { getSemanticCache } from "../cache/semantic-cache.js";
import { canonicalText } from "../cache/semantic-cache.js";
import type { ChatCompletionRequest } from "../../shared/types.js";

export interface ScreenedCandidate {
  /** 缓存 hash */
  hash: string;
  /** 原始 prompt */
  prompt: string;
  /** 归一化 prompt */
  canonical: string;
  /** cosine 相似度 0-1 */
  similarity: number;
  /** 缓存响应 */
  response: any;
  /** 缓存创建时间 */
  createdAt: number;
  /** 命中次数 */
  hits: number;
  /** TTL */
  ttl: number;
}

export interface ScreeningResult {
  candidates: ScreenedCandidate[];
  topScore: number;
  screeningTime: number;
}

/**
 * 简单中文分词：按字符 N-gram + 英文单词
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // 提取英文单词（连续字母）
  const enWords = text.match(/[a-zA-Z]+/g) ?? [];
  tokens.push(...enWords.map((w) => w.toLowerCase()));

  // 提取中文 bigram（重叠双字）
  const chChars = [...text].filter((c) => /[\u4e00-\u9fff]/.test(c));
  for (let i = 0; i < chChars.length - 1; i++) {
    tokens.push(chChars[i]! + chChars[i + 1]!);
  }

  // 提取数字序列
  const nums = text.match(/\d+/g) ?? [];
  tokens.push(...nums);

  // 停用词过滤
  const stopWords = new Set(["的", "了", "是", "在", "和", "也", "都", "就", "要", "会", "有", "不", "the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of", "in", "for", "on", "with"]);
  return [...new Set(tokens.filter((t) => !stopWords.has(t.toLowerCase()) && t.length >= 1))];
}

/**
 * 构建 TF-IDF 向量
 */
function buildTfIdf(
  docs: string[],
  globalDf?: Map<string, number>,
): {
  vectors: Map<string, number>[];
  df: Map<string, number>;
  N: number;
} {
  const N = docs.length;
  const df = globalDf ?? new Map<string, number>();

  if (!globalDf) {
    // 统计 document frequency
    for (const doc of docs) {
      const tokens = tokenize(doc);
      const unique = new Set(tokens);
      for (const t of unique) {
        df.set(t, (df.get(t) ?? 0) + 1);
      }
    }
  }

  const vectors: Map<string, number>[] = [];

  for (const doc of docs) {
    const tokens = tokenize(doc);
    const vec = new Map<string, number>();

    // TF
    for (const t of tokens) {
      vec.set(t, (vec.get(t) ?? 0) + 1);
    }

    // TF-IDF
    for (const [t, tf] of vec) {
      const docFreq = df.get(t) ?? 1;
      const idf = Math.log((N + 1) / (docFreq + 1)) + 1;
      vec.set(t, tf * idf);
    }

    vectors.push(vec);
  }

  return { vectors, df, N };
}

/**
 * Cosine 相似度
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [t, va] of a) {
    const vb = b.get(t) ?? 0;
    dot += va * vb;
    magA += va * va;
  }

  for (const [, vb] of b) {
    magB += vb * vb;
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export class EmbeddingScreener {
  private threshold: number;

  constructor(threshold = 0.5) {
    this.threshold = threshold;
  }

  /**
   * 对查询 Prompt 进行 Embedding 初筛
   *
   * @param req 原始请求
   * @param model 模型名
   * @param provider Provider 名
   * @returns 候选缓存列表（按相似度降序）
   */
  async screen(
    req: ChatCompletionRequest,
    model: string,
    provider: string,
  ): Promise<ScreeningResult> {
    const start = Date.now();
    const cache = getSemanticCache();
    const queryCanonical = canonicalText(
      (req.messages as Array<{ role: string; content: string }>)
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join(" "),
    );

    if (!queryCanonical || queryCanonical.length < 3) {
      return { candidates: [], topScore: 0, screeningTime: Date.now() - start };
    }

    // 获取最近缓存条目
    const entries = await cache.listRecent(100, model, provider);
    if (entries.length === 0) {
      return { candidates: [], topScore: 0, screeningTime: Date.now() - start };
    }

    // 提取所有缓存 prompt
    const cachedPrompts = entries.map((e) => e.prompt ?? e.canonical ?? "");
    const allDocs = [queryCanonical, ...cachedPrompts];

    // 构建 TF-IDF 向量
    const { vectors } = buildTfIdf(allDocs);
    const queryVec = vectors[0]!;

    // 计算余弦相似度
    const candidates: ScreenedCandidate[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const docVec = vectors[i + 1]!;
      const similarity = cosineSimilarity(queryVec!, docVec!);

      if (similarity >= this.threshold) {
        candidates.push({
          hash: entry.hash ?? "",
          prompt: entry.prompt ?? "",
          canonical: entry.canonical ?? "",
          similarity: +(similarity.toFixed(4)),
          response: entry.response,
          createdAt: entry.createdAt ? new Date(entry.createdAt as any).getTime() : 0,
          hits: entry.hits ?? 0,
          ttl: entry.ttl ?? 86400,
        });
      }
    }

    // 按相似度降序
    candidates.sort((a, b) => b.similarity - a.similarity);

    return {
      candidates: candidates.slice(0, 5), // 最多返回 5 个候选
      topScore: candidates[0]?.similarity ?? 0,
      screeningTime: Date.now() - start,
    };
  }

  /**
   * 快速初筛（只返回最高分候选，不列表）
   */
  async quickScreen(
    req: ChatCompletionRequest,
    model: string,
    provider: string,
  ): Promise<ScreenedCandidate | null> {
    const result = await this.screen(req, model, provider);
    return result.candidates[0] ?? null;
  }

  /** 设置阈值 */
  setThreshold(t: number): void {
    this.threshold = Math.max(0, Math.min(1, t));
  }
}

let _screener: EmbeddingScreener | null = null;
export function getEmbeddingScreener(): EmbeddingScreener {
  if (!_screener) _screener = new EmbeddingScreener();
  return _screener;
}
export function resetEmbeddingScreener(): void { _screener = null; }
