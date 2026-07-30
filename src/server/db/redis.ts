/**
 * Nexus LLM Gateway - Redis 客户端
 * 用于限流、热缓存、分布式状态。
 */
import IORedis from "ioredis";
import { getConfig } from "../../shared/config.js";
import { logger } from "../../shared/logger.js";

const config = getConfig();

export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("error", (err) => {
  logger.error({ err }, "redis error");
});

redis.on("connect", () => {
  logger.info("redis connected");
});

/** 健康检查 */
export async function redisHealthCheck(): Promise<boolean> {
  try {
    const r = await redis.ping();
    return r === "PONG";
  } catch (e) {
    logger.error({ err: e }, "redis health check failed");
    return false;
  }
}