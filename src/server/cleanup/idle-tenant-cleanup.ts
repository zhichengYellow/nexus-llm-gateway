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
 * 保护: 内置 `default` 租户(master 单租户)永不清理。
 * 修复(2026-08-11): 从未活跃的租户(lastActive=null)此前被"保守跳过"→
 * 注册即弃的账号永远不会被清理;现改为按 createdAt 判定(注册超 N 天即闲置)。
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

/** 计算租户最近活跃时间: max(usage.created_at, key.last_used_at);从未活跃返回 null */
export async function getTenantLastActiveAt(tenantId: string): Promise<Date | null> {
  const [u] = await db
    .select({ last: sql<Date | null>`max(${usageLogs.createdAt})` })
    .from(usageLogs)
    .where(eq(usageLogs.tenantId, tenantId));
  const [k] = await db
    .select({ last: sql<Date | null>`max(${apiKeys.lastUsedAt})` })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId));
  const candidates = [u?.last, k?.last].filter((x): x is Date => x instanceof Date);
  return candidates.length > 0 ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;
}

/** 判定是否闲置: 最近活跃(或从未活跃时按 createdAt)早于 cutoff */
export function isTenantIdle(lastActiveAt: Date | null | undefined, createdAt: Date | null | undefined, days: number): boolean {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const ref = lastActiveAt ?? createdAt;
  if (!ref) return false; // 无任何时间信息,保守跳过
  return ref.getTime() < cutoff;
}

/** 删除单个租户的全部数据(自动清理与手动删除共用) */
export async function deleteTenantData(tenantId: string): Promise<void> {
  await db.delete(semanticCache).where(eq(semanticCache.tenantId, tenantId)).catch(() => undefined);
  await db.delete(usageLogs).where(eq(usageLogs.tenantId, tenantId)).catch(() => undefined);
  await db.delete(providerConfigs).where(eq(providerConfigs.tenantId, tenantId)).catch(() => undefined);
  await db.delete(apiKeys).where(eq(apiKeys.tenantId, tenantId)).catch(() => undefined);
  await db.delete(tenants).where(eq(tenants.id, tenantId)).catch(() => undefined);
}

/** 执行闲置租户清理,返回 { removed, skipped } */
export async function cleanupIdleTenants(days: number = idleCleanupDays()): Promise<{ removed: number; skipped: number }> {
  const all = await db.select({ id: tenants.id, name: tenants.name, createdAt: tenants.createdAt }).from(tenants);
  let removed = 0;
  let skipped = 0;

  for (const t of all) {
    // 保护: 内置 default 租户(master 单租户)永不清理
    if (t.name === "default") {
      skipped++;
      continue;
    }

    const lastActive = await getTenantLastActiveAt(t.id);
    if (!isTenantIdle(lastActive, t.createdAt, days)) {
      skipped++;
      continue;
    }

    await deleteTenantData(t.id);
    logger.info({ tenantId: t.id, name: t.name, days, lastActive: lastActive?.toISOString() ?? null, createdAt: t.createdAt?.toISOString() }, "idle tenant data cleaned");
    removed++;
  }

  return { removed, skipped };
}
