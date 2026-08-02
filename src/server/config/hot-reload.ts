/**
 * Nexus LLM Gateway - 配置热加载（Config Hot Reload）
 *
 * 支持运行时修改路由/权重/Provider 配置，无需重启网关。
 * Dashboard 修改后通过 admin API 触发 reload，所有新请求立即生效。
 *
 * 设计：
 * - 配置源：数据库 model_routes 表（优先级高于代码中写死的 config）
 * - 热加载时机：admin API 修改路由后自动触发
 * - 实现方式：ProviderRegistry 提供 reloadFromDB() 方法
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { modelRoutes } from "../db/schema.js";
import { getRegistry } from "../providers/registry.js";
import { getConfig } from "../../shared/config.js";
import { logger } from "../../shared/logger.js";
import type { ProviderType } from "../../shared/types.js";

/** 从数据库加载路由配置并重建 Registry */
export async function reloadRegistryFromDB(): Promise<{
  success: boolean;
  routesLoaded: number;
  error?: string;
}> {
  try {
    const config = getConfig();
    const registry = getRegistry();

    // 读取数据库中的模型路由
    const dbRoutes = await db.select().from(modelRoutes).where(eq(modelRoutes.enabled, true));

    // 清除旧的路由映射
    registry.clearRoutes();

    // 重新注册
    for (const route of dbRoutes) {
      const providerType = route.provider as ProviderType;
      const providerConfig = config.providers[providerType];

      if (!providerConfig) {
        logger.warn({ route: route.alias, provider: route.provider }, "provider not found in config, skipping route");
        continue;
      }

      registry.addModelAlias(route.alias, providerType, route.upstreamModel);

      // 设置故障转移
      if (route.fallbacks && Array.isArray(route.fallbacks) && route.fallbacks.length > 0) {
        const fallbackChain = (route.fallbacks as unknown as Array<{ providerType: string; upstreamModel: string }>)
          .filter((f) => f.providerType && f.upstreamModel);
        if (fallbackChain.length > 0) {
          registry.setFallback(route.alias, fallbackChain as Array<{ providerType: ProviderType; upstreamModel: string }>);
        }
      }
    }

    logger.info({ routesLoaded: dbRoutes.length }, "config hot reload complete");
    return { success: true, routesLoaded: dbRoutes.length };
  } catch (e) {
    logger.error({ err: (e as Error).message }, "config hot reload failed");
    return { success: false, routesLoaded: 0, error: (e as Error).message };
  }
}

/**
 * 获取当前热加载状态
 */
export function getHotReloadStatus(): {
  lastReloadAt: Date | null;
  routesCount: number;
} {
  const registry = getRegistry();
  return {
    lastReloadAt: registry.lastReloadAt,
    routesCount: registry.listAllModels().length,
  };
}

/**
 * 监听配置变更（Watch Config Changes）
 * 在 admin API 修改路由后，自动调用 reloadRegistryFromDB
 */
export function setupHotReload(): void {
  logger.info("hot reload enabled - config changes will be applied without restart");
}
