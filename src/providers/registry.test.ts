/**
 * Nexus LLM Gateway - Provider Registry 集成测试
 * 测试 ProviderRegistry 的注册、模型解析、故障转移等功能。
 */
import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../providers/registry.js";
import type { ProviderType, ProviderConfig } from "../shared/types.js";

/** 构建测试用 ProviderConfig */
function mkConfig(type: ProviderType, models: Record<string, string>, apiKey?: string): ProviderConfig {
  return { type, baseUrl: `https://mock-${type}.test/v1`, apiKey, models };
}

describe("ProviderRegistry 注册中心", () => {
  it("注册 provider 后可通过 getProvider 获取", () => {
    const registry = new ProviderRegistry({
      deepseek: mkConfig("deepseek", { "deepseek-v4-flash": "deepseek-chat" }, "sk-test"),
    });
    const p = registry.getProvider("deepseek");
    expect(p).toBeDefined();
    expect(p!.type).toBe("deepseek");
  });

  it("无 API Key 的云 provider 自动跳过注册", () => {
    const registry = new ProviderRegistry({
      openai: mkConfig("openai", { "gpt-4o": "gpt-4o" }), // 无 key
      deepseek: mkConfig("deepseek", { "deepseek-v4-flash": "deepseek-chat" }, "sk-test"),
    });
    expect(registry.getProvider("openai")).toBeUndefined();
    expect(registry.getProvider("deepseek")).toBeDefined();
  });

  it("Ollama 无需 API Key 也能注册", () => {
    const registry = new ProviderRegistry({
      ollama: mkConfig("ollama", { "ollama-llama3": "llama3" }),
    });
    expect(registry.getProvider("ollama")).toBeDefined();
  });

  it("resolve 能正确解析模型别名", () => {
    const registry = new ProviderRegistry({
      deepseek: mkConfig("deepseek", { "deepseek-v4-flash": "deepseek-chat" }, "sk-test"),
    });
    const resolved = registry.resolve("deepseek-v4-flash");
    expect(resolved.providerType).toBe("deepseek");
    expect(resolved.upstreamModel).toBe("deepseek-chat");
    expect(resolved.fallbacks).toEqual([]);
  });

  it("resolve 不存在的模型抛错", () => {
    const registry = new ProviderRegistry({
      deepseek: mkConfig("deepseek", { "deepseek-v4-flash": "deepseek-chat" }, "sk-test"),
    });
    expect(() => registry.resolve("nonexistent-model")).toThrow("model not found");
  });

  it("resolveEmbedding 能解析 embedding 模型", () => {
    const registry = new ProviderRegistry({
      openai: mkConfig("openai", { "text-embedding-3-small": "text-embedding-3-small" }, "sk-test"),
    });
    const resolved = registry.resolveEmbedding("text-embedding-3-small");
    expect(resolved.providerType).toBe("openai");
    expect(resolved.upstreamModel).toBe("text-embedding-3-small");
  });

  it("setFallback 设置故障转移链", () => {
    const registry = new ProviderRegistry({
      deepseek: mkConfig("deepseek", { "deepseek-v4-flash": "deepseek-chat" }, "sk-test"),
      openai: mkConfig("openai", { "gpt-4o": "gpt-4o" }, "sk-test2"),
    });
    registry.setFallback("deepseek-v4-flash", [{ providerType: "openai", upstreamModel: "gpt-4o" }]);
    const resolved = registry.resolve("deepseek-v4-flash");
    expect(resolved.fallbacks).toHaveLength(1);
    expect(resolved.fallbacks[0]!.providerType).toBe("openai");
  });

  it("listAllModels 返回所有已注册模型的列表", () => {
    const registry = new ProviderRegistry({
      deepseek: mkConfig("deepseek", { "deepseek-v4-flash": "deepseek-chat", "deepseek-v4-pro": "deepseek-reasoner" }, "sk-test"),
      gemini: mkConfig("gemini", { "gemini-flash-lite": "gemini-flash-lite-latest" }, "sk-gemini"),
    });
    const models = registry.listAllModels();
    const ids = models.map((m) => m.id).sort();
    expect(ids).toContain("deepseek-v4-flash");
    expect(ids).toContain("deepseek-v4-pro");
    expect(ids).toContain("gemini-flash-lite");
  });
});
