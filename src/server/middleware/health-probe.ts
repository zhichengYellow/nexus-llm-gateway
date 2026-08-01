/**
 * Nexus LLM Gateway - Provider 健康探测
 * 注册(有无Key) → 健康探测 → 可用性状态（UNKNOWN/HEALTHY/DEGRADED/UNREACHABLE）
 */
import { logger } from "../../shared/logger.js";

export type HealthStatus = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "UNREACHABLE";

export interface HealthSnapshot {
  provider: string;
  status: HealthStatus;
  lastProbeMs: number | null;
  consecutiveFailures: number;
}

export class HealthProbe {
  private status: HealthStatus = "UNKNOWN";
  private lastProbeMs: number | null = null;
  private consecutiveFailures = 0;
  private failureThreshold: number;
  private slowThresholdMs: number;

  constructor(threshold = 2, slowMs = 2000) {
    this.failureThreshold = threshold;
    this.slowThresholdMs = slowMs;
  }

  recordSuccess(latencyMs: number) {
    this.consecutiveFailures = 0;
    this.lastProbeMs = latencyMs;
    this.status = latencyMs > this.slowThresholdMs ? "DEGRADED" : "HEALTHY";
  }

  recordFailure() {
    this.consecutiveFailures++;
    this.lastProbeMs = null;
    this.status = this.consecutiveFailures >= this.failureThreshold ? "UNREACHABLE" : "DEGRADED";
  }

  getStatus(): HealthStatus {
    return this.status;
  }

  snapshot(provider: string): HealthSnapshot {
    return { provider, status: this.status, lastProbeMs: this.lastProbeMs, consecutiveFailures: this.consecutiveFailures };
  }
}

export class HealthProbeRegistry {
  private probes = new Map<string, HealthProbe>();

  get(provider: string): HealthProbe {
    let p = this.probes.get(provider);
    if (!p) {
      p = new HealthProbe();
      this.probes.set(provider, p);
    }
    return p;
  }

  snapshot(): HealthSnapshot[] {
    return [...this.probes.entries()].map(([provider, probe]) => probe.snapshot(provider));
  }
}

let _registry: HealthProbeRegistry | null = null;
export function getHealthProbeRegistry(): HealthProbeRegistry {
  if (!_registry) _registry = new HealthProbeRegistry();
  return _registry;
}