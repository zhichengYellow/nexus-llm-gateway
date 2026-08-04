/**
 * Nexus LLM Gateway - Cache Auto Refresh（缓存自动刷新）
 *
 * 低 confidence 缓存自动刷新 + TTL 动态调整 + 热门 Prompt 预生成。
 */
import { logger } from "../../shared/logger.js";

export interface RefreshPolicy {
  /** 低 confidence 阈值 */
  lowThreshold: number;
  /** 高 confidence 阈值 */
  highThreshold: number;
  /** 后台刷新间隔 (ms) */
  refreshIntervalMs: number;
}

export interface TtlLearner {
  /** 问题类型 → 观察到的 TTL */
  observed: Map<string, number[]>;
  /** 动态 TTL 映射 */
  dynamicTtl: Map<string, number>;
}

export interface HotPrompt {
  text: string;
  hits: number;
  lastHitAt: number;
  avgLatency: number;
}

export class CacheAutoRefresh {
  private policy: RefreshPolicy = {
    lowThreshold: 0.5,
    highThreshold: 0.9,
    refreshIntervalMs: 60000,
  };

  private ttlLearner: TtlLearner = {
    observed: new Map(),
    dynamicTtl: new Map(),
  };

  private hotPrompts = new Map<string, HotPrompt>();
  private refreshQueue: Array<{ hash: string; prompt: string }> = [];

  /** 记录缓存命中，用于识别热门 Prompt */
  recordHit(prompt: string, latencyMs: number): void {
    const key = prompt.slice(0, 100);
    const existing = this.hotPrompts.get(key);
    if (existing) {
      existing.hits++;
      existing.lastHitAt = Date.now();
      existing.avgLatency = existing.avgLatency * 0.7 + latencyMs * 0.3;
    } else {
      this.hotPrompts.set(key, { text: prompt, hits: 1, lastHitAt: Date.now(), avgLatency: latencyMs });
    }

    if (this.hotPrompts.size > 1000) {
      const oldest = [...this.hotPrompts.entries()].sort((a, b) => a[1].lastHitAt - b[1].lastHitAt)[0];
      if (oldest) this.hotPrompts.delete(oldest[0]);
    }
  }

  /** 获取 Top N 热门 Prompt */
  getHotPrompts(topN = 10): HotPrompt[] {
    return [...this.hotPrompts.values()].sort((a, b) => b.hits - a.hits).slice(0, topN);
  }

  /** 是否需要刷新 */
  needsRefresh(confidence: number): boolean {
    return confidence < this.policy.highThreshold && confidence >= this.policy.lowThreshold;
  }

  /** 是否需要重新生成 */
  needsRegenerate(confidence: number): boolean {
    return confidence < this.policy.lowThreshold;
  }

  /** 学习 TTL：根据问题类型 + 观察到的命中模式动态调整 */
  learnTtl(category: string, observedTtl: number): void {
    const arr = this.ttlLearner.observed.get(category) ?? [];
    arr.push(observedTtl);
    if (arr.length > 50) arr.shift();
    this.ttlLearner.observed.set(category, arr);

    // 计算动态 TTL（P50）
    const sorted = [...arr].sort((a, b) => a - b);
    const dynamic = sorted[Math.floor(sorted.length / 2)] ?? observedTtl;
    this.ttlLearner.dynamicTtl.set(category, dynamic);
  }

  /** 获取动态 TTL */
  getDynamicTtl(category: string, defaultTtl: number): number {
    return this.ttlLearner.dynamicTtl.get(category) ?? defaultTtl;
  }

  /** 获取所有 TTL 映射 */
  getTtlMap(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const [k, v] of this.ttlLearner.dynamicTtl) map[k] = v;
    return map;
  }

  /** 添加到刷新队列 */
  enqueueRefresh(hash: string, prompt: string): void {
    this.refreshQueue.push({ hash, prompt });
    if (this.refreshQueue.length > 100) this.refreshQueue.shift();
  }

  /** 获取刷新队列 */
  getRefreshQueue(): Array<{ hash: string; prompt: string }> {
    return [...this.refreshQueue];
  }
}

let _autoRefresh: CacheAutoRefresh | null = null;
export function getCacheAutoRefresh(): CacheAutoRefresh {
  if (!_autoRefresh) _autoRefresh = new CacheAutoRefresh();
  return _autoRefresh;
}
export function resetCacheAutoRefresh(): void { _autoRefresh = null; }
