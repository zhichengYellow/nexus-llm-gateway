import { describe, it, expect, beforeEach } from "vitest";
import { CacheConfidence, resetCacheConfidence } from "./cache-confidence.js";

beforeEach(() => resetCacheConfidence());

describe("CacheConfidence", () => {
  it("新缓存条目置信度高", () => {
    const cc = new CacheConfidence();
    const result = cc.evaluate({
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      hits: 5,
      ttl: 86400,
    });
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.useCache).toBe(true);
  });

  it("旧缓存条目置信度低", () => {
    const cc = new CacheConfidence();
    const result = cc.evaluate({
      createdAt: Date.now() - 7 * 86400000, // 7 天前
      lastAccessedAt: Date.now() - 7 * 86400000,
      hits: 0,
      ttl: 86400,
    });
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("高频命中的缓存置信度高", () => {
    const cc = new CacheConfidence();
    const result = cc.evaluate({
      createdAt: Date.now() - 3600000,
      lastAccessedAt: Date.now(),
      hits: 20,
      ttl: 86400,
    });
    expect(result.factors.hitsScore).toBeGreaterThan(0.8);
  });

  it("时效性类别降低置信度", () => {
    const cc = new CacheConfidence();
    const result = cc.evaluate({
      createdAt: Date.now() - 300000, // 5 分钟前
      lastAccessedAt: Date.now(),
      hits: 1,
      ttl: 30, // 价格类 30s TTL
      category: "price",
      originalTtl: 30,
    });
    expect(result.factors.categoryScore).toBeLessThan(0.5);
  });

  it("shouldUseCache 快速判断", () => {
    const cc = new CacheConfidence();
    expect(cc.shouldUseCache({
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      hits: 10,
      ttl: 86400,
    })).toBe(true);
  });
});
