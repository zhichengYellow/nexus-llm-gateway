/**
 * Nexus LLM Gateway - 指数退避重试（Exponential Backoff Retry）
 *
 * 可重试状态码：429（限流）、5xx（上游故障）、网络断连（fetch 抛错）
 * 不可重试：4xx（除 429）、校验类错误
 *
 * 策略：maxRetries 次，间隔 baseDelay * 2^(attempt)，加随机抖动防惊群。
 */
import { logger } from "../../shared/logger.js";

export interface RetryOptions {
  /** 最大重试次数（默认 2，即总共最多 3 次尝试） */
  maxRetries: number;
  /** 初始延迟 ms（默认 500） */
  baseDelayMs: number;
  /** 抖动比例（默认 0.2，±20%） */
  jitterRatio: number;
}

/** 是否可重试：5xx / 网络错误（429 不重试，避免放大限流） */
export function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    // fetch 网络错误（无 status）都可重试
    if ((err as any).status === undefined) return true;
  }
  const status = (err as any)?.status ?? (err as any)?.statusCode;
  if (typeof status !== "number") return true;
  return status >= 500 && status < 600;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitteredDelay(base: number, ratio: number): number {
  return Math.round(base * (1 + (Math.random() * 2 - 1) * ratio));
}

/**
 * 用指数退避重试执行 fn
 * @returns fn 的成功结果；全部失败后抛出最后一次错误
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts: RetryOptions = {
    maxRetries: options?.maxRetries ?? 2,
    baseDelayMs: options?.baseDelayMs ?? 500,
    jitterRatio: options?.jitterRatio ?? 0.2,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || attempt >= opts.maxRetries) break;
      const delay = jitteredDelay(opts.baseDelayMs * 2 ** attempt, opts.jitterRatio);
      logger.warn(
        { attempt: attempt + 1, maxRetries: opts.maxRetries, delay },
        `retry in ${delay}ms after error: ${(e as Error).message}`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}