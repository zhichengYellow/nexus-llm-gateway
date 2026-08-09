import { describe, it, expect } from "vitest";
import { isTenantIdle, idleCleanupDays } from "./idle-tenant-cleanup.js";

describe("idle-tenant-cleanup (闲置租户清理)", () => {
  it("isTenantIdle: 活跃期内不算闲置", () => {
    expect(isTenantIdle(new Date(Date.now() - 1000), 30)).toBe(false);
    expect(isTenantIdle(new Date(Date.now() - 29 * 24 * 3600 * 1000), 30)).toBe(false);
  });

  it("isTenantIdle: 超过阈值算闲置", () => {
    expect(isTenantIdle(new Date(Date.now() - 31 * 24 * 3600 * 1000), 30)).toBe(true);
    expect(isTenantIdle(new Date(Date.now() - 400 * 24 * 3600 * 1000), 30)).toBe(true);
  });

  it("isTenantIdle: 无活跃记录返回 false(保守不删)", () => {
    expect(isTenantIdle(null, 30)).toBe(false);
    expect(isTenantIdle(undefined, 30)).toBe(false);
  });

  it("idleCleanupDays: 默认 30,env 可覆盖,非法值回退 30", () => {
    const prev = process.env.IDLE_TENANT_CLEANUP_DAYS;
    delete process.env.IDLE_TENANT_CLEANUP_DAYS;
    expect(idleCleanupDays()).toBe(30);
    process.env.IDLE_TENANT_CLEANUP_DAYS = "60";
    expect(idleCleanupDays()).toBe(60);
    process.env.IDLE_TENANT_CLEANUP_DAYS = "abc";
    expect(idleCleanupDays()).toBe(30);
    process.env.IDLE_TENANT_CLEANUP_DAYS = "0";
    expect(idleCleanupDays()).toBe(30);
    if (prev === undefined) delete process.env.IDLE_TENANT_CLEANUP_DAYS;
    else process.env.IDLE_TENANT_CLEANUP_DAYS = prev;
  });
});
