/**
 * Nexus LLM Gateway - Gateway Memory（网关记忆）
 *
 * 目的：Gateway 记住租户的历史使用习惯，越用越聪明。
 *
 * 记忆维度：
 * - Tenant History：租户常用模型、常用意图、预算偏好
 * - Provider Optimization：根据历史数据优化 Provider 选择
 * - Preference Learning：自动学习租户偏好
 *
 * 存储：内存 + 定期持久化到 DB
 */
import type { ProviderType } from "../../shared/types.js";

export interface TenantMemory {
  tenantId: string;
  /** 模型使用频率 */
  modelUsage: Map<string, number>;
  /** 意图分布 */
  intentDistribution: Map<string, number>;
  /** Provider 偏好 */
  providerPreference: Map<ProviderType, number>;
  /** 平均每次请求 token 数 */
  avgTokensPerRequest: number;
  /** 总请求数 */
  totalRequests: number;
  /** 缓存命中率 */
  cacheHitRate: number;
  /** 预算使用率 */
  budgetUsageRate: number;
  /** 首选模型 */
  preferredModel: string;
  /** 首选 Provider */
  preferredProvider: ProviderType;
  /** 更新时间 */
  updatedAt: number;
}

export interface MemoryInsight {
  /** 推荐模型 */
  recommendedModel: string;
  /** 推荐 Provider */
  recommendedProvider: ProviderType;
  /** 推荐理由 */
  reason: string;
  /** 置信度 */
  confidence: number;
}

export class GatewayMemory {
  private tenants = new Map<string, TenantMemory>();
  private decayFactor = 0.95; // 每次更新旧数据衰减 5%

  /** 初始化租户记忆 */
  initTenant(tenantId: string): TenantMemory {
    const memory: TenantMemory = {
      tenantId,
      modelUsage: new Map(),
      intentDistribution: new Map(),
      providerPreference: new Map(),
      avgTokensPerRequest: 0,
      totalRequests: 0,
      cacheHitRate: 0,
      budgetUsageRate: 0,
      preferredModel: "deepseek-v4-flash",
      preferredProvider: "deepseek",
      updatedAt: Date.now(),
    };
    this.tenants.set(tenantId, memory);
    return memory;
  }

  /** 获取租户记忆 */
  get(tenantId: string): TenantMemory {
    return this.tenants.get(tenantId) ?? this.initTenant(tenantId);
  }

  /** 记录一次请求 */
  record(tenantId: string, data: {
    model: string;
    provider: ProviderType;
    intent?: string;
    tokens: number;
    cached: boolean;
  }): void {
    const mem = this.get(tenantId);

    // 衰减旧数据
    for (const [k, v] of mem.modelUsage) mem.modelUsage.set(k, v * this.decayFactor);
    for (const [k, v] of mem.intentDistribution) mem.intentDistribution.set(k, v * this.decayFactor);

    // 更新模型使用
    mem.modelUsage.set(data.model, (mem.modelUsage.get(data.model) ?? 0) + 1);

    // 更新意图分布
    if (data.intent) {
      mem.intentDistribution.set(data.intent, (mem.intentDistribution.get(data.intent) ?? 0) + 1);
    }

    // 更新 Provider 偏好
    mem.providerPreference.set(data.provider, (mem.providerPreference.get(data.provider) ?? 0) + 1);

    // 更新统计
    mem.totalRequests++;
    mem.avgTokensPerRequest = (mem.avgTokensPerRequest * (mem.totalRequests - 1) + data.tokens) / mem.totalRequests;
    mem.cacheHitRate = data.cached ? (mem.cacheHitRate * (mem.totalRequests - 1) + 1) / mem.totalRequests : mem.cacheHitRate;

    // 更新首选
    mem.preferredModel = this.topKey(mem.modelUsage) ?? mem.preferredModel;
    mem.preferredProvider = (this.topKey(mem.providerPreference) as ProviderType) ?? mem.preferredProvider;
    mem.updatedAt = Date.now();
  }

  /** 获取首选模型 */
  getPreferredModel(tenantId: string): string {
    return this.get(tenantId).preferredModel;
  }

  /** 获取首选 Provider */
  getPreferredProvider(tenantId: string): ProviderType {
    return this.get(tenantId).preferredProvider;
  }

  /** 生成智能推荐 */
  getInsight(tenantId: string, intent?: string): MemoryInsight {
    const mem = this.get(tenantId);

    // 如果有意图信息，看历史意图偏好
    if (intent && mem.intentDistribution.size > 0) {
      return {
        recommendedModel: mem.preferredModel,
        recommendedProvider: mem.preferredProvider,
        reason: `based on ${mem.totalRequests} requests history, intent "${intent}"`,
        confidence: Math.min(0.9, mem.totalRequests / 100),
      };
    }

    // 默认推荐
    return {
      recommendedModel: mem.preferredModel,
      recommendedProvider: mem.preferredProvider,
      reason: `based on ${mem.totalRequests} requests history`,
      confidence: Math.min(0.9, mem.totalRequests / 100),
    };
  }

  /** 获取租户统计摘要 */
  getSummary(tenantId: string): Record<string, unknown> {
    const mem = this.get(tenantId);
    return {
      tenantId: mem.tenantId,
      totalRequests: mem.totalRequests,
      preferredModel: mem.preferredModel,
      preferredProvider: mem.preferredProvider,
      avgTokensPerRequest: Math.round(mem.avgTokensPerRequest),
      cacheHitRate: (mem.cacheHitRate * 100).toFixed(1) + "%",
      topModels: this.topN(mem.modelUsage, 3),
      topIntents: this.topN(mem.intentDistribution, 3),
      updatedAt: new Date(mem.updatedAt).toISOString(),
    };
  }

  /** 获取 Map 中最大的 key */
  private topKey(map: Map<string, number>): string | undefined {
    let maxK: string | undefined;
    let maxV = 0;
    for (const [k, v] of map) {
      if (v > maxV) { maxV = v; maxK = k; }
    }
    return maxK;
  }

  /** 获取 Top N */
  private topN(map: Map<string, number>, n: number): Array<{ key: string; count: number }> {
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, count]) => ({ key, count }));
  }
}

/** 全局单例 */
let _memory: GatewayMemory | null = null;

export function getGatewayMemory(): GatewayMemory {
  if (!_memory) _memory = new GatewayMemory();
  return _memory;
}

export function resetGatewayMemory(): void {
  _memory = null;
}
