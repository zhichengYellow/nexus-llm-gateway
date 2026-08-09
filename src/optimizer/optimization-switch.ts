/**
 * Nexus LLM Gateway - 优化开关（控制台可控制）
 *
 * 开关项: 压缩 / 语义缓存 / 智能路由 / 预算封锁 + 优化档位 profile。
 * 持久化: DB `optimization_settings` 单行（env 提供默认值；DB 有值则覆盖）。
 * 生效方式: chat 链路每请求读取（内存缓存），admin API 修改后立即生效。
 */
import { db } from "../server/db/client.js";
import { optimizationSettings } from "../server/db/schema.js";
import type { OptimizationSettings } from "../shared/types.js";

const PROFILE_NAMES = ["fast", "balanced", "cheap", "maximum_saving"] as const;

function envBool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  return v === "1" || v.toLowerCase() === "true";
}

/** env 默认值（无 DB 记录时生效；也用于测试/本地） */
export function defaultOptimizationSettings(): OptimizationSettings {
  return {
    compressionEnabled: envBool("COMPRESSION_ENABLED", true),
    semanticCacheEnabled: envBool("SEMANTIC_CACHE_ENABLED", true),
    smartRoutingEnabled: envBool("SMART_ROUTING_ENABLED", true),
    budgetBlockEnabled: envBool("BUDGET_BLOCK_ENABLED", true),
    profile: (PROFILE_NAMES as readonly string[]).includes(process.env.OPTIMIZATION_PROFILE ?? "")
      ? (process.env.OPTIMIZATION_PROFILE as OptimizationSettings["profile"])
      : "balanced",
  };
}

let cached: OptimizationSettings | null = null;

/** 读取当前开关（内存缓存 → DB 覆盖 → env 默认） */
export async function getOptimizationSettings(): Promise<OptimizationSettings> {
  if (cached) return cached;
  cached = defaultOptimizationSettings();
  try {
    const rows = await db.select().from(optimizationSettings).limit(1);
    const row = rows[0];
    if (row?.settings) {
      const base = cached ?? defaultOptimizationSettings();
      cached = { ...base, ...row.settings };
    }
  } catch {
    // DB 不可用时回退 env 默认（不阻塞请求链路）
  }
  return cached;
}

/** 更新开关（部分字段），写 DB + 立即生效 */
export async function updateOptimizationSettings(
  partial: Partial<OptimizationSettings>,
): Promise<OptimizationSettings> {
  const next = { ...(await getOptimizationSettings()), ...partial };
  try {
    await db
      .insert(optimizationSettings)
      .values({ id: 1, settings: next })
      .onConflictDoUpdate({
        target: optimizationSettings.id,
        set: { settings: next, updatedAt: new Date() },
      });
  } catch {
    // 持久化失败仅内存生效（不阻塞）
  }
  cached = next;
  return next;
}

/** 供测试重置缓存 */
export function resetOptimizationSettingsCache(): void {
  cached = null;
}
