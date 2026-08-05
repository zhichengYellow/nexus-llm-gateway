/**
 * Nexus LLM Gateway - Prompt Router（意图路由）
 *
 * 目的：根据用户 Prompt 的意图，自动选择最合适的 Provider。
 *
 * 分类策略（规则引擎，不依赖 LLM）：
 * - 代码/编程 → DeepSeek（代码能力强）
 * - 翻译/多语言 → Gemini（多语言支持好）
 * - 数学/推理 → DeepSeek（推理能力强）
 * - 创意写作 → Gemini（创意能力强）
 * - 长文本总结 → Gemini（上下文窗口大）
 * - 常识问答 → 默认（缓存友好）
 *
 * 实现：
 * - 关键词匹配 + 正则模式
 * - 零延迟（纯 CPU 运算，不调 LLM）
 * - 可配置路由规则
 */
import type { ProviderType } from "../../shared/types.js";

export interface IntentRule {
  /** 规则名称 */
  name: string;
  /** 意图类别 */
  category: string;
  /** 目标 Provider */
  targetProvider: ProviderType;
  /** 目标模型 */
  targetModel?: string;
  /** 关键词（任一命中则匹配） */
  keywords: string[];
  /** 正则模式（任一命中则匹配） */
  patterns: RegExp[];
  /** 优先级（越大越优先） */
  priority: number;
}

export interface IntentResult {
  /** 匹配的意图类别 */
  category: string;
  /** 推荐 Provider */
  provider: ProviderType;
  /** 推荐模型 */
  model?: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 匹配的规则 */
  matchedRule: string;
}

/** 默认路由规则 */
const DEFAULT_RULES: IntentRule[] = [
  {
    name: "code",
    category: "代码/编程",
    targetProvider: "deepseek",
    keywords: [
      "代码", "编程", "函数", "算法", "bug", "debug",
      "python", "javascript", "typescript", "java", "go", "rust",
      "react", "vue", "angular", "api", "rest", "sql",
      "写一个", "实现一个", "优化这段", "修复这个",
    ],
    patterns: [
      /```[\s\S]*```/,                          // 代码块
      /function\s+\w+\s*\(/,                     // 函数定义
      /import\s+.*from/,                         // import 语句
      /def\s+\w+\s*\(/,                          // Python def
      /class\s+\w+/,                             // 类定义
    ],
    priority: 90,
  },
  {
    name: "translation",
    category: "翻译/多语言",
    targetProvider: "gemini",
    targetModel: "gemini-flash-lite",
    keywords: [
      "翻译", "translate", "英文", "中文", "日文", "法语",
      "用.*说", "怎么说", "什么意思",
    ],
    patterns: [
      /翻译[成到]/,                             // 翻译成/翻译到
      /translate\s+(to|into)/i,                  // translate to/into
    ],
    priority: 85,
  },
  {
    name: "math",
    category: "数学/推理",
    targetProvider: "deepseek",
    keywords: [
      "计算", "公式", "数学", "方程", "证明",
      "推理", "逻辑", "推导",
    ],
    patterns: [
      /[\d]+\s*[\+\-\*\/\^]\s*[\d]+/,           // 算术表达式
      /solve|prove|derive/i,                     // 求解/证明/推导
    ],
    priority: 80,
  },
  {
    name: "creative",
    category: "创意写作",
    targetProvider: "gemini",
    targetModel: "gemini-flash-lite",
    keywords: [
      "写一篇文章", "写一个故事", "写诗", "创意",
      "头脑风暴", "灵感", "文案", "广告语",
      "写一首", "创作",
    ],
    patterns: [
      /写[一个篇首]/,                            // 写一个/写一篇/写一首
      /故事|诗歌|小说|散文/,                    // 文体
    ],
    priority: 75,
  },
  {
    name: "summary",
    category: "长文本总结",
    targetProvider: "gemini",
    targetModel: "gemini-flash-lite",
    keywords: [
      "总结", "摘要", "概括", "归纳",
      "summarize", "summary",
    ],
    patterns: [
      /总结[一下]/,                             // 总结一下
      /请.*概括/,                               // 请概括
    ],
    priority: 70,
  },
  {
    name: "general",
    category: "常识问答",
    targetProvider: "deepseek",
    keywords: [],
    patterns: [],
    priority: 0,
  },
];

/**
 * Prompt Router：根据 Prompt 内容决定路由到哪个 Provider
 */
export class PromptRouter {
  private rules: IntentRule[];

  constructor(rules?: IntentRule[]) {
    this.rules = rules ?? DEFAULT_RULES;
  }

  /** 添加/覆盖规则 */
  addRule(rule: IntentRule): void {
    const idx = this.rules.findIndex((r) => r.name === rule.name);
    if (idx >= 0) {
      this.rules[idx] = rule;
    } else {
      this.rules.push(rule);
    }
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /** 移除规则 */
  removeRule(name: string): void {
    this.rules = this.rules.filter((r) => r.name !== name);
  }

  /** 获取所有规则 */
  getRules(): IntentRule[] {
    return [...this.rules];
  }

  /**
   * 分类 Prompt，返回最佳 Provider
   */
  classify(prompt: string): IntentResult {
    const lower = prompt.toLowerCase();

    for (const rule of this.rules) {
      if (rule.name === "general") continue; // 最后处理

      // 关键词匹配
      const keywordMatch = rule.keywords.some((kw) => lower.includes(kw.toLowerCase()));
      if (keywordMatch) {
        return {
          category: rule.category,
          provider: rule.targetProvider,
          model: rule.targetModel,
          confidence: 0.8,
          matchedRule: rule.name,
        };
      }

      // 正则匹配
      const patternMatch = rule.patterns.some((p) => p.test(prompt));
      if (patternMatch) {
        return {
          category: rule.category,
          provider: rule.targetProvider,
          model: rule.targetModel,
          confidence: 0.9,
          matchedRule: rule.name,
        };
      }
    }

    // 默认：常识问答
    const generalRule = this.rules.find((r) => r.name === "general")!;
    return {
      category: generalRule.category,
      provider: generalRule.targetProvider,
      model: generalRule.targetModel,
      confidence: 0.5,
      matchedRule: "general",
    };
  }

  /**
   * 批量分类（并发安全）
   */
  classifyBatch(prompts: string[]): IntentResult[] {
    return prompts.map((p) => this.classify(p));
  }
}

/** 全局单例 */
let _router: PromptRouter | null = null;

export function getPromptRouter(): PromptRouter {
  if (!_router) _router = new PromptRouter();
  return _router;
}

export function resetPromptRouter(): void {
  _router = null;
}
