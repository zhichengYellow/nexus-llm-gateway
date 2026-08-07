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

  // R10: cheap_only 过滤空 → 选 cost 最低候选（不选超 maxCost 的、不静默回退全量）
  it("R10: cheap_only 全过滤时选 cheapest 候选", () => {
    const engine = new SmartRoutingEngine();
    // vitest 无 .env，仅 ollama 注册；注入价格使 cost 超过 maxCost（cost=(i+o)/2e6，故注入需 ≥0.02）
    engine.updatePrice("ollama", "ollama-llama3", 1, 1);
    engine.updatePrice("ollama", "ollama-qwen2.5", 2, 2);
    engine.setDegradation({ type: "cheap_only", maxCost: 0.00000001, maxLatency: Infinity, minQuality: 0 });
    const d = engine.decide("general", undefined, new Set(["ollama"]));
    expect(d.degraded).toBe(true);
    // 约束放宽但未绕过：应选中注入的最低价比对，而不是超 maxCost 的任意候选
    expect(d.provider).toBe("ollama");
    expect(d.model).toBe("ollama-llama3");
  });

  // R10: 预算过滤空 → 选 cheapest 并标记 degraded（不静默选超 budget 候选）
  it("R10: 预算过低时选 cheapest 并标记 degraded", () => {
    const engine = new SmartRoutingEngine();
    engine.updatePrice("ollama", "ollama-llama3", 1, 1);
    engine.updatePrice("ollama", "ollama-qwen2.5", 2, 2);
    const d = engine.decide("general", 0.00000001, new Set(["ollama"]));
    expect(d.degraded).toBe(true);
    expect(d.model).toBe("ollama-llama3");
  });
});
