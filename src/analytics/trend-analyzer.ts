/**
 * Nexus LLM Gateway - Trend Analyzer（趋势分析器）
 *
 * 质量趋势分析 + 成本趋势分析 + 预测模型 + 优化建议生成
 */

export interface TrendPoint {
  timestamp: number;
  value: number;
  label?: string;
}

export interface TrendAnalysis {
  direction: "up" | "down" | "stable";
  changeRate: number;      // 变化率
  volatility: number;      // 波动率
  prediction: number;      // 预测下一个值
  confidence: number;      // 预测置信度
}

export interface OptimizationSuggestion {
  category: "cost" | "quality" | "latency" | "cache" | "routing";
  priority: "high" | "medium" | "low";
  suggestion: string;
  expectedImpact: string;
}

export class TrendAnalyzer {
  /**
   * 分析趋势
   */
  analyze(points: TrendPoint[]): TrendAnalysis {
    if (points.length < 2) {
      return { direction: "stable", changeRate: 0, volatility: 0, prediction: points[0]?.value ?? 0, confidence: 0 };
    }

    const values = points.map((p) => p.value);
    const n = values.length;

    // 线性回归
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    let numerator = 0, denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i]! - yMean);
      denominator += (i - xMean) ** 2;
    }
    const slope = denominator > 0 ? numerator / denominator : 0;

    // 波动率
    const variance = values.reduce((s, v) => s + (v - yMean) ** 2, 0) / n;
    const volatility = yMean > 0 ? Math.sqrt(variance) / yMean : 0;

    // 预测
    const prediction = yMean + slope * 1;

    // 方向
    const direction = slope > 0.01 ? "up" : slope < -0.01 ? "down" : "stable";
    const changeRate = yMean > 0 ? slope / yMean : 0;

    return {
      direction,
      changeRate,
      volatility: Math.min(1, volatility),
      prediction: Math.max(0, prediction),
      confidence: Math.max(0, 1 - volatility),
    };
  }

  /**
   * 生成优化建议
   */
  generateSuggestions(stats: {
    cacheHitRate: number;
    avgQuality: number;
    avgLatencyMs: number;
    costTrend: number; // 成本变化率
    qualityTrend: number;
  }): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // 缓存建议
    if (stats.cacheHitRate < 0.3) {
      suggestions.push({
        category: "cache",
        priority: "high",
        suggestion: `缓存命中率仅 ${(stats.cacheHitRate * 100).toFixed(0)}%，建议启用 Adaptive TTL 或增加缓存容量`,
        expectedImpact: `预计可提升至 50%+，节省 ${((0.5 - stats.cacheHitRate) * 100).toFixed(0)}% Token`,
      });
    }

    // 质量建议
    if (stats.avgQuality < 0.6) {
      suggestions.push({
        category: "quality",
        priority: "high",
        suggestion: `平均质量评分 ${(stats.avgQuality * 100).toFixed(0)}%，建议切换到更高质量的 Provider`,
        expectedImpact: "预计提升 20%+ 响应质量",
      });
    }

    // 延迟建议
    if (stats.avgLatencyMs > 2000) {
      suggestions.push({
        category: "latency",
        priority: "medium",
        suggestion: `平均延迟 ${stats.avgLatencyMs}ms 偏高，建议启用 Hedged Request 或切换到低延迟 Provider`,
        expectedImpact: "预计降低 40%+ 延迟",
      });
    }

    // 成本建议
    if (stats.costTrend > 0.1) {
      suggestions.push({
        category: "cost",
        priority: "high",
        suggestion: `成本呈上升趋势 (+${(stats.costTrend * 100).toFixed(0)}%)，建议启用 Budget Controller`,
        expectedImpact: "预计节省 20%+ 成本",
      });
    }

    // 路由建议
    if (stats.qualityTrend < -0.05) {
      suggestions.push({
        category: "routing",
        priority: "medium",
        suggestion: "响应质量呈下降趋势，建议调整路由权重或切换 Provider",
        expectedImpact: "预计稳定质量评分",
      });
    }

    return suggestions;
  }
}

let _trend: TrendAnalyzer | null = null;
export function getTrendAnalyzer(): TrendAnalyzer {
  if (!_trend) _trend = new TrendAnalyzer();
  return _trend;
}
export function resetTrendAnalyzer(): void { _trend = null; }
