/**
 * Nexus LLM Gateway - Provider API Key 持久化与热加载
 *
 * 个人开发者友好:API Key 可在控制台 UI 配置,存 DB(provider_configs),
 * 保存立即生效(registry 热重建),重启后自动恢复(启动时从 DB 加载,优先于 .env)。
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { providerConfigs } from "../db/schema.js";
import { getRegistry } from "../../providers/registry.js";
import { logger } from "../../shared/logger.js";
import type { ProviderType } from "../../shared/types.js";

/** 启动时调用:从 DB 加载已配置的 Provider Key(覆盖 .env),失败不阻塞启动 */
export async function loadProviderKeysFromDB(): Promise<void> {
  try {
    const rows = await db.select().from(providerConfigs);
    for (const row of rows) {
      getRegistry().updateProviderKey(row.provider as ProviderType, row.apiKey);
    }
    if (rows.length > 0) {
      logger.info({ providers: rows.map((r) => r.provider) }, "provider api keys loaded from DB");
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "load provider keys from DB failed (skipped)");
  }
}

/** 保存 Provider Key:写 DB + 立即热生效 */
export async function saveProviderKey(type: ProviderType, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  await db
    .insert(providerConfigs)
    .values({ provider: type, apiKey: trimmed })
    .onConflictDoUpdate({
      target: providerConfigs.provider,
      set: { apiKey: trimmed, updatedAt: new Date() },
    });
  getRegistry().updateProviderKey(type, trimmed);
}

/** 删除 Provider Key(恢复为 .env 配置) */
export async function deleteProviderKey(type: ProviderType): Promise<void> {
  await db.delete(providerConfigs).where(eq(providerConfigs.provider, type));
  const cfg = (await import("../../shared/config.js")).getConfig();
  getRegistry().updateProviderKey(type, cfg.providers[type]?.apiKey ?? "");
}
