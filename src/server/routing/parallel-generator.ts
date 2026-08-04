/**
 * Nexus LLM Gateway - Parallel Generator（并行生成引擎）
 *
 * 多模型并行生成 + Judge 评分排序 + 返回最优响应。
 *
 * 策略：
 * - 同时向多个 Provider 发送请求
 * - 对每个响应进行 Judge 评分
 * - 返回评分最高的响应
 * - 支持 fallback：部分失败不影响整体
 */
import type { ProviderType } from "../../shared/types.js";
import { getJudgeEngine } from "../judge/judge.js";
import { logger } from "../../shared/logger.js";

export interface ParallelRequest {
  provider: ProviderType;
  model: string;
  prompt: string;
  /** 实际调用函数 */
  call: () => Promise<string>;
}

export interface ParallelResult {
  provider: ProviderType;
  model: string;
  content: string;
  latencyMs: number;
  score: number;
  success: boolean;
  error?: string;
}

export interface ParallelResponse {
  best: ParallelResult;
  all: ParallelResult[];
  strategy: "best_score" | "fastest" | "only_success";
  winnerReason: string;
}

export class ParallelGenerator {
  /**
   * 并行调用多个 Provider，Judge 评分后返回最优
   */
  async generate(requests: ParallelRequest[]): Promise<ParallelResponse> {
    if (requests.length === 0) {
      throw new Error("no requests provided");
    }

    // 并行发起所有请求
    const promises = requests.map(async (req) => {
      const start = Date.now();
      try {
        const content = await req.call();
        const latency = Date.now() - start;
        const judge = getJudgeEngine();
        const score = judge.evaluate(req.prompt, content);

        return {
          provider: req.provider,
          model: req.model,
          content,
          latencyMs: latency,
          score: score.overall,
          success: true,
        } as ParallelResult;
      } catch (e) {
        logger.warn({ provider: req.provider, err: (e as Error).message }, "parallel generator: request failed");
        return {
          provider: req.provider,
          model: req.model,
          content: "",
          latencyMs: Date.now() - start,
          score: 0,
          success: false,
          error: (e as Error).message,
        } as ParallelResult;
      }
    });

    const results = await Promise.all(promises);
    const successful = results.filter((r) => r.success);

    // 选择策略
    let best: ParallelResult;
    let strategy: "best_score" | "fastest" | "only_success";
    let reason: string;

    if (successful.length >= 2) {
      // 多成功 → 选评分最高的
      best = successful.reduce((a, b) => (a.score >= b.score ? a : b));
      strategy = "best_score";
      reason = `selected by highest judge score (${(best.score * 100).toFixed(0)}%) among ${successful.length} candidates`;
    } else if (successful.length === 1) {
      best = successful[0]!;
      strategy = "only_success";
      reason = "only one provider succeeded";
    } else {
      // 全部失败 → 返回第一个（错误信息）
      best = results[0]!;
      strategy = "only_success";
      reason = `all ${results.length} providers failed`;
    }

    logger.info({
      total: results.length,
      success: successful.length,
      winner: `${best.provider}:${best.model}`,
      score: best.score,
      strategy,
    }, "parallel generator: completed");

    return {
      best,
      all: results,
      strategy,
      winnerReason: reason,
    };
  }

  /**
   * 快速模式：谁先返回用谁（不 Judge）
   */
  async generateFastest(requests: ParallelRequest[]): Promise<ParallelResult> {
    if (requests.length === 0) throw new Error("no requests");

    const promises = requests.map(async (req) => {
      const start = Date.now();
      try {
        const content = await req.call();
        return {
          provider: req.provider,
          model: req.model,
          content,
          latencyMs: Date.now() - start,
          score: 0,
          success: true,
        } as ParallelResult;
      } catch {
        return null;
      }
    });

    // 竞速：第一个成功
    const result = await Promise.race(promises);
    if (result) return result;

    // 全失败 → 等待所有，返回错误
    const all = await Promise.all(promises);
    const first = all.find((r) => r !== null);
    if (first) return first;

    throw new Error("all parallel requests failed");
  }
}

let _parallel: ParallelGenerator | null = null;
export function getParallelGenerator(): ParallelGenerator {
  if (!_parallel) _parallel = new ParallelGenerator();
  return _parallel;
}
export function resetParallelGenerator(): void { _parallel = null; }
