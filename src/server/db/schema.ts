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

export { vector };
export const enableVectorExtension = sql`CREATE EXTENSION IF NOT EXISTS vector`;