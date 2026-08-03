import { describe, it, expect, beforeEach } from "vitest";
import { PromptCompiler, resetPromptCompiler } from "./prompt-compiler.js";

// 每个测试用独立实例，避免全局单例污染
function newCompiler() { return new PromptCompiler(); }

beforeEach(() => resetPromptCompiler());

describe("PromptCompiler", () => {
  it("编译基本文本", () => {
    const compiler = newCompiler();
    const ast = compiler.compile("  hello   world  ");
    expect(ast.compiled).toBe("hello world");
    expect(ast.tokens).toBeGreaterThan(0);
  });

  it("contextMerge 合并 System Prompt", () => {
    const compiler = newCompiler();
    const ast = compiler.compile("hello", { systemPrompt: "You are a helpful assistant." });
    expect(ast.compiled).toContain("You are a helpful assistant.");
    expect(ast.compiled).toContain("hello");
  });

  it("toolPrompt 注入工具列表", () => {
    const compiler = newCompiler();
    const ast = compiler.compile("search something", { tools: ["search", "calculate"] });
    expect(ast.compiled).toContain("search");
    expect(ast.compiled).toContain("calculate");
  });

  it("禁用的 Pass 被跳过", () => {
    const compiler = newCompiler();
    compiler.addPass({
      name: "rewrite",
      enabled: false,
      transform: () => "SKIPPED",
    });
    const ast = compiler.compile("hello");
    expect(ast.compiled).not.toBe("SKIPPED");
  });

  it("addPass 添加自定义 Pass", () => {
    const compiler = newCompiler();
    compiler.addPass({
      name: "custom",
      enabled: true,
      transform: (text) => `[CUSTOM] ${text}`,
    });
    const ast = compiler.compile("hello");
    expect(ast.compiled).toContain("[CUSTOM]");
  });

  it("compileMessages 编译消息列表", () => {
    const compiler = newCompiler();
    const result = compiler.compileMessages([
      { role: "user", content: "  hello  " },
      { role: "assistant", content: "  hi  " },
    ]);
    expect(result.messages[0]!.content).toBe("hello");
    expect(result.messages[1]!.content).toBe("hi");
    expect(result.tokens).toBeGreaterThan(0);
  });

  it("debug 返回每步信息", () => {
    const compiler = newCompiler();
    const lines = compiler.debug("  hello   world  ");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("rewrite");
  });
});
