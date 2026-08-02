/**
 * Nexus LLM Gateway - 插件系统（Plugin System）
 *
 * 支持 Provider / Router / Cache / Auth / Metrics 的插件化扩展。
 * 插件通过实现标准接口注册到 PluginRegistry，Gateway 启动时自动加载。
 *
 * 设计原则：
 * - 每个插件实现 Plugin 接口
 * - 插件按类型分组管理（provider / cache / auth / metrics / middleware）
 * - 支持动态注册、启用/禁用
 * - 第三方插件可通过 npm 包自动注册
 */
import type { ProviderType, ProviderConfig, ChatProvider, EmbeddingProvider } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";
import type { MiddlewareHandler } from "../middleware/pipeline.js";

// ===== 插件类型定义 =====

export type PluginType = "provider" | "cache" | "auth" | "metrics" | "middleware";

export interface Plugin {
  /** 插件名称（唯一标识） */
  name: string;
  /** 插件类型 */
  type: PluginType;
  /** 版本号 */
  version: string;
  /** 描述 */
  description?: string;
  /** 是否启用 */
  enabled: boolean;
}

/** Provider 插件 */
export interface ProviderPlugin extends Plugin {
  type: "provider";
  /** Provider 类型标识 */
  providerType: ProviderType;
  /** 创建 Provider 实例的工厂函数 */
  factory: (config: ProviderConfig) => ChatProvider & EmbeddingProvider;
  /** 默认配置 */
  defaultConfig: Partial<ProviderConfig>;
}

/** 缓存插件 */
export interface CachePlugin extends Plugin {
  type: "cache";
  /** 初始化缓存引擎 */
  init: (config: Record<string, unknown>) => Promise<void>;
  /** 查找缓存 */
  lookup: (key: string) => Promise<any>;
  /** 存储缓存 */
  store: (key: string, value: any, ttl: number) => Promise<void>;
  /** 清除缓存 */
  clear: () => Promise<void>;
  /** 统计信息 */
  stats: () => Promise<Record<string, unknown>>;
}

/** 认证插件 */
export interface AuthPlugin extends Plugin {
  type: "auth";
  /** 验证凭证 */
  authenticate: (token: string) => Promise<{ valid: boolean; identity?: Record<string, unknown> }>;
}

/** Metrics 插件 */
export interface MetricsPlugin extends Plugin {
  type: "metrics";
  /** 初始化指标收集器 */
  init: (config: Record<string, unknown>) => Promise<void>;
  /** 记录请求 */
  record: (metric: { name: string; value: number; labels?: Record<string, string> }) => void;
  /** 导出指标 */
  export: () => Promise<string>;
}

/** Middleware 插件（可注入 Pipeline） */
export interface MiddlewarePlugin extends Plugin {
  type: "middleware";
  /** 创建中间件 handler */
  createMiddleware: () => MiddlewareHandler;
}

export type AnyPlugin = ProviderPlugin | CachePlugin | AuthPlugin | MetricsPlugin | MiddlewarePlugin;

// ===== 插件注册中心 =====

export class PluginRegistry {
  private plugins = new Map<string, AnyPlugin>();

  /** 注册插件 */
  register(plugin: AnyPlugin): void {
    if (this.plugins.has(plugin.name)) {
      logger.warn({ pluginName: plugin.name }, "plugin already registered, replacing");
    }
    this.plugins.set(plugin.name, plugin);
    logger.info({ pluginName: plugin.name, type: plugin.type, version: plugin.version }, "plugin registered");
  }

  /** 注销插件 */
  unregister(name: string): boolean {
    const existed = this.plugins.has(name);
    if (existed) {
      this.plugins.delete(name);
      logger.info({ pluginName: name }, "plugin unregistered");
    }
    return existed;
  }

  /** 获取插件 */
  get<T extends AnyPlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }

  /** 按类型获取所有插件 */
  getByType<T extends AnyPlugin>(type: PluginType): T[] {
    return Array.from(this.plugins.values()).filter((p) => p.type === type && p.enabled) as T[];
  }

  /** 列出所有插件 */
  list(): Array<{ name: string; type: PluginType; version: string; enabled: boolean }> {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.name,
      type: p.type,
      version: p.version,
      enabled: p.enabled,
    }));
  }

  /** 启用/禁用插件 */
  toggle(name: string, enabled: boolean): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    plugin.enabled = enabled;
    logger.info({ pluginName: name, enabled }, "plugin toggled");
    return true;
  }

  /** 获取所有 Provider 插件 */
  getProviders(): ProviderPlugin[] {
    return this.getByType<ProviderPlugin>("provider");
  }

  /** 获取所有 Middleware 插件（用于注入 Pipeline） */
  getMiddlewarePlugins(): MiddlewarePlugin[] {
    return this.getByType<MiddlewarePlugin>("middleware");
  }
}

// ===== 全局单例 =====

let _pluginRegistry: PluginRegistry | null = null;

export function getPluginRegistry(): PluginRegistry {
  if (!_pluginRegistry) _pluginRegistry = new PluginRegistry();
  return _pluginRegistry;
}

/** 重置（测试用） */
export function resetPluginRegistry(): void {
  _pluginRegistry = null;
}

// ===== 自动发现（npm 包约定）=====

/**
 * 扫描 node_modules 中符合 @nexus/plugin-* 或 nexus-plugin-* 约定的包。
 * 每个包 export 一个 plugin 对象，自动注册到 PluginRegistry。
 *
 * 约定：
 * - 包名：@nexus/plugin-<name> 或 nexus-plugin-<name>
 * - 包导出：{ plugin: AnyPlugin }
 */
export async function discoverPlugins(): Promise<number> {
  const registry = getPluginRegistry();
  let count = 0;

  try {
    // 读取 package.json 的 nexus.plugins 配置
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const pkgPath = path.join(process.cwd(), "package.json");

    let pkg: any = {};
    try {
      const raw = await fs.readFile(pkgPath, "utf-8");
      pkg = JSON.parse(raw);
    } catch {
      // package.json 不存在，跳过
    }

    const pluginList: string[] = pkg?.nexus?.plugins ?? [];

    for (const pluginName of pluginList) {
      try {
        const mod = await import(pluginName);
        if (mod.plugin && typeof mod.plugin.name === "string") {
          registry.register(mod.plugin as AnyPlugin);
          count++;
        }
      } catch (e) {
        logger.warn({ pluginName, err: (e as Error).message }, "failed to load plugin");
      }
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "plugin discovery failed");
  }

  return count;
}

/**
 * 手动注册内置插件（Provider / Cache 等核心功能）
 * 在 gateway 启动时调用，将内置实现注册为插件。
 */
export function registerBuiltinPlugins(): void {
  const registry = getPluginRegistry();

  // 注册内置中间件插件
  registry.register({
    name: "builtin-auth",
    type: "middleware",
    version: "1.0.0",
    enabled: true,
    description: "Built-in authentication middleware (Master Key + API Key)",
    createMiddleware: () => ({
      name: "auth",
      enabled: true,
      order: 0,
      handler: async () => {},
    }),
  });

  registry.register({
    name: "builtin-logging",
    type: "middleware",
    version: "1.0.0",
    enabled: true,
    description: "Built-in request logging middleware",
    createMiddleware: () => ({
      name: "logging",
      enabled: true,
      order: 100,
      handler: async () => {},
    }),
  });

  registry.register({
    name: "builtin-prometheus",
    type: "metrics",
    version: "1.0.0",
    enabled: true,
    description: "Built-in Prometheus metrics exporter",
    init: async () => {},
    record: () => {},
    export: async () => "",
  });
}
