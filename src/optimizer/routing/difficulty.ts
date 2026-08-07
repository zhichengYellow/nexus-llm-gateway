/**
 * Nexus - 任务难度感知(智能路由质量保障)
 *
 * A: 难度分 —— 高难度请求自动升级强模型(保质量)
 * B: 请求头 x-nexus-model-tier: cheap | balanced | strong(手动覆盖)
 *
 * 原则: auto 路由只对"明显简单"的任务按成本选模型;
 * 检测到代码/推理/长上下文信号时升级到强模型,避免"保价不保质"。
 */
import { getCostEstimator } from "../cost/cost-controller.js";
import type { ProviderType } from "../../shared/types.js";

export type DifficultyLevel = "simple" | "standard" | "hard";

export interface DifficultyResult {
  score: number;
  level: DifficultyLevel;
  signals: string[];
}

const CODE_PATTERNS = [
  /`/,
  /\b(function|class|def|const|let|interface|type|import|export|return|async|await)\b/,
  /=>/,
  /\b(error|exception|bug|debug|stack.?trace|报错|异常|重构|refactor)\b/,
];

const REASONING_PATTERNS = [
  /证明|prove/,
  /分析|analy[sz]e/,
  /设计|design/,
  /架构|architecture/,
  /评估|evaluate/,
  /为什么|why/,
  /比较|compare|对比/,
  /优化|optimize|性能/,
  /解释|explain/,
  /算法|algorithm/,
  /复杂度|complexity/,
];

/** 任务难度评分: 长度 + 代码特征 + 推理信号 */
export function scoreDifficulty(prompt: string): DifficultyResult {
  const signals: string[] = [];
  let score = 0;
  const len = prompt.length;

  if (len > 1200) {
    score += 60;
    signals.push(`长度 ${len} 字符`);
  } else if (len > 600) {
    score += 30;
    signals.push(`长度 ${len} 字符`);
  }

  let codeHits = 0;
  for (const p of CODE_PATTERNS) if (p.test(prompt)) codeHits++;
  if (codeHits >= 3) {
    score += 40;
    signals.push(`代码特征 x${codeHits}`);
  } else if (codeHits >= 1) {
    score += 20;
    signals.push(`代码特征 x${codeHits}`);
  }

  let reasonHits = 0;
  for (const p of REASONING_PATTERNS) if (p.test(prompt)) reasonHits++;
  if (reasonHits >= 5) {
    score += 60;
    signals.push(`推理密集 x${reasonHits}`);
  } else if (reasonHits >= 3) {
    score += 30;
    signals.push(`推理任务 x${reasonHits}`);
  } else if (reasonHits >= 1) {
    score += 10;
    signals.push(`推理任务 x${reasonHits}`);
  }

  const level: DifficultyLevel = score >= 60 ? "hard" : score >= 25 ? "standard" : "simple";
  return { score, level, signals };
}

/** 该 provider 最强模型(价格表内 inputPrice 最高,贵=规格高) */
export function pickStrongModel(provider: ProviderType): string | undefined {
  const prices = getCostEstimator().getPrices().filter((p) => p.provider === provider);
  if (prices.length === 0) return undefined;
  return prices.reduce((a, b) => (b.inputPrice > a.inputPrice ? b : a)).model;
}

/** 该 provider 最便宜模型 */
export function pickCheapModel(provider: ProviderType): string | undefined {
  const prices = getCostEstimator().getPrices().filter((p) => p.provider === provider);
  if (prices.length === 0) return undefined;
  return prices.reduce((a, b) => (b.inputPrice < a.inputPrice ? b : a)).model;
}
