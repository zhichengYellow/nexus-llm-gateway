import { describe, it, expect, beforeEach } from "vitest";
import { CacheAutoRefresh, resetCacheAutoRefresh } from "./cache-auto-refresh.js";

beforeEach(() => resetCacheAutoRefresh());

describe("CacheAutoRefresh", () => {
  it("recordHit 记录热门Prompt", () => {
    const ar = new CacheAutoRefresh();
    ar.recordHit("解释机器学习", 200);
    ar.recordHit("解释机器学习", 150);
    ar.recordHit("解释深度学习", 300);

    const hot = ar.getHotPrompts(5);
    expect(hot.length).toBeGreaterThanOrEqual(1);
    expect(hot[0]!.hits).toBe(2);
  });

  it("needsRefresh 判断", () => {
    const ar = new CacheAutoRefresh();
    expect(ar.needsRefresh(0.7)).toBe(true);
    expect(ar.needsRefresh(0.95)).toBe(false);
    expect(ar.needsRefresh(0.4)).toBe(false);
  });

  it("needsRegenerate 判断", () => {
    const ar = new CacheAutoRefresh();
    expect(ar.needsRegenerate(0.3)).toBe(true);
    expect(ar.needsRegenerate(0.8)).toBe(false);
  });

  it("learnTtl 学习动态TTL", () => {
    const ar = new CacheAutoRefresh();
    ar.learnTtl("code", 86400);
    ar.learnTtl("code", 604800);
    expect(ar.getDynamicTtl("code", 86400)).toBeGreaterThan(0);
  });

  it("enqueueRefresh 刷新队列", () => {
    const ar = new CacheAutoRefresh();
    ar.enqueueRefresh("hash1", "prompt1");
    expect(ar.getRefreshQueue()).toHaveLength(1);
  });
});
