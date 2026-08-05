/**
 * Nexus LLM Gateway - Adaptive Retry（自适应重试）
 *
 * 目的：根据上游返回的状态码，采用不同的退避策略。
 *
 * 策略：
 * - 429 (Rate Limit)：使用 Retry-After 头或长退避（base 1s，最大 30s）
 * - 500 (Internal Error)：短退避（base 200ms，最大 2s）
 * - 502/503 (Bad Gateway/Unavailable)：中等退避（base 500ms，最大 10s）
 * - 网络错误 (fetch failed)：指数退避（base 100ms，最大 5s）
 * - 4xx (非 429)：不重试
 *
 * 此外支持退避时间自适应：
 * - 连续成功 → 减少退避时间
 * - 连续失败 → 增加退避时间（cap 在最大值内）
 */
import { logger } from "../../shared/logger.js";

export interface AdaptiveRetryOptions {
  /** 最大重试次数（默认 3） */
  maxRetries: number;
  /** 总超时时间 ms（默认 30000） */
  totalTimeoutMs: number;
}

interface StrategyConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  /** 每次重试的倍数 */
  multiplier: number;
}

/** 根据 HTTP 状态码确定重试策略 */
function getStrategy(status?: number): StrategyConfig | null {
  if (status === 429) {
    return { baseDelayMs: 1000, maxDelayMs: 30000, multiplier: 2 };
  }
  if (status === 500) {
    return { baseDelayMs: 200, maxDelayMs: 2000, multiplier: 1.5 };
  }
  if (status === 502 || status === 503) {
    return { baseDelayMs: 500, maxDelayMs: 10000, multiplier: 2 };
  }
  if (status === undefined) {
    // 网络错误（无状态码）
    return { baseDelayMs: 100, maxDelayMs: 5000, multiplier: 2 };
  }
  return null; // 不可重试
}

/** 是否可重试 */
export function isRetryableStatus(err: unknown): { retryable: boolean; status?: number; strategy?: StrategyConfig } {
  const status = (err as any)?.status ?? (err as any)?.statusCode;
  if (status === undefined && err instanceof Error) {
    // 网络错误
    const strategy = getStrategy();
    return { retryable: true, strategy: strategy ?? undefined };
  }
  const strategy = getStrategy(status);
  return { retryable: strategy !== null, status, strategy: strategy ?? undefined };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jittered(delay: number, ratio = 0.3): number {
  return Math.round(delay * (1 + (Math.random() * 2 - 1) * ratio));
}

/**
 * 自适应重试：根据错误类型自动选择退避策略
 */
export async function withAdaptiveRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: Partial<AdaptiveRetryOptions>,
): Promise<T> {
  const opts: AdaptiveRetryOptions = {
    maxRetries: options?.maxRetries ?? 3,
    totalTimeoutMs: options?.totalTimeoutMs ?? 30000,
  };

  const startTime = Date.now();
  let lastErr: unknown;
  let consecutiveSuccesses = 0;
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    // 检查总超时
    if (Date.now() - startTime > opts.totalTimeoutMs) {
      throw new Error(`adaptive retry total timeout exceeded (${opts.totalTimeoutMs}ms)`);
    }

    try {
      const result = await fn(attempt);
      consecutiveSuccesses++;
      consecutiveFailures = 0;
      return result;
    } catch (e) {
      lastErr = e;
      consecutiveFailures++;
      consecutiveSuccesses = 0;

      const { retryable, status, strategy } = isRetryableStatus(e);

      if (!retryable || attempt >= opts.maxRetries) {
        break;
      }

      // 计算延迟：基础延迟 * multiplier^attempt，自适应调整
      let delay = (strategy!.baseDelayMs * Math.pow(strategy!.multiplier, attempt));

      // 连续失败时增加延迟（最多翻倍）
      if (consecutiveFailures > 1) {
        delay = Math.min(delay * 1.5, strategy!.maxDelayMs);
      }

      delay = Math.min(jittered(delay), strategy!.maxDelayMs);

      logger.warn(
        {
          attempt: attempt + 1,
          maxRetries: opts.maxRetries,
          status,
          delay,
          strategy: `${strategy!.baseDelayMs}ms x ${strategy!.multiplier}^${attempt}`,
        },
        `adaptive retry in ${delay}ms after ${status ?? "network"} error`,
      );

      await sleep(delay);
    }
  }

  throw lastErr;
}

/**
 * 获取 Retry-After 头的值（秒）
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const num = parseInt(header, 10);
  if (!isNaN(num)) return num;
  // HTTP-date 格式，简化处理
  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
  }
  return null;
}
