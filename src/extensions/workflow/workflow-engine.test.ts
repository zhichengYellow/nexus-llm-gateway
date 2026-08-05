import { describe, it, expect } from "vitest";
import { WorkflowEngine } from "./workflow-engine.js";

const SIMPLE_WORKFLOW = `
workflow:
  name: "simple"
  nodes:
    - id: router
      type: RouterNode
    - id: llm
      type: ProviderNode
  edges:
    - from: router
      to: llm
    - from: llm
      to: end
`;

describe("WorkflowEngine", () => {
  it("执行简单工作流", async () => {
    const engine = new WorkflowEngine();
    const wf = engine.parseWorkflow(SIMPLE_WORKFLOW);
    const result = await engine.execute(wf, "hello");
    expect(result.success).toBe(true);
    expect(result.nodePath).toContain("router");
    expect(result.nodePath).toContain("llm");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("解析 YAML DSL", () => {
    const engine = new WorkflowEngine();
    const wf = engine.parseWorkflow(SIMPLE_WORKFLOW);
    expect(wf.name).toBe("simple");
    expect(wf.nodes).toHaveLength(2);
    expect(wf.edges).toHaveLength(2);
  });

  it("注册自定义 handler", async () => {
    const engine = new WorkflowEngine();
    let called = false;
    engine.register("CustomNode" as any, async () => { called = true; return {}; });

    const wf = engine.parseWorkflow(`
workflow:
  name: "custom"
  nodes:
    - id: c1
      type: CustomNode
  edges:
    - from: c1
      to: end
    `);

    await engine.execute(wf, "test");
    expect(called).toBe(true);
  });

  it("条件边跳转", async () => {
    const engine = new WorkflowEngine();
    // 注册 cache handler 返回 hit: true
    engine.register("CacheNode", async () => ({ hit: true }));

    const wf = engine.parseWorkflow(`
workflow:
  name: "conditional"
  nodes:
    - id: cache
      type: CacheNode
    - id: llm
      type: ProviderNode
  edges:
    - from: cache
      to: llm
      condition: "!cache.hit"
    - from: cache
      to: end
      condition: "cache.hit"
    `);

    const result = await engine.execute(wf, "test");
    expect(result.success).toBe(true);
    // cache.hit=true → 应该直接到 end，不经过 llm
    expect(result.nodePath).not.toContain("llm");
  });
});
