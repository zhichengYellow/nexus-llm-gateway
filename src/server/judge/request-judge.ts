/**
 * Nexus LLM Gateway - Request Judge（请求链路质量评估）
 *
 * Judge 引擎接入请求链路：记录质量评分 + Router 基于质量反馈优化。
 */
import { getJudgeEngine } from "../judge/judge.js";
import { getSmartRoutingEngine } from "../routing/smart-routing.js";
import type { ProviderType } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

export interface QualityRecord {
  requestId: string;
  provider: ProviderType;
  model: string;
  prompt: string;
  response: string;
  score: number;
  relevance: number;
  accuracy: number;
  fluency: number;
  safety: number;
  completeness: number;
  latencyMs: number;
  timestamp: number;
}

export class RequestJudge {
  private records: QualityRecord[] = [];
  private maxRecords = 500;

  /**
   * 评估一次请求的质量并记录
   */
  evaluate(requestId: string, provider: ProviderType, model: string, prompt: string, response: string, latencyMs: number): QualityRecord {
    const judge = getJudgeEngine();
    const score = judge.evaluate(prompt, response);

    const record: QualityRecord = {
      requestId,
      provider,
      model,
      prompt,
      response,
      score: score.overall,
      relevance: score.relevance,
      accuracy: score.accuracy,
      fluency: score.fluency,
      safety: score.safety,
      completeness: score.completeness,
      latencyMs,
      timestamp: Date.now(),
    };

    this.records.push(record);
    if (this.records.length > this.maxRecords) this.records.shift();

    // 反馈给路由引擎
    const isGood = score.overall >= 0.7;
    getSmartRoutingEngine().recordFeedback(provider, model, isGood, latencyMs);

    if (!isGood) {
      logger.warn({ requestId, provider, model, score: score.overall }, "low quality response detected");
    }

    return record;
  }

  /**
   * 获取质量统计
   */
  getQualityStats(): {
    total: number;
    avgScore: number;
    byProvider: Record<string, { avgScore: number; count: number }>;
    byModel: Record<string, { avgScore: number; count: number }>;
  } {
    const byProvider: Record<string, { totalScore: number; count: number }> = {};
    const byModel: Record<string, { totalScore: number; count: number }> = {};
    let totalScore = 0;

    for (const r of this.records) {
      totalScore += r.score;

      if (!byProvider[r.provider]) byProvider[r.provider] = { totalScore: 0, count: 0 };
      byProvider[r.provider]!.totalScore += r.score;
      byProvider[r.provider]!.count++;

      if (!byModel[r.model]) byModel[r.model] = { totalScore: 0, count: 0 };
      byModel[r.model]!.totalScore += r.score;
      byModel[r.model]!.count++;
    }

    const toAvg = (map: Record<string, { totalScore: number; count: number }>) => {
      const result: Record<string, { avgScore: number; count: number }> = {};
      for (const [k, v] of Object.entries(map)) {
        result[k] = { avgScore: v.count > 0 ? v.totalScore / v.count : 0, count: v.count };
      }
      return result;
    };

    return {
      total: this.records.length,
      avgScore: this.records.length > 0 ? totalScore / this.records.length : 0,
      byProvider: toAvg(byProvider),
      byModel: toAvg(byModel),
    };
  }

  /**
   * 获取最近的质量记录
   */
  getRecent(limit = 20): QualityRecord[] {
    return this.records.slice(-limit).reverse();
  }

  /**
   * Router 基于质量反馈优化
   */
  optimizeRouting(): { action: string; details: string } {
    const stats = this.getQualityStats();

    // 找出质量最低的 Provider
    let worstProvider = "";
    let worstScore = 1;
    for (const [p, s] of Object.entries(stats.byProvider)) {
      if (s.avgScore < worstScore && s.count >= 3) {
        worstScore = s.avgScore;
        worstProvider = p;
      }
    }

    if (worstProvider && worstScore < 0.5) {
      logger.warn({ provider: worstProvider, avgScore: worstScore }, "routing: reducing weight for low-quality provider");
      return {
        action: "reduce_weight",
        details: `Reduced weight for ${worstProvider} (avg score: ${(worstScore * 100).toFixed(0)}%)`,
      };
    }

    return { action: "no_change", details: "All providers meet quality threshold" };
  }
}

let _requestJudge: RequestJudge | null = null;
export function getRequestJudge(): RequestJudge {
  if (!_requestJudge) _requestJudge = new RequestJudge();
  return _requestJudge;
}
export function resetRequestJudge(): void { _requestJudge = null; }
