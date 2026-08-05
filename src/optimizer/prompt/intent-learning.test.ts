import { describe, it, expect, beforeEach } from "vitest";
import { IntentLearner, resetIntentLearner } from "./intent-learning.js";

beforeEach(() => resetIntentLearner());

describe("IntentLearner", () => {
  it("训练后预测意图", () => {
    const learner = new IntentLearner();
    learner.addSample("写一个 Python 函数", "code");
    learner.addSample("def hello(): pass", "code");
    learner.addSample("翻译成英文", "translation");
    learner.addSample("translate to chinese", "translation");

    const result = learner.predict("写一个函数");
    expect(result.intent).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("空训练数据返回 general", () => {
    const learner = new IntentLearner();
    const result = learner.predict("hello");
    expect(result.intent).toBe("general");
  });

  it("trainBatch 批量训练", () => {
    const learner = new IntentLearner();
    learner.trainBatch([
      { text: "代码", intent: "code", weight: 1 },
      { text: "编程", intent: "code", weight: 1 },
      { text: "翻译", intent: "translation", weight: 1 },
    ]);
    expect(learner.getIntents().length).toBeGreaterThan(0);
  });

  it("getDistribution 返回分布", () => {
    const learner = new IntentLearner();
    learner.addSample("code", "code");
    learner.addSample("code", "code");
    learner.addSample("translate", "translation");
    const dist = learner.getDistribution();
    expect(dist["code"]).toBeGreaterThan(dist["translation"]!);
  });

  it("getClassifier 返回信息", () => {
    const learner = new IntentLearner();
    learner.addSample("test", "general");
    const c = learner.getClassifier();
    expect(c.sampleCount).toBe(1);
  });
});
