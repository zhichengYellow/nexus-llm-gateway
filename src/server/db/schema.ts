/**
 * Nexus LLM Gateway - 数据库 Schema
 * Postgres + pgvector
 */
import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, index, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 启用 pgvector 扩展（通过自定义 SQL 在 migration 中处理）
// 这里定义 vector 类型占位，drizzle 暂无原生 vector，用 customType

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
  /** 月度 token 配额，null 表示不限 */
  monthlyTokenQuota: integer("monthly_token_quota"),
  /** 缓存计划: free | premium_pending | premium_approved | premium_rejected */
  cachePlan: text("cache_plan").notNull().default("free"),
  /** 缓存相似度阈值（null=使用默认值：free 0.95，premium 0.85） */
  cacheThreshold: integer("cache_threshold"),
  /** 申请付费缓存的时间 */
  premiumRequestedAt: timestamp("premium_requested_at", { withTimezone: true }),
  /** 审批人: admin | agent */
  premiumApprovedBy: text("premium_approved_by"),
  /** 审批时间 */
  premiumApprovedAt: timestamp("premium_approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===== API Key =====
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** 展示名 */
    name: text("name").notNull(),
    /** 完整 key（仅创建时返回，存储用 hash） */
    keyHash: text("key_hash").notNull().unique(),
    /** key 前缀，用于识别 */
    keyPrefix: text("key_prefix").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("api_keys_tenant_idx").on(t.tenantId),
    keyHashIdx: index("api_keys_key_hash_idx").on(t.keyHash),
  }),
);

// ===== 模型配置（路由表）=====
export const modelRoutes = pgTable("model_routes", {
  id: serial("id").primaryKey(),
  /** 对外暴露的模型别名 */
  alias: text("alias").notNull().unique(),
  /** provider 类型 */
  provider: text("provider").notNull(),
  /** 实际模型名 */
  upstreamModel: text("upstream_model").notNull(),
  /** 故障转移链：JSON 数组，如 ["deepseek:deepseek-chat","ollama:llama3"] */
  fallbacks: jsonb("fallbacks").$type<string[]>().default([]),
  /** 输入价格（每 1K token，美元） */
  priceInput: integer("price_input").default(0),
  /** 输出价格（每 1K token，美元，×1000 存储） */
  priceOutput: integer("price_output").default(0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===== 用量记录 =====
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
    /** 成本（×10000 存储，单位美元） */
    costMicro: integer("cost_micro").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    cached: boolean("cached").notNull().default(false),
    stream: boolean("stream").notNull().default(false),
    status: integer("status").notNull().default(200),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTimeIdx: index("usage_logs_tenant_time_idx").on(t.tenantId, t.createdAt),
    modelTimeIdx: index("usage_logs_model_time_idx").on(t.model, t.createdAt),
  }),
);

// ===== 语义缓存 =====
export const semanticCache = pgTable(
  "semantic_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 缓存 key 的 hash（精确去重） */
    keyHash: text("key_hash").notNull(),
    /** 请求 prompt 的 embedding */
    embedding: vector("embedding"),
    /** 请求摘要（用于展示与调试） */
    promptPreview: text("prompt_preview").notNull(),
    /** 完整请求 JSON */
    request: jsonb("request").notNull(),
    /** 完整响应 JSON */
    response: jsonb("response").notNull(),
    model: text("model").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    hits: integer("hits").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyHashIdx: index("semantic_cache_key_hash_idx").on(t.keyHash),
    modelIdx: index("semantic_cache_model_idx").on(t.model),
  }),
);

// ===== Prompt 模板 =====
export const promptTemplates = pgTable("prompt_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  /** 模板内容，支持 {{var}} 插值 */
  content: text("content").notNull(),
  /** 变量定义 JSON */
  variables: jsonb("variables").$type<Record<string, string>>().default({}),
  version: integer("version").notNull().default(1),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 导出 vector 类型供 migration 使用
export { vector };

// 用于在 migration 中启用扩展的 SQL
export const enableVectorExtension = sql`CREATE EXTENSION IF NOT EXISTS vector`;