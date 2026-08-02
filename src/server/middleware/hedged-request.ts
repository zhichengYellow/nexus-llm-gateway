/**
 * Nexus LLM Gateway - Hedged Request（对冲请求）
 *
 * 目的：主 Provider 超时未返回时，同时向备用 Provider 发送请求，谁先返回用谁的结果。
 *
 * 实现：
 * - 先向主 Provider 发送请求
 * - 超过 hedgingDelayMs 后未返回 → 同时向 fallback[0] 发送相同请求
 * - 第一个成功的响应被采纳，其余被取消（通过 AbortController）
 *
 * 场景：DeepSeek 偶尔慢（p99 延迟 > 3s），自动切到 Gemini 抢答
 */
import { logger } from "../../shared/logger.js";

export interface HedgedOptions {
  /** 主请求超时多久后触发对冲（ms），默认 2000 */
  hedgingDelayMs: number;
  /** 最多同时发送几个对冲请求（默认 2，即主 + 1 个备用） */
  maxHedged: number;
}

interface HedgedAttempt<T> {
  result: Promise<T>;
  abort: () => void;
}

/**
 * 执行对冲请求：同时向多个 provider 发送，第一个成功的结果被返回
 *
 * @param primary - 主请求函数
 * @param fallbacks - 备用请求函数数组
 * @param options - 配置
 * @returns 第一个成功的结果
 * @throws 所有请求都失败时抛 AggregateError
 */
export async function hedgedRequest<T>(
  primary: (signal: AbortSignal) => Promise<T>,
  fallbacks: Array<(signal: AbortSignal) => Promise<T>>,
  options?: Partial<HedgedOptions>,
): Promise<{ result: T; source: "primary" | number }> {
  const opts: HedgedOptions = {
    hedgingDelayMs: options?.hedgingDelayMs ?? 2000,
    maxHedged: options?.maxHedged ?? 2,
  };

  const controller = new AbortController();
  const fallbackControllers: AbortController[] = [];

  // 用 Promise 包装，让 fallback 可以动态加入竞速
  let resolveWinner: (value: { result: T; source: "primary" | number }) => void;
  let rejectAll: (reason: any) => void;
  const winnerPromise = new Promise<{ result: T; source: "primary" | number }>((resolve, reject) => {
    resolveWinner = resolve;
    rejectAll = reject;
  });

  let settled = false;

  function settle(value: { result: T; source: "primary" | number }) {
    if (settled) return;
    settled = true;
    controller.abort();
    for (const fc of fallbackControllers) fc.abort();
    resolveWinner(value);
  }

  // 主请求
  let primaryFailed = false;
  primary(controller.signal)
    .then((r) => settle({ result: r, source: "primary" }))
    .catch(() => {
      primaryFailed = true;
      // 如果没有 fallback，直接 reject
      if (fallbackCount === 0) {
        rejectAll(new Error("primary request failed and no fallbacks available"));
      }
    });

  // 设置对冲定时器
  const fallbackCount = Math.min(fallbacks.length, opts.maxHedged);
  const timers: ReturnType<typeof setTimeout>[] = [];
  let fallbackFailures = 0;

  function launchFallback(index: number) {
    if (settled) return;
    const fbController = new AbortController();
    fallbackControllers.push(fbController);
    logger.info({ fallbackIndex: index }, "hedged request: launching fallback");

    fallbacks[index]!(fbController.signal)
      .then((r) => settle({ result: r, source: index }))
      .catch(() => {
        fallbackFailures++;
        checkAllFailed();
      });
  }

  function checkAllFailed() {
    if (primaryFailed && fallbackFailures >= fallbackCount) {
      rejectAll(new Error("all hedged requests failed"));
    }
  }

  for (let i = 0; i < fallbackCount; i++) {
    const idx = i;
    const timer = setTimeout(() => launchFallback(idx), opts.hedgingDelayMs + idx * 200);
    timers.push(timer);
  }

  try {
    const winner = await winnerPromise;
    for (const t of timers) clearTimeout(t);
    logger.info({ source: winner.source }, "hedged request: winner");
    return winner;
  } catch (e) {
    for (const t of timers) clearTimeout(t);
    throw e;
  }
}

/**
 * 简化版：从 Provider 链创建对冲请求
 */
export async function hedgedProviderCall<T>(
  providers: Array<{
    name: string;
    call: (signal: AbortSignal) => Promise<T>;
  }>,
  options?: Partial<HedgedOptions>,
): Promise<{ result: T; source: string }> {
  if (providers.length === 0) {
    throw new Error("no providers available for hedged request");
  }

  const [primary, ...fallbacks] = providers;
  const result = await hedgedRequest<T>(
    primary!.call,
    fallbacks.map((f) => f.call),
    options,
  );

  return {
    result: result.result,
    source: result.source === "primary" ? primary!.name : fallbacks[result.source as number]?.name ?? "unknown",
  };
}
