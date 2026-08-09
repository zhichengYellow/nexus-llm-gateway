import { describe, it, expect, beforeEach } from "vitest";
import {
  defaultOptimizationSettings,
  getOptimizationSettings,
  updateOptimizationSettings,
  resetOptimizationSettingsCache,
} from "./optimization-switch.js";

beforeEach(() => {
  resetOptimizationSettingsCache();
  for (const k of ["COMPRESSION_ENABLED", "SEMANTIC_CACHE_ENABLED", "SMART_ROUTING_ENABLED", "BUDGET_BLOCK_ENABLED", "OPTIMIZATION_PROFILE"]) {
    delete process.env[k];
  }
});

describe("optimization-switch (优化开关)", () => {
  it("默认全部开启 + balanced 档位", () => {
    const s = defaultOptimizationSettings();
    expect(s.compressionEnabled).toBe(true);
    expect(s.semanticCacheEnabled).toBe(true);
    expect(s.smartRoutingEnabled).toBe(true);
    expect(s.budgetBlockEnabled).toBe(true);
    expect(s.profile).toBe("balanced");
  });

  it("env 可覆盖默认值", () => {
    process.env.COMPRESSION_ENABLED = "false";
    process.env.SEMANTIC_CACHE_ENABLED = "0";
    process.env.OPTIMIZATION_PROFILE = "cheap";
    const s = defaultOptimizationSettings();
    expect(s.compressionEnabled).toBe(false);
    expect(s.semanticCacheEnabled).toBe(false);
    expect(s.profile).toBe("cheap");
  });

  it("非法 profile 回退 balanced", () => {
    process.env.OPTIMIZATION_PROFILE = "whatever";
    expect(defaultOptimizationSettings().profile).toBe("balanced");
  });

  it("update 部分字段合并,立即生效(DB 不可用时内存生效)", async () => {
    const s = await updateOptimizationSettings({ compressionEnabled: false });
    expect(s.compressionEnabled).toBe(false);
    // 未修改字段保持不变
    expect(s.semanticCacheEnabled).toBe(true);
    expect(s.smartRoutingEnabled).toBe(true);
    // 读取同源
    const g = await getOptimizationSettings();
    expect(g.compressionEnabled).toBe(false);
  });
});
