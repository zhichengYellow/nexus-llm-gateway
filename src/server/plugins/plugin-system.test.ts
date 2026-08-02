/**
 * Nexus LLM Gateway - 插件系统测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
  registerBuiltinPlugins,
  type ProviderPlugin,
  type CachePlugin,
  type AuthPlugin,
  type MetricsPlugin,
  type MiddlewarePlugin,
} from "../plugins/plugin-system.js";

// 重置注册中心
beforeEach(() => {
  resetPluginRegistry();
});

function mkProviderPlugin(name: string): ProviderPlugin {
  return {
    name,
    type: "provider",
    version: "1.0.0",
    enabled: true,
    providerType: name as any,
    factory: (cfg) => ({} as any),
    defaultConfig: { baseUrl: "https://example.com" },
  };
}

describe("PluginRegistry", () => {
  it("注册和获取插件", () => {
    const registry = getPluginRegistry();
    const plugin = mkProviderPlugin("test-provider");
    registry.register(plugin);

    const found = registry.get<ProviderPlugin>("test-provider");
    expect(found).toBeDefined();
    expect(found!.name).toBe("test-provider");
    expect(found!.type).toBe("provider");
  });

  it("重复注册发出警告但不报错", () => {
    const registry = getPluginRegistry();
    const p1 = mkProviderPlugin("dup");
    const p2 = mkProviderPlugin("dup");
    registry.register(p1);
    registry.register(p2); // 不应抛错
    expect(registry.list()).toHaveLength(1);
  });

  it("注销插件", () => {
    const registry = getPluginRegistry();
    registry.register(mkProviderPlugin("to-remove"));
    expect(registry.unregister("to-remove")).toBe(true);
    expect(registry.get("to-remove")).toBeUndefined();
    expect(registry.unregister("not-exist")).toBe(false);
  });

  it("按类型获取插件", () => {
    const registry = getPluginRegistry();
    registry.register(mkProviderPlugin("p1"));
    registry.register(mkProviderPlugin("p2"));

    registry.register({
      name: "cache-1",
      type: "cache",
      version: "1.0.0",
      enabled: true,
      init: async () => {},
      lookup: async () => null,
      store: async () => {},
      clear: async () => {},
      stats: async () => ({}),
    });

    const providers = registry.getByType<ProviderPlugin>("provider");
    const caches = registry.getByType<CachePlugin>("cache");
    expect(providers).toHaveLength(2);
    expect(caches).toHaveLength(1);
  });

  it("禁用的插件不出现在 getByType 中", () => {
    const registry = getPluginRegistry();
    registry.register(mkProviderPlugin("p1"));
    const p2 = mkProviderPlugin("p2");
    p2.enabled = false;
    registry.register(p2);

    const providers = registry.getByType<ProviderPlugin>("provider");
    expect(providers).toHaveLength(1);
    expect(providers[0]!.name).toBe("p1");
  });

  it("toggle 切换启用状态", () => {
    const registry = getPluginRegistry();
    registry.register(mkProviderPlugin("toggle-test"));
    expect(registry.toggle("toggle-test", false)).toBe(true);
    expect(registry.get<ProviderPlugin>("toggle-test")!.enabled).toBe(false);
    expect(registry.toggle("toggle-test", true)).toBe(true);
    expect(registry.get<ProviderPlugin>("toggle-test")!.enabled).toBe(true);
    expect(registry.toggle("not-exist", true)).toBe(false);
  });

  it("list 返回所有插件", () => {
    const registry = getPluginRegistry();
    registry.register(mkProviderPlugin("a"));
    registry.register(mkProviderPlugin("b"));
    expect(registry.list()).toHaveLength(2);
  });

  it("getProviders 返回所有 Provider 插件", () => {
    const registry = getPluginRegistry();
    registry.register(mkProviderPlugin("p1"));
    registry.register(mkProviderPlugin("p2"));
    expect(registry.getProviders()).toHaveLength(2);
  });

  it("注册多种类型插件", () => {
    const registry = getPluginRegistry();

    registry.register(mkProviderPlugin("p1"));

    registry.register({
      name: "auth-plugin",
      type: "auth",
      version: "1.0.0",
      enabled: true,
      authenticate: async (token) => ({ valid: token === "secret" }),
    } as AuthPlugin);

    registry.register({
      name: "metrics-plugin",
      type: "metrics",
      version: "1.0.0",
      enabled: true,
      init: async () => {},
      record: () => {},
      export: async () => "# HELP test\n",
    } as MetricsPlugin);

    registry.register({
      name: "mw-plugin",
      type: "middleware",
      version: "1.0.0",
      enabled: true,
      createMiddleware: () => ({ name: "test", enabled: true, order: 10, handler: async () => {} }),
    } as MiddlewarePlugin);

    expect(registry.getByType("provider")).toHaveLength(1);
    expect(registry.getByType("auth")).toHaveLength(1);
    expect(registry.getByType("metrics")).toHaveLength(1);
    expect(registry.getByType("middleware")).toHaveLength(1);
    expect(registry.list()).toHaveLength(4);
  });

  it("resetPluginRegistry 重置注册中心", () => {
    const r1 = getPluginRegistry();
    r1.register(mkProviderPlugin("test"));
    expect(r1.list()).toHaveLength(1);

    resetPluginRegistry();
    const r2 = getPluginRegistry();
    expect(r2.list()).toHaveLength(0);
    expect(r2).not.toBe(r1); // 新实例
  });

  it("registerBuiltinPlugins 注册内置插件", () => {
    const registry = getPluginRegistry();
    registerBuiltinPlugins();
    const list = registry.list();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((p) => p.name === "builtin-auth")).toBe(true);
    expect(list.some((p) => p.name === "builtin-logging")).toBe(true);
    expect(list.some((p) => p.name === "builtin-prometheus")).toBe(true);
  });

  it("getMiddlewarePlugins 返回中间件插件", () => {
    const registry = getPluginRegistry();
    registry.register({
      name: "mw1",
      type: "middleware",
      version: "1.0.0",
      enabled: true,
      createMiddleware: () => ({ name: "mw1", enabled: true, order: 10, handler: async () => {} }),
    });
    expect(registry.getMiddlewarePlugins()).toHaveLength(1);
  });
});
