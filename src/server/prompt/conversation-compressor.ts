/**
 * Nexus LLM Gateway - Conversation Compressor（对话压缩）
 *
 * Layer 1.2 + 1.4: 对话摘要 + History Pruning
 *
 * 策略：20 轮历史 → 前 18 轮 Summary + 后 2 轮原文
 * 上下文重要性评分 + 低价值删除
 */
import type { ChatMessage } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

export interface ConversationSummary {
  /** 摘要文本 */
  summary: string;
  /** 原始消息数 */
  originalCount: number;
  /** 压缩后 token 估算 */
  compressedTokens: number;
  /** 原始 token 估算 */
  originalTokens: number;
}

export interface ImportanceScore {
  index: number;
  role: string;
  content: string;
  score: number;
  reason: string;
}

export class ConversationCompressor {
  /**
   * 生成对话摘要（基于规则的轻量实现）
   */
  summarize(messages: ChatMessage[], maxSummaryRounds: number): ConversationSummary {
    if (messages.length === 0) {
      return { summary: "", originalCount: 0, compressedTokens: 0, originalTokens: 0 };
    }

    // 提取关键信息
    const userMsgs = messages.filter((m) => m.role === "user");
    const topics: string[] = [];
    const questions: string[] = [];

    for (const msg of userMsgs) {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (content.length < 5) continue;

      // 提取问题
      if (/\?|？|什么|怎么|如何|为什么|请问/i.test(content)) {
        questions.push(content.slice(0, 50));
      } else {
        topics.push(content.slice(0, 30));
      }
    }

    // 构建摘要
    const parts: string[] = [];
    if (topics.length > 0) {
      parts.push(`讨论了: ${topics.slice(0, 5).join("; ")}`);
    }
    if (questions.length > 0) {
      parts.push(`提出了: ${questions.slice(0, 3).join("; ")}`);
    }

    const summary = parts.join("。");
    const originalTokens = this.estimateTokens(messages);
    const compressedTokens = Math.ceil(summary.length / 4);

    return {
      summary,
      originalCount: messages.length,
      compressedTokens,
      originalTokens,
    };
  }

  /**
   * 混合策略：前 N 轮摘要 + 后 M 轮原文
   */
  hybridCompress(messages: ChatMessage[], keepRecent = 2): { system: string; messages: ChatMessage[] } {
    const systemMsgs = messages.filter((m) => m.role === "system");
    const otherMsgs = messages.filter((m) => m.role !== "system");

    // 分离历史（除最后 keepRecent 轮）
    const pairs: ChatMessage[][] = [];
    let current: ChatMessage[] = [];
    for (const msg of otherMsgs) {
      current.push(msg);
      if (msg.role === "assistant" || msg.role === "user") {
        if (current.filter((m) => m.role === "user").length >= 1) {
          pairs.push(current);
          current = [];
        }
      }
    }
    if (current.length > 0) pairs.push(current);

    const recent = pairs.slice(-keepRecent).flat();
    const old = pairs.slice(0, -keepRecent).flat();

    const summary = this.summarize(old, keepRecent);

    const systemContent = summary.summary
      ? `[历史摘要] ${summary.summary}`
      : "";

    return {
      system: systemContent,
      messages: [...recent],
    };
  }

  /**
   * 上下文重要性评分
   */
  scoreImportance(messages: ChatMessage[]): ImportanceScore[] {
    return messages.map((msg, idx) => {
      const content = typeof msg.content === "string" ? msg.content : "";
      let score = 5; // 基础分

      // 系统消息重要
      if (msg.role === "system") score += 5;

      // 含关键信息加分
      if (/结论|总结|关键|重要|答案|结果/i.test(content)) score += 3;
      if (/\?|？/i.test(content)) score += 2; // 问题重要
      if (/```|function|class |def /i.test(content)) score += 3; // 代码重要

      // 低价值减分
      if (/^(好的|ok|嗯|哦|对|是的)$/i.test(content.trim())) score -= 4;
      if (content.length < 10) score -= 2;
      if (/谢谢|感谢|不客气/i.test(content)) score -= 2;

      return {
        index: idx,
        role: msg.role,
        content: content.slice(0, 50),
        score: Math.max(0, Math.min(10, score)),
        reason: score >= 7 ? "important" : score >= 4 ? "normal" : "low_value",
      };
    });
  }

  /**
   * 基于重要性评分删除低价值上下文
   */
  pruneByImportance(messages: ChatMessage[], threshold = 4): ChatMessage[] {
    const scores = this.scoreImportance(messages);
    const toKeep = new Set(
      scores.filter((s) => s.score >= threshold).map((s) => s.index),
    );

    const pruned = messages.filter((_, idx) => toKeep.has(idx));
    logger.debug({ original: messages.length, pruned: pruned.length }, "history pruned by importance");

    return pruned;
  }

  private estimateTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      total += Math.ceil(content.length / 4);
    }
    return total;
  }
}

// ===== 全局单例 =====
let _convCompressor: ConversationCompressor | null = null;

export function getConversationCompressor(): ConversationCompressor {
  if (!_convCompressor) _convCompressor = new ConversationCompressor();
  return _convCompressor;
}

export function resetConversationCompressor(): void {
  _convCompressor = null;
}
