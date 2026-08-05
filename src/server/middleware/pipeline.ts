/**
 * Nexus LLM Gateway - 中间件管道（Middleware Pipeline）
 *
 * 可插拔的中间件链，按顺序执行：
 *   Auth → RateLimit → Cache → Router → Retry → Provider → Metrics → Logger
 *
 * 每个中间件是一个独立的处理单元，可单独启用/禁用、配置参数。
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getRegistry } from "../../providers/registry.js";
import { getSemanticCache } from "../../optimizer/cache/semantic-cache.js";
import { checkRateLimit, checkQuota } from "../quota/rate-limiter.js";
import { getCircuitBreakerRegistry } from "../middleware/circuit-breaker.js";
import { withRetry } from "../middleware/retry.js";
import { trackRequest } from "../middleware/metrics.js";
import { recordUsage } from "../billing/usage.js";
import { ProviderError, type ChatCompletionResponse } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";
import type { AuthEnv } from "../middleware/auth.js";
import type { LoggingEnv } from "../middleware/logging.js";

// ===== Pipeline 类型定义 =====

export interface PipelineContext {
  /** Hono Context */
  c: Context<AuthEnv & LoggingEnv>;
  /** 请求模型 */
  model: string;
  /** 请求体 */
  request: any;
  /** 请求 ID */
  requestId: string;
  /** 租户信息 */
  tenant: { id: string; name: string; monthlyTokenQuota: number | null } | null;
  /** API Key 信息 */
  apiKey: { id: string; tenantId: string; name: string; keyPrefix: string } | null;
  /** 是否 Master Key */
  isMaster: boolean;
  /** 是否流式 */
  stream: boolean;
  /** 请求开始时间 */
  startTime: number;
  /** 已解析的 Provider 链 */
  chain?: Array<{ provider: any; providerType: string; upstreamModel: string }>;
  /** 缓存结果（如果命中） */
  cacheResult?: ChatCompletionResponse;
  /** 中间件可携带的元数据 */
  meta: Record<string, unknown>;
}

export interface PipelineResult {
  /** 是否中断管道（返回响应） */
  break: boolean;
  /** 中断时的响应 */
  response?: Response;
  /** 状态码 */
  status?: number;
  /** 错误信息 */
  error?: { message: string; type: string };
}

export interface MiddlewareHandler {
  /** 中间件名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 执行中间件逻辑，返回 PipelineResult 或 void（继续管道） */
  handler: (ctx: PipelineContext) => Promise<PipelineResult | void>;
  /** 权重（决定在管道中的顺序，越小越靠前） */
  order: number;
}

// ===== 内置中间件 =====

/** 限流中间件 */
export const rateLimitMiddleware: MiddlewareHandler = {
  name: "rateLimit",
  enabled: true,
  order: 10,
  handler: async (ctx) => {
    if (ctx.isMaster) return; // Master Key 不限流

    if (ctx.apiKey) {
      const rl = await checkRateLimit(ctx.apiKey.id, 60);
      ctx.c.header("X-RateLimit-Remaining", String(rl.remaining));
      if (!rl.allowed) {
        return {
          break: true,
          status: 429,
          error: { message: `rate limit exceeded, retry in ${rl.resetIn}s`, type: "rate_limit_error" },
        };
      }
    }

    if (ctx.tenant) {
      const quota = await checkQuota(ctx.tenant.id);
      if (!quota.allowed) {
        return {
          break: true,
          status: 429,
          error: { message: `monthly token quota exceeded (${quota.used}/${quota.quota})`, type: "quota_error" },
        };
      }
    }
  },
};

/** 缓存中间件 */
export const cacheMiddleware: MiddlewareHandler = {
  name: "cache",
  enabled: true,
  order: 20,
  handler: async (ctx) => {
    const bypassCache =
      ctx.c.req.header("x-nexus-no-cache") === "1" ||
      ctx.c.req.header("x-nexus-no-cache") === "true";

    if (bypassCache) return;

    const cache = getSemanticCache();
    const tenantId = ctx.tenant?.id ?? null;
    const chain = ctx.chain;
    if (!chain || chain.length === 0) return;

    const primary = chain[0]!;
    const cacheResult = await cache.lookup(ctx.request, ctx.model, primary.providerType);

    if (cacheResult.hit && cacheResult.response) {
      const latencyMs = Date.now() - ctx.startTime;
      const res = cacheResult.response;
      res.nexus.requestId = ctx.requestId;

      recordUsage({
        requestId: ctx.requestId,
        tenantId,
        apiKeyId: ctx.apiKey?.id ?? null,
        provider: "cache",
        model: ctx.model,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        latencyMs,
        cached: true,
        stream: false,
        status: 200,
      });

      logger.info({ requestId: ctx.requestId, model: ctx.model, latencyMs }, "served from cache");
      ctx.cacheResult = res;
      return { break: true };
    }
  },
};

/** 路由中间件（模型解析） */
export const routerMiddleware: MiddlewareHandler = {
  name: "router",
  enabled: true,
  order: 5,
  handler: async (ctx) => {
    const registry = getRegistry();
    try {
      const resolved = registry.resolve(ctx.model);
      ctx.chain = [
        { provider: resolved.provider, providerType: resolved.providerType, upstreamModel: resolved.upstreamModel },
        ...resolved.fallbacks.map((f) => ({
          provider: registry.getProvider(f.providerType),
          providerType: f.providerType,
          upstreamModel: f.upstreamModel,
        })),
      ];
    } catch (e) {
      return {
        break: true,
        status: e instanceof ProviderError ? (e.status as ContentfulStatusCode) : 500,
        error: { message: (e as Error).message, type: "model_error" },
      };
    }
  },
};

/** Provider 调用中间件（含重试 + 熔断） */
export const providerMiddleware: MiddlewareHandler = {
  name: "provider",
  enabled: true,
  order: 30,
  handler: async (ctx) => {
    const chain = ctx.chain;
    if (!chain || chain.length === 0) {
      return {
        break: true,
        status: 502,
        error: { message: "no providers available", type: "upstream_error" },
      };
    }

    const cache = getSemanticCache();
    const breakers = getCircuitBreakerRegistry();
    const tenantId = ctx.tenant?.id ?? null;
    let lastErr: unknown;

    for (let i = 0; i < chain.length; i++) {
      const node = chain[i];
      if (!node?.provider) continue;

      const breaker = breakers.get(`${node.providerType}:${node.upstreamModel}`);
      if (!breaker.allowRequest()) {
        logger.warn({ provider: node.providerType, model: node.upstreamModel }, "circuit OPEN, skipping provider");
        continue;
      }

      try {
        const key = `sf:${node.providerType}:${ctx.model}:${node.upstreamModel}:${String(
          (ctx.request.messages as any[]).at(-1)?.content ?? "",
        ).slice(0, 100)}`;

        const res = await cache.deduplicate<ChatCompletionResponse>(key, () =>
          withRetry(() => node.provider.chat(ctx.request, node.upstreamModel), {
            maxRetries: 2,
            baseDelayMs: 500,
          }),
        );

        breaker.recordSuccess();
        const latencyMs = Date.now() - ctx.startTime;
        trackRequest(false, latencyMs, 0, res.usage && typeof res.usage === "object" ? res.usage.total_tokens : 0);
        res.nexus.requestId = ctx.requestId;

        recordUsage({
          requestId: ctx.requestId,
          tenantId,
          apiKeyId: ctx.apiKey?.id ?? null,
          provider: node.providerType,
          model: ctx.model,
          upstreamModel: node.upstreamModel,
          usage: res.usage,
          latencyMs,
          cached: false,
          stream: false,
          status: 200,
        });

        await cache.store(ctx.request, ctx.model, node.providerType, res, tenantId).catch(() => undefined);
        ctx.meta.providerResponse = res;
        return;
      } catch (e) {
        breaker.recordFailure();
        lastErr = e;
        logger.warn(
          { err: (e as Error).message, provider: node.providerType, model: node.upstreamModel, attempt: i + 1 },
          "provider failed, trying fallback",
        );
      }
    }

    const status: ContentfulStatusCode =
      lastErr instanceof ProviderError ? (lastErr.status as ContentfulStatusCode) : 502;
    return {
      break: true,
      status,
      error: { message: `all providers failed: ${(lastErr as Error)?.message ?? "unknown"}`, type: "upstream_error" },
    };
  },
};

// ===== Pipeline 执行引擎 =====

export class MiddlewarePipeline {
  private middlewares: MiddlewareHandler[] = [];

  constructor(initial?: MiddlewareHandler[]) {
    if (initial) {
      this.middlewares = [...initial];
      this.middlewares.sort((a, b) => a.order - b.order);
    }
  }

  /** 注册中间件（按 order 排序插入） */
  use(middleware: MiddlewareHandler): this {
    this.middlewares.push(middleware);
    this.middlewares.sort((a, b) => a.order - b.order);
    return this;
  }

  /** 移除中间件 */
  remove(name: string): this {
    this.middlewares = this.middlewares.filter((m) => m.name !== name);
    return this;
  }

  /** 启用/禁用中间件 */
  toggle(name: string, enabled: boolean): this {
    const m = this.middlewares.find((m) => m.name === name);
    if (m) m.enabled = enabled;
    return this;
  }

  /** 列出所有中间件 */
  list(): Array<{ name: string; enabled: boolean; order: number }> {
    return this.middlewares.map((m) => ({ name: m.name, enabled: m.enabled, order: m.order }));
  }

  /** 执行管道 */
  async execute(ctx: PipelineContext): Promise<PipelineResult | void> {
    for (const middleware of this.middlewares) {
      if (!middleware.enabled) continue;

      try {
        const result = await middleware.handler(ctx);
        if (result?.break) {
          return result;
        }
      } catch (e) {
        logger.error(
          { middleware: middleware.name, err: (e as Error).message },
          "middleware execution error",
        );
        return {
          break: true,
          status: 500,
          error: { message: `middleware ${middleware.name} error: ${(e as Error).message}`, type: "internal_error" },
        };
      }
    }
  }
}

/** 创建默认管道（生产环境使用） */
export function createDefaultPipeline(): MiddlewarePipeline {
  return new MiddlewarePipeline([
    routerMiddleware,
    rateLimitMiddleware,
    cacheMiddleware,
    providerMiddleware,
  ]);
}

/** 创建测试管道（不含副作用中间件） */
export function createTestPipeline(): MiddlewarePipeline {
  return new MiddlewarePipeline([
    routerMiddleware,
    providerMiddleware,
  ]);
}
