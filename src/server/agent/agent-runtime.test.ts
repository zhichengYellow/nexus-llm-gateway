import { describe, it, expect } from "vitest";
import { AgentRuntime, Planner, ToolRegistry, AgentMemory } from "./agent-runtime.js";

describe("Planner", () => {
  it("基础规划生成步骤", () => {
    const planner = new Planner();
    const steps = planner.plan("你好", []);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]!.action).toBe("think");
    expect(steps[steps.length - 1]!.action).toBe("respond");
  });

  it("搜索意图触发 tool 步骤", () => {
    const planner = new Planner();
    const steps = planner.plan("搜索一下今天的新闻", [
      { name: "search", description: "搜索", handler: async () => "result" },
    ]);
    expect(steps.some((s) => s.action === "tool" && s.tool === "search")).toBe(true);
  });

  it("计算意图触发 calculate tool", () => {
    const planner = new Planner();
    const steps = planner.plan("计算 1+2+3", [
      { name: "calculate", description: "计算", handler: async () => "6" },
    ]);
    expect(steps.some((s) => s.action === "tool" && s.tool === "calculate")).toBe(true);
  });
});

describe("ToolRegistry", () => {
  it("注册和调用工具", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "test",
      description: "test tool",
      handler: async (params) => `result: ${params.input}`,
    });

    const result = await registry.call("test", { input: "hello" });
    expect(result).toBe("result: hello");
  });

  it("调用不存在的工具抛错", async () => {
    const registry = new ToolRegistry();
    await expect(registry.call("nonexistent", {})).rejects.toThrow("tool not found");
  });

  it("list 返回所有工具", () => {
    const registry = new ToolRegistry();
    registry.register({ name: "a", description: "", handler: async () => "" });
    registry.register({ name: "b", description: "", handler: async () => "" });
    expect(registry.list()).toHaveLength(2);
  });
});

describe("AgentMemory", () => {
  it("短期记忆存储和检索", () => {
    const mem = new AgentMemory();
    mem.remember({ role: "user", content: "hello", timestamp: Date.now() });
    mem.remember({ role: "assistant", content: "hi", timestamp: Date.now() });

    const ctx = mem.getContext(10);
    expect(ctx).toHaveLength(2);
  });

  it("长期记忆 set/get", () => {
    const mem = new AgentMemory();
    mem.setLongTerm("user_name", "Alice");
    expect(mem.getLongTerm("user_name")).toBe("Alice");
  });

  it("stats 返回统计", () => {
    const mem = new AgentMemory();
    mem.remember({ role: "user", content: "test", timestamp: Date.now() });
    expect(mem.stats().shortTerm).toBe(1);
  });
});

describe("AgentRuntime", () => {
  it("run 执行并返回结果", async () => {
    const agent = new AgentRuntime();
    const result = await agent.run({ prompt: "搜索最新新闻" });
    expect(result.success).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("内置工具可用", () => {
    const agent = new AgentRuntime();
    const tools = agent.getTools().list();
    expect(tools.length).toBeGreaterThanOrEqual(3);
    expect(tools.some((t) => t.name === "search")).toBe(true);
    expect(tools.some((t) => t.name === "calculate")).toBe(true);
  });
});
