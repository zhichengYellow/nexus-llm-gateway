/**
 * Nexus LLM Gateway - Chunk Cache（块级缓存）
 *
 * Layer 1.5: Prompt 分块（语义块）+ Chunk 级缓存存储与检索。
 *
 * 策略：
 * - 长 Prompt 拆分为语义块
 * - 每个 Chunk 独立缓存
 * - 请求时按 Chunk 组合命中
 */

export interface TextChunk {
  id: string;
  text: string;
  tokens: number;
  hash: string;
  index: number;
}

export interface ChunkCacheEntry {
  hash: string;
  response: string;
  hits: number;
  createdAt: number;
  lastAccessedAt: number;
}

export class ChunkCache {
  private store = new Map<string, ChunkCacheEntry>();

  /**
   * 将文本按语义块拆分
   */
  chunk(text: string, maxTokensPerChunk = 100): TextChunk[] {
    const sentences = text.split(/(?<=[.!?。！？\n])\s*/);
    const chunks: TextChunk[] = [];
    let current = "";
    let idx = 0;

    for (const sentence of sentences) {
      const currentTokens = Math.ceil(current.length / 4);
      const sentenceTokens = Math.ceil(sentence.length / 4);

      if (currentTokens + sentenceTokens > maxTokensPerChunk && current.length > 0) {
        chunks.push(this.makeChunk(current, idx++));
        current = sentence;
      } else {
        current += (current ? " " : "") + sentence;
      }
    }

    if (current.trim()) {
      chunks.push(this.makeChunk(current, idx++));
    }

    return chunks;
  }

  private makeChunk(text: string, index: number): TextChunk {
    const hash = this.hashText(text);
    return {
      id: `chunk_${hash.slice(0, 8)}`,
      text: text.trim(),
      tokens: Math.ceil(text.length / 4),
      hash,
      index,
    };
  }

  /**
   * 查找 Chunk 缓存
   */
  lookup(chunks: TextChunk[]): { hits: number; total: number; responses: string[] } {
    const responses: string[] = [];
    let hits = 0;

    for (const chunk of chunks) {
      const entry = this.store.get(chunk.hash);
      if (entry) {
        entry.hits++;
        entry.lastAccessedAt = Date.now();
        responses.push(entry.response);
        hits++;
      }
    }

    return { hits, total: chunks.length, responses };
  }

  /**
   * 存储 Chunk 缓存
   */
  storeChunk(chunk: TextChunk, response: string): void {
    this.store.set(chunk.hash, {
      hash: chunk.hash,
      response,
      hits: 1,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });
  }

  /**
   * 简单 hash
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 统计
   */
  stats(): { totalEntries: number; totalHits: number } {
    let totalHits = 0;
    for (const entry of this.store.values()) {
      totalHits += entry.hits;
    }
    return { totalEntries: this.store.size, totalHits };
  }

  /**
   * 清空
   */
  clear(): void {
    this.store.clear();
  }
}

// ===== 全局单例 =====
let _chunkCache: ChunkCache | null = null;

export function getChunkCache(): ChunkCache {
  if (!_chunkCache) _chunkCache = new ChunkCache();
  return _chunkCache;
}

export function resetChunkCache(): void {
  _chunkCache = null;
}
