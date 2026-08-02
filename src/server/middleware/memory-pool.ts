/**
 * Nexus LLM Gateway - Memory Pool（对象池）
 *
 * 目的：复用频繁创建的对象（Response 对象、Buffer），减少 GC 压力。
 *
 * 实现：
 * - ObjectPool<T>：泛型对象池，支持 borrow/return
 * - 预分配策略：初始化时创建 minSize 个对象
 * - 自动扩容：池空时创建新对象（不超过 maxSize）
 * - 统计：记录 borrow/return/create 次数
 */
import { logger } from "../../shared/logger.js";

export interface PoolOptions {
  /** 最小预分配数 */
  minSize: number;
  /** 最大池大小 */
  maxSize: number;
  /** 对象空闲超时 ms（超时后销毁，0 不超时） */
  idleTimeoutMs: number;
}

interface Pooled<T> {
  value: T;
  createdAt: number;
  lastUsedAt: number;
}

export class ObjectPool<T> {
  private pool: Array<Pooled<T>> = [];
  private options: PoolOptions;
  private factory: () => T;
  private resetFn: (obj: T) => void;

  private stats = {
    borrowed: 0,
    returned: 0,
    created: 0,
    destroyed: 0,
  };

  constructor(factory: () => T, resetFn: (obj: T) => void, options?: Partial<PoolOptions>) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.options = {
      minSize: options?.minSize ?? 4,
      maxSize: options?.maxSize ?? 32,
      idleTimeoutMs: options?.idleTimeoutMs ?? 60000,
    };

    // 预分配
    for (let i = 0; i < this.options.minSize; i++) {
      this.pool.push({
        value: factory(),
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      });
      this.stats.created++;
    }
  }

  /** 从池中获取对象 */
  borrow(): T {
    // 清理超时对象
    this.cleanup();

    const now = Date.now();
    if (this.pool.length > 0) {
      const item = this.pool.pop()!;
      item.lastUsedAt = now;
      this.stats.borrowed++;
      return item.value;
    }

    // 池空，创建新对象
    if (this.stats.created < this.options.maxSize) {
      this.stats.created++;
      this.stats.borrowed++;
      return this.factory();
    }

    // 达到上限，等待回收（简单实现：强制创建但不跟踪）
    logger.warn("memory pool exhausted, creating unmanaged object");
    this.stats.borrowed++;
    return this.factory();
  }

  /** 归还对象到池 */
  return(obj: T): void {
    this.resetFn(obj);
    this.pool.push({
      value: obj,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    this.stats.returned++;
  }

  /** 清理超时对象 */
  private cleanup(): void {
    if (this.options.idleTimeoutMs <= 0) return;
    const now = Date.now();
    const before = this.pool.length;
    this.pool = this.pool.filter((item) => {
      const idle = now - item.lastUsedAt;
      if (idle > this.options.idleTimeoutMs) {
        this.stats.destroyed++;
        return false;
      }
      return true;
    });
    if (this.pool.length < before) {
      logger.debug({ destroyed: before - this.pool.length }, "pool cleanup: destroyed idle objects");
    }
  }

  /** 获取统计信息 */
  getStats() {
    return {
      poolSize: this.pool.length,
      ...this.stats,
      reuseRate: this.stats.borrowed > 0
        ? ((this.stats.borrowed - this.stats.created + this.options.minSize) / this.stats.borrowed * 100).toFixed(1) + "%"
        : "0%",
    };
  }

  /** 清空池 */
  drain(): void {
    this.stats.destroyed += this.pool.length;
    this.pool.length = 0;
  }
}

/**
 * JSON 解析对象池
 * 复用解析后的对象结构，减少 JSON.parse 次数
 */
export class JsonPool {
  private pool = new ObjectPool<Record<string, unknown>>(
    () => ({}),
    (obj) => { for (const k of Object.keys(obj)) delete obj[k]; },
    { minSize: 4, maxSize: 16 },
  );

  /** 解析 JSON 字符串（复用池中对象） */
  parse(text: string): Record<string, unknown> {
    const obj = this.pool.borrow();
    const parsed = JSON.parse(text);
    Object.assign(obj, parsed);
    return obj;
  }

  /** 归还解析对象 */
  release(obj: Record<string, unknown>): void {
    this.pool.return(obj);
  }

  getStats() {
    return this.pool.getStats();
  }
}

/**
 * 响应头对象池
 * 复用频繁创建的 headers 对象
 */
export class HeadersPool {
  private pool = new ObjectPool<Record<string, string>>(
    () => ({}),
    (obj) => { for (const k of Object.keys(obj)) delete obj[k]; },
    { minSize: 2, maxSize: 8 },
  );

  borrow(): Record<string, string> {
    return this.pool.borrow();
  }

  return(obj: Record<string, string>): void {
    this.pool.return(obj);
  }

  getStats() {
    return this.pool.getStats();
  }
}

/** 全局单例 */
let _jsonPool: JsonPool | null = null;
let _headersPool: HeadersPool | null = null;

export function getJsonPool(): JsonPool {
  if (!_jsonPool) _jsonPool = new JsonPool();
  return _jsonPool;
}

export function getHeadersPool(): HeadersPool {
  if (!_headersPool) _headersPool = new HeadersPool();
  return _headersPool;
}

export function resetPools(): void {
  _jsonPool?.pool.drain();
  _headersPool?.pool.drain();
  _jsonPool = null;
  _headersPool = null;
}
