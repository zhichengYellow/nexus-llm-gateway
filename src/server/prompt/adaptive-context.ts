/**
 * Nexus LLM Gateway - Adaptive Context（自适应上下文）
 *
 * Layer 1.3: 不是所有请求都带 History。
 * "你好" → History 0；"继续" → History 保留。
 *
 * 功能：
 * 1. 请求类型检测（新对话/继续/引用）
 * 2. 动态 History 长度策略
 * 3. 上下文相关性判断
 */
import type { ChatMessage } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

export type RequestType = "new_conversation" | "continuation" | "reference" | "greeting" | "code" | "unknown";

export interface AdaptiveContextResult {
  type: RequestType;
  /** 保留的历史轮数 */
  keepHistoryRounds: number;
  /** 是否保留 System Prompt */
  keepSystem: boolean;
  /** 决策理由 */
  reason: string;
  /** 过滤后的消息 */
  filteredMessages: ChatMessage[];
}

/** 问候语模式 */
const GREETING_PATTERNS = /^(你好|hello|hi|hey|早上好|下午好|晚上好|您好|嗨)[!！。.]?$/i;

/** 继续模式 */
const CONTINUATION_PATTERNS = /^(继续|接着|然后|还有|next|continue|go on)[!！。.]?$/i;

/** 引用模式 */
const REFERENCE_PATTERNS = /^(上面|前面|刚才|之前|上一个|earlier|previous|above)/i;

export class AdaptiveContext {
  /**
   * 检测请求类型并返回优化的上下文策略
   */
  analyze(messages: ChatMessage[]): AdaptiveContextResult {
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    const lastContent = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";

    // 1. 检测类型
    const type = this.detectType(lastContent, messages);

    // 2. 决定策略
    switch (type) {
      case "greeting":
        return {
          type,
          keepHistoryRounds: 0,
          keepSystem: true,
          reason: "greeting detected, no history needed",
          filteredMessages: this.filterHistory(messages, 0, true),
        };
      case "continuation":
        return {
          type,
          keepHistoryRounds: 20,
          keepSystem: true,
          reason: "continuation detected, keep full history",
          filteredMessages: this.filterHistory(messages, 20, true),
        };
      case "reference":
        return {
          type,
          keepHistoryRounds: 10,
          keepSystem: true,
          reason: "reference detected, keep recent history",
          filteredMessages: this.filterHistory(messages, 10, true),
        };
      case "new_conversation":
        return {
          type,
          keepHistoryRounds: 0,
          keepSystem: true,
          reason: "new conversation, no history needed",
          filteredMessages: this.filterHistory(messages, 0, true),
        };
      case "code":
        return {
          type,
          keepHistoryRounds: 2,
          keepSystem: false,
          reason: "code request, minimal context needed",
          filteredMessages: this.filterHistory(messages, 2, false),
        };
      default:
        return {
          type: "unknown",
          keepHistoryRounds: 5,
          keepSystem: true,
          reason: "unknown type, keep moderate history",
          filteredMessages: this.filterHistory(messages, 5, true),
        };
    }
  }

  private detectType(content: string, messages: ChatMessage[]): RequestType {
    // 问候
    if (GREETING_PATTERNS.test(content.trim())) return "greeting";

    // 代码请求（优先检测，即使只有一条消息）
    if (/```|function\s|class\s|def\s|import\s|const\s|let\s|var\s/i.test(content)) return "code";

    // 继续
    if (CONTINUATION_PATTERNS.test(content.trim())) return "continuation";

    // 引用上文
    if (REFERENCE_PATTERNS.test(content)) return "reference";

    // 新对话（短消息 + 无历史）
    const userMsgs = messages.filter((m) => m.role === "user");
    const assistantMsgs = messages.filter((m) => m.role === "assistant");
    if (userMsgs.length <= 1 && assistantMsgs.length === 0) return "new_conversation";

    return "unknown";
  }

  /**
   * 过滤消息历史
   */
  private filterHistory(messages: ChatMessage[], keepRounds: number, keepSystem: boolean): ChatMessage[] {
    const systemMsgs = messages.filter((m) => m.role === "system");
    const otherMsgs = messages.filter((m) => m.role !== "system");

    // 保留最近 N 轮（每轮 = user + assistant）
    const pairs: ChatMessage[] = [];
    let rounds = 0;
    for (let i = otherMsgs.length - 1; i >= 0; i--) {
      pairs.unshift(otherMsgs[i]!);
      if (otherMsgs[i]!.role === "user") rounds++;
      if (rounds >= keepRounds) break;
    }

    const result: ChatMessage[] = [];
    if (keepSystem) result.push(...systemMsgs);
    result.push(...pairs);

    if (pairs.length < otherMsgs.length) {
      logger.debug({ original: otherMsgs.length, filtered: pairs.length }, "adaptive context: history pruned");
    }

    return result;
  }
}

// ===== 全局单例 =====
let _adaptiveContext: AdaptiveContext | null = null;

export function getAdaptiveContext(): AdaptiveContext {
  if (!_adaptiveContext) _adaptiveContext = new AdaptiveContext();
  return _adaptiveContext;
}

export function resetAdaptiveContext(): void {
  _adaptiveContext = null;
}
