/**
 * Nexus LLM Gateway - Hedged Request 测试
 */
import { describe, it, expect, vi } from "vitest";
import { hedgedRequest, hedgedProviderCall } from "./hedged-request.js";

describe("hedgedRequest 对冲请求", () => {
  it("主请求快速返回时不触发对冲", async () => {
    const primary = vi.fn(async (signal: AbortSignal) => {
      await new Promise((r) => setTimeout(r, 10));
      return "primary";
    });
    const fallback = vi.fn(async () => "fallback");

    const result = await hedgedRequest(primary, [fallback], { hedgingDelayMs: 1000 });
    expect(result.result).toBe("primary");
    expect(result.source).toBe("primary");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("主请求超时后触发对冲，备用先返回", async () => {
    const primary = vi.fn(async (signal: AbortSignal) => {
      // 主请求故意慢，让对冲有机会触发
      await new Promise((r) => setTimeout(r, 500));
      if (signal.aborted) throw new Error("aborted");
      return "primary";
    });
    const fallback = vi.fn(async (signal: AbortSignal) => {
      // 备用快速返回
      await new Promise((r) => setTimeout(r, 20));
      return "fallback";
    });

    const result = await hedgedRequest(primary, [fallback], { hedgingDelayMs: 50 });
    expect(result.result).toBe("fallback");
    expect(result.source).toBe(0);
    expect(fallback).toHaveBeenCalled();
  });

  it("所有请求都失败时抛错", async () => {
    const primary = vi.fn(async () => { throw new Error("p fail"); });
    const fallback = vi.fn(async () => { throw new Error("f fail"); });

    await expect(
      hedgedRequest(primary, [fallback], { hedgingDelayMs: 50 }),
    ).rejects.toThrow();
  });

  it("maxHedged 限制对冲数量", async () => {
    const calls: string[] = [];
    const mkFn = (name: string) => async () => {
      calls.push(name);
      await new Promise((r) => setTimeout(r, 300));
      return name;
    };

    const primary = vi.fn(mkFn("primary"));
    const fb1 = vi.fn(mkFn("fb1"));
    const fb2 = vi.fn(mkFn("fb2"));
    const fb3 = vi.fn(mkFn("fb3"));

    const result = await hedgedRequest(primary, [fb1, fb2, fb3], {
      hedgingDelayMs: 10,
      maxHedged: 2,
    });

    expect(result.source).toBe("primary");
    // 最多触发 2 个对冲
    expect(fb3).not.toHaveBeenCalled();
  });
});

describe("hedgedProviderCall", () => {
  it("多 Provider 对冲调用", async () => {
    const providers = [
      {
        name: "deepseek",
        call: vi.fn(async () => {
          // 主请求慢
          await new Promise((r) => setTimeout(r, 300));
          return "ds-result";
        }),
      },
      {
        name: "gemini",
        call: vi.fn(async () => {
          // 备用快
          await new Promise((r) => setTimeout(r, 20));
          return "gm-result";
        }),
      },
    ];

    const result = await hedgedProviderCall(providers, { hedgingDelayMs: 50 });
    expect(result.result).toBe("gm-result");
    expect(result.source).toBe("gemini");
  });

  it("空 Provider 列表抛错", async () => {
    await expect(hedgedProviderCall([])).rejects.toThrow("no providers available");
  });
});
