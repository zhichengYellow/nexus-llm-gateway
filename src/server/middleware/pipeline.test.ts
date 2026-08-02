/**
 * Nexus LLM Gateway - Pipeline 中间件管道测试
 */
import { describe, it, expect } from "vitest";
import { MiddlewarePipeline, createDefaultPipeline, createTestPipeline } from "./pipeline.js";
import type { MiddlewareHandler, PipelineContext } from "./pipeline.js";

function mkCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    c: {
      header: () => {},
      req: { header: () => null },
      get: () => null,
      json: () => new Response(),
    } as any,
    model: "test-model",
    request: { model: "test-model", messages: [{ role: "user", content: "hi" }] },
    requestId: "req_test",
    tenant: null,
    apiKey: null,
    isMaster: true,
    stream: false,
    startTime: Date.now(),
    meta: {},
    ...overrides,
  };
}

describe("MiddlewarePipeline 基础功能", () => {
  it("空管道执行不报错", async () => {
    const pipeline = new MiddlewarePipeline();
    const result = await pipeline.execute(mkCtx());
    expect(result).toBeUndefined();
  });

  it("中间件按 order 排序执行", async () => {
    const order: number[] = [];
    const m1: MiddlewareHandler = {
      name: "m1", enabled: true, order: 30,
      handler: async () => { order.push(1); },
    };
    const m2: MiddlewareHandler = {
      name: "m2", enabled: true, order: 10,
      handler: async () => { order.push(2); },
    };
    const m3: MiddlewareHandler = {
      name: "m3", enabled: true, order: 20,
      handler: async () => { order.push(3); },
    };

    const pipeline = new MiddlewarePipeline([m1, m2, m3]);
    await pipeline.execute(mkCtx());
    expect(order).toEqual([2, 3, 1]);
  });

  it("禁用的中间件被跳过", async () => {
    let called = false;
    const m: MiddlewareHandler = {
      name: "disabled", enabled: false, order: 10,
      handler: async () => { called = true; },
    };
    const pipeline = new MiddlewarePipeline([m]);
    await pipeline.execute(mkCtx());
    expect(called).toBe(false);
  });

  it("break=true 中断管道", async () => {
    let secondCalled = false;
    const m1: MiddlewareHandler = {
      name: "m1", enabled: true, order: 10,
      handler: async () => ({ break: true, status: 429, error: { message: "blocked", type: "test" } }),
    };
    const m2: MiddlewareHandler = {
      name: "m2", enabled: true, order: 20,
      handler: async () => { secondCalled = true; },
    };

    const pipeline = new MiddlewarePipeline([m1, m2]);
    const result = await pipeline.execute(mkCtx());
    expect(result?.break).toBe(true);
    expect(result?.status).toBe(429);
    expect(secondCalled).toBe(false);
  });

  it("中间件抛错不中断管道（被捕获）", async () => {
    let secondCalled = false;
    const m1: MiddlewareHandler = {
      name: "m1", enabled: true, order: 10,
      handler: async () => { throw new Error("boom"); },
    };
    const m2: MiddlewareHandler = {
      name: "m2", enabled: true, order: 20,
      handler: async () => { secondCalled = true; },
    };

    const pipeline = new MiddlewarePipeline([m1, m2]);
    const result = await pipeline.execute(mkCtx());
    expect(result?.break).toBe(true);
    expect(result?.error?.message).toContain("boom");
    expect(secondCalled).toBe(false);
  });

  it("remove 移除中间件", async () => {
    let called = false;
    const m: MiddlewareHandler = {
      name: "to-remove", enabled: true, order: 10,
      handler: async () => { called = true; },
    };
    const pipeline = new MiddlewarePipeline([m]);
    pipeline.remove("to-remove");
    await pipeline.execute(mkCtx());
    expect(called).toBe(false);
  });

  it("toggle 切换启用状态", async () => {
    let count = 0;
    const m: MiddlewareHandler = {
      name: "toggle-test", enabled: true, order: 10,
      handler: async () => { count++; },
    };
    const pipeline = new MiddlewarePipeline([m]);

    await pipeline.execute(mkCtx());
    expect(count).toBe(1);

    pipeline.toggle("toggle-test", false);
    await pipeline.execute(mkCtx());
    expect(count).toBe(1); // 未增加

    pipeline.toggle("toggle-test", true);
    await pipeline.execute(mkCtx());
    expect(count).toBe(2);
  });

  it("list 返回中间件列表", () => {
    const m1: MiddlewareHandler = { name: "a", enabled: true, order: 20, handler: async () => {} };
    const m2: MiddlewareHandler = { name: "b", enabled: false, order: 10, handler: async () => {} };
    const pipeline = new MiddlewarePipeline([m1, m2]);
    const list = pipeline.list();
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe("b"); // order=10 在前
    expect(list[0]!.enabled).toBe(false);
    expect(list[1]!.name).toBe("a");
    expect(list[1]!.enabled).toBe(true);
  });

  it("createDefaultPipeline 包含所有内置中间件", () => {
    const pipeline = createDefaultPipeline();
    const list = pipeline.list();
    const names = list.map((m) => m.name).sort();
    expect(names).toEqual(["cache", "provider", "rateLimit", "router"]);
    expect(list.every((m) => m.enabled)).toBe(true);
  });

  it("createTestPipeline 不含限流和缓存", () => {
    const pipeline = createTestPipeline();
    const list = pipeline.list();
    const names = list.map((m) => m.name).sort();
    expect(names).toEqual(["provider", "router"]);
  });

  it("use 动态注册中间件", () => {
    const pipeline = new MiddlewarePipeline();
    const m: MiddlewareHandler = {
      name: "dynamic", enabled: true, order: 5,
      handler: async () => {},
    };
    pipeline.use(m);
    expect(pipeline.list()).toHaveLength(1);
  });

  it("use 支持链式调用", () => {
    const pipeline = new MiddlewarePipeline()
      .use({ name: "a", enabled: true, order: 10, handler: async () => {} })
      .use({ name: "b", enabled: true, order: 5, handler: async () => {} });
    expect(pipeline.list()).toHaveLength(2);
  });

  it("PipelineContext.meta 可携带数据", async () => {
    const m: MiddlewareHandler = {
      name: "meta-test", enabled: true, order: 10,
      handler: async (ctx) => { ctx.meta.foo = "bar"; },
    };
    const pipeline = new MiddlewarePipeline([m]);
    const ctx = mkCtx();
    await pipeline.execute(ctx);
    expect(ctx.meta.foo).toBe("bar");
  });
});
