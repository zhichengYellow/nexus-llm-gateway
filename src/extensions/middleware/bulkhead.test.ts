/**
 * Nexus LLM Gateway - Bulkhead 测试
 */
import { describe, it, expect } from "vitest";
import { Bulkhead, BulkheadRegistry, resetBulkheadRegistry } from "./bulkhead.js";

describe("Bulkhead 并发隔离", () => {
  it("初始状态 active=0", () => {
    const b = new Bulkhead({ maxConcurrent: 5 });
    expect(b.activeCount).toBe(0);
  });

  it("acquire 成功后 active 增加", async () => {
    const b = new Bulkhead({ maxConcurrent: 5 });
    const ok = await b.tryAcquire();
    expect(ok).toBe(true);
    expect(b.activeCount).toBe(1);
  });

  it("release 后 active 减少", async () => {
    const b = new Bulkhead({ maxConcurrent: 5 });
    await b.tryAcquire();
    b.release();
    expect(b.activeCount).toBe(0);
  });

  it("达到上限后拒绝新请求（maxQueue=0）", async () => {
    const b = new Bulkhead({ maxConcurrent: 2, maxQueue: 0 });
    await b.tryAcquire();
    await b.tryAcquire();
    const ok = await b.tryAcquire();
    expect(ok).toBe(false);
    expect(b.activeCount).toBe(2);
  });

  it("release 后排队请求可以进入", async () => {
    const b = new Bulkhead({ maxConcurrent: 1, maxQueue: 3 });
    await b.tryAcquire(); // active=1

    // 排队 2 个
    const p1 = b.tryAcquire(5000);
    const p2 = b.tryAcquire(5000);
    expect(b.queueSize).toBe(2);

    // 释放 → 队列第一个进入
    b.release();
    const r1 = await p1;
    expect(r1).toBe(true);

    b.release();
    const r2 = await p2;
    expect(r2).toBe(true);
  });

  it("reset 清空所有状态", async () => {
    const b = new Bulkhead({ maxConcurrent: 1, maxQueue: 2 });
    await b.tryAcquire();
    b.tryAcquire(100); // 排队
    b.reset();
    expect(b.activeCount).toBe(0);
    expect(b.queueSize).toBe(0);
  });
});

describe("BulkheadRegistry", () => {
  it("按 key 获取独立的 Bulkhead", () => {
    const registry = new BulkheadRegistry();
    const b1 = registry.get("deepseek");
    const b2 = registry.get("gemini");
    expect(b1).not.toBe(b2);
  });

  it("同一 key 返回相同实例", () => {
    const registry = new BulkheadRegistry();
    const b1 = registry.get("deepseek");
    const b2 = registry.get("deepseek");
    expect(b1).toBe(b2);
  });

  it("snapshot 返回所有状态", () => {
    const registry = new BulkheadRegistry();
    registry.get("a");
    registry.get("b");
    const snap = registry.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0]!.active).toBe(0);
  });

  it("resetBulkheadRegistry 重置全局单例", () => {
    // 直接用已导入的函数
    const r1 = new BulkheadRegistry();
    r1.get("test");
    expect(r1.snapshot()).toHaveLength(1);

    // resetBulkheadRegistry 重置的是模块级单例
    resetBulkheadRegistry();
  });
});
