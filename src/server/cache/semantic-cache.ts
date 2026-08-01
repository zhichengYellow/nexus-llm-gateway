/**
 * Nexus LLM Gateway - 工程级缓存引擎（v2）
 *
 * 特性：
 * 1. Canonical Key（Prompt 标准化）：trim / 空白归一 / 去标点 / 小写，语义相同的变体命中同一 key
 * 2. 参数分桶（Bucket）：temperature 等影响小的参数分桶，避免 0.01 差异导致全部失效
 * 3. hit_count / last_accessed_at：支持 LRU/LFU 淘汰与统计
 * 4. 分类 TTL（Cache Policy）：静态内容长缓存，时效内容短缓存
 * 5. Cache Metadata：响应携带 cached / cache_age / cache_hit / cache_id
 * 6. 防缓存毒化：写入前校验响应合法性
 */
import { eq, and, gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { semanticCache } from "../db/schema.js";
import { getConfig } from "../../shared/config.js";
import { logger } from "../../shared/logger.js";
import { createHash } from "node:crypto";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../../shared/types.js";

/** 提取最后一条 user 消息并规范化（Canonical Text） */
function canonicalText(content: unknown): string {
  const raw = typeof content === "string" ? content : String(content ?? "");
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[。！？!?,，.;；：:、"']/g, "")
    .toLowerCase()
    .slice(0, 500);
}

/** 提取最后一条 user 消息 */
function lastUserMessage(req: ChatCompletionRequest): string {
  const msgs = req.messages as Array<{ role: string; content: string | any[] }>;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "user") {
      return canonicalText(msgs[i]?.content);
    }
  }
  return "";
}

/** 参数分桶：temperature 等微小差异不破坏缓存命中 */
function bucketNumber(v: number | undefined, defaultValue: number): number {
  const val = v ?? defaultValue;
  if (val < 0.3) return 0;
  if (val < 0.8) return 0.5;
  return 1;
}

function cacheHash(req: ChatCompletionRequest, model: string): string {
  const last = lastUserMessage(req);
  const tempBucket = bucketNumber(req.temperature, 1);
  const topPBucket = bucketNumber(req.top_p, 1);
  // Canonical Key：规范化 prompt + 分桶参数
  const text = `${model}|${last}|t${tempBucket}|p${topPBucket}`;
  return createHash("sha256").update(text).digest("hex");
}

/** 分类 TTL（Cache Policy）：按 prompt 语义判断时效性 */
function classifyTtl(text: string, defaultTtl: number): number {
  const lower = text.toLowerCase();
  // 强时效性（高频变动）
  if (/(价格|行情|股票|btc|eth|汇率|美元|油价)/.test(lower)) return 30; // 30s
  if (/(天气|气温|温湿度)/.test(lower)) return 600; // 10min
  if (/(新闻|今天|最新|地震|疫情|大选)/.test(lower)) return 1800; // 30min
  // 中时效（时政人物/政策）
  if (/(总统|总理|领导人|政策|法案)/.test(lower)) return 3600; // 1h
  // 基本静态内容（问候/常识/翻译/解释）→ 走长缓存
  if (/(你好|hello|hi|翻译|解释|是什么|介绍|代码|怎么)/.test(lower)) return Math.max(defaultTtl, 7 * 86400); // 7天
  return defaultTtl;
}

export interface CacheLookupResult {
  hit: boolean;
  response?: ChatCompletionResponse;
}

export class SemanticCache {
  private defaultTtl: number;

  constructor() {
    this.defaultTtl = getConfig().semanticCacheTtl;
  }

  async lookup(req: ChatCompletionRequest, model: string, _tenantId: string | null): Promise<CacheLookupResult> {
    try {
      const last = lastUserMessage(req);
      if (!last || last.length < 2) return { hit: false };

      const hash = cacheHash(req, model);
      const now = new Date();

      const rows = await db
        .select({
          id: semanticCache.id,
          response: semanticCache.response,
          hits: semanticCache.hits,
          createdAt: semanticCache.createdAt,
        })
        .from(semanticCache)
        .where(and(eq(semanticCache.keyHash, hash), gt(semanticCache.expiresAt, now)))
        .limit(1);

      const row = rows[0] as any;
      if (row?.response) {
        // 更新 hit_count + last_accessed_at（LFU/LRU 统计）
        db.update(semanticCache)
          .set({ hits: sql`${semanticCache.hits} + 1`, lastAccessedAt: now })
          .where(eq(semanticCache.id, row.id))
          .execute()
          .catch(() => undefined);

        const r = row.response as ChatCompletionResponse;
        const ageMs = Date.now() - new Date(row.createdAt).getTime();
        r.nexus = {
          provider: "cache",
          cached: true,
          cacheId: row.id,
          cacheHit: (row.hits ?? 0) + 1,
          cacheAge: formatAge(ageMs),
        } as any;
        logger.info({ model, hash: hash.slice(0, 8), hits: row.hits + 1, preview: last.slice(0, 40) }, "cache HIT");
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
      const last = lastUserMessage(req);
      if (!last || last.length < 2) return;

      // ===== 缓存毒化防护：写入前校验响应合法性 =====
      const content = (response as any)?.choices?.[0]?.message?.content ?? "";
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        logger.warn({ model }, "skip cache: empty response content");
        return;
      }
      const finish = (response as any)?.choices?.[0]?.finish_reason;
      if (finish === "error" || finish === "content_filter") {
        logger.warn({ model, finish }, "skip cache: abnormal finish_reason");
        return;
      }
      if ((response as any)?.error) {
        logger.warn({ model }, "skip cache: response contains error");
        return;
      }

      const hash = cacheHash(req, model);
      // 分类 TTL：按 prompt 语义分配不同缓存时长
      const ttl = classifyTtl(last, this.defaultTtl);
      const expiresAt = new Date(Date.now() + ttl * 1000);
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

      logger.info({ model, hash: hash.slice(0, 8), ttl, preview }, "cache stored");
    } catch (e) {
      logger.error({ err: (e as Error).message, model }, "cache store failed");
    }
  }

  /** 缓存统计（含 LRU/LFU 支持字段） */
  async stats(): Promise<{ totalEntries: number; totalHits: number; avgHits: number; totalSavedTokens: number }> {
    try {
      const rows = await db.select().from(semanticCache);
      const active = rows.filter((r: any) => new Date(r.expiresAt) > new Date());
      return {
        totalEntries: active.length,
        totalHits: active.reduce((s: number, r: any) => s + (r.hits || 0), 0),
        avgHits: active.length > 0 ? Math.round(active.reduce((s: number, r: any) => s + (r.hits || 0), 0) / active.length) : 0,
        totalSavedTokens: active.reduce((s: number, r: any) => s + (r.hits || 0) * 500, 0),
      };
    } catch {
      return { totalEntries: 0, totalHits: 0, avgHits: 0, totalSavedTokens: 0 };
    }
  }
}

/** 格式化缓存年龄（Cache Metadata） */
function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  return `${Math.floor(ms / 86400_000)}d`;
}

let _cache: SemanticCache | null = null;
export function getSemanticCache(): SemanticCache {
  if (!_cache) _cache = new SemanticCache();
  return _cache;
}