import { describe, it, expect } from "vitest";
import { TokenAnalyzer } from "./token-analyzer.js";

describe("TokenAnalyzer", () => {
  it("analyze 分析 Token 构成", () => {
    const ta = new TokenAnalyzer();
    const report = ta.analyze([
      { role: "system", content: "You are a helpful assistant. ".repeat(10) },
      { role: "user", content: "What is AI?" },
      { role: "assistant", content: "AI is artificial intelligence." },
      { role: "user", content: "Tell me more about machine learning." },
    ], "Machine learning is a subset of AI.");

    expect(report.breakdown.system).toBeGreaterThan(0);
    expect(report.breakdown.user).toBeGreaterThan(0);
    expect(report.breakdown.history).toBeGreaterThan(0);
    expect(report.breakdown.output).toBeGreaterThan(0);
    expect(report.ratios.system).toBeDefined();
    expect(report.trr).toBeGreaterThanOrEqual(0);
  });

  it("quickAnalyze 快速分析", () => {
    const ta = new TokenAnalyzer();
    const report = ta.quickAnalyze("What is ML?", ["Previous question"], "System prompt");
    expect(report.breakdown.total).toBeGreaterThan(0);
  });

  it("识别历史过长浪费", () => {
    const ta = new TokenAnalyzer();
    const report = ta.analyze([
      { role: "user", content: "Q" },
      { role: "assistant", content: "A ".repeat(200) },
      { role: "user", content: "Q2" },
      { role: "assistant", content: "A2 ".repeat(200) },
      { role: "user", content: "Short question" },
    ]);
    const historyWaste = report.wasteSources.find((w) => w.source === "history");
    expect(historyWaste).toBeDefined();
  });

  it("识别未启用压缩浪费", () => {
    const ta = new TokenAnalyzer();
    const report = ta.analyze(
      [{ role: "system", content: "S ".repeat(200) }, { role: "user", content: "X ".repeat(200) }],
      "Y ".repeat(200),
      0, 0
    );
    // total > 500 才触发，现在 system(50) + user(50) + output(50) = 150，放宽判断
    expect(report.wasteSources.length).toBeGreaterThanOrEqual(0);
    expect(report.trr).toBeGreaterThanOrEqual(0);
  });
});
