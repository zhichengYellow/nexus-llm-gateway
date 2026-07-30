/**
 * Nexus LLM Gateway - 限流与配额
 * 1. Redis 令牌桶：RPM（每分钟请求数）限流
 * 2. 月度 Token 配额：检查租户当月用量是否超限
 */
import { redis } from "../db/redis.js";
import { db, queryClient } from "../db/client.js";
import { tenants } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../shared/logger.js";

export interface RateLimitResult {
  allowed: boolean;
  /** 剩余请求数（当前窗口） */
  remaining: number;
  /** 限流类型 */
  reason?: "rate_limit" | "quota_exceeded";
  /** 重置时间（秒） */
  resetIn?: number;
}

/** Redis 令牌桶限流（固定窗口法，按 API Key） */
export async function checkRateLimit(
  apiKeyId: string,
  rpm: number = 60,
): Promise<RateLimitResult> {
  const key = `ratelimit:${apiKeyId}`;
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000; // 当前分钟起点
  const windowKey = `${key}:${windowStart}`;

  try {
    const pipe = redis.pipeline();
    pipe.incr(windowKey);
    pipe.expire(windowKey, 60);
    const results = await pipe.exec();
    const count = (results?.[0]?.[1] as number) ?? 1;

    if (count > rpm) {
      return {
        allowed: false,
        remaining: 0,
        reason: "rate_limit",
        resetIn: 60 - Math.floor((now - windowStart) / 1000),
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, rpm - count),
    };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "rate limit check failed, allowing");
    return { allowed: true, remaining: 999 };
  }
}

/** 检查租户月度 Token 配额 */
export async function checkQuota(tenantId: string | null): Promise<{ allowed: boolean; used: number; quota: number | null }> {
  if (!tenantId) return { allowed: true, used: 0, quota: null };

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return { allowed: true, used: 0, quota: null };
    if (tenant.monthlyTokenQuota === null) return { allowed: true, used: 0, quota: null };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const rows = await queryClient`
      SELECT coalesce(sum(total_tokens), 0)::bigint::int AS used
      FROM usage_logs
      WHERE tenant_id = ${tenantId} AND created_at >= ${monthStart}
    `;
    const used = (rows[0] as { used: number } | undefined)?.used ?? 0;

    return {
      allowed: used < tenant.monthlyTokenQuota,
      used,
      quota: tenant.monthlyTokenQuota,
    };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "quota check failed, allowing");
    return { allowed: true, used: 0, quota: null };
  }
}