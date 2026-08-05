import { describe, it, expect, beforeEach } from "vitest";
import { RequestJudge, resetRequestJudge } from "./request-judge.js";
import { resetSmartRoutingEngine } from "../routing/smart-routing.js";

beforeEach(() => { resetRequestJudge(); resetSmartRoutingEngine(); });

describe("RequestJudge", () => {
  it("evaluate 评估并记录", () => {
    const judge = new RequestJudge();
    const record = judge.evaluate(
      "req_001", "deepseek", "deepseek-chat",
      "解释机器学习", "机器学习是AI分支，通过数据训练模型",
      500
    );
    expect(record.score).toBeGreaterThan(0);
    expect(record.provider).toBe("deepseek");
  });

  it("getQualityStats 返回统计", () => {
    const judge = new RequestJudge();
    judge.evaluate("r1", "deepseek", "chat", "q", "a", 100);
    judge.evaluate("r2", "gemini", "flash", "q2", "a2", 200);

    const stats = judge.getQualityStats();
    expect(stats.total).toBe(2);
    expect(stats.byProvider["deepseek"]).toBeDefined();
    expect(stats.byProvider["gemini"]).toBeDefined();
  });

  it("getRecent 返回最近记录", () => {
    const judge = new RequestJudge();
    judge.evaluate("r1", "deepseek", "chat", "q", "a", 100);
    expect(judge.getRecent(1)).toHaveLength(1);
  });

  it("optimizeRouting 返回优化建议", () => {
    const judge = new RequestJudge();
    judge.evaluate("r1", "deepseek", "chat", "q", "a", 100);
    const result = judge.optimizeRouting();
    expect(result.action).toBeDefined();
  });
});
