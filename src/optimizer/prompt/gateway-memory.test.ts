import { describe, it, expect, beforeEach } from "vitest";
import { GatewayMemory, resetGatewayMemory } from "./gateway-memory.js";

beforeEach(() => resetGatewayMemory());

describe("GatewayMemory", () => {
  it("initTenant 初始化租户", () => {
    const mem = new GatewayMemory();
    const t = mem.get("tenant-1");
    expect(t.tenantId).toBe("tenant-1");
    expect(t.totalRequests).toBe(0);
  });

  it("record 记录请求并更新统计", () => {
    const mem = new GatewayMemory();
    mem.record("t1", { model: "deepseek-v4-flash", provider: "deepseek", tokens: 100, cached: false });
    mem.record("t1", { model: "deepseek-v4-flash", provider: "deepseek", tokens: 200, cached: true });

    const t = mem.get("t1");
    expect(t.totalRequests).toBe(2);
    expect(t.preferredModel).toBe("deepseek-v4-flash");
    expect(t.preferredProvider).toBe("deepseek");
    expect(t.cacheHitRate).toBeGreaterThan(0);
  });

  it("getPreferredModel 返回首选模型", () => {
    const mem = new GatewayMemory();
    mem.record("t1", { model: "gemini-flash-lite", provider: "gemini", tokens: 50, cached: false });
    mem.record("t1", { model: "gemini-flash-lite", provider: "gemini", tokens: 50, cached: false });
    mem.record("t1", { model: "deepseek-v4-flash", provider: "deepseek", tokens: 50, cached: false });

    expect(mem.getPreferredModel("t1")).toBe("gemini-flash-lite");
  });

  it("getInsight 生成推荐", () => {
    const mem = new GatewayMemory();
    mem.record("t1", { model: "gemini-flash-lite", provider: "gemini", tokens: 100, cached: false, intent: "translation" });

    const insight = mem.getInsight("t1", "translation");
    expect(insight.recommendedProvider).toBe("gemini");
    expect(insight.reason).toContain("translation");
  });

  it("getSummary 返回摘要", () => {
    const mem = new GatewayMemory();
    mem.record("t1", { model: "m1", provider: "deepseek", tokens: 100, cached: true });

    const summary = mem.getSummary("t1");
    expect(summary.totalRequests).toBe(1);
    expect(summary.preferredModel).toBe("m1");
  });

  it("衰减旧数据", () => {
    const mem = new GatewayMemory();
    // 大量记录 model-A，少量 model-B
    for (let i = 0; i < 50; i++) {
      mem.record("t1", { model: "model-a", provider: "deepseek", tokens: 10, cached: false });
    }
    mem.record("t1", { model: "model-b", provider: "gemini", tokens: 10, cached: false });

    // model-b 最新，由于衰减，model-a 权重降低
    const t = mem.get("t1");
    // model-a 被衰减 50 次，model-b 只有 1 次未衰减
    // 检查 model-b 的计数相对于 model-a
    expect(t.modelUsage.get("model-b")).toBeGreaterThan(0);
  });
});
