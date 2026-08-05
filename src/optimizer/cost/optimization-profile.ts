/**
 * Nexus LLM Gateway - Optimization Profile（优化档位配置）
 *
 * P1: 定义 Fast / Balanced / Cheap / Maximum Saving 四档位，
 * 联动压缩强度、缓存策略、路由目标、质量门槛。
 */

export type ProfileName = "fast" | "balanced" | "cheap" | "maximum_saving";

export interface OptimizationProfile {
  name: ProfileName;
  label: string;
  description: string;
  compressionStrength: number;  // 0-1，越高越激进压缩
  cacheThreshold: number;       // 缓存置信度阈值，越低越容易命中缓存
  routingPreference: "quality" | "cost" | "balanced";
  minQuality: number;           // 最低质量门槛
  maxLatencyMs: number;         // 延迟上限
}

export const PROFILES: Record<ProfileName, OptimizationProfile> = {
  fast: {
    name: "fast",
    label: "极速模式",
    description: "最低延迟，不做任何优化处理",
    compressionStrength: 0,
    cacheThreshold: 1.0,
    routingPreference: "quality",
    minQuality: 0.95,
    maxLatencyMs: 1000,
  },
  balanced: {
    name: "balanced",
    label: "均衡模式",
    description: "质量与成本平衡，适度的压缩和缓存",
    compressionStrength: 0.5,
    cacheThreshold: 0.8,
    routingPreference: "balanced",
    minQuality: 0.9,
    maxLatencyMs: 3000,
  },
  cheap: {
    name: "cheap",
    label: "省钱模式",
    description: "优先使用最便宜的 Provider，积极压缩和缓存",
    compressionStrength: 0.8,
    cacheThreshold: 0.6,
    routingPreference: "cost",
    minQuality: 0.8,
    maxLatencyMs: 5000,
  },
  maximum_saving: {
    name: "maximum_saving",
    label: "极致省钱",
    description: "最大化成本节省，适用非关键场景",
    compressionStrength: 1.0,
    cacheThreshold: 0.4,
    routingPreference: "cost",
    minQuality: 0.7,
    maxLatencyMs: 10000,
  },
};

export function getProfile(name: string): OptimizationProfile {
  return PROFILES[name as ProfileName] ?? PROFILES.balanced;
}

export function listProfiles(): OptimizationProfile[] {
  return Object.values(PROFILES);
}
