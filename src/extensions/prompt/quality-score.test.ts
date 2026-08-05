import { describe, it, expect, beforeEach } from "vitest";
import { QualityScoreRouter, resetQualityScoreRouter } from "./quality-score.js";

beforeEach(() => resetQualityScoreRouter());

describe("QualityScoreRouter", () => {
  it("初始状态 score 返回默认值", () => {
    const router = new QualityScoreRouter();
    const result = router.score("deepseek", "deepseek-chat");
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
    expect(result!.quality).toBe(0.5);
  });

  it("record 后更新指标", () => {
    const router = new QualityScoreRouter();
    router.record("deepseek", "deepseek-chat", true, 500, 0.001);
    router.record("deepseek", "deepseek-chat", true, 600, 0.002);

    const result = router.score("deepseek", "deepseek-chat");
    expect(result!.quality).toBe(1); // 2/2 成功
    expect(result!.metrics.totalRequests).toBe(2);
  });

  it("失败降低质量评分", () => {
    const router = new QualityScoreRouter();
    router.record("gemini", "flash", true, 100, 0.001);
    router.record("gemini", "flash", false, 5000, 0.001);
    router.record("gemini", "flash", true, 100, 0.001);

    const quality = router.getQuality("gemini", "flash");
    expect(quality).toBeCloseTo(0.667, 1); // 2/3
  });

  it("selectBest 选择最高评分 Provider", () => {
    const router = new QualityScoreRouter();
    router.record("deepseek", "chat", true, 200, 0.0001);
    router.record("deepseek", "chat", true, 200, 0.0001);
    router.record("gemini", "flash", false, 3000, 0.01);
    router.record("gemini", "flash", false, 3000, 0.01);

    const best = router.selectBest([
      { provider: "deepseek", model: "chat" },
      { provider: "gemini", model: "flash" },
    ]);
    expect(best).not.toBeNull();
    expect(best!.provider).toBe("deepseek");
  });

  it("空候选项返回 null", () => {
    const router = new QualityScoreRouter();
    expect(router.selectBest([])).toBeNull();
  });

  it("getAllMetrics 返回所有指标", () => {
    const router = new QualityScoreRouter();
    router.record("deepseek", "chat", true, 100, 0.001);
    expect(router.getAllMetrics()).toHaveLength(1);
  });
});
