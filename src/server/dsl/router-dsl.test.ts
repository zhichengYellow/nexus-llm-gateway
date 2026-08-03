import { describe, it, expect } from "vitest";
import { DslParser, DslCompiler, DslRuntime, resetDslRuntime } from "./router-dsl.js";

const SAMPLE_YAML = `
routes:
  - when:
      intent: code
      latency: "< 300"
    provider: deepseek
    model: deepseek-v4-flash

  - when:
      intent: math
    provider: qwen

  - when:
      fallback: true
    provider: deepseek
`;

describe("DslParser", () => {
  it("解析 YAML 文本", () => {
    const parser = new DslParser();
    const dsl = parser.parse(SAMPLE_YAML);
    expect(dsl.routes).toHaveLength(3);
    expect(dsl.routes[0]!.provider).toBe("deepseek");
    expect(dsl.routes[2]!.when.fallback).toBe(true);
  });

  it("空文本返回空 routes", () => {
    const parser = new DslParser();
    const dsl = parser.parse("");
    expect(dsl.routes).toHaveLength(0);
  });
});

describe("DslCompiler", () => {
  it("编译 DSL 为可执行规则", () => {
    const parser = new DslParser();
    const compiler = new DslCompiler();
    const dsl = parser.parse(SAMPLE_YAML);
    const rules = compiler.compile(dsl);
    expect(rules).toHaveLength(3);
    expect(rules[0]!.test({ intent: "code", latencyMs: 200 })).toBe(true);
    expect(rules[0]!.test({ intent: "code", latencyMs: 500 })).toBe(false);
    expect(rules[2]!.test({})).toBe(true); // fallback 总是匹配
  });

  it("intent 匹配", () => {
    const parser = new DslParser();
    const compiler = new DslCompiler();
    const dsl = parser.parse("routes:\n  - when:\n      intent: math\n    provider: qwen");
    const rules = compiler.compile(dsl);
    expect(rules[0]!.test({ intent: "math" })).toBe(true);
    expect(rules[0]!.test({ intent: "code" })).toBe(false);
  });

  it("cost 比较", () => {
    const parser = new DslParser();
    const compiler = new DslCompiler();
    const dsl = parser.parse("routes:\n  - when:\n      cost: \"< 0.002\"\n    provider: deepseek");
    const rules = compiler.compile(dsl);
    expect(rules[0]!.test({ estimatedCost: 0.001 })).toBe(true);
    expect(rules[0]!.test({ estimatedCost: 0.01 })).toBe(false);
  });
});

describe("DslRuntime", () => {
  it("加载和匹配", () => {
    const runtime = new DslRuntime();
    runtime.load(SAMPLE_YAML);

    const result = runtime.match({ intent: "code", latencyMs: 200 });
    expect(result).not.toBeNull();
    expect(result!.rule.provider).toBe("deepseek");
    expect(result!.rule.model).toBe("deepseek-v4-flash");
  });

  it("fallback 规则兜底", () => {
    const runtime = new DslRuntime();
    runtime.load(SAMPLE_YAML);

    const result = runtime.match({ intent: "unknown" });
    expect(result).not.toBeNull();
    expect(result!.rule.condition.fallback).toBe(true);
  });

  it("getRules 返回所有规则", () => {
    const runtime = new DslRuntime();
    runtime.load(SAMPLE_YAML);
    expect(runtime.getRules()).toHaveLength(3);
  });
});
