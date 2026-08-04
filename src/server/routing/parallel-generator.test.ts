import { describe, it, expect } from "vitest";
import { ParallelGenerator } from "./parallel-generator.js";

describe("ParallelGenerator", () => {
  it("generate 并行调用并返回最优", async () => {
    const gen = new ParallelGenerator();
    const result = await gen.generate([
      {
        provider: "deepseek", model: "deepseek-chat", prompt: "解释AI",
        call: async () => "AI是人工智能的缩写，指能够模拟人类智能的系统。",
      },
      {
        provider: "gemini", model: "gemini-flash", prompt: "解释AI",
        call: async () => "AI stands for Artificial Intelligence.",
      },
    ]);

    expect(result.best.success).toBe(true);
    expect(result.all).toHaveLength(2);
    expect(result.strategy).toBeDefined();
  });

  it("部分失败不影响整体", async () => {
    const gen = new ParallelGenerator();
    const result = await gen.generate([
      {
        provider: "deepseek", model: "deepseek-chat", prompt: "test",
        call: async () => { throw new Error("fail"); },
      },
      {
        provider: "gemini", model: "gemini-flash", prompt: "test",
        call: async () => "success response",
      },
    ]);

    expect(result.best.success).toBe(true);
    expect(result.best.provider).toBe("gemini");
  });

  it("空请求抛错", async () => {
    const gen = new ParallelGenerator();
    await expect(gen.generate([])).rejects.toThrow("no requests");
  });
});
