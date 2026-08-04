import { describe, it, expect, beforeEach } from "vitest";
import { ConversationCompressor, resetConversationCompressor } from "./conversation-compressor.js";

beforeEach(() => resetConversationCompressor());

function msg(role: string, content: string) { return { role, content } as any; }

describe("ConversationCompressor", () => {
  it("summarize 生成摘要", () => {
    const c = new ConversationCompressor();
    const msgs = [
      msg("user", "什么是机器学习？"),
      msg("assistant", "机器学习是AI分支..."),
      msg("user", "它有哪些应用？"),
    ];
    const result = c.summarize(msgs, 10);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.originalCount).toBe(3);
  });

  it("hybridCompress 混合策略", () => {
    const c = new ConversationCompressor();
    const msgs = [];
    for (let i = 0; i < 5; i++) {
      msgs.push(msg("user", `问题${i}`));
      msgs.push(msg("assistant", `回答${i}`));
    }
    const result = c.hybridCompress(msgs, 1);
    expect(result.messages.length).toBeLessThan(msgs.length);
    // system 至少包含摘要信息
    expect(result.system).toBeDefined();
  });

  it("scoreImportance 评分", () => {
    const c = new ConversationCompressor();
    const msgs = [
      msg("system", "你是助手"),
      msg("user", "ok"),
      msg("user", "解释量子计算的核心原理是什么"),
    ];
    const scores = c.scoreImportance(msgs);
    expect(scores[0]!.score).toBeGreaterThan(5); // system 重要
    expect(scores[1]!.score).toBeLessThan(5); // ok 不重要
    expect(scores[2]!.score).toBeGreaterThanOrEqual(5); // 包含"核心"等关键词
  });

  it("pruneByImportance 删除低价值", () => {
    const c = new ConversationCompressor();
    const msgs = [
      msg("user", "解释机器学习"),
      msg("assistant", "回答..."),
      msg("user", "ok"),
      msg("user", "谢谢"),
    ];
    const pruned = c.pruneByImportance(msgs, 4);
    expect(pruned.length).toBeLessThan(msgs.length);
    expect(pruned.some((m) => m.content === "ok")).toBe(false);
  });
});
