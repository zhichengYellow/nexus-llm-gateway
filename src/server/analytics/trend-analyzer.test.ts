import { describe, it, expect } from "vitest";
import { TrendAnalyzer } from "./trend-analyzer.js";

describe("TrendAnalyzer", () => {
  it("analyze 上升趋势", () => {
    const ta = new TrendAnalyzer();
    const result = ta.analyze([
      { timestamp: 1, value: 100 },
      { timestamp: 2, value: 110 },
      { timestamp: 3, value: 120 },
      { timestamp: 4, value: 130 },
      { timestamp: 5, value: 140 },
    ]);
    expect(result.direction).toBe("up");
    expect(result.prediction).toBeGreaterThanOrEqual(130);
  });

  it("analyze 下降趋势", () => {
    const ta = new TrendAnalyzer();
    const result = ta.analyze([
      { timestamp: 1, value: 100 },
      { timestamp: 2, value: 90 },
      { timestamp: 3, value: 80 },
    ]);
    expect(result.direction).toBe("down");
  });

  it("analyze 稳定", () => {
    const ta = new TrendAnalyzer();
    const result = ta.analyze([
      { timestamp: 1, value: 100 },
      { timestamp: 2, value: 100 },
    ]);
    expect(result.direction).toBe("stable");
  });

  it("单点返回 stable", () => {
    const ta = new TrendAnalyzer();
    const result = ta.analyze([{ timestamp: 1, value: 100 }]);
    expect(result.direction).toBe("stable");
  });

  it("generateSuggestions 生成优化建议", () => {
    const ta = new TrendAnalyzer();
    const suggestions = ta.generateSuggestions({
      cacheHitRate: 0.2,
      avgQuality: 0.5,
      avgLatencyMs: 3000,
      costTrend: 0.15,
      qualityTrend: -0.1,
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.category === "cache")).toBe(true);
    expect(suggestions.some((s) => s.category === "cost")).toBe(true);
  });
});
