/**
 * Nexus LLM Gateway - 通用工具
 */
import { nanoid } from "nanoid";

/** 生成请求追踪 ID */
export function genRequestId(prefix = "req"): string {
  return `${prefix}_${nanoid(16)}`;
}

/** 生成 OpenAI 风格的 completion id */
export function genCompletionId(): string {
  return `chatcmpl-${nanoid(24)}`;
}

/** 粗略估算 token 数（4 字符 ≈ 1 token，仅用于缺省场景） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/\s+/g, " ").trim();
  return Math.max(1, Math.ceil(cleaned.length / 4));
}

/**
 * 解析 SSE 流文本，按 data: 行切分。
 * 返回去掉 "data: " 前缀的 payload 字符串数组（不含 [DONE]）。
 */
export function parseSseLines(chunk: string): string[] {
  const lines: string[] = [];
  for (const raw of chunk.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;
    if (payload) lines.push(payload);
  }
  return lines;
}

/** 安全的 JSON 解析，失败返回 null */
export function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** 简单 sleep */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}