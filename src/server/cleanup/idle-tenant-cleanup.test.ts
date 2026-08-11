import { describe, it, expect } from "vitest";
import { isTenantIdle, idleCleanupDays } from "./idle-tenant-cleanup.js";

describe("idle-tenant-cleanup (闲置租户清理)", () => {
  it("isTenantIdle: 活跃期内不算闲置", () => {
    const now = new Date();
    expect(isTenantIdle(new Date(Date.now() - 1000), now, 30)).toBe(false);
    expect(isTenantIdle(new Date(Date.now() - 29 * 24 * 3600 * 1000), now, 30)).toBe(false);
  });

  it("isTenantIdle: 超过阈值算闲置", () => {
    const now = new Date();
    expect(isTenantIdle(new Date(Date.now() - 31 * 24 * 3600 * 1000), now, 30)).toBe(true);
    expect(isTenantIdle(new Date(Date.now() - 400 * 24 * 3600 * 1000), now, 30)).toBe(true);
  });

  it("isTenantIdle: 无活跃但注册超期 → 按 createdAt 判定可删(修复注册即弃账号)", () => {
    const oldCreated = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    const recentCreated = new Date(Date.now() - 1000);
    expect(isTenantIdle(null, oldCreated, 30)).toBe(true);
    expect(isTenantIdle(undefined, recentCreated, 30)).toBe(false);
    expect(isTenantIdle(null, null, 30)).toBe(false); // 无任何时间信息保守跳过
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
