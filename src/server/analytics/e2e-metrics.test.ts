/**
 * E2E Metrics Collector 测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import { E2EMetricsCollector, getE2ECollector, resetE2ECollector, type MetricPoint } from "../analytics/e2e-metrics.js";

function makePoint(overrides: Partial<MetricPoint> = {}): MetricPoint {
  return {
    requestId: "req-" + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    entryTokens: 1000,
    optimizedTokens: 600,
    outputTokens: 400,
    totalCostMicro: 2000,
    savedCostMicro: 800,
    qualityScore: 0.92,
    latencyMs: 350,
    savingsBreakdown: { compression: 160, cache: 160, routing: 80 },
    ...overrides,
  };
}

describe("E2EMetricsCollector", () => {
  let collector: E2EMetricsCollector;

  beforeEach(() => {
    resetE2ECollector();
    collector = new E2EMetricsCollector();
    collector.disablePersistence();
  });

  it("应正确计算 TRR", () => {
    collector.record(makePoint({ entryTokens: 1000, optimizedTokens: 600 }));
    const m = collector.compute();
    expect(m.trr).toBeCloseTo(0.4, 2);
  });

  it("应正确计算 CSR", () => {
    collector.record(makePoint({ totalCostMicro: 1000, savedCostMicro: 400 }));
    const m = collector.compute();
    expect(m.csr).toBeCloseTo(0.4, 2);
  });

  it("无数据时应返回零值", () => {
    const m = collector.compute();
    expect(m.trr).toBe(0);
    expect(m.csr).toBe(0);
    expect(m.requestCount).toBe(0);
  });

  it("应正确计算加权平均质量分", () => {
    collector.record(makePoint({ qualityScore: 0.8 }));
    collector.record(makePoint({ qualityScore: 0.9 }));
    collector.record(makePoint({ qualityScore: 1.0 }));
    const m = collector.compute();
    expect(m.avgQualityScore).toBeCloseTo(0.9, 1);
    expect(m.requestCount).toBe(3);
  });

  it("应正确聚合请求计数", () => {
    for (let i = 0; i < 5; i++) collector.record(makePoint());
    expect(collector.compute().requestCount).toBe(5);
  });

  it("应正确计算 savedTokens", () => {
    collector.record(makePoint({ entryTokens: 800, optimizedTokens: 500 }));
    const m = collector.compute();
    expect(m.savedTokens).toBe(300);
  });

  it("优化后 tokens 不应多于原始 tokens", () => {
    collector.record(makePoint({ entryTokens: 500, optimizedTokens: 800 }));
    const m = collector.compute();
    expect(m.savedTokens).toBe(0); // savedTokens 不小于 0
  });

  it("getRecentPoints 应返回最近的点", () => {
    collector.record(makePoint({ requestId: "first" }));
    collector.record(makePoint({ requestId: "last" }));
    const recent = collector.getRecentPoints(1);
    expect(recent.length).toBe(1);
    expect(recent[0]!.requestId).toBe("last");
  });

  it("reset 应清空内存", () => {
    collector.record(makePoint());
    collector.reset();
    expect(collector.compute().requestCount).toBe(0);
  });
});

describe("全局单例", () => {
  it("getE2ECollector 应返回同一个实例", () => {
    resetE2ECollector();
    const a = getE2ECollector();
    const b = getE2ECollector();
    expect(a).toBe(b);
  });
});
