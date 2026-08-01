import { describe, it, expect, vi } from "vitest";
import { CircuitBreaker, CircuitBreakerRegistry } from "./circuit-breaker.js";
import { withRetry, isRetryable } from "./retry.js";
import { weightedPicker, buildWeightedChain } from "./weighted-router.js";

describe("CircuitBreaker 三态机", () => {
  it("CLOSED 放行", () => {
    const cb = new CircuitBreaker();
    expect(cb.allowRequest()).toBe(true);
    expect(cb.getState()).toBe("CLOSED");
  });

  it("连续失败达阈值 → OPEN 拒绝", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure(); cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.allowRequest()).toBe(false);
  });

  it("OPEN 超时 → HALF_OPEN 放行，探测成功恢复", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, openTimeoutMs: 50 });
    cb.recordFailure(); cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe("HALF_OPEN");
    expect(cb.allowRequest()).toBe(true);
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("HALF_OPEN 探测失败 → 重新 OPEN", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, openTimeoutMs: 30 });
    cb.recordFailure(); cb.recordFailure();
    await new Promise((r) => setTimeout(r, 40));
    expect(cb.getState()).toBe("HALF_OPEN");
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.allowRequest()).toBe(false);
  });

  it("reset 手动恢复", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure(); expect(cb.getState()).toBe("OPEN");
    cb.reset(); expect(cb.getState()).toBe("CLOSED");
  });
});

describe("withRetry 指数退避", () => {
  it("成功不重试", async () => {
    const fn = vi.fn(async () => "ok");
    await expect(withRetry(fn, { maxRetries: 3 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("失败达 maxRetries 抛错", async () => {
    const fn = vi.fn(async () => { throw new Error("boom"); });
    await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("重试后成功", async () => {
    let calls = 0;
    const fn = vi.fn(async () => { if (++calls < 3) throw new Error("x"); return "ok"; });
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).resolves.toBe("ok");
    expect(calls).toBe(3);
  });

  it("isRetryable 判定", () => {
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ status: 502 })).toBe(true);
    expect(isRetryable(new Error("fetch failed"))).toBe(true);
    expect(isRetryable({ status: 400 })).toBe(false);
  });
});

describe("weightedPicker / buildWeightedChain", () => {
  const shards = [
    { provider: "openai" as const, upstreamModel: "gpt-4o", weight: 50 },
    { provider: "deepseek" as const, upstreamModel: "deepseek-chat", weight: 30 },
    { provider: "qwen" as const, upstreamModel: "qwen-max", weight: 20 },
  ];

  it("按权重分布（openai ~50%）", () => {
    const counts: Record<string, number> = { openai: 0, deepseek: 0, qwen: 0 };
    const n = 2000;
    for (let i = 0; i < n; i++) { const p = weightedPicker(shards); if (p) counts[p.provider] = (counts[p.provider] ?? 0) + 1; }
    const rate = (counts["openai"] ?? 0) / n;
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.6);
  });

  it("熔断 provider 被跳过", () => {
    const b = new CircuitBreakerRegistry();
    const cb = b.get("openai:gpt-4o");
    for (let i = 0; i < 10; i++) cb.recordFailure();
    const p = weightedPicker(shards, b);
    expect(p).not.toBeNull();
    expect(p!.provider).not.toBe("openai");
  });

  it("全部熔断返回 null", () => {
    const b = new CircuitBreakerRegistry();
    for (const s of shards) { const c = b.get(`${s.provider}:${s.upstreamModel}`); for (let i = 0; i < 10; i++) c.recordFailure(); }
    expect(weightedPicker(shards, b)).toBeNull();
  });

  it("buildWeightedChain 返回 picked + 权重降序 fallbacks", () => {
    const chain = buildWeightedChain(shards);
    expect(chain.length).toBe(3);
    expect(chain[1]!.provider).toBe("openai");
    expect(chain[2]!.provider).toBe("deepseek");
  });
});