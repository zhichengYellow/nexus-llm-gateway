/**
 * Nexus LLM Gateway - 请求缓存
 * 基于最后一条用户消息 + model 做 hash 的精确匹配缓存。
 *
 * 设计：Cline/IDE 会带超长系统 prompt + 对话历史，
 * 但用户的核心问题通常重复 → 对最后一轮 user 消息做 hash
 */
import { eq, and, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { semanticCache } from "../db/schema.js";
import { getConfig } from "../../shared/config.js";
import { logger } from "../../shared/logger.js";
import { createHash } from "node:crypto";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../../shared/types.js";

/** 提取最后一条 user 消息 */
function lastUserMessage(req: ChatCompletionRequest): string {
  const msgs = req.messages as Array<{ role: string; content: string | any[] }>;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "user") {
      const c = msgs[i]?.content;
      return typeof c === "string" ? c : String(c);
    }
  }
  return "";
}

function cacheHash(req: ChatCompletionRequest, model: string): string {
  const last = lastUserMessage(req);
  const text = `${model}|${last}|${req.temperature ?? 1}|${req.max_tokens ?? 0}`;
  return createHash("sha256").update(text).digest("hex");
}

export interface CacheLookupResult {
  hit: boolean;
  response?: ChatCompletionResponse;
}

export class SemanticCache {
  private ttl: number;

  constructor() {
    this.ttl = getConfig().semanticCacheTtl;
  }

  async lookup(req: ChatCompletionRequest, model: string, _tenantId: string | null): Promise<CacheLookupResult> {
    try {
      // 流式请求也查缓存——命中后以非流式返回结果（Cline 兼容）
      const last = lastUserMessage(req);
      if (!last || last.length < 2) return { hit: false };

      const hash = cacheHash(req, model);
      const now = new Date();

      const rows = await db
        .select({ response: semanticCache.response })
        .from(semanticCache)
        .where(and(eq(semanticCache.keyHash, hash), gt(semanticCache.expiresAt, now)))
        .limit(1);

      const row = rows[0] as any;
      if (row?.response) {
        logger.info({ model, hash: hash.slice(0, 8), lastMsg: last.slice(0, 60) }, "cache HIT");
        const r = row.response as ChatCompletionResponse;
        r.nexus = { provider: "cache", cached: true } as any;
        return { hit: true, response: r };
      }
      return { hit: false };
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "cache lookup failed");
      return { hit: false };
    }
  }

  async store(
    req: ChatCompletionRequest,
    model: string,
    response: ChatCompletionResponse,
    tenantId: string | null,
  ): Promise<void> {
    try {
      // 注意：流式请求也会写入缓存（handleStream 已收集完整内容）
      const last = lastUserMessage(req);
      if (!last || last.length < 2) return;

      const hash = cacheHash(req, model);
      const expiresAt = new Date(Date.now() + this.ttl * 1000);
      const preview = last.slice(0, 200);

      await db.delete(semanticCache).where(eq(semanticCache.keyHash, hash));

      await db.insert(semanticCache).values({
        keyHash: hash,
        promptPreview: preview,
        request: req as any,
        response: response as any,
        model,
        tenantId: tenantId || null as any,
        expiresAt,
      } as any);

      logger.info({ model, hash: hash.slice(0, 8), preview }, "cache stored");
    } catch (e) {
      logger.error({ err: (e as Error).message, model }, "cache store failed");
    }
  }

  async stats(): Promise<{ totalEntries: number; totalHits: number; avgHits: number }> {
    try {
      const rows = await db.select().from(semanticCache);
      const active = rows.filter((r: any) => new Date(r.expiresAt) > new Date());
      return {
        totalEntries: active.length,
        totalHits: active.reduce((s: number, r: any) => s + (r.hits || 0), 0),
        avgHits: active.length > 0 ? Math.round(active.reduce((s: number, r: any) => s + (r.hits || 0), 0) / active.length) : 0,
      };
    } catch {
      return { totalEntries: 0, totalHits: 0, avgHits: 0 };
    }
  }
}

let _cache: SemanticCache | null = null;
export function getSemanticCache(): SemanticCache {
  if (!_cache) _cache = new SemanticCache();
  return _cache;
}