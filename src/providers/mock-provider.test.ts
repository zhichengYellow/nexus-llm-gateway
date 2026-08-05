/**
 * Nexus LLM Gateway - Mock Provider 单元测试
 * 验证 MockProvider 的响应格式、错误模拟、调用记录等功能。
 */
import { describe, it, expect } from "vitest";
import { MockProvider } from "../providers/mock-provider.js";
import type { ChatCompletionRequest } from "../shared/types.js";

function mkReq(model = "mock-model"): ChatCompletionRequest {
  return {
    model,
    messages: [{ role: "user", content: "Hello" }],
  };
}

describe("MockProvider", () => {
  it("chat 返回正确的响应格式", async () => {
    const mock = new MockProvider({ type: "mock" as any });
    const resp = await mock.chat(mkReq(), "mock-upstream");
    expect(resp.object).toBe("chat.completion");
    expect(resp.choices).toHaveLength(1);
    expect(resp.choices[0]!.message.content).toContain("Mock response");
    expect(resp.nexus.provider).toBe("mock");
  });

  it("chatStream 返回多个 chunk，最后包含 finish_reason=stop", async () => {
    const mock = new MockProvider({ type: "mock" as any });
    const chunks: any[] = [];
    for await (const chunk of mock.chatStream(mkReq(), "mock-upstream")) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const last = chunks[chunks.length - 1]!;
    expect(last.choices[0]!.finish_reason).toBe("stop");
    expect(last.usage).toBeDefined();
  });

  it("embed 返回正确的 embedding 格式", async () => {
    const mock = new MockProvider({ type: "mock" as any });
    const resp = await mock.embed({ model: "mock-model", input: "test" }, "mock-upstream");
    expect(resp.object).toBe("list");
    expect(resp.data).toHaveLength(1);
    expect(resp.data[0]!.embedding).toHaveLength(3);
  });

  it("listModels 返回配置的模型列表", () => {
    const mock = new MockProvider({ type: "mock" as any, models: ["model-a", "model-b"] });
    const models = mock.listModels();
    expect(models).toHaveLength(2);
    expect(models.map((m) => m.id)).toEqual(["model-a", "model-b"]);
  });

  it("shouldFail=true 时 chat 抛 ProviderError", async () => {
    const mock = new MockProvider({ type: "mock" as any, shouldFail: true });
    await expect(mock.chat(mkReq(), "mock-upstream")).rejects.toThrow("mock upstream error");
  });

  it("shouldFail=true 时 chatStream 抛 ProviderError", async () => {
    const mock = new MockProvider({ type: "mock" as any, shouldFail: true });
    const iter = mock.chatStream(mkReq(), "mock-upstream");
    await expect((async () => { for await (const _ of iter) {} })()).rejects.toThrow("mock upstream error");
  });

  it("callLog 记录每次调用", async () => {
    const mock = new MockProvider({ type: "mock" as any });
    await mock.chat(mkReq(), "mock-upstream");
    await mock.embed({ model: "mock-model", input: "test" }, "mock-upstream");

    expect(mock.callLog).toHaveLength(2);
    expect(mock.callLog[0]!.method).toBe("chat");
    expect(mock.callLog[1]!.method).toBe("embed");
  });

  it("clearCallLog 清空调用记录", async () => {
    const mock = new MockProvider({ type: "mock" as any });
    await mock.chat(mkReq(), "mock-upstream");
    mock.clearCallLog();
    expect(mock.callLog).toHaveLength(0);
  });

  it("setShouldFail 动态切换失败模式", async () => {
    const mock = new MockProvider({ type: "mock" as any });
    await expect(mock.chat(mkReq(), "mock-upstream")).resolves.toBeDefined();
    mock.setShouldFail(true);
    await expect(mock.chat(mkReq(), "mock-upstream")).rejects.toThrow("mock upstream error");
  });

  it("延迟模拟", async () => {
    const mock = new MockProvider({ type: "mock" as any, latency: 50 });
    const start = Date.now();
    await mock.chat(mkReq(), "mock-upstream");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});
