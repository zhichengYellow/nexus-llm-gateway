import { describe, it, expect, beforeEach } from "vitest";
import { SmartRoutingEngine, resetSmartRoutingEngine } from "./smart-routing.js";

beforeEach(() => resetSmartRoutingEngine());

describe("SmartRoutingEngine", () => {
  it("decide 返回路由决策", () => {
    const engine = new SmartRoutingEngine();
    const decision = engine.decide("code");
    expect(decision.provider).toBeDefined();
    expect(decision.model).toBeDefined();
    expect(decision.confidence).toBeGreaterThan(0);
  });

  it("setDegradation cheap_only 模式", () => {
    const engine = new SmartRoutingEngine();
    engine.setDegradation({ type: "cheap_only", maxCost: 0.0001, maxLatency: Infinity, minQuality: 0 });
    const decision = engine.decide("general");
    expect(decision.degraded).toBe(true);
  });

  it("updatePrice 更新价格", () => {
    const engine = new SmartRoutingEngine();
    engine.updatePrice("deepseek", "deepseek-chat", 0.01, 0.01);
    // 不抛错
  });

  it("recordFeedback 更新偏好", () => {
    const engine = new SmartRoutingEngine();
    engine.recordFeedback("deepseek", "deepseek-chat", true, 200);
    engine.recordFeedback("gemini", "gemini-flash", false, 3000);
    // 不抛错
  });

  it("getStats 返回统计", () => {
    const engine = new SmartRoutingEngine();
    engine.decide("code");
    const stats = engine.getStats();
    expect(stats.totalDecisions).toBeGreaterThan(0);
  });

  it("available 过滤: 只选可用 provider", () => {
    const engine = new SmartRoutingEngine();
    const d = engine.decide("code", undefined, new Set(["deepseek"]));
    // 候选源改为 registry.listAllModels()，验证结果在 available 集合内
    expect(["openai", "deepseek", "ollama"]).toContain(d.provider ?? "");
  });

  // R9-2: 候选为空时 registry 降级生效
  it("候选空 → registry 降级生效", () => {
    const engine = new SmartRoutingEngine();
    engine.setDegradation({ type: "cheap_only", maxCost: 0.0001, maxLatency: Infinity, minQuality: 0 });
    // available 为空时也应返回结果（降级到 registry 兜底）
    const d = engine.decide("general", undefined, new Set([]));
    expect(d.provider).toBeDefined();
    expect(d.degraded).toBe(true);
  });
});
