/**
 * Nexus LLM Gateway - Policy Engine
 *
 * Phase 5: Policy DSL → Compile → Runtime
 *
 * 支持：
 * - PII 检测：身份证/银行卡/手机号/邮箱
 * - Secret 检测：API Key/密码/Token
 * - Injection 检测：Prompt 注入攻击
 * - DLP：数据泄露防护
 *
 * DSL 示例：
 * ```yaml
 * policies:
 *   - name: "PII Mask"
 *     when: "contains_pii(input)"
 *     then: "mask"
 *     action: "allow"
 *
 *   - name: "Secret Block"
 *     when: "contains_secret(input)"
 *     then: "block"
 *     action: "reject"
 * ```
 */
import { logger } from "../../shared/logger.js";

// ===== Policy 类型 =====

export type PolicyAction = "allow" | "reject" | "mask" | "log" | "sanitize" | "block";

export interface PolicyRule {
  name: string;
  description?: string;
  /** 触发条件（内置函数名或表达式） */
  when: string;
  /** 处理方式 */
  then: PolicyAction;
  /** 结果动作 */
  action: PolicyAction;
  /** 是否启用 */
  enabled: boolean;
}

export interface PolicySet {
  policies: PolicyRule[];
}

export interface PolicyResult {
  rule: string;
  triggered: boolean;
  action: PolicyAction;
  then: PolicyAction;
  /** 脱敏后的文本（如果 then=mask） */
  maskedText?: string;
  /** 检测到的详情 */
  details?: string[];
}

// ===== 内置检测函数 =====

const PII_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: "PHONE", pattern: /1[3-9]\d{9}/ },
  { type: "ID_CARD", pattern: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/ },
  { type: "EMAIL", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  { type: "BANK_CARD", pattern: /\b\d{16,19}\b/ },
];

const SECRET_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: "API_KEY", pattern: /sk-[a-zA-Z0-9_-]{20,}/ },
  { type: "TOKEN", pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/ },
  { type: "PASSWORD", pattern: /(?:password|passwd|pwd)\s*[:=]\s*\S+/i },
  { type: "JWT", pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /forget\s+(all\s+)?(previous|prior)\s+instructions?/i,
  /you\s+are\s+now\s+(DAN|STAN|GPT)/i,
  /system\s*:\s*you\s+are/i,
  /<\|im_start\|>/i,
  /\[system\]/i,
];

// ===== Policy Compiler =====

export class PolicyCompiler {
  /** 编译 DSL */
  compile(policySet: PolicySet): PolicyRule[] {
    return policySet.policies.map((p) => ({
      ...p,
      enabled: p.enabled ?? true,
    }));
  }
}

// ===== Policy Runtime =====

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  load(rules: PolicyRule[]): void {
    this.rules = rules;
    logger.info({ rulesCount: rules.length }, "policy engine loaded");
  }

  loadFromYaml(yamlText: string): void {
    const lines = yamlText.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    const rules: PolicyRule[] = [];
    let currentRule: Partial<PolicyRule> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("policies:")) continue;

      if (trimmed === "- name:" || trimmed.startsWith("- name:")) {
        if (currentRule) rules.push(currentRule as PolicyRule);
        currentRule = { name: "", when: "", then: "log", action: "allow", enabled: true };
        const m = trimmed.match(/^- name:\s*(.+)/);
        if (m) currentRule.name = m[1]!.trim();
        continue;
      }

      if (currentRule) {
        const kv = trimmed.match(/^(\w+):\s*(.+)/);
        if (kv) {
          const key = kv[1]!;
          const val = kv[2]!.trim();
          (currentRule as any)[key] = val;
        }
      }
    }
    if (currentRule) rules.push(currentRule as PolicyRule);

    this.load(rules);
  }

  /** 评估所有策略 */
  evaluate(text: string): PolicyResult[] {
    const results: PolicyResult[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const triggered = this.evaluateCondition(rule.when, text);
      if (triggered) {
        const result = this.executeAction(rule, text);
        results.push(result);
      }
    }

    return results;
  }

  private evaluateCondition(when: string, text: string): boolean {
    switch (when) {
      case "contains_pii(input)":
        return PII_PATTERNS.some((item) => item.pattern.test(text));

      case "contains_secret(input)":
        return SECRET_PATTERNS.some((item) => item.pattern.test(text));

      case "contains_injection(input)":
        return INJECTION_PATTERNS.some((item) => item.test(text));

      case "always":
        return true;

      default:
        return false;
    }
  }

  private executeAction(rule: PolicyRule, text: string): PolicyResult {
    const result: PolicyResult = {
      rule: rule.name,
      triggered: true,
      action: rule.action,
      then: rule.then,
      details: [],
    };

    switch (rule.then) {
      case "mask": {
        let masked = text;
        for (const item of PII_PATTERNS) {
          const m = item.pattern.exec(masked);
          if (m) {
            result.details!.push(`${item.type}: ${m[0]}`);
          }
          masked = masked.replace(item.pattern, `[${item.type}]`);
        }
        result.maskedText = masked;
        break;
      }
      case "sanitize": {
        for (const item of INJECTION_PATTERNS) {
          const m = item.exec(text);
          if (m) {
            result.details!.push(`INJECTION: ${m[0]}`);
          }
        }
        break;
      }
      case "block": {
        for (const item of SECRET_PATTERNS) {
          const m = item.pattern.exec(text);
          if (m) {
            result.details!.push(`${item.type} detected`);
          }
        }
        break;
      }
    }

    logger.warn({ rule: rule.name, action: rule.action, details: result.details }, "policy triggered");
    return result;
  }

  /** 获取所有规则 */
  getRules(): PolicyRule[] {
    return [...this.rules];
  }
}

// ===== 全局单例 =====

let _engine: PolicyEngine | null = null;

export function getPolicyEngine(): PolicyEngine {
  if (!_engine) _engine = new PolicyEngine();
  return _engine;
}

export function resetPolicyEngine(): void {
  _engine = null;
}
