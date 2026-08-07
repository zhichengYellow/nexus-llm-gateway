/**
 * Nexus LLM Gateway - 数据库 Schema
 * Postgres + pgvector
 */
import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, index, uniqueIndex, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { customType } from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
});

// ===== 租户 =====
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  monthlyTokenQuota: integer("monthly_token_quota"),
  cachePlan: text("cache_plan").notNull().default("free"),
  cacheThreshold: integer("cache_threshold"),
  premiumRequestedAt: timestamp("premium_requested_at", { withTimezone: true }),
  premiumApprovedBy: text("premium_approved_by"),
  premiumApprovedAt: timestamp("premium_approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    role: text("role").notNull().default("developer"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("api_keys_tenant_idx").on(t.tenantId),
    keyHashIdx: index("api_keys_key_hash_idx").on(t.keyHash),
  }),
);

export const modelRoutes = pgTable("model_routes", {
  id: serial("id").primaryKey(),
  alias: text("alias").notNull().unique(),
  provider: text("provider").notNull(),
  upstreamModel: text("upstream_model").notNull(),
  fallbacks: jsonb("fallbacks").$type<string[]>().default([]),
  priceInput: integer("price_input").default(0),
  priceOutput: integer("price_output").default(0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usageLogs = pgTable(
  "usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: text("request_id").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    upstreamModel: text("upstream_model"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    /** 节省的 token 数（压缩 + 缓存） */
    savedTokens: integer("saved_tokens").default(0),
    /** 节省的成本（微美元） */
    savedCostMicro: integer("saved_cost_micro").default(0),
    costMicro: integer("cost_micro").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    /** 首 token 延迟 (ms) */
    ttftMs: integer("ttft_ms").default(0),
    cached: boolean("cached").notNull().default(false),
    stream: boolean("stream").notNull().default(false),
    /** 压缩率 (0~1) */
    compressionRatio: integer("compression_ratio").default(0),
    /** 缓存类型：semantic / exact / none */
    cacheType: text("cache_type").default("none"),
    /** 路由决策原因 */
    routerReason: text("router_reason"),
    /** 意图类别 */
    intentCategory: text("intent_category"),
    /** 用户反馈 (0-5) */
    userFeedback: integer("user_feedback"),
    /** 重试次数 */
    retryCount: integer("retry_count").default(0),
    status: integer("status").notNull().default(200),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTimeIdx: index("usage_logs_tenant_time_idx").on(t.tenantId, t.createdAt),
    modelTimeIdx: index("usage_logs_model_time_idx").on(t.model, t.createdAt),
    intentIdx: index("usage_logs_intent_idx").on(t.intentCategory),
    cacheTypeIdx: index("usage_logs_cache_type_idx").on(t.cacheType),
  }),
);

export const semanticCache = pgTable(
  "semantic_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyHash: text("key_hash").notNull(),
    embedding: vector("embedding"),
    promptPreview: text("prompt_preview").notNull(),
    request: jsonb("request").notNull(),
    response: jsonb("response").notNull(),
    model: text("model").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    hits: integer("hits").notNull().default(0),
    /** 最近一次命中时间（用于 LRU/LFU 淘汰策略） */
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyHashUnique: uniqueIndex("semantic_cache_key_hash_unique").on(t.keyHash),
    modelIdx: index("semantic_cache_model_idx").on(t.model),
  }),
);

export const promptTemplates = pgTable("prompt_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  content: text("content").notNull(),
  variables: jsonb("variables").$type<Record<string, string>>().default({}),
  version: integer("version").notNull().default(1),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===== C2.1: 请求画像存储 =====
export const requestProfiles = pgTable("request_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  intentDistribution: jsonb("intent_distribution").$type<Record<string, number>>().default({}),
  providerPreference: jsonb("provider_preference").$type<Record<string, number>>().default({}),
  tokenTrend: jsonb("token_trend").$type<number[]>().default([]),
  costTrend: jsonb("cost_trend").$type<number[]>().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===== C2.2: 每日成本聚合 =====
export const costReports = pgTable("cost_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: text("date").notNull(),
  totalCostMicro: integer("total_cost_micro").notNull().default(0),
  savedCostMicro: integer("saved_cost_micro").default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  savedTokens: integer("saved_tokens").default(0),
  totalRequests: integer("total_requests").notNull().default(0),
  cacheHitRate: integer("cache_hit_rate").default(0),
  avgLatencyMs: integer("avg_latency_ms").default(0),
  breakdown: jsonb("breakdown").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dateUnique: uniqueIndex("cost_reports_date_unique").on(t.date),
}));

// ===== C2.3: TRR/CSR/QPS 指标快照 =====
export const optimizationStats = pgTable("optimization_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: text("date").notNull(),
  trr: integer("trr").default(0),        // Token Reduction Rate * 100
  csr: integer("csr").default(0),        // Cost Saving Rate * 100
  qps: integer("qps").default(0),        // Quality Preservation Score * 100
  totalRequests: integer("total_requests").default(0),
  totalTokens: integer("total_tokens").default(0),
  totalCostMicro: integer("total_cost_micro").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dateUnique: uniqueIndex("optimization_stats_date_unique").on(t.date),
}));

// ===== C2.4: Agent Memory 持久化 =====
export const chatMemories = pgTable("chat_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index("chat_memories_session_idx").on(t.tenantId, t.sessionId),
}));

// ===== Layer 5: 审计日志 =====
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),                    // 操作人（api key prefix 或 "master"）
  actorRole: text("actor_role").notNull().default("developer"),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  action: text("action").notNull(),                  // 操作类型（create_key, delete_key, toggle_key, create_tenant, etc.）
  resource: text("resource").notNull(),              // 目标资源（"api_keys", "tenants", "routes"）
  resourceId: text("resource_id"),                   // 资源 ID
  detail: text("detail"),                            // 操作详情
  result: text("result").notNull().default("success"), // success / failure
  ip: text("ip"),                                     // 请求 IP
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  actorIdx: index("audit_logs_actor_idx").on(t.actor),
  resourceIdx: index("audit_logs_resource_idx").on(t.resource),
  createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
}));

export const providerConfigs = pgTable("provider_configs", {
  provider: text("provider").primaryKey(),       // ProviderType: deepseek / openai / gemini / ...
  apiKey: text("api_key").notNull(),             // UI 配置的 Provider API Key
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export { vector };
export const enableVectorExtension = sql`CREATE EXTENSION IF NOT EXISTS vector`;