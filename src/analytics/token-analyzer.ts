/**
 * Nexus LLM Gateway - Token Analyzer（Token 构成分析）
 *
 * R2: 统计逐段 Token 构成，输出「哪里浪费最多」。
 *
 * 分析维度：
 * - system: System Prompt Token
 * - history: 对话历史 Token
 * - user: 用户输入 Token
 * - tool: 工具调用 Token
 * - output: 输出 Token
 * - compressed: 压缩节省的 Token
 * - cached: 缓存节省的 Token
 */
import { logger } from "../../shared/logger.js";

export interface TokenBreakdown {
  system: number;
  history: number;
  user: number;
  tool: number;
  output: number;
  total: number;
  compressed: number;  // 压缩节省
  cached: number;      // 缓存节省
}

export interface WasteReport {
  breakdown: TokenBreakdown;
  /** 各段占比 */
  ratios: Record<string, number>;
  /** 浪费来源 */
  wasteSources: Array<{ source: string; tokens: number; suggestion: string }>;
  /** TRR 估算 */
  trr: number;
}

export class TokenAnalyzer {
  /** 分析消息列表的 Token 构成 */
  analyze(messages: Array<{ role: string; content: string }>, outputContent = "", compressedSaved = 0, cacheSaved = 0): WasteReport {
    const breakdown: TokenBreakdown = {
      system: 0, history: 0, user: 0, tool: 0, output: 0, total: 0, compressed: compressedSaved, cached: cacheSaved,
    };

    let userCount = 0;
    for (const msg of messages) {
      const tokens = Math.ceil((msg.content?.length ?? 0) / 4);
      switch (msg.role) {
        case "system": breakdown.system += tokens; break;
        case "user":
          userCount++;
          if (userCount === messages.filter((m) => m.role === "user").length) {
            breakdown.user += tokens; // 最后一条是当前用户输入
          } else {
            breakdown.history += tokens;
          }
          break;
        case "assistant": breakdown.history += tokens; break;
        case "tool": breakdown.tool += tokens; break;
      }
    }

    breakdown.output = Math.ceil(outputContent.length / 4);
    breakdown.total = breakdown.system + breakdown.history + breakdown.user + breakdown.tool + breakdown.output;

    // 计算占比
    const total = breakdown.total || 1;
    const ratios: Record<string, number> = {
      system: breakdown.system / total,
      history: breakdown.history / total,
      user: breakdown.user / total,
      tool: breakdown.tool / total,
      output: breakdown.output / total,
    };

    // 识别浪费来源
    const wasteSources: Array<{ source: string; tokens: number; suggestion: string }> = [];
    if (breakdown.history > breakdown.user * 3) {
      wasteSources.push({ source: "history", tokens: breakdown.history, suggestion: `历史占比过高 (${(ratios.history * 100).toFixed(0)}%)，建议启用 Adaptive Context 自动截断` });
    }
    if (breakdown.system > breakdown.user) {
      wasteSources.push({ source: "system", tokens: breakdown.system, suggestion: `System Prompt 过长 (${(ratios.system * 100).toFixed(0)}%)，建议启用 Prompt Compression` });
    }
    if (breakdown.compressed === 0 && breakdown.total > 500) {
      wasteSources.push({ source: "compression", tokens: 0, suggestion: "未启用压缩，预计可节省 10-20% Token" });
    }
    if (breakdown.cached === 0 && breakdown.total > 200) {
      wasteSources.push({ source: "cache", tokens: 0, suggestion: "缓存未命中，建议启用 Adaptive TTL" });
    }

    // TRR 估算
    const saved = breakdown.compressed + breakdown.cached;
    const trr = breakdown.total > 0 ? saved / (breakdown.total + saved) : 0;

    return { breakdown, ratios, wasteSources, trr };
  }

  /** 快速分析 */
  quickAnalyze(prompt: string, history: string[], systemPrompt = "", output = ""): WasteReport {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    for (const h of history) messages.push({ role: "user", content: h });
    messages.push({ role: "user", content: prompt });
    return this.analyze(messages, output);
  }
}

let _tokenAnalyzer: TokenAnalyzer | null = null;
export function getTokenAnalyzer(): TokenAnalyzer {
  if (!_tokenAnalyzer) _tokenAnalyzer = new TokenAnalyzer();
  return _tokenAnalyzer;
}
export function resetTokenAnalyzer(): void { _tokenAnalyzer = null; }
