import { describe, it, expect } from "vitest";
import { QualityEvaluator } from "./quality-evaluator.js";

describe("QualityEvaluator", () => {
  it("evaluateSemanticPreservation 语义保持验证", () => {
    const e = new QualityEvaluator();
    const result = e.evaluateSemanticPreservation(
      "机器学习是人工智能的重要分支，通过数据训练模型",
      "机器学习是AI分支，训练模型"
    );
    // score 基于关键词保留率，至少要有一些匹配
    expect(result.score).toBeGreaterThan(0);
    expect(result.keyTermsTotal).toBeGreaterThan(0);
  });

  it("完全不同的文本得分低", () => {
    const e = new QualityEvaluator();
    const result = e.evaluateSemanticPreservation(
      "解释量子计算原理",
      "今天天气很好"
    );
    expect(result.score).toBeLessThan(0.5);
  });

  it("evaluateSummaryQuality 摘要质量", () => {
    const e = new QualityEvaluator();
    const result = e.evaluateSummaryQuality(
      [{ content: "机器学习是AI分支，通过数据训练模型" }, { content: "深度学习使用神经网络" }],
      "讨论了机器学习和深度学习"
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.completeness).toBeGreaterThan(0);
  });

  it("evaluateTokenEstimation 误差评估", () => {
    const e = new QualityEvaluator();
    const result = e.evaluateTokenEstimation(100, 120);
    expect(result.error).toBe(20);
    expect(result.errorRate).toBeGreaterThan(0);
  });
});
