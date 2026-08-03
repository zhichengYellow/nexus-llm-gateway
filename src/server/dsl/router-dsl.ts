/**
 * Nexus LLM Gateway - Router DSL Engine
 *
 * Phase 2: YAML DSL → Parser → Compiler → Runtime
 *
 * 用法：
 * ```yaml
 * routes:
 *   - when:
 *       intent: code
 *       latency: "< 300"
 *       cost: "< 0.002"
 *     provider: deepseek
 *     model: deepseek-v4-flash
 *
 *   - when:
 *       intent: math
 *     provider: qwen
 *
 *   - when:
 *       fallback: true
 *     provider: deepseek
 * ```
 */
import type { ProviderType } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

// ===== DSL 类型定义 =====

export interface RouteCondition {
  intent?: string;
  latency?: string;      // "< 300" | "> 1000"
  cost?: string;          // "< 0.002" | "> 0.01"
  contextLength?: string; // "> 8000"
  errorRate?: string;     // "< 0.1"
  model?: string;         // 精确匹配模型名
  fallback?: boolean;     // 兜底规则
}

export interface RouteRule {
  when: RouteCondition;
  provider: string;
  model?: string;
  weight?: number;
  priority?: number;
}

export interface RouterDsl {
  routes: RouteRule[];
}

// ===== Parser =====

export class DslParser {
  /** when 块内的条件字段（model 只有带引号比较时才是条件，否则是 rule 字段） */
  private static readonly WHEN_CONDITION_FIELDS = new Set([
    "intent", "latency", "cost", "contextLength", "context_length",
    "errorRate", "error_rate", "fallback",
  ]);

  /** 解析 YAML 文本为 RouterDsl */
  parse(yamlText: string): RouterDsl {
    const lines = yamlText.split("\n");
    const dsl: RouterDsl = { routes: [] };
    let currentRule: Partial<RouteRule> | null = null;
    let inWhen = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      if (trimmed.startsWith("routes:")) continue;

      // 新的 rule 开始
      if (trimmed.startsWith("- when:")) {
        if (currentRule) this.flushRule(dsl, currentRule);
        currentRule = { when: {} };
        inWhen = true;
        continue;
      }

      if (!currentRule) continue;

      const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (!kvMatch) continue;

      const key = kvMatch[1]!;
      const val = kvMatch[2]!.trim();

      if (inWhen) {
        // model 在 when 块中如果带引号（比较表达式）就是条件，否则退出 when
        if (key === "model" && (val.startsWith('"') || val.startsWith("'"))) {
          (currentRule.when as any)[key] = val;
          continue;
        }

        if (DslParser.WHEN_CONDITION_FIELDS.has(key)) {
          if (key === "fallback") {
            (currentRule.when as any)[key] = val === "true";
          } else {
            (currentRule.when as any)[key] = val;
          }
        } else {
          // 非 when 条件字段 → 退出 when 块
          inWhen = false;
          (currentRule as any)[key] = val;
        }
      } else {
        (currentRule as any)[key] = val;
      }
    }

    if (currentRule) this.flushRule(dsl, currentRule);
    return dsl;
  }

  private flushRule(dsl: RouterDsl, rule: Partial<RouteRule>): void {
    if (rule.when && Object.keys(rule.when).length > 0) {
      dsl.routes.push(rule as RouteRule);
    }
  }
}

// ===== Compiler =====

export interface CompiledRule {
  condition: RouteCondition;
  provider: ProviderType;
  model?: string;
  weight: number;
  priority: number;
  /** 预编译的条件检查函数 */
  test: (context: RuleContext) => boolean;
}

export interface RuleContext {
  intent?: string;
  latencyMs?: number;
  estimatedCost?: number;
  contextLength?: number;
  errorRate?: number;
  model?: string;
}

export class DslCompiler {
  /** 编译 DSL 为可执行规则 */
  compile(dsl: RouterDsl): CompiledRule[] {
    return dsl.routes.map((rule, idx) => {
      const compiled: CompiledRule = {
        condition: rule.when,
        provider: rule.provider as ProviderType,
        model: rule.model,
        weight: rule.weight ?? 1,
        priority: rule.priority ?? (100 - idx),
        test: this.buildTest(rule.when),
      };
      return compiled;
    });
  }

  private buildTest(cond: RouteCondition): (ctx: RuleContext) => boolean {
    const checks: Array<(ctx: RuleContext) => boolean> = [];

    // fallback
    if (cond.fallback) {
      return () => true; // 总是匹配
    }

    // intent
    if (cond.intent) {
      checks.push((ctx) => ctx.intent === cond.intent);
    }

    // model 精确匹配
    if (cond.model) {
      checks.push((ctx) => ctx.model === cond.model);
    }

    // latency: "< 300" / "> 1000"
    if (cond.latency) {
      const { op, val } = this.parseComparison(cond.latency);
      checks.push((ctx) => ctx.latencyMs !== undefined && this.compare(ctx.latencyMs, op, val));
    }

    // cost: "< 0.002"
    if (cond.cost) {
      const { op, val } = this.parseComparison(cond.cost);
      checks.push((ctx) => ctx.estimatedCost !== undefined && this.compare(ctx.estimatedCost, op, val));
    }

    // contextLength
    if (cond.contextLength) {
      const { op, val } = this.parseComparison(cond.contextLength);
      checks.push((ctx) => ctx.contextLength !== undefined && this.compare(ctx.contextLength, op, val));
    }

    // errorRate
    if (cond.errorRate) {
      const { op, val } = this.parseComparison(cond.errorRate);
      checks.push((ctx) => ctx.errorRate !== undefined && this.compare(ctx.errorRate, op, val));
    }

    return (ctx) => checks.every((c) => c(ctx));
  }

  private parseComparison(expr: string): { op: "<" | ">" | "<=" | ">=" | "="; val: number } {
    // 去除引号
    const clean = expr.trim().replace(/^["']|["']$/g, "");
    const match = clean.match(/^([<>]=?|=)\s*(-?[\d.]+)$/);
    if (match) {
      return { op: match[1] as any, val: parseFloat(match[2]!) };
    }
    return { op: "=", val: 0 };
  }

  private compare(a: number, op: string, b: number): boolean {
    switch (op) {
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      case ">=": return a >= b;
      case "=": return a === b;
      default: return false;
    }
  }
}

// ===== Runtime =====

export interface DslMatchResult {
  rule: CompiledRule;
  matched: boolean;
  reason: string;
}

export class DslRuntime {
  private rules: CompiledRule[] = [];
  private lastLoadAt: number = 0;

  /** 从 YAML 文本加载规则 */
  load(yamlText: string): void {
    const parser = new DslParser();
    const compiler = new DslCompiler();
    const dsl = parser.parse(yamlText);
    this.rules = compiler.compile(dsl);
    this.lastLoadAt = Date.now();
    logger.info({ rulesCount: this.rules.length }, "DSL rules loaded");
  }

  /** 热重载 */
  reload(yamlText: string): void {
    this.load(yamlText);
  }

  /** 匹配规则 */
  match(context: RuleContext): DslMatchResult | null {
    // 按 priority 降序
    const sorted = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sorted) {
      try {
        if (rule.test(context)) {
          return {
            rule,
            matched: true,
            reason: `matched rule: ${rule.provider} (priority=${rule.priority})`,
          };
        }
      } catch (e) {
        logger.warn({ err: (e as Error).message }, "DSL rule test error");
      }
    }

    return null;
  }

  /** 获取所有规则 */
  getRules(): CompiledRule[] {
    return [...this.rules];
  }

  /** 最后加载时间 */
  getLastLoadAt(): number {
    return this.lastLoadAt;
  }
}

// ===== 全局单例 =====

let _runtime: DslRuntime | null = null;

export function getDslRuntime(): DslRuntime {
  if (!_runtime) _runtime = new DslRuntime();
  return _runtime;
}

export function resetDslRuntime(): void {
  _runtime = null;
}
