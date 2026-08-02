/**
 * Nexus LLM Gateway - Prompt Router 测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PromptRouter, resetPromptRouter } from "../prompt/router.js";

beforeEach(() => {
  resetPromptRouter();
});

describe("PromptRouter 意图分类", () => {
  it("代码类路由到 DeepSeek", () => {
    const router = new PromptRouter();
    const result = router.classify("写一个 Python 快速排序算法");
    expect(result.provider).toBe("deepseek");
    expect(result.category).toBe("代码/编程");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("翻译类路由到 Gemini", () => {
    const router = new PromptRouter();
    const result = router.classify("请把这段话翻译成英文：你好世界");
    expect(result.provider).toBe("gemini");
    expect(result.category).toBe("翻译/多语言");
    expect(result.model).toBe("gemini-flash-lite");
  });

  it("数学推理路由到 DeepSeek", () => {
    const router = new PromptRouter();
    const result = router.classify("证明这个数学公式：a^2 + b^2 = c^2");
    expect(result.provider).toBe("deepseek");
    expect(result.category).toBe("数学/推理");
  });

  it("创意写作路由到 Gemini", () => {
    const router = new PromptRouter();
    const result = router.classify("帮我写一首关于春天的诗");
    expect(result.provider).toBe("gemini");
  });

  it("常识问答走默认路由", () => {
    const router = new PromptRouter();
    const result = router.classify("今天天气怎么样？");
    expect(result.matchedRule).toBe("general");
  });

  it("代码块正则匹配", () => {
    const router = new PromptRouter();
    const result = router.classify("这段代码有什么问题？\n```\nfunction foo() {}\n```");
    expect(result.provider).toBe("deepseek");
  });

  it("addRule 添加自定义规则", () => {
    const router = new PromptRouter();
    router.addRule({
      name: "custom",
      category: "自定义",
      targetProvider: "ollama",
      keywords: ["自定义触发词"],
      patterns: [],
      priority: 100,
    });
    const result = router.classify("这是一个自定义触发词的问题");
    expect(result.provider).toBe("ollama");
    expect(result.matchedRule).toBe("custom");
  });

  it("removeRule 移除规则", () => {
    const router = new PromptRouter();
    router.removeRule("code");
    router.removeRule("creative");
    const result = router.classify("写一个 Python 函数");
    // 没有代码和创意规则，走默认
    expect(result.matchedRule).toBe("general");
  });

  it("classifyBatch 批量分类", () => {
    const router = new PromptRouter();
    const results = router.classifyBatch([
      "写一个排序算法",
      "翻译成英文",
      "今天天气怎么样",
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]!.provider).toBe("deepseek");
    expect(results[1]!.provider).toBe("gemini");
  });
});
