/**
 * Nexus LLM Gateway - 配置加载
 * 从环境变量读取并校验配置，集中管理。
 */
import type { ProviderConfig, ProviderType } from "./types.js";

export interface GatewayConfig {
  port: number;
  logLevel: string;
  masterKey: string;
  databaseUrl: string;
  redisUrl: string;
  semanticCacheThreshold: number;
  semanticCacheTtl: number;
  semanticCacheEmbeddingModel: string;
  providers: Record<ProviderType, ProviderConfig>;
}

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (!v) {
    throw new Error(`Missing required env: ${key}`);
  }
  return v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Invalid number for env: ${key}`);
  return n;
}

export function loadConfig(): GatewayConfig {
  return {
    port: num("PORT", 8787),
    logLevel: process.env.LOG_LEVEL ?? "info",
    masterKey: required("GATEWAY_MASTER_KEY", "sk-nexus-master-change-me"),
    databaseUrl: required("DATABASE_URL", "postgres://nexus:nexus@localhost:5432/nexus"),
    redisUrl: required("REDIS_URL", "redis://localhost:6379"),
    semanticCacheThreshold: num("SEMANTIC_CACHE_THRESHOLD", 0.95),
    semanticCacheTtl: num("SEMANTIC_CACHE_TTL", 86400),
    semanticCacheEmbeddingModel: process.env.SEMANTIC_CACHE_EMBEDDING_MODEL ?? "text-embedding-3-small",
    providers: {
      deepseek: {
        type: "deepseek",
        baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
        apiKey: process.env.DEEPSEEK_API_KEY,
        models: {
          "deepseek-chat": "deepseek-chat",
          "deepseek-reasoner": "deepseek-reasoner",
        },
      },
      ollama: {
        type: "ollama",
        baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
        apiKey: process.env.OLLAMA_API_KEY,
        models: {
          "ollama-llama3": "llama3",
          "ollama-qwen2.5": "qwen2.5",
        },
      },
      openai: {
        type: "openai",
        baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY,
        models: {
          "gpt-4o-mini": "gpt-4o-mini",
          "gpt-4o": "gpt-4o",
          "text-embedding-3-small": "text-embedding-3-small",
          "text-embedding-3-large": "text-embedding-3-large",
        },
      },
    },
  };
}

let _config: GatewayConfig | null = null;

export function getConfig(): GatewayConfig {
  if (!_config) _config = loadConfig();
  return _config;
}