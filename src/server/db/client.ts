/**
 * Nexus LLM Gateway - 数据库客户端
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { getConfig } from "../../shared/config.js";
import { logger } from "../../shared/logger.js";

const config = getConfig();

const queryClient = postgres(config.databaseUrl, {
  max: 10,
  prepare: false,
});

export const db = drizzle(queryClient, { schema, logger: config.logLevel === "debug" });

export type DB = typeof db;

/** 健康检查 */
export async function dbHealthCheck(): Promise<boolean> {
  try {
    const r = await queryClient`SELECT 1 AS ok`;
    return (r[0] as { ok: number })?.ok === 1;
  } catch (e) {
    logger.error({ err: e }, "db health check failed");
    return false;
  }
}

export { queryClient };