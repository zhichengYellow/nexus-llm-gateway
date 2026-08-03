import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventBus, resetEventBus } from "./event-bus.js";

beforeEach(() => resetEventBus());

describe("EventBus", () => {
  it("订阅和发布事件", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("cache:hit", handler);
    bus.emit("cache:hit", { key: "test" }, "req_001");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].type).toBe("cache:hit");
    expect(handler.mock.calls[0]![0].data.key).toBe("test");
  });

  it("通配符 * 订阅所有事件", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("*", handler);
    bus.emit("cache:hit", {});
    bus.emit("provider:call", {});

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("取消订阅", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const id = bus.on("cache:hit", handler);
    bus.off(id);
    bus.emit("cache:hit", {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("recent 返回最近事件", () => {
    const bus = new EventBus();
    bus.emit("cache:hit", {});
    bus.emit("provider:call", {});
    bus.emit("request:end", {});

    const recent = bus.recent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.type).toBe("request:end");
  });

  it("filter 按类型过滤", () => {
    const bus = new EventBus();
    bus.emit("cache:hit", {});
    bus.emit("provider:call", {});
    bus.emit("cache:hit", {});

    const filtered = bus.filter("cache:hit");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.type === "cache:hit")).toBe(true);
  });

  it("stats 返回统计", () => {
    const bus = new EventBus();
    bus.emit("cache:hit", {});
    bus.emit("provider:call", {});
    bus.emit("provider:call", {});

    const stats = bus.stats();
    expect(stats.total).toBe(3);
    expect(stats.byType["cache:hit"]).toBe(1);
    expect(stats.byType["provider:call"]).toBe(2);
  });

  it("emitAsync 不阻塞", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("cache:hit", handler);
    bus.emitAsync("cache:hit", {});
    // 同步检查：handler 还没被调用
    expect(handler).not.toHaveBeenCalled();
  });

  it("clear 清空事件存储", () => {
    const bus = new EventBus();
    bus.emit("cache:hit", {});
    bus.clear();
    expect(bus.recent(10)).toHaveLength(0);
  });

  it("handler 错误不中断其他订阅者", () => {
    const bus = new EventBus();
    bus.on("cache:hit", () => { throw new Error("boom"); });
    const handler2 = vi.fn();
    bus.on("cache:hit", handler2);
    bus.emit("cache:hit", {});

    expect(handler2).toHaveBeenCalled();
  });
});
