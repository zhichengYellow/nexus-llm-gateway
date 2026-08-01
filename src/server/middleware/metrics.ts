/**
 * Nexus LLM Gateway - Prometheus Metrics
 * 暴露 /metrics，供 Grafana 展示
 */
import { Hono } from "hono";
import type { LoggingEnv } from "./logging.js";

const m = { requests: 0, cacheHits: 0, latencyTotalMs: 0, retries: 0, circuitOpen: 0, tokens: 0 };

export function trackRequest(cached: boolean, latencyMs: number, retries = 0, tokens = 0) {
  m.requests++;
  m.latencyTotalMs += latencyMs;
  m.retries += retries;
  m.tokens += tokens;
  if (cached) m.cacheHits++;
}
export function trackCircuitOpen() { m.circuitOpen++; }

export const metricsRoute = new Hono<LoggingEnv>();
metricsRoute.get("/", (c) => {
  const avg = m.requests > 0 ? Math.round(m.latencyTotalMs / m.requests) : 0;
  const hit = m.requests > 0 ? (m.cacheHits / m.requests).toFixed(3) : "0";
  const body = [
    `gateway_requests_total ${m.requests}`,
    `gateway_cache_hits_total ${m.cacheHits}`,
    `gateway_cache_hit_rate ${hit}`,
    `gateway_provider_latency_avg_ms ${avg}`,
    `gateway_retry_total ${m.retries}`,
    `gateway_circuit_open_total ${m.circuitOpen}`,
    `gateway_tokens_total ${m.tokens}`,
  ].join("\n");
  return c.text(body, 200, { "Content-Type": "text/plain; version=0.0.4" });
});