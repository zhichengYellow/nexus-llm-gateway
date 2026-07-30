/**
 * Nexus LLM Gateway - 数据库种子
 * 创建默认租户与 API Key，便于本地开发验证。
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./client.js";
import { apiKeys, tenants } from "./schema.js";
import { hashKey } from "../middleware/auth.js";
import { logger } from "../../shared/logger.js";

async function seed() {
  // 默认租户
  const [existing] = await db.select().from(tenants).where(eq(tenants.name, "default")).limit(1);
  let tenantId: string;

  if (existing) {
    tenantId = existing.id;
    logger.info({ tenantId }, "default tenant already exists");
  } else {
    const [row] = await db.insert(tenants).values({ name: "default" }).returning();
    if (!row) throw new Error("failed to create default tenant");
    tenantId = row.id;
    logger.info({ tenantId }, "created default tenant");
  }

  // 默认 API Key
  const rawKey = `sk-nexus-dev-${nanoid(24)}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 16);

  const [keyRow] = await db
    .insert(apiKeys)
    .values({ tenantId, name: "dev-key", keyHash, keyPrefix })
    .returning();
  if (!keyRow) throw new Error("failed to create dev api key");

  logger.info({ apiKeyId: keyRow.id }, "✅ created dev api key (save this key, shown only once)");
  // 仅打印前缀，防止日志泄露完整 Key
  const maskedKey = `${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`;
  logger.info("   使用方式: Authorization: Bearer " + maskedKey);

  process.exit(0);
}

seed().catch((e) => {
  logger.error({ err: e }, "seed failed");
  process.exit(1);
});