import { describe, it, expect } from "vitest";
import { SemanticJudge } from "./semantic-judge.js";

describe("SemanticJudge", () => {
  it("等价 Prompt 判定为 true", () => {
    const judge = new SemanticJudge();
    const result = judge.isEquivalent("Transformer介绍一下", "Transformer是什么");
    expect(result.score).toBeGreaterThan(0);
  });

  it("不等价 Prompt 判定为 false", () => {
    const judge = new SemanticJudge();
    const result = judge.isEquivalent("解释机器学习", "今天天气怎么样", 0.5);
    expect(result.equivalent).toBe(false);
  });

  it("decide 高置信度 → return_cache", () => {
    const judge = new SemanticJudge();
    const result = judge.decide(0.9, 0.9, 100, 86400);
    expect(result.action).toBe("return_cache");
  });

  it("decide 中置信度 → return_and_refresh", () => {
    const judge = new SemanticJudge();
    const result = judge.decide(0.7, 0.7, 3600, 86400);
    expect(result.action).toBe("return_and_refresh");
  });

  it("decide 低置信度 → regenerate", () => {
    const judge = new SemanticJudge();
    const result = judge.decide(0.3, 0.3, 86000, 86400);
    expect(result.action).toBe("regenerate");
  });

  it("quickDecide 一行决策", () => {
    const judge = new SemanticJudge();
    const result = judge.quickDecide("Transformer介绍", "Transformer是什么", 0.8, 100, 86400);
    expect(result.action).toBeDefined();
  });
});
