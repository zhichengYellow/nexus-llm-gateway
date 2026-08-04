/**
 * Nexus LLM Gateway - 认证中间件
 * 从 Authorization: Bearer <key> 解析租户。
 * 支持 master key（管理用）与租户 API Key。
 */
import type { Context, MiddlewareHandler } from "hono";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { apiKeys, tenants } from "../db/schema.js";
import { getConfig } from "../../shared/config.js";
import type { Tenant, ApiKeyRow } from "./types.js";

export interface AuthEnv {
  Variables: {
    tenant: Tenant | null;
    apiKey: ApiKeyRow | null;
    isMaster: boolean;
    role: string;
  };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** 从请求中提取 Bearer token */
export function extractBearer(c: Context): string | null {
  const auth = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export const authMiddleware: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = extractBearer(c);
  if (!token) {
    return c.json({ error: { message: "missing authorization bearer token", type: "auth_error" } }, 401);
  }

  const config = getConfig();

  // master key
  if (token === config.masterKey) {
    c.set("isMaster", true);
    c.set("role", "owner");
    c.set("tenant", null);
    c.set("apiKey", null);
    await next();
    return;
  }

  c.set("isMaster", false);

  // 查租户 key
  const keyHash = hashKey(token);
  const rows = await db
    .select({
      apiKey: apiKeys,
      tenant: tenants,
    })
    .from(apiKeys)
    .innerJoin(tenants, eq(apiKeys.tenantId, tenants.id))
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: { message: "invalid api key", type: "auth_error" } }, 401);
  }
  if (!row.apiKey.enabled) {
    return c.json({ error: { message: "api key disabled", type: "auth_error" } }, 403);
  }

  c.set("role", row.apiKey.role ?? "developer");
  c.set("tenant", {
    id: row.tenant.id,
    name: row.tenant.name,
    monthlyTokenQuota: row.tenant.monthlyTokenQuota,
  });
  c.set("apiKey", {
    id: row.apiKey.id,
    tenantId: row.apiKey.tenantId,
    name: row.apiKey.name,
    keyPrefix: row.apiKey.keyPrefix,
    role: row.apiKey.role ?? "developer",
  } as ApiKeyRow);

  // 异步更新 lastUsedAt（不阻塞请求）
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.apiKey.id))
    .execute()
    .catch(() => undefined);

  await next();
};