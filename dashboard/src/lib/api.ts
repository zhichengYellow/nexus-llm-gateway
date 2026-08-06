/**
 * Nexus LLM Gateway - 看板 API 客户端
 */
export class ApiClient {
  private masterKey: string;
  private apiUrl: string;

  constructor(masterKey: string, apiUrl?: string) {
    this.masterKey = masterKey;
    this.apiUrl = apiUrl || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.masterKey}`,
      "Content-Type": "application/json",
    };
  }

  async del<T>(path: string): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, { headers: this.headers() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async patch<T>(path: string): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: "PATCH",
      headers: this.headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ===== 用量 =====
  async getUsageSummary() {
    return this.get<{
      window: string;
      since: string;
      summary: Array<{
        provider: string;
        model: string;
        totalRequests: number;
        totalTokens: number;
        promptTokens: number;
        completionTokens: number;
        cacheHits: number;
        avgLatencyMs: number;
      }>;
    }>("/admin/usage/summary");
  }

  async getUsageTimeline(range: "1h" | "24h" | "7d" = "24h") {
    return this.get<{
      window: string;
      since: string;
      timeline: Array<{
        hour: string;
        totalRequests: number;
        totalTokens: number;
        cacheHits: number;
      }>;
    }>(`/admin/usage/timeline?range=${range}`);
  }

  // ===== 缓存 =====
  async getCacheStats() {
    return this.get<{
      cache: { totalEntries: number; totalHits: number; avgHits: number };
    }>("/admin/cache/stats");
  }

  // ===== 租户 =====
  async getTenants() {
    return this.get<{
      tenants: Array<{
        id: string;
        name: string;
        monthlyTokenQuota: number | null;
        createdAt: string;
      }>;
    }>("/admin/tenants");
  }

  async createTenant(name: string, monthlyTokenQuota?: number) {
    return this.post<{ tenant: { id: string; name: string; monthlyTokenQuota: number | null } }>(
      "/admin/tenants",
      { name, monthlyTokenQuota },
    );
  }

  async requestPremium(tenantId: string) {
    return this.patch<{ tenant: { id: string; cachePlan: string; approvedBy?: string; autoApproved?: boolean; recentRequests?: number } }>(
      `/admin/tenants/${tenantId}/request-premium`,
    );
  }

  async approvePremium(tenantId: string) {
    return this.patch<{ tenant: { id: string; cachePlan: string } }>(`/admin/tenants/${tenantId}/approve-premium`);
  }

  async revokePremium(tenantId: string) {
    return this.patch<{ tenant: { id: string; cachePlan: string } }>(`/admin/tenants/${tenantId}/revoke-premium`);
  }

  async rejectPremium(tenantId: string) {
    return this.patch<{ tenant: { id: string; cachePlan: string } }>(`/admin/tenants/${tenantId}/reject-premium`);
  }

  async getTenantUsage(tenantId: string) {
    return this.get<{
      tenant: { id: string; name: string; monthlyTokenQuota: number | null };
      period: { start: string; end: string };
      usage: {
        monthTokens: number;
        monthCostMicro: number;
        requestCount: number;
        quotaExceeded: boolean;
      };
    }>(`/admin/tenants/${tenantId}/usage`);
  }

  // ===== API Keys =====
  async getApiKeys() {
    return this.get<{
      apiKeys: Array<{
        id: string;
        tenantId: string;
        name: string;
        keyPrefix: string;
        enabled: boolean;
        createdAt: string;
        lastUsedAt: string | null;
      }>;
    }>("/admin/api-keys");
  }

  async createApiKey(tenantId: string, name: string) {
    return this.post<{
      apiKey: {
        id: string;
        tenantId: string;
        name: string;
        keyPrefix: string;
        key: string;
        enabled: boolean;
        createdAt: string;
      };
    }>("/admin/api-keys", { tenantId, name });
  }

  async deleteApiKey(id: string) {
    return this.del<{ ok: boolean }>(`/admin/api-keys/${id}`);
  }

  async toggleApiKey(id: string) {
    return this.patch<{ apiKey: { id: string; enabled: boolean } }>(`/admin/api-keys/${id}/toggle`);
  }

  // ===== 模型路由 =====
  async getModelRoutes() {
    return this.get<{
      routes: Array<{
        id: number;
        alias: string;
        provider: string;
        upstreamModel: string;
        priceInput: number;
        priceOutput: number;
        enabled: boolean;
        createdAt: string;
      }>;
    }>("/admin/model-routes");
  }

  async createModelRoute(data: { alias: string; provider: string; upstreamModel: string; priceInput?: number; priceOutput?: number }) {
    return this.post<{
      route: { id: number; alias: string; provider: string; upstreamModel: string; priceInput: number; priceOutput: number; enabled: boolean; createdAt: string };
    }>("/admin/model-routes", data);
  }

  async deleteModelRoute(id: number) {
    return this.del<{ ok: boolean }>(`/admin/model-routes/${id}`);
  }

  // ===== 运营分析 =====
  async getCostReport(range: "day" | "week" | "month" = "month") {
    return this.get<{
      report: {
        range: string;
        since: string;
        until: string;
        totalCostMicro: number;
        totalCostUsd: string;
        rows: Array<{
          date: string;
          provider: string;
          model: string;
          requests: number;
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
          costMicro: number;
          cacheHits: number;
        }>;
      };
    }>(`/admin/cost/report?range=${range}`);
  }

  async getOptimizationStats() {
    return this.get<{
      today: {
        trr: string;
        csr: string;
        qps: string;
        totalTokens: number;
        savedTokens: number;
        totalCost: string;
        savedCost: string;
      };
    }>("/admin/optimization/stats");
  }

  async getOptimizationSuggestions() {
    return this.get<{
      suggestions: Array<{
        category: "cost" | "quality" | "latency" | "cache" | "routing";
        priority: "high" | "medium" | "low";
        suggestion: string;
        expectedImpact: string;
      }>;
    }>("/admin/optimization/suggestions");
  }

  async getAnalyticsReport(range: "day" | "week" | "month" = "day") {
    return this.get<{
      period: { start: string; end: string };
      summary: {
        totalRequests: number;
        totalTokens: number;
        totalCostMicro: number;
        cacheHitRate: string;
        avgLatencyMs: number;
      };
      topModels: Array<{ model: string; requests: number; tokens: number }>;
      topProviders: Array<{ provider: string; requests: number; cost: number }>;
      dailyTrend: Array<{ date: string; requests: number; tokens: number }>;
      tenantBreakdown: Array<{ tenant: string; requests: number; tokens: number }>;
    }>(`/admin/analytics/report?range=${range}`);
  }

  async getCacheConfidence() {
    return this.get<{
      hotPrompts: Array<{ text: string; hits: number; avgLatency: number }>;
      refreshQueueSize: number;
      ttlMap: Record<string, number>;
    }>("/admin/cache/confidence");
  }

  // ===== P1: Cost Before Request =====
  async estimateCost(prompt: string) {
    return this.post<{
      prompt: string;
      promptTokens: number;
      estimates: Array<{
        provider: string;
        model: string;
        inputPrice: number;
        outputPrice: number;
        estimatedCost: number;
        estimatedTokens: number;
      }>;
      cheapest: { provider: string; model: string; estimatedCost: number };
    }>("/admin/cost/estimate", { prompt });
  }

  // ===== P1: Optimization Profiles =====
  async getProfiles() {
    return this.get<{
      profiles: Array<{
        name: string;
        label: string;
        description: string;
        compressionStrength: number;
        cacheThreshold: number;
        routingPreference: string;
        minQuality: number;
        maxLatencyMs: number;
      }>;
    }>("/admin/optimization/profiles");
  }

  // ===== P2: Provider Recommendation =====
  async getRecommendation(prompt: string) {
    return this.post<{
      intent: string;
      recommendations: Array<{ provider: string; model: string; estimatedCost: number }>;
      cheapest: { provider: string; model: string; estimatedCost: number };
      potentialSavings: string;
      message: string;
    }>("/admin/optimization/recommend", { prompt });
  }

  // ===== Provider 测速 =====
  async speedTest() {
    return this.post<{
      results: Array<{ model: string; status: "ok" | "error"; latencyMs: number; error?: string }>;
    }>("/admin/speed-test", {});
  }

  // ===== Provider API Key 配置(UI 配置,热生效) =====
  async getProviderKeys() {
    return this.get<{
      providers: Array<{ provider: string; configured: boolean; source: string }>;
    }>("/admin/providers/keys");
  }

  async setProviderKey(provider: string, apiKey: string) {
    return this.post<{ ok: boolean; provider: string; source: string }>(`/admin/providers/${provider}/key`, { apiKey });
  }

  async deleteProviderKey(provider: string) {
    return this.del<{ ok: boolean; provider: string; source: string }>(`/admin/providers/${provider}/key`);
  }
}