import { describe, it, expect, beforeEach } from "vitest";
import { CostEstimator, BudgetController, resetCostControllers } from "./cost-controller.js";

beforeEach(() => resetCostControllers());

describe("CostEstimator", () => {
  it("estimateTokens 估算", () => {
    const e = new CostEstimator();
    expect(e.estimateTokens("hello")).toBe(2);
    expect(e.estimateTokens("")).toBe(0);
  });

  it("estimateCost 估算成本", () => {
    const e = new CostEstimator();
    const cost = e.estimateCost("hello world test", "deepseek", "deepseek-v4-flash");
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.001);
  });

  it("getPrice 查找价格", () => {
    const e = new CostEstimator();
    const p = e.getPrice("deepseek", "deepseek-v4-flash");
    expect(p).toBeDefined();
    expect(p!.inputPrice).toBe(0.27);
  });

  it("updatePrice 更新价格", () => {
    const e = new CostEstimator();
    e.updatePrice({ provider: "deepseek", model: "deepseek-v4-flash", inputPrice: 0.01, outputPrice: 0.01 });
    const p = e.getPrice("deepseek", "deepseek-v4-flash");
    expect(p!.inputPrice).toBe(0.01);
  });
});

describe("BudgetController", () => {
  it("setBudget 设置预算", () => {
    const bc = new BudgetController();
    bc.setBudget("t1", 100);
    const b = bc.getBudget("t1");
    expect(b).toBeDefined();
    expect(b!.monthlyBudget).toBe(100);
  });

  it("recordSpending 记录消费", () => {
    const bc = new BudgetController();
    bc.setBudget("t1", 1, "block");
    const r1 = bc.recordSpending("t1", 0.5);
    expect(r1.allowed).toBe(true);
    const r2 = bc.recordSpending("t1", 0.6);
    expect(r2.allowed).toBe(false);
  });

  it("warn 模式不阻止", () => {
    const bc = new BudgetController();
    bc.setBudget("t1", 0.001, "warn");
    const r = bc.recordSpending("t1", 100);
    expect(r.allowed).toBe(true);
  });

  it("无预算限制时允许所有", () => {
    const bc = new BudgetController();
    const r = bc.recordSpending("unknown", 1000);
    expect(r.allowed).toBe(true);
  });
});
