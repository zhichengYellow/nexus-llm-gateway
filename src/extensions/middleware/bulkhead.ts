/**
 * Nexus LLM Gateway - Bulkhead（仓壁隔离）
 *
 * 目的：每个 Provider 拥有独立的并发请求池，一个 Provider 的过载不会影响其他。
 *
 * 实现：
 * - 每个 Provider 分配一个信号量（Semaphore），限制最大并发数
 * - 请求到达时 acquire 许可，完成后 release
 * - 许可耗尽时返回 503（不阻塞等待，快速失败）
 *
 * 场景：DeepSeek 突然变慢堆积请求 → 不会拖垮 Gemini/OpenAI
 */
import { logger } from "../../shared/logger.js";

export interface BulkheadOptions {
  /** 最大并发请求数（默认 10） */
  maxConcurrent: number;
  /** 最大排队等待数（默认 0，即不排队直接拒绝） */
  maxQueue: number;
}

interface PendingRequest {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export class Bulkhead {
  private options: BulkheadOptions;
  private active = 0;
  private queue: PendingRequest[] = [];

  constructor(options?: Partial<BulkheadOptions>) {
    this.options = {
      maxConcurrent: options?.maxConcurrent ?? 10,
      maxQueue: options?.maxQueue ?? 0,
    };
  }

  /** 获取当前活跃请求数 */
  get activeCount(): number {
    return this.active;
  }

  /** 获取排队等待数 */
  get queueSize(): number {
    return this.queue.length;
  }

  /** 尝试获取许可，失败返回 false（调用方应返回 503） */
  async tryAcquire(timeoutMs = 0): Promise<boolean> {
    if (this.active < this.options.maxConcurrent) {
      this.active++;
      return true;
    }

    if (this.queue.length >= this.options.maxQueue) {
      logger.warn({ active: this.active, maxConcurrent: this.options.maxConcurrent }, "bulkhead: request rejected (no capacity)");
      return false;
    }

    // 排队等待
    return new Promise<boolean>((resolve) => {
      const pending: PendingRequest = { resolve: () => resolve(true), timer: null };

      if (timeoutMs > 0) {
        pending.timer = setTimeout(() => {
          const idx = this.queue.indexOf(pending);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
            resolve(false);
          }
        }, timeoutMs);
      }

      this.queue.push(pending);
    });
  }

  /** 释放许可 */
  release(): void {
    if (this.active > 0) {
      this.active--;
    }

    // 从队列中取出下一个等待的请求
    const next = this.queue.shift();
    if (next) {
      if (next.timer) clearTimeout(next.timer);
      this.active++;
      next.resolve();
    }
  }

  /** 重置（测试用） */
  reset(): void {
    this.active = 0;
    for (const p of this.queue) {
      if (p.timer) clearTimeout(p.timer);
    }
    this.queue = [];
  }
}

/** Provider 级 Bulkhead 注册表 */
export class BulkheadRegistry {
  private bulkheads = new Map<string, Bulkhead>();

  /** 获取（不存在则创建） */
  get(key: string, options?: Partial<BulkheadOptions>): Bulkhead {
    let b = this.bulkheads.get(key);
    if (!b) {
      b = new Bulkhead(options);
      this.bulkheads.set(key, b);
    }
    return b;
  }

  /** 状态快照 */
  snapshot(): Array<{ key: string; active: number; queue: number }> {
    return Array.from(this.bulkheads.entries()).map(([key, b]) => ({
      key,
      active: b.activeCount,
      queue: b.queueSize,
    }));
  }

  /** 重置所有 */
  resetAll(): void {
    for (const b of this.bulkheads.values()) b.reset();
  }
}

let _bulkheadRegistry: BulkheadRegistry | null = null;
export function getBulkheadRegistry(): BulkheadRegistry {
  if (!_bulkheadRegistry) _bulkheadRegistry = new BulkheadRegistry();
  return _bulkheadRegistry;
}

/** 重置（测试用） */
export function resetBulkheadRegistry(): void {
  _bulkheadRegistry = null;
}
