import { describe, it, expect, beforeEach } from "vitest";
import { Tracer, TraceStore, resetTraceStore } from "./observability.js";

beforeEach(() => resetTraceStore());

describe("Tracer", () => {
  it("创建 Span 并正确记录父子关系", () => {
    const tracer = new Tracer("req_001");
    tracer.startSpan("auth");
    tracer.endSpan("ok");
    tracer.startSpan("cache");
    tracer.endSpan("ok");

    const trace = tracer.getTrace();
    expect(trace.allSpans).toHaveLength(2);
    expect(trace.requestId).toBe("req_001");
    expect(trace.allSpans[0]!.name).toBe("auth");
    expect(trace.allSpans[0]!.duration).toBeGreaterThanOrEqual(0);
  });

  it("嵌套 Span 正确建立父子关系", () => {
    const tracer = new Tracer("req_002");
    tracer.startSpan("router");
    tracer.startSpan("deepseek");
    tracer.endSpan("ok");
    tracer.endSpan("ok");

    const trace = tracer.getTrace();
    expect(trace.allSpans).toHaveLength(2);
    expect(trace.allSpans[1]!.parentId).toBe(trace.allSpans[0]!.id);
  });

  it("toWaterfall 生成文本格式", () => {
    const tracer = new Tracer("req_003");
    tracer.startSpan("auth", { key: "master" });
    tracer.endSpan("ok");
    tracer.startSpan("cache");
    tracer.endSpan("ok");

    const waterfall = tracer.toWaterfall();
    expect(waterfall).toContain("Trace:");
    expect(waterfall).toContain("req_003");
    expect(waterfall).toContain("auth");
    expect(waterfall).toContain("cache");
  });

  it("log 不抛错", () => {
    const tracer = new Tracer("req_004");
    tracer.startSpan("test");
    tracer.endSpan("ok");
    expect(() => tracer.log()).not.toThrow();
  });
});

describe("TraceStore", () => {
  it("save 和 recent 获取最近 Trace", () => {
    const store = new TraceStore();
    const tracer = new Tracer("r1");
    tracer.startSpan("test");
    tracer.endSpan("ok");
    store.save(tracer.getTrace());

    const recent = store.recent();
    expect(recent).toHaveLength(1);
    expect(recent[0]!.requestId).toBe("r1");
  });

  it("findByRequestId 查找", () => {
    const store = new TraceStore();
    const tracer = new Tracer("find-me");
    tracer.startSpan("test");
    tracer.endSpan("ok");
    store.save(tracer.getTrace());

    expect(store.findByRequestId("find-me")).toBeDefined();
    expect(store.findByRequestId("not-exist")).toBeUndefined();
  });

  it("stats 返回统计", () => {
    const store = new TraceStore();
    const t = new Tracer("r1");
    t.startSpan("a");
    t.endSpan("ok");
    store.save(t.getTrace());

    const stats = store.stats();
    expect(stats.total).toBe(1);
    expect(stats.avgDuration).toBeGreaterThanOrEqual(0);
  });

  it("maxSize 限制存储数量", () => {
    const store = new TraceStore(3);
    for (let i = 0; i < 5; i++) {
      const t = new Tracer(`r${i}`);
      t.startSpan("test");
      t.endSpan("ok");
      store.save(t.getTrace());
    }
    expect(store.recent(10)).toHaveLength(3);
  });
});
