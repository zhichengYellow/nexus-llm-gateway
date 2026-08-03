/**
 * Nexus LLM Gateway - Event Bus
 *
 * Phase 7: Pub/Sub 事件总线，插件可监听事件。
 *
 * 事件类型：
 *   RequestStart → Retry → CacheHit → ProviderSwitch → CostChanged → ResponseEnd
 */
import { logger } from "../../shared/logger.js";

// ===== 事件定义 =====

export type EventType =
  | "request:start"
  | "request:end"
  | "auth:success"
  | "auth:failed"
  | "cache:hit"
  | "cache:miss"
  | "cache:store"
  | "provider:call"
  | "provider:success"
  | "provider:failed"
  | "provider:switch"
  | "retry:attempt"
  | "circuit:open"
  | "circuit:close"
  | "rate:limit"
  | "cost:changed"
  | "config:reload"
  | "pipeline:start"
  | "pipeline:end"
  | "error";

export interface EventPayload {
  type: EventType;
  timestamp: number;
  requestId?: string;
  data: Record<string, unknown>;
}

export type EventHandler = (event: EventPayload) => void | Promise<void>;

export interface EventSubscription {
  id: string;
  type: EventType | "*";
  handler: EventHandler;
}

// ===== Event Bus =====

export class EventBus {
  private subscriptions: EventSubscription[] = [];
  private eventStore: EventPayload[] = [];
  private maxStoreSize: number;
  private idCounter = 0;

  constructor(maxStoreSize = 1000) {
    this.maxStoreSize = maxStoreSize;
  }

  /** 订阅事件 */
  on(type: EventType | "*", handler: EventHandler): string {
    const id = `sub_${++this.idCounter}`;
    this.subscriptions.push({ id, type, handler });
    logger.debug({ subscriptionId: id, eventType: type }, "event: subscribed");
    return id;
  }

  /** 取消订阅 */
  off(subscriptionId: string): boolean {
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter((s) => s.id !== subscriptionId);
    return this.subscriptions.length < before;
  }

  /** 发布事件（同步通知所有订阅者） */
  emit(type: EventType, data: Record<string, unknown> = {}, requestId?: string): void {
    const event: EventPayload = {
      type,
      timestamp: Date.now(),
      requestId,
      data,
    };

    // 存储事件
    this.eventStore.push(event);
    if (this.eventStore.length > this.maxStoreSize) {
      this.eventStore.shift();
    }

    // 通知订阅者
    const matches = this.subscriptions.filter((s) => s.type === type || s.type === "*");
    for (const sub of matches) {
      try {
        sub.handler(event);
      } catch (e) {
        logger.error({ subscriptionId: sub.id, err: (e as Error).message }, "event: handler error");
      }
    }
  }

  /** 异步发布（不阻塞主流程） */
  emitAsync(type: EventType, data: Record<string, unknown> = {}, requestId?: string): void {
    setImmediate(() => this.emit(type, data, requestId));
  }

  /** 获取最近事件 */
  recent(count = 50): EventPayload[] {
    return this.eventStore.slice(-count).reverse();
  }

  /** 按类型过滤事件 */
  filter(type: EventType, count = 50): EventPayload[] {
    return this.eventStore.filter((e) => e.type === type).slice(-count).reverse();
  }

  /** 获取统计 */
  stats(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const e of this.eventStore) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
    }
    return { total: this.eventStore.length, byType };
  }

  /** 清空事件存储 */
  clear(): void {
    this.eventStore.length = 0;
  }

  /** 事件回放（调试用） */
  replay(count = 100): EventPayload[] {
    return this.eventStore.slice(-count);
  }

  /** 获取订阅列表 */
  getSubscriptions(): Array<{ id: string; type: EventType | "*" }> {
    return this.subscriptions.map((s) => ({ id: s.id, type: s.type }));
  }
}

// ===== 全局单例 =====

let _bus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!_bus) _bus = new EventBus();
  return _bus;
}

export function resetEventBus(): void {
  _bus = null;
}
