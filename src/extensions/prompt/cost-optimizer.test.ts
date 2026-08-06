import { describe, it, expect, beforeEach } from "vitest";
import { CostOptimizer, resetCostOptimizer } from "./cost-optimizer.js";

beforeEach(() => resetCostOptimizer());

describe("CostOptimizer", () => {
  it("estimateTokens 估算 token 数", () => {
    const opt = new CostOptimizer();
    expect(opt.estimateTokens("hello")).toBe(2); // 5/4 = 1.25 → 2
    expect(opt.estimateTokens("")).toBe(1);
  });

  it("estimateCost 估算成本", () => {
    const opt = new CostOptimizer();
    // deepseek-v4-flash: input $0.27/M, output $1.10/M
    const cost = opt.estimateCost("hello world test", "deepseek", "deepseek-v4-flash");
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });

  it("optimize 选择最优 Provider", () => {
    const opt = new CostOptimizer();
    const result = opt.optimize("hello", [
      { provider: "deepseek", model: "deepseek-v4-flash" },
      { provider: "gemini", model: "gemini-flash-lite" },
    ]);
    expect(result).not.toBeNull();
    // Gemini 更便宜
    expect(result!.provider).toBe("gemini");
    expect(result!.score).toBeGreaterThan(0);
  });

  it("预算限制过滤超预算 Provider", () => {
    const opt = new CostOptimizer();
    const result = opt.optimize(
      "a very long prompt ".repeat(100),
      [{ provider: "deepseek", model: "deepseek-v4-flash" }],
      0.0001, // 极小预算
    );
    expect(result).toBeNull();
  });

  it("空候选项返回 null", () => {
    const opt = new CostOptimizer();
    expect(opt.optimize("hello", [])).toBeNull();
  });

  it("updatePrice 更新价格表", () => {
    const opt = new CostOptimizer();
    opt.updatePrice({ provider: "deepseek", model: "deepseek-v4-flash", inputPrice: 0.01, outputPrice: 0.01 });
    const result = opt.optimize("hello", [{ provider: "deepseek", model: "deepseek-v4-flash" }]);
    expect(result).not.toBeNull();
    expect(result!.estimatedCost).toBeLessThan(0.0001);
  });

  it("updateMetrics 影响评分", () => {
    const opt = new CostOptimizer();
    opt.updateMetrics("deepseek", "deepseek-v4-flash", 0.5, 3000); // 低成功率，高延迟
    opt.updateMetrics("gemini", "gemini-flash-lite", 0.99, 200); // 高成功率，低延迟

    const result = opt.optimize("hello", [
      { provider: "deepseek", model: "deepseek-v4-flash" },
      { provider: "gemini", model: "gemini-flash-lite" },
    ]);
    expect(result!.provider).toBe("gemini");
  });
});
