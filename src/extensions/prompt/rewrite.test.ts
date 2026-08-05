/**
 * Nexus LLM Gateway - Prompt Rewrite 测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PromptRewriter, resetPromptRewriter } from "../prompt/rewrite.js";
import type { ChatMessage } from "../../shared/types.js";

beforeEach(() => {
  resetPromptRewriter();
});

function mkMsg(role: string, content: string): ChatMessage {
  return { role: role as any, content };
}

describe("PromptRewriter 基础功能", () => {
  it("注入租户 System Prompt", () => {
    const rewriter = new PromptRewriter({ tenantSystemPrompt: "你是客服助手" });
    const result = rewriter.rewrite([
      mkMsg("user", "你好"),
    ]);
    expect(result.messages[0]!.role).toBe("system");
    expect(result.messages[0]!.content).toBe("你是客服助手");
  });

  it("合并到已有的 System Prompt", () => {
    const rewriter = new PromptRewriter({ tenantSystemPrompt: "客服助手" });
    const result = rewriter.rewrite([
      mkMsg("system", "你是 AI 助手"),
      mkMsg("user", "你好"),
    ]);
    expect(result.messages[0]!.role).toBe("system");
    expect(result.messages[0]!.content).toContain("客服助手");
    expect(result.messages[0]!.content).toContain("你是 AI 助手");
  });

  it("合并连续相同 role 的消息", () => {
    const rewriter = new PromptRewriter({ autoFormat: true });
    const result = rewriter.rewrite([
      mkMsg("user", "问题1"),
      mkMsg("user", "问题2"),
      mkMsg("assistant", "回答"),
    ]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]!.content).toContain("问题1");
    expect(result.messages[0]!.content).toContain("问题2");
  });

  it("截断超长 Prompt（tail 策略）", () => {
    const rewriter = new PromptRewriter({ maxTokens: 50, truncationStrategy: "tail" });
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(mkMsg("user", `这是第${i}条消息，包含很多内容`));
      messages.push(mkMsg("assistant", `这是第${i}条回复，包含很多内容`));
    }
    const result = rewriter.rewrite(messages);
    expect(result.truncated).toBe(true);
    expect(result.messages.length).toBeLessThan(messages.length);
  });

  it("不超限时不截断", () => {
    const rewriter = new PromptRewriter({ maxTokens: 10000 });
    const result = rewriter.rewrite([
      mkMsg("user", "hello"),
    ]);
    expect(result.truncated).toBe(false);
  });

  it("head 截断策略保留开头", () => {
    const rewriter = new PromptRewriter({ maxTokens: 30, truncationStrategy: "head" });
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(mkMsg("user", `消息${i}内容很长很长很长很长很长`));
      messages.push(mkMsg("assistant", `回复${i}内容很长很长很长很长很长`));
    }
    const result = rewriter.rewrite(messages);
    expect(result.truncated).toBe(true);
    // head 策略保留开头，第一条非 system 消息是 "消息0"
    const firstUserMsg = result.messages.find((m) => m.role === "user");
    expect(firstUserMsg).toBeDefined();
    expect(firstUserMsg!.content).toContain("消息0");
  });

  it("使用 tenant name 作为 System Prompt", () => {
    const rewriter = new PromptRewriter();
    const result = rewriter.rewrite([
      mkMsg("user", "你好"),
    ], "my-tenant");
    expect(result.messages[0]!.role).toBe("system");
    expect(result.messages[0]!.content).toContain("my-tenant");
  });

  it("configure 更新配置", () => {
    const rewriter = new PromptRewriter({ maxTokens: 100 });
    rewriter.configure({ maxTokens: 20, truncationStrategy: "tail" });
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(mkMsg("user", "很长很长很长很长很长很长"));
      messages.push(mkMsg("assistant", "很长很长很长很长很长很长"));
    }
    const result = rewriter.rewrite(messages);
    expect(result.truncated).toBe(true);
  });
});
