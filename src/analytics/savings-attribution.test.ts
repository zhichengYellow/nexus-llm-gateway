import { describe, it, expect } from "vitest";
import { attributeSavings, summarizeSavings } from "./savings-attribution.js";

describe("savings-attribution (节省归因,防 double counting)", () => {
  it("无优化 → NONE,不产生节省", () => {
    const a = attributeSavings({ cached: false, compressionRatio: 0, savedTokens: 0 });
    expect(a.source).toBe("NONE");
    expect(a.savedTokens).toBe(0);
  });

  it("缓存命中 → CACHE(ACTUAL),即使其他字段也有值也只归缓存", () => {
    const a = attributeSavings({ cached: true, compressionRatio: 0.5, savedTokens: 120, savedCostMicro: 30, routerReason: "cheap" });
    expect(a.source).toBe("CACHE");
    expect(a.kind).toBe("ACTUAL");
    expect(a.savedTokens).toBe(120);
  });

  it("压缩 → COMPRESSION(ACTUAL),不与路由重复计", () => {
    const a = attributeSavings({ cached: false, compressionRatio: 0.3, savedTokens: 50, savedCostMicro: 10, routerReason: "cost-optimized" });
    expect(a.source).toBe("COMPRESSION");
    expect(a.kind).toBe("ACTUAL");
  });

  it("路由决策 → ROUTING(ESTIMATED)", () => {
    const a = attributeSavings({ cached: false, compressionRatio: 0, savedTokens: 20, savedCostMicro: 8, routerReason: "score=0.5 cost=cheapest" });
    expect(a.source).toBe("ROUTING");
    expect(a.kind).toBe("ESTIMATED");
  });

  it("SingleFlight 去重等待者 → DEDUP(不重复计费,savedTokens=0)", () => {
    const a = attributeSavings({ cached: false, deduped: true, compressionRatio: 0, savedTokens: 0 });
    expect(a.source).toBe("DEDUP");
    expect(a.savedTokens).toBe(0);
    expect(a.kind).toBe("ACTUAL");
    const s = summarizeSavings([{ cached: false, deduped: true, savedTokens: 0 }]);
    expect(s.DEDUP.tokens).toBe(0);
  });

  it("压缩+路由双决策仍互斥归 COMPRESSION(MULTI 枚举保留不参与)", () => {
    const a = attributeSavings({ cached: false, compressionRatio: 0.3, savedTokens: 50, routerReason: "cost-optimized" });
    expect(a.source).toBe("COMPRESSION");
    const s = summarizeSavings([{ cached: false, compressionRatio: 0.3, savedTokens: 50, routerReason: "cost-optimized" }]);
    expect(s.MULTI.tokens).toBe(0);
    expect(s.COMPRESSION.tokens).toBe(50);
  });

  it("多优化不重复累加: summarize 按互斥来源分组", () => {
    const s = summarizeSavings([
      { cached: true, savedTokens: 100, savedCostMicro: 20 },
      { cached: false, compressionRatio: 0.4, savedTokens: 60, savedCostMicro: 10 },
      { cached: false, compressionRatio: 0, savedTokens: 30, routerReason: "cost-first" },
      { cached: false, compressionRatio: 0, savedTokens: 0 },
    ]);
    expect(s.CACHE.tokens).toBe(100);
    expect(s.COMPRESSION.tokens).toBe(60);
    expect(s.ROUTING.tokens).toBe(30);
    expect(s.NONE.tokens).toBe(0);
    // 总计 = 各来源之和（无重复）
    const total = Object.values(s).reduce((acc, v) => acc + v.tokens, 0);
    expect(total).toBe(190);
  });

  it("缓存命中压缩比也非零: 仅归 CACHE(缓存优先)", () => {
    const a = attributeSavings({ cached: true, compressionRatio: 0.9, savedTokens: 300 });
    expect(a.source).toBe("CACHE");
  });
});
