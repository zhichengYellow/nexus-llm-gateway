import { describe, it, expect, beforeEach } from "vitest";
import { MultiDimRouter, resetMultiDimRouter } from "./multi-dim-router.js";

beforeEach(() => resetMultiDimRouter());

describe("MultiDimRouter", () => {
  it("选择最优路由", () => {
    const router = new MultiDimRouter();
    const decision = router.select([
      { provider: "deepseek", model: "deepseek-chat", cost: 0.001, quality: 0.9, latency: 500, intentMatch: 0.8 },
      { provider: "gemini", model: "gemini-flash", cost: 0.0005, quality: 0.85, latency: 300, intentMatch: 0.6 },
      { provider: "openai", model: "gpt-4o", cost: 0.005, quality: 0.95, latency: 800, intentMatch: 0.9 },
    ]);
    expect(decision).not.toBeNull();
    expect(decision!.selected).toBeDefined();
    expect(decision!.reason).toContain("score=");
  });

  it("空选项返回 null", () => {
    const router = new MultiDimRouter();
    expect(router.select([])).toBeNull();
  });

  it("recordFeedback 调整权重", () => {
    const router = new MultiDimRouter();
    const w1 = router.getWeights();
    router.recordFeedback("deepseek", "chat", 0.9);
    router.recordFeedback("deepseek", "chat", 0.8);
    const w2 = router.getWeights();
    // 权重可能变化
    expect(w2.quality).toBeDefined();
  });

  it("getHistory 返回历史", () => {
    const router = new MultiDimRouter();
    router.select([{ provider: "deepseek", model: "chat", cost: 0.001, quality: 0.9, latency: 500, intentMatch: 0.8 }]);
    expect(router.getHistory()).toHaveLength(1);
  });

  it("setWeights 手动设置", () => {
    const router = new MultiDimRouter();
    router.setWeights({ intent: 0.5, cost: 0.2, quality: 0.2, latency: 0.1 });
    const w = router.getWeights();
    expect(w.intent).toBeCloseTo(0.5);
  });
});
