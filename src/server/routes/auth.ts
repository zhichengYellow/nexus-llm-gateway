/**
 * Nexus LLM Gateway - 注册路由
 * POST /auth/register（需 REGISTRATION_ENABLED=true）
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tenants, apiKeys } from "../db/schema.js";
import { hashKey } from "../middleware/auth.js";
import { logger } from "../../shared/logger.js";
import { redis } from "../db/redis.js";

export const authRoute = new Hono();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function genApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `sk-nexus-${randomBytes(24).toString("base64url")}`;
  const prefix = raw.slice(0, 12);
  return { raw, prefix, hash: hashKey(raw) };
}

const registerSchema = z.object({
  username: z.string().min(2, "用户名至少 2 位").max(30, "用户名最多 30 位").regex(/^[a-zA-Z0-9_-]+$/, "仅允许字母、数字、下划线、短横"),
  password: z.string().min(8, "密码至少 8 位").max(100, "密码最多 100 位"),
});

/** 将 zod 校验错误转为统一的中文 error.message 格式 */
export function authErrorMessage(errors: z.ZodIssue[]): string {
  const first = errors[0];
  if (!first) return "输入格式错误";
  return first.message;
}

authRoute.post("/register", zValidator("json", registerSchema, (result, c) => {
  if (!result.success) {
    const msg = authErrorMessage(result.error.issues);
    return c.json({ error: { message: msg, type: "validation_error" } }, 400);
  }
}), async (c) => {
  // 注册开关
  if (process.env.REGISTRATION_ENABLED !== "true") {
    return c.json({ error: { message: "注册功能未开放", type: "registration_disabled" } }, 403);
  }

  // 按 IP 限流（5 次/分钟）
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  const rateKey = `reg:${ip}`;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 60);
    if (count > 5) {
      return c.json({ error: { message: "注册太频繁，请 1 分钟后再试", type: "rate_limit" } }, 429);
    }
  } catch {
    // Redis 不可用时不阻塞注册（fail-open）
    logger.warn("registration rate limit check failed, allowing");
  }

  const { username, password } = c.req.valid("json");

  // 检查用户名唯一性
  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.name, username))
    .limit(1);

  if (existing) {
    return c.json({ error: { message: "用户名已存在，请换一个", type: "duplicate" } }, 409);
  }

  // 密码 hash（预留字段，当前 tenants 表无 password 列，暂不存）
  void hashPassword(password);

  // 创建租户（不设 quota，用户 BYOK 成本自理）
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: username,
      cachePlan: "free",
    })
    .returning({ id: tenants.id });

  if (!tenant) {
    return c.json({ error: { message: "创建账号失败，请稍后重试", type: "server_error" } }, 500);
  }

  // 生成 API Key
  const key = genApiKey();

  await db.insert(apiKeys).values({
    tenantId: tenant.id,
    name: `default-${username}`,
    keyHash: key.hash,
    keyPrefix: key.prefix,
    role: "developer",
    enabled: true,
  });

  logger.info({ username, tenantId: tenant.id }, "user registered");

  return c.json({
    message: "注册成功",
    apiKey: key.raw,
    keyPrefix: key.prefix,
    tenantId: tenant.id,
    note: "此 API Key 仅显示一次，请立即保存。BYOK 模式：请自行配置 Provider API Key。",
  }, 201);
});
