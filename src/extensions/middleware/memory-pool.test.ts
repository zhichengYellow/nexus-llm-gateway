/**
 * Nexus LLM Gateway - Memory Pool 测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ObjectPool, JsonPool, HeadersPool, resetPools } from "./memory-pool.js";

beforeEach(() => {
  resetPools();
});

describe("ObjectPool 泛型对象池", () => {
  it("预分配 minSize 个对象", () => {
    let created = 0;
    const pool = new ObjectPool(
      () => { created++; return { id: created }; },
      () => {},
      { minSize: 4 },
    );
    expect(created).toBe(4);
    const stats = pool.getStats();
    expect(stats.poolSize).toBe(4);
  });

  it("borrow 从池中获取并减少 poolSize", () => {
    const pool = new ObjectPool(
      () => ({}),
      () => {},
      { minSize: 2 },
    );
    const obj = pool.borrow();
    expect(obj).toBeDefined();
    expect(pool.getStats().poolSize).toBe(1);
  });

  it("return 归还对象并增加 poolSize", () => {
    const pool = new ObjectPool(
      () => ({}),
      () => {},
      { minSize: 1 },
    );
    const obj = pool.borrow();
    expect(pool.getStats().poolSize).toBe(0);
    pool.return(obj);
    expect(pool.getStats().poolSize).toBe(1);
  });

  it("池空时创建新对象（不超过 maxSize）", () => {
    const pool = new ObjectPool(
      () => ({}),
      () => {},
      { minSize: 1, maxSize: 5 },
    );
    // 预分配 1 个
    pool.borrow(); // 池空
    const obj = pool.borrow(); // 创建新对象
    expect(obj).toBeDefined();
    expect(pool.getStats().created).toBe(2);
  });

  it("drain 清空池", () => {
    const pool = new ObjectPool(
      () => ({}),
      () => {},
      { minSize: 4 },
    );
    pool.drain();
    expect(pool.getStats().poolSize).toBe(0);
  });

  it("resetFn 在归还时调用", () => {
    let resetCalled = false;
    const pool = new ObjectPool(
      () => ({ val: "test" }),
      (obj) => { obj.val = ""; resetCalled = true; },
      { minSize: 1 },
    );
    const obj = pool.borrow();
    pool.return(obj);
    expect(resetCalled).toBe(true);
  });
});

describe("JsonPool", () => {
  it("解析 JSON 字符串", () => {
    const pool = new JsonPool();
    const obj = pool.parse('{"a":1,"b":2}');
    expect(obj.a).toBe(1);
    expect(obj.b).toBe(2);
    pool.release(obj);
  });

  it("getStats 返回统计", () => {
    const pool = new JsonPool();
    const stats = pool.getStats();
    expect(stats.poolSize).toBeGreaterThan(0);
  });
});

describe("HeadersPool", () => {
  it("borrow/return", () => {
    const pool = new HeadersPool();
    const obj = pool.borrow();
    obj["Content-Type"] = "application/json";
    expect(obj["Content-Type"]).toBe("application/json");
    pool.return(obj);
    expect(obj["Content-Type"]).toBeUndefined();
  });
});
