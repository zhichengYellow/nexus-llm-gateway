/**
 * Nexus LLM Gateway - 请求缓存
 * 基于 prompt + model hash 的精确匹配缓存。
 * 
 * 核心逻辑：相同 prompt → 相同 hash → 直接从缓存返回，不调用 LLM
 */
import { eq, and, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { semanticCache } from "../db/schema.js";
import { getConfig } from "../../shared/config.js";
import { logger } from "../../shared/logger.js";
import { createHash } from "node:crypto";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../../shared/types.js";

function promptHash(req: ChatCompletionRequest, model: string): string {
  const parts: string[] = [];
  for (const msg of req.messages) {
    if (msg.role === "system" || msg.role === "user") {
      parts.push(`${msg.role}:${msg.content}`);
    }
  }
  const text = `${model}|${parts.join("\n")}|${req.temperature ?? 1}|${req.max_tokens ?? 0}`;
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
      if (req.stream) return { hit: false };
      const text = req.messages.map(m => (m as any).content).join(" ");
      if (!text || text.length < 3) return { hit: false };

      const hash = promptHash(req, model);
      const now = new Date();

      const rows = await db
        .select({ response: semanticCache.response })
        .from(semanticCache)
        .where(and(eq(semanticCache.keyHash, hash), gt(semanticCache.expiresAt, now)))
        .limit(1);

      const row = rows[0] as any;
      if (row?.response) {
        logger.info({ model, hash: hash.slice(0, 8) }, "cache HIT");
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
      if (req.stream) return;
      const text = req.messages.map(m => (m as any).content).join(" ");
      if (!text || text.length < 3) return;

      const hash = promptHash(req, model);
      const expiresAt = new Date(Date.now() + this.ttl * 1000);
      const preview = text.slice(0, 200);

      // 先尝试删除旧记录避免冲突
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

      logger.info({ model, hash: hash.slice(0, 8) }, "cache stored");
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