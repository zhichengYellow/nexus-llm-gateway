/**
 * Nexus LLM Gateway - Cost Controller（成本控制器）
 *
 * Layer 2: Cost Estimator + Budget Controller + Cost Report
 *
 * 功能：
 * 1. 成本预估（基于 Provider 价格表 + token 估算）
 * 2. 租户预算跟踪
 * 3. 预算阈值触发降级
 * 4. 每日成本聚合报告
 */
import type { ProviderType } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

// ===== 价格表 =====

export interface ProviderPrice {
  provider: ProviderType;
  model: string;
  inputPrice: number;   // 每 1M tokens (USD)
  outputPrice: number;  // 每 1M tokens (USD)
}

const PRICE_TABLE: ProviderPrice[] = [
  { provider: "deepseek", model: "deepseek-v4-flash", inputPrice: 0.27, outputPrice: 1.10 },
  { provider: "deepseek", model: "deepseek-v4-pro", inputPrice: 0.55, outputPrice: 2.19 },
  { provider: "gemini", model: "gemini-flash-lite", inputPrice: 0.075, outputPrice: 0.30 },
  { provider: "gemini", model: "gemini-2.0-flash", inputPrice: 0.10, outputPrice: 0.40 },
  { provider: "openai", model: "gpt-4o-mini", inputPrice: 0.15, outputPrice: 0.60 },
  { provider: "openai", model: "gpt-4o", inputPrice: 2.50, outputPrice: 10.00 },
  { provider: "qwen", model: "qwen-max", inputPrice: 2.80, outputPrice: 11.20 },
  { provider: "qwen", model: "qwen-plus", inputPrice: 0.55, outputPrice: 2.20 },
  { provider: "qwen", model: "qwen-turbo", inputPrice: 0.27, outputPrice: 0.83 },
];

// ===== Cost Estimator =====

export class CostEstimator {
  private prices: ProviderPrice[];

  constructor(prices?: ProviderPrice[]) {
    this.prices = prices ?? PRICE_TABLE;
  }

  /** 估算 token 数 */
  estimateTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    return Math.ceil(text.length / 4);
  }

  /** 估算单次请求成本 (USD) */
  estimateCost(input: string, provider: ProviderType, model: string, estimatedOutput = 200): number {
    const price = this.prices.find((p) => p.provider === provider && p.model === model);
    if (!price) return 0;

    const inputTokens = this.estimateTokens(input);
    const inputCost = (inputTokens / 1_000_000) * price.inputPrice;
    const outputCost = (estimatedOutput / 1_000_000) * price.outputPrice;

    return inputCost + outputCost;
  }

  /** 获取全部价格 */
  getAllPrices(): ProviderPrice[] {
    return [...this.prices];
  }

  /** 获取价格 */
  getPrice(provider: ProviderType, model: string): ProviderPrice | undefined {
    return this.prices.find((p) => p.provider === provider && p.model === model);
  }

  /** 更新价格 */
  updatePrice(price: ProviderPrice): void {
    const idx = this.prices.findIndex((p) => p.provider === price.provider && p.model === price.model);
    if (idx >= 0) this.prices[idx] = price;
    else this.prices.push(price);
  }

  /** 获取所有价格 */
  getPrices(): ProviderPrice[] {
    return [...this.prices];
  }
}

// ===== Budget Controller =====

export interface TenantBudget {
  tenantId: string;
  /** 月度预算 (USD) */
  monthlyBudget: number;
  /** 当月已消费 */
  spentThisMonth: number;
  /** 预算使用率 */
  usageRate: number;
  /** 是否超预算 */
  exceeded: boolean;
  /** 降级策略：block / cheap_only / warn */
  onExceeded: "block" | "cheap_only" | "warn";
}

export class BudgetController {
  private budgets = new Map<string, TenantBudget>();

  /** 设置预算 */
  setBudget(tenantId: string, monthlyBudget: number, onExceeded: "block" | "cheap_only" | "warn" = "warn"): void {
    this.budgets.set(tenantId, {
      tenantId,
      monthlyBudget,
      spentThisMonth: 0,
      usageRate: 0,
      exceeded: false,
      onExceeded,
    });
  }

  /** 获取预算状态 */
  getBudget(tenantId: string): TenantBudget | undefined {
    return this.budgets.get(tenantId);
  }

  /** 记录消费 */
  recordSpending(tenantId: string, cost: number): { allowed: boolean; reason: string } {
    let budget = this.budgets.get(tenantId);
    if (!budget) {
      // 无预算限制
      return { allowed: true, reason: "no budget set" };
    }

    budget.spentThisMonth += cost;
    budget.usageRate = budget.spentThisMonth / budget.monthlyBudget;
    budget.exceeded = budget.spentThisMonth >= budget.monthlyBudget;

    if (budget.exceeded) {
      switch (budget.onExceeded) {
        case "block":
          return { allowed: false, reason: `budget exceeded: $${budget.spentThisMonth.toFixed(4)} / $${budget.monthlyBudget}` };
        case "cheap_only":
          return { allowed: true, reason: "budget exceeded, cheap providers only" };
        case "warn":
          logger.warn({ tenantId, spent: budget.spentThisMonth, budget: budget.monthlyBudget }, "budget exceeded (warn)");
          return { allowed: true, reason: "budget exceeded (warning)" };
      }
    }

    return { allowed: true, reason: "within budget" };
  }

  /** 获取所有预算状态 */
  getAllBudgets(): TenantBudget[] {
    return [...this.budgets.values()];
  }

  /** 重置月度统计 */
  resetMonthly(): void {
    for (const b of this.budgets.values()) {
      b.spentThisMonth = 0;
      b.usageRate = 0;
      b.exceeded = false;
    }
  }
}

// ===== 全局单例 =====

let _estimator: CostEstimator | null = null;
let _budgetController: BudgetController | null = null;

export function getCostEstimator(): CostEstimator {
  if (!_estimator) _estimator = new CostEstimator();
  return _estimator;
}

export function getBudgetController(): BudgetController {
  if (!_budgetController) _budgetController = new BudgetController();
  return _budgetController;
}

export function resetCostControllers(): void {
  _estimator = null;
  _budgetController = null;
}
