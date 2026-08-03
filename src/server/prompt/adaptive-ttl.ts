/**
 * Nexus LLM Gateway - Adaptive TTL（自适应缓存过期时间）
 *
 * 目的：根据问题类型自动调整缓存 TTL，时效性高的短 TTL，常识性的长 TTL。
 *
 * TTL 映射表：
 * - 价格/行情 → 30s
 * - 天气 → 10min
 * - 新闻/实时 → 30min
 * - 时政 → 1h
 * - 技术/代码 → 30天
 * - 翻译 → 7天
 * - 常识/问候 → 30天
 * - 默认 → 1天
 */
import { logger } from "../../shared/logger.js";

export interface TtlRule {
  /** 类别名称 */
  category: string;
  /** TTL（秒） */
  ttl: number;
  /** 关键词 */
  keywords: string[];
  /** 正则模式 */
  patterns: RegExp[];
  /** 优先级（越大越优先） */
  priority: number;
}

/** 默认 TTL 规则 */
const DEFAULT_TTL_RULES: TtlRule[] = [
  {
    category: "price",
    ttl: 30,
    keywords: ["价格", "行情", "多少钱", "费用", "成本", "报价", "股价", "汇率", "比特币", "股票", "基金"],
    patterns: [/价格|行情|股价/],
    priority: 100,
  },
  {
    category: "weather",
    ttl: 600,
    keywords: ["天气", "气温", "下雨", "刮风", "晴天", "阴天", "温度", "湿度"],
    patterns: [/天气|气温/],
    priority: 95,
  },
  {
    category: "news",
    ttl: 1800,
    keywords: ["新闻", "最新", "今日", "刚刚", "突发", "热点", "热搜"],
    patterns: [/新闻|最新|今日/],
    priority: 90,
  },
  {
    category: "politics",
    ttl: 3600,
    keywords: ["总统", "主席", "首相", "政府", "政策", "国家", "国际", "政治", "选举", "法律"],
    patterns: [/总统|主席|政策/],
    priority: 85,
  },
  {
    category: "code",
    ttl: 30 * 86400,
    keywords: ["代码", "编程", "函数", "算法", "bug", "python", "javascript", "java", "react", "vue"],
    patterns: [/function|class|import|def|```/],
    priority: 80,
  },
  {
    category: "translation",
    ttl: 7 * 86400,
    keywords: ["翻译", "translate", "英文", "中文", "日文", "法语", "德语"],
    patterns: [/翻译[成到]|translate/i],
    priority: 75,
  },
  {
    category: "greeting",
    ttl: 30 * 86400,
    keywords: ["你好", "hello", "hi", "早上好", "下午好", "晚上好", "谢谢"],
    patterns: [/^(你好|hello|hi|hey)/i],
    priority: 70,
  },
  {
    category: "tech",
    ttl: 30 * 86400,
    keywords: ["spring", "docker", "kubernetes", "mysql", "redis", "linux", "git", "api"],
    patterns: [/docker|kubernetes|spring/i],
    priority: 65,
  },
];

export class AdaptiveTtl {
  private rules: TtlRule[];
  private defaultTtl: number;

  constructor(rules?: TtlRule[], defaultTtl = 86400) {
    this.rules = rules ?? DEFAULT_TTL_RULES;
    this.rules.sort((a, b) => b.priority - a.priority);
    this.defaultTtl = defaultTtl;
  }

  /** 根据文本内容确定 TTL */
  determine(text: string): { ttl: number; category: string; confidence: number } {
    const lower = text.toLowerCase();

    for (const rule of this.rules) {
      // 关键词匹配
      if (rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        logger.debug({ ttl: rule.ttl, category: rule.category }, "adaptive ttl: keyword match");
        return { ttl: rule.ttl, category: rule.category, confidence: 0.8 };
      }

      // 正则匹配
      if (rule.patterns.some((p) => p.test(text))) {
        logger.debug({ ttl: rule.ttl, category: rule.category }, "adaptive ttl: pattern match");
        return { ttl: rule.ttl, category: rule.category, confidence: 0.9 };
      }
    }

    return { ttl: this.defaultTtl, category: "default", confidence: 0.5 };
  }

  /** 添加/更新规则 */
  addRule(rule: TtlRule): void {
    const idx = this.rules.findIndex((r) => r.category === rule.category);
    if (idx >= 0) {
      this.rules[idx] = rule;
    } else {
      this.rules.push(rule);
    }
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /** 获取所有规则 */
  getRules(): TtlRule[] {
    return [...this.rules];
  }

  /** 更新默认 TTL */
  setDefaultTtl(ttl: number): void {
    this.defaultTtl = ttl;
  }
}

/** 全局单例 */
let _adaptiveTtl: AdaptiveTtl | null = null;

export function getAdaptiveTtl(): AdaptiveTtl {
  if (!_adaptiveTtl) _adaptiveTtl = new AdaptiveTtl();
  return _adaptiveTtl;
}

export function resetAdaptiveTtl(): void {
  _adaptiveTtl = null;
}
