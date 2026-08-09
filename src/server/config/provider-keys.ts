/**
 * Nexus LLM Gateway - Provider API Key 持久化与热加载
 *
 * 个人开发者友好:API Key 可在控制台 UI 配置,存 DB(provider_configs),
 * 保存立即生效(registry 热重建),重启后自动恢复(启动时从 DB 加载,优先于 .env)。
 *
 * v2.3: 支持租户级 Provider Key（tenant_id=null → master 全局，有值 → 该租户专用）。
 *       请求链路: 租户专用优先 → 回退全局 → 回退 .env。
 */
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { providerConfigs } from "../db/schema.js";
import { getRegistry } from "../../providers/registry.js";
import { logger } from "../../shared/logger.js";
import { decryptSecret, encryptSecret, isEncrypted, maskKey } from "../../shared/crypto.js";
import type { ProviderType } from "../../shared/types.js";

/** 启动时调用:从 DB 加载已配置的 Provider Key(覆盖 .env),失败不阻塞启动 */
export async function loadProviderKeysFromDB(): Promise<void> {
  try {
    const rows = await db.select().from(providerConfigs).where(isNull(providerConfigs.tenantId));
    for (const row of rows) {
      const decrypted = decryptSecret(row.apiKey);
      // 懒迁移:旧明文 → 加密写回（一次）
      if (!isEncrypted(row.apiKey)) {
        await db
          .update(providerConfigs)
          .set({ apiKey: encryptSecret(decrypted), updatedAt: new Date() })
          .where(eq(providerConfigs.id, row.id))
          .catch(() => undefined);
        logger.info({ provider: row.provider }, "provider key migrated to encrypted storage");
      }
      getRegistry().updateProviderKey(row.provider as ProviderType, decrypted);
    }
    if (rows.length > 0) {
      logger.info({ providers: rows.map((r) => r.provider) }, "provider api keys loaded from DB");
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "load provider keys from DB failed (skipped)");
  }
}

/** 保存 Provider Key:加密写 DB + 立即热生效 */
export async function saveProviderKey(type: ProviderType, apiKey: string, tenantId?: string | null): Promise<void> {
  const trimmed = apiKey.trim();
  const values: Record<string, unknown> = {
    provider: type,
    apiKey: encryptSecret(trimmed),
    updatedAt: new Date(),
  };
  if (tenantId) values.tenantId = tenantId;

  // 如果 tenant-scoped，先删旧记录（同一租户同一 provider 唯一）
  if (tenantId) {
    await db
      .delete(providerConfigs)
      .where(and(eq(providerConfigs.provider, type), eq(providerConfigs.tenantId, tenantId)));
  }

  await db.insert(providerConfigs).values(values as any);
  // 全局 key 热生效；租户 key 不注册到全局 registry（由请求链路按租户解析）
  if (!tenantId) {
    getRegistry().updateProviderKey(type, trimmed);
  }
}

/** 读取 Provider Key 元数据(脱敏,供 GET API) */
export async function getProviderKeyMeta(
  type: ProviderType,
  tenantId?: string | null,
): Promise<{ configured: boolean; source: "db" | "env" | "none"; masked?: string }> {
  const cfg = (await import("../../shared/config.js")).getConfig();
  // 租户专用 → 全局 → .env
  if (tenantId) {
    const [tenantRow] = await db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.provider, type), eq(providerConfigs.tenantId, tenantId)))
      .limit(1);
    if (tenantRow) {
      let decrypted: string;
      try { decrypted = decryptSecret(tenantRow.apiKey); } catch { decrypted = ""; }
      return { configured: true, source: "db", masked: maskKey(decrypted) };
    }
  }
  // 回退全局
  const [globalRow] = await db
    .select()
    .from(providerConfigs)
    .where(and(eq(providerConfigs.provider, type), isNull(providerConfigs.tenantId)))
    .limit(1);
  if (globalRow) {
    let decrypted: string;
    try { decrypted = decryptSecret(globalRow.apiKey); } catch { decrypted = ""; }
    return { configured: true, source: "db", masked: maskKey(decrypted) };
  }
  // 回退 .env
  const envKey = cfg.providers[type]?.apiKey;
  if (envKey) return { configured: true, source: "env", masked: maskKey(envKey) };
  return { configured: false, source: "none" };
}

/** 获取某租户的所有 Provider Key 元数据 */
export async function getTenantProviderKeys(tenantId: string): Promise<Array<{ provider: string; configured: boolean; source: string; masked?: string }>> {
  const providers: Array<{ provider: string; configured: boolean; source: string; masked?: string }> = [];
  const rows = await db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.tenantId, tenantId));
  for (const r of rows) {
    let decrypted: string;
    try { decrypted = decryptSecret(r.apiKey); } catch { decrypted = ""; }
    providers.push({ provider: r.provider, configured: true, source: "db", masked: maskKey(decrypted) });
  }
  return providers;
}

/** 获取所有 Provider 列表（用于 UI 展示可配置项） */
export async function getAllProviderKeysMeta(tenantId?: string | null): Promise<Array<{ provider: string; configured: boolean; source: string; masked?: string }>> {
  const providers: ProviderType[] = ["deepseek", "openai", "gemini", "ollama", "qwen", "moonshot", "zhipu"];
  const results = await Promise.all(providers.map((p) => getProviderKeyMeta(p, tenantId)));
  return providers.map((p, i) => ({ provider: p, ...results[i]! }));
}

/** 删除 Provider Key(恢复为 .env 配置) */
export async function deleteProviderKey(type: ProviderType, tenantId?: string | null): Promise<void> {
  if (tenantId) {
    await db
      .delete(providerConfigs)
      .where(and(eq(providerConfigs.provider, type), eq(providerConfigs.tenantId, tenantId)));
  } else {
    await db.delete(providerConfigs).where(and(eq(providerConfigs.provider, type), isNull(providerConfigs.tenantId)));
  }
  const cfg = (await import("../../shared/config.js")).getConfig();
  getRegistry().updateProviderKey(type, cfg.providers[type]?.apiKey ?? "");
}

/** 按租户解析 Provider Key：租户专用优先 → 全局 → .env → null */
export async function resolveProviderKey(provider: ProviderType, tenantId?: string | null): Promise<string | null> {
  // 1. 租户专用（BYOK：租户必须配自己的 key，**不回退全局**，防止白嫖 master 账户成本）
  if (tenantId) {
    const [tenantRow] = await db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.provider, provider), eq(providerConfigs.tenantId, tenantId)))
      .limit(1);
    if (tenantRow) {
      try { return decryptSecret(tenantRow.apiKey); } catch { /* fall through */ }
    }
    return null;
  }
  // 2. 全局（master）
  const [globalRow] = await db
    .select()
    .from(providerConfigs)
    .where(and(eq(providerConfigs.provider, provider), isNull(providerConfigs.tenantId)))
    .limit(1);
  if (globalRow) {
    try { return decryptSecret(globalRow.apiKey); } catch { /* fall through */ }
  }
  // 3. .env
  const cfg = (await import("../../shared/config.js")).getConfig();
  return cfg.providers[provider]?.apiKey ?? null;
}
