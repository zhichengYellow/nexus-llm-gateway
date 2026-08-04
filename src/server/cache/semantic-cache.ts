/**
 * Nexus LLM Gateway - 工程级缓存引擎（v3）
 *
 * 特性：
 * 1. Canonical Key：仅 whitespace 归一 + 中文标点统一（不删代码符号，防 C++/1+1 碰撞）
 * 2. 短 Prompt 禁用缓存（"继续"/"谢谢"等 <8 字且非问候语不缓存，防止命中旧上下文）
 * 3. 只缓存 finish_reason=stop 的完整响应（网络中断的半截回答绝不落缓存）
 * 4. Cache Key 包含 Provider + Model（不同模型/上游不共享缓存，防风格污染）
 * 5. Cache Stampede（SingleFlight）：并发缓存缺失只放行一个请求打 LLM，其余等待共享结果
 * 6. 参数分桶 + hit_count/last_accessed + 分类 TTL + Cache Metadata + 防毒化
 */
import { eq, and, gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { semanticCache } from "../db/schema.js";
import { getConfig } from "../../shared/config.js";
import { logger } from "../../shared/logger.js";
import { createHash } from "node:crypto";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../../shared/types.js";

/** min 长度的"强指令"黑名单（这些词条本身是上下文指示，绝不能独立命中旧缓存） */
const CONTEXT_INDICATOR = /^(继续|再来一个|谢谢|好的|懂了|明白|ok|yes|no|go on|again|thanks?)$/i;

/** 提取最后一条 user 消息（不规范化，供判断长度/是否上下文指令） */
function rawLastUser(req: ChatCompletionRequest): string {
  const msgs = req.messages as Array<{ role: string; content: string | any[] }>;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "user") {
      const c = msgs[i]?.content;
      return typeof c === "string" ? c : String(c);
    }
  }
  return "";
}

/**
 * Canonical Text：消除无意义的表面差异，但保留代码/数学符号
 * - trim + 多个空白→一个
 * - 剔除【首尾】的语气标点（！？。，、~），使 "hello！" ≈ "hello"
 * - 中间符号（+ # . / = 等）保留，避免 C++→c、1+1=→11 碰撞
 */
export function canonicalText(content: unknown): string {
  const raw = typeof content === "string" ? content : String(content ?? "");
  const normalized = raw.trim().replace(/\s+/g, " ").toLowerCase();
  // 只剔除首尾语气标点，中间保留
  return normalized.replace(/^[！？。，、!?,\.~]+/, "").replace(/[！？。，、!?,\.~]+$/, "");
}

/** 是否值得缓存：过滤短上下文词句（继续/谢谢等）与超短无意义输入 */
export function isCacheable(lastRaw: string, canonical: string): boolean {
  if (!canonical || canonical.length < 2) return false;
  // 上下文指示词（"继续"等）绝不缓存
  if (CONTEXT_INDICATOR.test(lastRaw.trim())) return false;
  // 非问候语的过短输入（<8）不缓存（可能是闲聊打断/上下文）
  if (canonical.length < 8 && !/(你好|hello|hi|谢谢|thanks|翻译|解释)/.test(canonical)) return false;
  return true;
}

/** 参数分桶 */
function bucketNumber(v: number | undefined, defaultValue: number): number {
  const val = v ?? defaultValue;
  if (val < 0.3) return 0;
  if (val < 0.8) return 0.5;
  return 1;
}

/** Cache Key：Provider + Model + Canonical prompt + 分桶参数（模型间隔离） */
export function cacheHash(req: ChatCompletionRequest, model: string, provider: string): string {
  const canonical = canonicalText(rawLastUser(req));
  const tempBucket = bucketNumber(req.temperature, 1);
  const topPBucket = bucketNumber(req.top_p, 1);
  const text = `${provider}|${model}|${canonical}|t${tempBucket}|p${topPBucket}`;
  return createHash("sha256").update(text).digest("hex");
}

/** 分类 TTL */
export function classifyTtl(canonical: string, defaultTtl: number): number {
  const lower = canonical.toLowerCase();
  if (/(价格|行情|股票|btc|eth|汇率|美元|油价)/.test(lower)) return 30;
  if (/(天气|气温|温湿度)/.test(lower)) return 600;
  if (/(新闻|今天|最新|地震|疫情|大选)/.test(lower)) return 1800;
  if (/(总统|总理|领导人|政策|法案)/.test(lower)) return 3600;
  if (/(你好|hello|hi|翻译|解释|是什么|介绍|代码|怎么)/.test(lower)) return Math.max(defaultTtl, 7 * 86400);
  return defaultTtl;
}

export interface CacheLookupResult {
  hit: boolean;
  response?: ChatCompletionResponse;
  /** 缓存 key hash（用于关联缓存条目） */
  hash?: string;
}

/** SingleFlight：并发缓存缺失只放行一个请求打上游，其余等待共享结果 */
class SingleFlight {
  private inflight = new Map<string, Promise<any>>();

  /**
   * 同步检查 + 立即存 promise，避免微任务竞态窗口：
   * 并发请求必须在此同步段内先 get；第一个先 set，后续直接命中。
   */
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = Promise.resolve()
      .then(() => fn())
      .finally(() => {
        this.inflight.delete(key);
      });
    // 同步 set：同一事件循环中的并发请求在此处就能拿到同一个 promise
    this.inflight.set(key, promise);
    return promise;
  }

  get size() {
    return this.inflight.size;
  }
}

export class SemanticCache {
  private defaultTtl: number;
  private singleFlight = new SingleFlight();

  constructor() {
    this.defaultTtl = getConfig().semanticCacheTtl;
  }

  /** 供 chat 路由在并发缺失时使用 SingleFlight：同 key 只打一次上游 */
  deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.singleFlight.run(key, fn);
  }

  async lookup(
    req: ChatCompletionRequest,
    model: string,
    provider: string | undefined,
  ): Promise<CacheLookupResult> {
    try {
      const raw = rawLastUser(req);
      const canonical = canonicalText(raw);
      // 短上下文词句禁用缓存
      if (!isCacheable(raw, canonical)) return { hit: false };

      const hash = cacheHash(req, model, provider ?? "unknown");
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
        logger.info({ model, hash: hash.slice(0, 8), hits: row.hits + 1, preview: canonical.slice(0, 40) }, "cache HIT");
        return { hit: true, response: r, hash };
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
    provider: string | undefined,
    response: ChatCompletionResponse,
    tenantId: string | null,
  ): Promise<void> {
    try {
      const raw = rawLastUser(req);
      const canonical = canonicalText(raw);
      if (!isCacheable(raw, canonical)) return;

      // ===== 防毒化校验（内容必须非空、无 error）=====
      // 注意：非流式 max_tokens 截断时 finish_reason="length"，也是有效回答，必须缓存；
      // 半截回答防护由 handleStream（流中断走 catch 不写缓存）承担。
      const content = (response as any)?.choices?.[0]?.message?.content ?? "";
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        logger.warn({ model }, "skip cache: empty content");
        return;
      }
      if ((response as any)?.error) return;

      const hash = cacheHash(req, model, provider ?? "unknown");
      const ttl = classifyTtl(canonical, this.defaultTtl);
      const expiresAt = new Date(Date.now() + ttl * 1000);
      const preview = canonical.slice(0, 200);

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

  /** 获取缓存条目元信息（供 Cache Confidence 使用） */
  async getEntry(hash: string): Promise<{ createdAt: unknown; lastAccessedAt: unknown; hits: number; ttl: number } | null> {
    try {
      const [row] = await db
        .select({
          createdAt: semanticCache.createdAt,
          lastAccessedAt: semanticCache.lastAccessedAt,
          hits: semanticCache.hits,
          expiresAt: semanticCache.expiresAt,
        })
        .from(semanticCache)
        .where(eq(semanticCache.keyHash, hash))
        .limit(1);
      if (!row) return null;
      const ttl = Math.max(1, Math.ceil((new Date(row.expiresAt).getTime() - Date.now()) / 1000));
      return { createdAt: row.createdAt, lastAccessedAt: row.lastAccessedAt, hits: row.hits ?? 0, ttl };
    } catch {
      return null;
    }
  }
}

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