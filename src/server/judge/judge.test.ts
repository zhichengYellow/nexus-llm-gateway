import { describe, it, expect, beforeEach } from "vitest";
import { JudgeEngine, resetJudgeEngine } from "./judge.js";

beforeEach(() => resetJudgeEngine());

describe("JudgeEngine", () => {
  it("evaluate 返回完整评分", () => {
    const judge = new JudgeEngine();
    const score = judge.evaluate(
      "解释一下什么是机器学习",
      "机器学习是人工智能的一个分支，它使计算机能够从数据中学习并做出预测或决策，而无需明确编程。",
    );
    expect(score.relevance).toBeGreaterThan(0);
    expect(score.accuracy).toBeGreaterThan(0);
    expect(score.fluency).toBeGreaterThan(0);
    expect(score.safety).toBeGreaterThan(0);
    expect(score.completeness).toBeGreaterThan(0);
    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThanOrEqual(1);
  });

  it("空响应得分低", () => {
    const judge = new JudgeEngine();
    const score = judge.evaluate("问题", "");
    expect(score.overall).toBeLessThan(0.5);
  });

  it("含错误标记的响应准确度低", () => {
    const judge = new JudgeEngine();
    const score = judge.evaluate("复杂问题", "Sorry, I cannot answer this. I don't know. 抱歉，无法回答。");
    expect(score.accuracy).toBeLessThan(0.7);
  });

  it("evaluateBatch 批量评估", () => {
    const judge = new JudgeEngine();
    const result = judge.evaluateBatch([
      { prompt: "你好", response: "你好！有什么可以帮助你的？", model: "m1", provider: "p1" },
      { prompt: "写代码", response: "def hello(): print('hello')", model: "m2", provider: "p2" },
    ]);

    expect(result.results).toHaveLength(2);
    expect(result.summary.total).toBe(2);
    expect(result.summary.best).toBeDefined();
  });
});
