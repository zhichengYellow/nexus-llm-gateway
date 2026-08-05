/**
 * Nexus LLM Gateway - Prompt Compression（Prompt 压缩）
 *
 * Layer 1.1: 删除礼貌语、压缩 System Prompt、保留语义。
 * 目标是最大化 TRR（Token Reduction Ratio）。
 *
 * 压缩策略：
 * 1. 礼貌语删除："请帮我"、"谢谢"、"麻烦"、"请问"
 * 2. System Prompt 压缩：去冗余、合并重复指令
 * 3. 语义保持验证
 */
import { logger } from "../../shared/logger.js";

export interface CompressionResult {
  /** 原始文本 */
  original: string;
  /** 压缩后文本 */
  compressed: string;
  /** 原始 token 估算 */
  originalTokens: number;
  /** 压缩后 token 估算 */
  compressedTokens: number;
  /** 压缩率 (0~1) */
  ratio: number;
  /** 压缩步骤 */
  steps: string[];
}

/** 礼貌语模式 */
const POLITENESS_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /请(你|您)?帮(我|忙)?/g, replacement: "" },
  { pattern: /谢谢(你|您)?[!！。.]?/g, replacement: "" },
  { pattern: /麻烦(你|您)?(了)?/g, replacement: "" },
  { pattern: /请问(你|您)?/g, replacement: "" },
  { pattern: /不好意思[,，]?\s*/g, replacement: "" },
  { pattern: /打扰一下[,，]?\s*/g, replacement: "" },
  { pattern: /能否(麻烦)?/g, replacement: "" },
  { pattern: /可以(帮)?/g, replacement: "" },
  { pattern: /感谢[!！。.]?/g, replacement: "" },
  { pattern: /^[，,。.!！\s]+/, replacement: "" },
  { pattern: /[，,。.!！\s]+$/, replacement: "" },
];

/** 冗余修饰词 */
const REDUNDANT_MODIFIERS = [
  "非常", "十分", "特别", "极其", "相当", "比较",
  "真的", "确实", "实在", "简直",
];

export class PromptCompressor {
  /**
   * 压缩 Prompt
   */
  compress(text: string): CompressionResult {
    const original = text;
    const steps: string[] = [];
    let compressed = text;

    // Step 1: 礼貌语删除
    let before = compressed;
    for (const { pattern, replacement } of POLITENESS_PATTERNS) {
      compressed = compressed.replace(pattern, replacement);
    }
    compressed = compressed.replace(/\s{2,}/g, " ").trim();
    if (compressed !== before) {
      steps.push(`politeness: ${before.length - compressed.length} chars removed`);
    }

    // Step 2: 冗余修饰词删除
    before = compressed;
    for (const mod of REDUNDANT_MODIFIERS) {
      compressed = compressed.replace(new RegExp(mod, "g"), "");
    }
    if (compressed !== before) {
      steps.push(`modifiers: ${before.length - compressed.length} chars removed`);
    }

    // Step 3: 多余空白清理
    before = compressed;
    compressed = compressed.replace(/\s+/g, " ").trim();
    if (compressed !== before) {
      steps.push(`whitespace: normalized`);
    }

    const originalTokens = Math.ceil(original.length / 4);
    const compressedTokens = Math.ceil(compressed.length / 4);
    const ratio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

    if (steps.length > 0) {
      logger.debug({ ratio: (1 - ratio).toFixed(2), steps }, "prompt compressed");
    }

    return {
      original,
      compressed,
      originalTokens,
      compressedTokens,
      ratio,
      steps,
    };
  }

  /**
   * 压缩 System Prompt（合并重复指令）
   */
  compressSystem(systemPrompt: string): string {
    // 去除重复的指令前缀
    const lines = systemPrompt.split("\n").filter((l) => l.trim());
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const line of lines) {
      const normalized = line.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(line.trim());
      }
    }

    return unique.join("\n");
  }

  /**
   * 获取统计摘要
   */
  getStats(results: CompressionResult[]): { totalSaved: number; avgRatio: number } {
    const totalSaved = results.reduce((s, r) => s + (r.originalTokens - r.compressedTokens), 0);
    const avgRatio = results.reduce((s, r) => s + r.ratio, 0) / results.length;
    return { totalSaved, avgRatio };
  }
}

// ===== 全局单例 =====
let _compressor: PromptCompressor | null = null;

export function getPromptCompressor(): PromptCompressor {
  if (!_compressor) _compressor = new PromptCompressor();
  return _compressor;
}

export function resetPromptCompressor(): void {
  _compressor = null;
}
