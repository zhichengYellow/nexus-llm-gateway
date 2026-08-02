/**
 * Nexus LLM Gateway - Prompt Rewrite（Prompt 重写）
 *
 * 目的：在发送给 Provider 前，统一处理 System Prompt + Tenant Prompt + User Prompt。
 *
 * 功能：
 * - 注入租户级 System Prompt（如品牌风格、合规要求）
 * - 合并多条 System Message
 * - 自动补全对话格式
 * - 截断超长 Prompt（防止超过 Provider 上下文窗口）
 */
import type { ChatMessage } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

export interface RewriteOptions {
  /** 租户级 System Prompt 模板 */
  tenantSystemPrompt?: string;
  /** 最大 token 数（0 表示不限制） */
  maxTokens?: number;
  /** 是否自动补全 user/assistant 交替格式 */
  autoFormat?: boolean;
  /** 截断策略：head（保留开头）| tail（保留结尾）| none（不截断） */
  truncationStrategy?: "head" | "tail" | "none";
}

export interface RewriteResult {
  /** 重写后的消息列表 */
  messages: ChatMessage[];
  /** 是否被截断 */
  truncated: boolean;
  /** 原始 token 估算 */
  estimatedTokens: number;
}

/**
 * 粗略 token 估算（4 字符 ≈ 1 token）
 */
function estimateTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    total += Math.ceil(content.length / 4);
  }
  return total;
}

/**
 * Prompt Rewriter：统一处理 Prompt 格式
 */
export class PromptRewriter {
  private options: RewriteOptions;

  constructor(options?: RewriteOptions) {
    this.options = {
      tenantSystemPrompt: options?.tenantSystemPrompt,
      maxTokens: options?.maxTokens ?? 0,
      autoFormat: options?.autoFormat ?? true,
      truncationStrategy: options?.truncationStrategy ?? "tail",
    };
  }

  /** 更新配置 */
  configure(options: Partial<RewriteOptions>): void {
    Object.assign(this.options, options);
  }

  /**
   * 重写消息列表
   */
  rewrite(messages: ChatMessage[], tenantName?: string): RewriteResult {
    let result = [...messages];

    // 1. 注入租户 System Prompt
    if (this.options.tenantSystemPrompt || tenantName) {
      const systemContent = this.options.tenantSystemPrompt ?? `You are assisting a user from tenant: ${tenantName}`;
      const existingSystem = result.findIndex((m) => m.role === "system");

      if (existingSystem >= 0) {
        // 合并到现有 system message
        const currentContent = typeof result[existingSystem]!.content === "string"
          ? result[existingSystem]!.content
          : "";
        result[existingSystem] = {
          role: "system",
          content: `${systemContent}\n\n${currentContent}`,
        };
      } else {
        // 插入到最前面
        result.unshift({ role: "system", content: systemContent });
      }
    }

    // 2. 自动格式：确保 user/assistant 交替
    if (this.options.autoFormat) {
      result = this.autoFormatMessages(result);
    }

    // 3. 截断超长 Prompt
    const tokens = estimateTokens(result);
    let truncated = false;

    if (this.options.maxTokens && this.options.maxTokens > 0 && tokens > this.options.maxTokens) {
      truncated = true;
      logger.warn(
        { estimatedTokens: tokens, maxTokens: this.options.maxTokens, strategy: this.options.truncationStrategy },
        "prompt truncated",
      );

      if (this.options.truncationStrategy === "head") {
        // 保留开头（system + 前几条 user）
        while (result.length > 3 && estimateTokens(result) > this.options.maxTokens) {
          result.splice(result.length - 2, 2); // 去掉最后 user+assistant 对
        }
      } else if (this.options.truncationStrategy === "tail") {
        // 保留结尾（最近对话）
        const systemMsgs = result.filter((m) => m.role === "system");
        const otherMsgs = result.filter((m) => m.role !== "system");
        while (otherMsgs.length > 2 && estimateTokens([...systemMsgs, ...otherMsgs]) > this.options.maxTokens) {
          otherMsgs.splice(0, 2); // 去掉最早 user+assistant 对
        }
        result = [...systemMsgs, ...otherMsgs];
      }
    }

    return {
      messages: result,
      truncated,
      estimatedTokens: estimateTokens(result),
    };
  }

  /**
   * 确保消息是 user/assistant 交替格式
   */
  private autoFormatMessages(messages: ChatMessage[]): ChatMessage[] {
    const formatted: ChatMessage[] = [];
    let lastRole = "";

    for (const msg of messages) {
      if (msg.role === "system") {
        formatted.push(msg);
        continue;
      }

      if (msg.role === "tool") {
        formatted.push(msg);
        continue;
      }

      // 合并连续相同 role 的消息
      if (msg.role === lastRole && formatted.length > 0) {
        const last = formatted[formatted.length - 1]!;
        const newContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        const lastContent = typeof last.content === "string" ? last.content : "";
        last.content = `${lastContent}\n${newContent}`;
      } else {
        formatted.push({ ...msg });
        lastRole = msg.role;
      }
    }

    return formatted;
  }
}

/** 全局单例 */
let _rewriter: PromptRewriter | null = null;

export function getPromptRewriter(): PromptRewriter {
  if (!_rewriter) _rewriter = new PromptRewriter();
  return _rewriter;
}

export function resetPromptRewriter(): void {
  _rewriter = null;
}
