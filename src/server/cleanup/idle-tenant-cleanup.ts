/**
 * Nexus LLM Gateway - 闲置租户数据定期清理
 *
 * 目标: 对超过 N 天(默认 30,env `IDLE_TENANT_CLEANUP_DAYS`)无任何活跃
 * (无请求、无 key 使用)的注册租户,清理其全部数据:
 *   - semantic_cache(租户缓存条目)
 *   - usage_logs(用量记录,tenant_id 为 set null,须显式删除)
 *   - provider_configs(租户 BYOK 的 Provider Key)
 *   - api_keys(网关 key,删除后该账号即无法登录)
 *   - tenants(账号本身)
 * 保护: 内置 `default` 租户(master 单租户)永不清理;无活跃记录的租户保守跳过。
 * 挂载: src/server/index.ts 启动时执行一次 + 每 24h 周期执行。
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { tenants, apiKeys, usageLogs, providerConfigs, semanticCache } from "../db/schema.js";
import { logger } from "../../shared/logger.js";

/** 闲置阈值(天),env IDLE_TENANT_CLEANUP_DAYS,默认 30 */
export function idleCleanupDays(): number {
  const v = Number(process.env.IDLE_TENANT_CLEANUP_DAYS ?? 30);
  return Number.isFinite(v) && v > 0 ? v : 30;
}

/** 判定是否闲置: 最近活跃时间早于 cutoff(无记录返回 false,保守不删) */
export function isTenantIdle(lastActiveAt: Date | null | undefined, days: number): boolean {
  if (!lastActiveAt) return false;
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return lastActiveAt.getTime() < cutoff;
}

/** 执行闲置租户清理,返回 { removed, skipped } */
export async function cleanupIdleTenants(days: number = idleCleanupDays()): Promise<{ removed: number; skipped: number }> {
  const all = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  let removed = 0;
  let skipped = 0;

  for (const t of all) {
    // 保护: 内置 default 租户(master 单租户)永不清理
    if (t.name === "default") {
      skipped++;
      continue;
    }

    // 最后活跃 = max(usage_logs.created_at, api_keys.last_used_at)
    const [u] = await db
      .select({ last: sql<Date | null>`max(${usageLogs.createdAt})` })
      .from(usageLogs)
      .where(eq(usageLogs.tenantId, t.id));
    const [k] = await db
      .select({ last: sql<Date | null>`max(${apiKeys.lastUsedAt})` })
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, t.id));
    const candidates = [u?.last, k?.last].filter((x): x is Date => x instanceof Date);
    const lastActive = candidates.length > 0 ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;

    if (!isTenantIdle(lastActive, days)) {
      skipped++;
      continue;
    }

    // 清理(usage_logs.tenant_id 为 set null,须显式删;其余依赖 cascade 的也显式删,更可控)
    await db.delete(semanticCache).where(eq(semanticCache.tenantId, t.id)).catch(() => undefined);
    await db.delete(usageLogs).where(eq(usageLogs.tenantId, t.id)).catch(() => undefined);
    await db.delete(providerConfigs).where(eq(providerConfigs.tenantId, t.id)).catch(() => undefined);
    await db.delete(apiKeys).where(eq(apiKeys.tenantId, t.id)).catch(() => undefined);
    await db.delete(tenants).where(eq(tenants.id, t.id)).catch(() => undefined);

    logger.info({ tenantId: t.id, name: t.name, days, lastActive: lastActive?.toISOString() }, "idle tenant data cleaned");
    removed++;
  }

  return { removed, skipped };
}
