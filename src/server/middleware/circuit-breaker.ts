/**
 * Nexus LLM Gateway - 熔断器（Circuit Breaker）
 *
 * 三态机：
 * - CLOSED（关闭）: 正常放行；连续失败 >= failureThreshold → 转 OPEN
 * - OPEN（打开）: 拒绝所有请求（快速失败）；持续 openTimeoutMs 后转 HALF_OPEN
 * - HALF_OPEN（半开）: 放行 1 个探测请求；成功→CLOSED，失败→OPEN
 *
 * 典型企业场景：DeepSeek 连续失败 5 次 → 熔断 60s → 期间请求直接跳过该
 * Provider 走故障转移到 OpenAI。
 */
import { logger } from "../../shared/logger.js";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitOptions {
  /** 连续失败多少次后打开熔断（默认 5） */
  failureThreshold: number;
  /** 熔断持续时间 ms（默认 60s） */
  openTimeoutMs: number;
  /** 半开后探测请求数（默认 1） */
  probeCount: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private probesUsed = 0;
  private options: CircuitOptions;

  constructor(options?: Partial<CircuitOptions>) {
    this.options = {
      failureThreshold: options?.failureThreshold ?? 5,
      openTimeoutMs: options?.openTimeoutMs ?? 60_000,
      probeCount: options?.probeCount ?? 1,
    };
  }

  /** 请求进入前调用：是否允许放行 */
  allowRequest(): boolean {
    const now = Date.now();
    if (this.state === "OPEN") {
      // 熔断超时 → HALF_OPEN，放行探测
      if (now - this.openedAt >= this.options.openTimeoutMs) {
        this.state = "HALF_OPEN";
        this.probesUsed = 0;
        logger.info("circuit HALF_OPEN, probing");
        return true;
      }
      return false;
    }
    if (this.state === "HALF_OPEN") {
      // 半开状态只放行 probeCount 个探测
      if (this.probesUsed < this.options.probeCount) {
        this.probesUsed++;
        return true;
      }
      return false;
    }
    return true;
  }

  /** 上游调用成功 */
  recordSuccess() {
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.consecutiveFailures = 0;
      logger.info("circuit CLOSED after successful probe");
      return;
    }
    if (this.state === "CLOSED") {
      this.consecutiveFailures = 0;
    }
  }

  /** 上游调用失败 */
  recordFailure() {
    if (this.state === "HALF_OPEN") {
      // 探测失败 → 重新熔断
      this.state = "OPEN";
      this.openedAt = Date.now();
      this.probesUsed = 0;
      logger.warn("circuit OPEN after failed probe");
      return;
    }
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = Date.now();
      logger.warn({
        failures: this.consecutiveFailures,
        threshold: this.options.failureThreshold,
        openFor: `${this.options.openTimeoutMs}ms`,
      }, "circuit OPEN - provider marked as down");
    }
  }

  getState(): CircuitState {
    if (this.state === "OPEN") {
      // 惰性：超时后 reads 为 HALF_OPEN
      if (Date.now() - this.openedAt >= this.options.openTimeoutMs) return "HALF_OPEN";
    }
    return this.state;
  }

  /** 重置（管理员手动恢复） */
  reset() {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.probesUsed = 0;
    logger.info("circuit manually reset to CLOSED");
  }
}

/** Provider 级熔断器注册表 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /** 获取（不存在则创建）每个 providerType:upstreamModel 一个熔断器 */
  get(key: string): CircuitBreaker {
    let cb = this.breakers.get(key);
    if (!cb) {
      cb = new CircuitBreaker();
      this.breakers.set(key, cb);
    }
    return cb;
  }

  /** 状态快照（供看板/监控） */
  snapshot(): Array<{ key: string; state: CircuitState }> {
    return [...this.breakers.entries()].map(([key, cb]) => ({ key, state: cb.getState() }));
  }

  /** 手动重置所有 */
  resetAll() {
    for (const cb of this.breakers.values()) cb.reset();
  }
}

let _registry: CircuitBreakerRegistry | null = null;
export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!_registry) _registry = new CircuitBreakerRegistry();
  return _registry;
}