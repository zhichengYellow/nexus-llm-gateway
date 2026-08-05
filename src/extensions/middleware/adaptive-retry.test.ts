/**
 * Nexus LLM Gateway - Adaptive Retry 测试
 */
import { describe, it, expect, vi } from "vitest";
import {
  withAdaptiveRetry,
  isRetryableStatus,
  parseRetryAfter,
} from "./adaptive-retry.js";

describe("isRetryableStatus", () => {
  it("429 可重试", () => {
    const r = isRetryableStatus({ status: 429 });
    expect(r.retryable).toBe(true);
    expect(r.strategy?.baseDelayMs).toBe(1000);
  });

  it("500 可重试", () => {
    const r = isRetryableStatus({ status: 500 });
    expect(r.retryable).toBe(true);
    expect(r.strategy?.baseDelayMs).toBe(200);
  });

  it("502/503 可重试", () => {
    expect(isRetryableStatus({ status: 502 }).retryable).toBe(true);
    expect(isRetryableStatus({ status: 503 }).retryable).toBe(true);
  });

  it("400 不可重试", () => {
    const r = isRetryableStatus({ status: 400 });
    expect(r.retryable).toBe(false);
  });

  it("404 不可重试", () => {
    expect(isRetryableStatus({ status: 404 }).retryable).toBe(false);
  });

  it("网络错误（无 status）可重试", () => {
    const r = isRetryableStatus(new Error("fetch failed"));
    expect(r.retryable).toBe(true);
    expect(r.status).toBeUndefined();
  });
});

describe("withAdaptiveRetry 自适应重试", () => {
  it("成功不重试", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withAdaptiveRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("429 使用长退避策略重试", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw { status: 429, message: "rate limited" };
      return "ok";
    });

    const result = await withAdaptiveRetry(fn, { maxRetries: 3 });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("500 使用短退避策略重试", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw { status: 500, message: "internal error" };
      return "ok";
    });

    const result = await withAdaptiveRetry(fn, { maxRetries: 3 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("不可重试的状态码立即抛错", async () => {
    const fn = vi.fn(async () => {
      throw { status: 400, message: "bad request" };
    });

    await expect(withAdaptiveRetry(fn, { maxRetries: 3 })).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1); // 不重试
  });

  it("达到 maxRetries 后抛最后一次错误", async () => {
    const fn = vi.fn(async () => {
      throw { status: 503, message: "unavailable" };
    });

    await expect(withAdaptiveRetry(fn, { maxRetries: 1 })).rejects.toThrow("unavailable");
    expect(fn).toHaveBeenCalledTimes(2); // 1 + 1 次重试
  });

  it("总超时后抛错", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 200));
      throw { status: 503, message: "unavailable" };
    });

    await expect(
      withAdaptiveRetry(fn, { maxRetries: 10, totalTimeoutMs: 100 }),
    ).rejects.toThrow("total timeout");
  });

  it("attempt 参数传递给 fn", async () => {
    const attempts: number[] = [];
    const fn = vi.fn(async (attempt) => {
      attempts.push(attempt);
      if (attempt < 1) throw { status: 503, message: "unavailable" };
      return "ok";
    });

    await withAdaptiveRetry(fn, { maxRetries: 3 });
    expect(attempts).toEqual([0, 1]);
  });
});

describe("parseRetryAfter", () => {
  it("解析数字秒", () => {
    expect(parseRetryAfter("30")).toBe(30);
  });

  it("null 返回 null", () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it("无效字符串返回 null", () => {
    expect(parseRetryAfter("invalid")).toBeNull();
  });
});
