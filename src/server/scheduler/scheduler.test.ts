import { describe, it, expect, beforeEach, vi } from "vitest";
import { Scheduler, resetScheduler } from "./scheduler.js";

beforeEach(() => resetScheduler());

describe("Scheduler", () => {
  it("注册和获取任务", () => {
    const scheduler = new Scheduler();
    scheduler.register({
      name: "test-task",
      description: "a test task",
      schedule: { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" } as any,
      enabled: true,
      handler: async () => {},
      maxRetries: 1,
    });

    const task = scheduler.get("test-task");
    expect(task).toBeDefined();
    expect(task!.enabled).toBe(true);
  });

  it("toggle 切换启用状态", () => {
    const scheduler = new Scheduler();
    scheduler.register({
      name: "toggle-task",
      schedule: { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" } as any,
      enabled: true,
      handler: async () => {},
      maxRetries: 0,
    });

    expect(scheduler.toggle("toggle-task", false)).toBe(true);
    expect(scheduler.get("toggle-task")!.enabled).toBe(false);

    expect(scheduler.toggle("not-exist", true)).toBe(false);
  });

  it("unregister 注销任务", () => {
    const scheduler = new Scheduler();
    scheduler.register({
      name: "remove-me",
      schedule: { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" } as any,
      enabled: true,
      handler: async () => {},
      maxRetries: 0,
    });
    scheduler.unregister("remove-me");
    expect(scheduler.get("remove-me")).toBeUndefined();
  });

  it("list 列出所有任务", () => {
    const scheduler = new Scheduler();
    scheduler.register({
      name: "t1",
      schedule: { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" } as any,
      enabled: true,
      handler: async () => {},
      maxRetries: 0,
    });
    scheduler.register({
      name: "t2",
      schedule: { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" } as any,
      enabled: false,
      handler: async () => {},
      maxRetries: 0,
    });
    expect(scheduler.list()).toHaveLength(2);
  });

  it("runNow 立即执行", async () => {
    const scheduler = new Scheduler();
    let executed = false;
    scheduler.register({
      name: "immediate",
      schedule: { minute: "*", hour: "*", dayOfMonth: "*", month: "*", dayOfWeek: "*" } as any,
      enabled: true,
      handler: async () => { executed = true; },
      maxRetries: 0,
    });

    const result = await scheduler.runNow("immediate");
    expect(result).toBe(true);
    expect(executed).toBe(true);
    expect(scheduler.get("immediate")!.lastStatus).toBe("success");
  });

  it("start/stop 调度器生命周期", () => {
    const scheduler = new Scheduler();
    scheduler.start(100);
    scheduler.stop();
    // 不抛错
  });
});
