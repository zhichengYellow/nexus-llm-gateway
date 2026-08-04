import { describe, it, expect, beforeEach } from "vitest";
import { PromptCompressor, resetPromptCompressor } from "./compression.js";

beforeEach(() => resetPromptCompressor());

describe("PromptCompressor", () => {
  it("删除礼貌语", () => {
    const c = new PromptCompressor();
    const result = c.compress("请你帮我解释一下什么是机器学习，谢谢！");
    expect(result.compressed).not.toContain("请");
    expect(result.compressed).not.toContain("谢谢");
    expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
  });

  it("删除冗余修饰词", () => {
    const c = new PromptCompressor();
    const result = c.compress("这个非常重要的问题");
    expect(result.compressed).not.toContain("非常");
  });

  it("无礼貌语时保持原样", () => {
    const c = new PromptCompressor();
    const result = c.compress("解释机器学习");
    expect(result.compressed).toBe("解释机器学习");
  });

  it("compressSystem 去重", () => {
    const c = new PromptCompressor();
    const result = c.compressSystem("你是助手\n你是助手\n请回答");
    expect(result.split("\n").length).toBe(2);
  });

  it("getStats 统计", () => {
    const c = new PromptCompressor();
    const results = [
      c.compress("请帮我解释，谢谢"),
      c.compress("这个问题非常重要"),
    ];
    const stats = c.getStats(results);
    expect(stats.totalSaved).toBeGreaterThan(0);
  });
});
