/**
 * Nexus LLM Gateway - Provider 注册中心
 * 管理所有 provider 实例，提供按模型别名路由的能力。
 */
import { getConfig } from "../shared/config.js";
import { logger } from "../shared/logger.js";
import type {
  ChatProvider,
  EmbeddingProvider,
  ModelInfo,
  ProviderConfig,
  ProviderType,
} from "../shared/types.js";
import { ProviderError } from "../shared/types.js";
import { DeepSeekProvider } from "./deepseek.js";
import { OpenAiProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

export interface ResolvedModel {
  provider: ChatProvider & EmbeddingProvider;
  providerType: ProviderType;
  upstreamModel: string;
  /** 故障转移链：[{providerType, upstreamModel}, ...] */
  fallbacks: Array<{ providerType: ProviderType; upstreamModel: string }>;
}

export class ProviderRegistry {
  private chatProviders = new Map<ProviderType, ChatProvider>();
  private embedProviders = new Map<ProviderType, EmbeddingProvider>();
  /** 模型别名 → {providerType, upstreamModel} */
  private modelMap = new Map<string, { providerType: ProviderType; upstreamModel: string }>();
  /** 模型别名 → 故障转移链 */
  private fallbackMap = new Map<string, Array<{ providerType: ProviderType; upstreamModel: string }>>();
  /** 上次热加载时间 */
  lastReloadAt: Date | null = null;

  constructor(providers: Partial<Record<ProviderType, ProviderConfig>>) {
    for (const [type, cfg] of Object.entries(providers) as Array<[ProviderType, ProviderConfig]>) {
      this.registerProvider(type, cfg);
    }
  }

  /** 该 provider 是否需要 API Key（ollama 本地无需；其余云服务必须） */
  private static requiresKey(type: ProviderType): boolean {
    return type !== "ollama";
  }

  private registerProvider(type: ProviderType, cfg: ProviderConfig) {
    // ===== v2: 官方 API 有限的场景 —— 无 key 的云 provider 自动禁用 =====
    if (ProviderRegistry.requiresKey(type) && !cfg.apiKey) {
      logger.warn({ providerType: type }, "provider skipped: missing API key (仅注册已配置的官方 API)");
      return;
    }
    let provider: ChatProvider & EmbeddingProvider;
    // 新增 OpenAI 兼容供应商（qwen/moonshot/zhipu/gemini）复用 OpenAiLikeProvider 基类
    switch (type) {
      case "deepseek":
        provider = new DeepSeekProvider(cfg) as ChatProvider & EmbeddingProvider;
        break;
      case "openai":
      case "qwen":
      case "moonshot":
      case "zhipu":
      case "gemini":
        provider = new OpenAiProvider(cfg) as ChatProvider & EmbeddingProvider;
        break;
      case "ollama":
        provider = new OllamaProvider(cfg) as ChatProvider & EmbeddingProvider;
        break;
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
    this.chatProviders.set(type, provider);
    this.embedProviders.set(type, provider);

    for (const [alias, upstream] of Object.entries(cfg.models)) {
      this.modelMap.set(alias, { providerType: type, upstreamModel: upstream });
      logger.debug({ alias, providerType: type, upstreamModel: upstream }, "registered model");
    }
  }

  /** 解析模型别名，返回主 provider + 故障转移链 */
  resolve(model: string): ResolvedModel {
    const primary = this.modelMap.get(model);
    if (!primary) {
      throw new ProviderError(`model not found: ${model}`, 404, "gateway");
    }
    const provider = this.chatProviders.get(primary.providerType) as ChatProvider & EmbeddingProvider;
    if (!provider) {
      throw new ProviderError(`provider not available: ${primary.providerType}`, 503, "gateway");
    }
    const fallbacks = this.fallbackMap.get(model) ?? [];
    return {
      provider,
      providerType: primary.providerType,
      upstreamModel: primary.upstreamModel,
      fallbacks,
    };
  }

  /** 解析 embedding 模型 */
  resolveEmbedding(model: string): { provider: EmbeddingProvider; providerType: ProviderType; upstreamModel: string } {
    const primary = this.modelMap.get(model);
    if (!primary) {
      throw new ProviderError(`embedding model not found: ${model}`, 404, "gateway");
    }
    const provider = this.embedProviders.get(primary.providerType) as EmbeddingProvider;
    if (!provider) {
      throw new ProviderError(`embedding provider not available: ${primary.providerType}`, 503, "gateway");
    }
    return { provider, providerType: primary.providerType, upstreamModel: primary.upstreamModel };
  }

  /** 获取 provider 实例（直接返回原实例，不用 spread 避免丢失原型方法） */
  getProvider(type: ProviderType): ChatProvider & EmbeddingProvider | undefined {
    const p = this.chatProviders.get(type);
    if (!p) return undefined;
    return p as ChatProvider & EmbeddingProvider;
  }

  /** 移除 provider（删除 key 后调用：空 key 的 registerProvider 会被跳过导致旧实例残留，必须显式移除） */
  removeProvider(type: ProviderType): void {
    const removed = this.chatProviders.delete(type) || this.embedProviders.delete(type);
    this.chatProviders.delete(type);
    this.embedProviders.delete(type);
    // 同步清理模型映射
    for (const [alias, meta] of this.modelMap) {
      if (meta.providerType === type) this.modelMap.delete(alias);
    }
    if (removed) logger.info({ providerType: type }, "provider removed from registry");
  }

  /** 列出所有对外暴露的模型 */
  listAllModels(): ModelInfo[] {
    const all: ModelInfo[] = [];
    for (const provider of this.chatProviders.values()) {
      all.push(...provider.listModels());
    }
    return all;
  }

  /** 列出所有 embedding 模型 */
  listAllEmbeddingModels(): ModelInfo[] {
    const all: ModelInfo[] = [];
    for (const provider of this.embedProviders.values()) {
      all.push(...provider.listEmbeddingModels());
    }
    return all;
  }

  /** 设置故障转移链（运行时配置） */
  setFallback(model: string, chain: Array<{ providerType: ProviderType; upstreamModel: string }>) {
    this.fallbackMap.set(model, chain);
  }

  /** 清除所有模型别名映射（用于热加载前清空旧路由） */
  clearRoutes(): void {
    this.modelMap.clear();
    this.fallbackMap.clear();
  }

  /** 添加模型别名（用于热加载时重建路由表） */
  addModelAlias(alias: string, providerType: ProviderType, upstreamModel: string): void {
    this.modelMap.set(alias, { providerType, upstreamModel });
  }

  /** 从 config 重建全部 provider(config 内置模型,可带 DB key 覆盖);用于热加载前重置 */
  rebuildFromConfig(
    providers: Partial<Record<ProviderType, ProviderConfig>>,
    keyOverrides?: Map<string, string>,
  ): void {
    this.modelMap.clear();
    this.fallbackMap.clear();
    this.chatProviders.clear();
    this.embedProviders.clear();
    for (const [type, cfg] of Object.entries(providers) as Array<[ProviderType, ProviderConfig]>) {
      const apiKey = keyOverrides?.get(type) ?? cfg.apiKey;
      this.registerProvider(type, { ...cfg, apiKey });
    }
  }

  /** 热更新 Provider API Key(UI 配置):用新 key 重建 provider 实例,立即生效 */
  updateProviderKey(type: ProviderType, apiKey: string): void {
    const cfg = getConfig().providers[type];
    if (!cfg) {
      logger.warn({ providerType: type }, "provider not found in config, cannot update key");
      return;
    }
    this.registerProvider(type, { ...cfg, apiKey });
    logger.info({ providerType: type, configured: Boolean(apiKey) }, "provider api key updated (hot reload)");
  }

  /** 获取所有模型别名列表 */
  listAllAliases(): string[] {
    return Array.from(this.modelMap.keys());
  }

  /** 已注册（有 key）的 provider 类型集合 */
  registeredProviders(): ProviderType[] {
    return Array.from(new Set(Array.from(this.modelMap.values()).map((m) => m.providerType)));
  }
}

let _registry: ProviderRegistry | null = null;

export function getRegistry(): ProviderRegistry {
  if (!_registry) {
    _registry = new ProviderRegistry(getConfig().providers);
  }
  return _registry;
}