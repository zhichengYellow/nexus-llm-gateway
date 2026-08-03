/**
 * Nexus LLM Gateway - LLM Observability（全链路 Trace）
 *
 * 目的：为每个请求生成完整的调用链 Trace，展示：
 *   Request → Auth → RateLimit → Cache → Router → Retry → Provider → LLM → Streaming
 * 每步记录耗时，生成 Waterfall 视图。
 *
 * 实现：
 * - 不引入外部 OpenTelemetry 依赖，使用自研轻量 Trace
 * - 每个 Span 记录 name、start、duration、metadata
 * - Trace 完成后输出结构化日志（可用作 Waterfall 数据源）
 * - 兼容 OpenTelemetry 格式，方便后续对接 Jaeger/Zipkin
 */
import { logger } from "../../shared/logger.js";

// ===== Span =====

export interface Span {
  /** Span ID */
  id: string;
  /** 父 Span ID */
  parentId: string | null;
  /** Span 名称 */
  name: string;
  /** 开始时间 (epoch ms) */
  start: number;
  /** 结束时间 (epoch ms) */
  end: number;
  /** 耗时 (ms) */
  duration: number;
  /** 状态：ok / error */
  status: "ok" | "error";
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** 子 Span */
  children: Span[];
}

export interface Trace {
  /** Trace ID */
  traceId: string;
  /** 请求 ID */
  requestId: string;
  /** 根 Span */
  rootSpan: Span;
  /** 所有 Span 平铺列表 */
  allSpans: Span[];
  /** 创建时间 */
  createdAt: number;
}

// ===== Tracer =====

export class Tracer {
  private traceId: string;
  private requestId: string;
  private spans: Span[] = [];
  private currentSpanId: string | null = null;

  constructor(requestId: string) {
    this.requestId = requestId;
    this.traceId = `trace_${requestId}`;
  }

  /** 开始一个新的 Span */
  startSpan(name: string, metadata?: Record<string, unknown>): Span {
    const span: Span = {
      id: `span_${this.spans.length}_${name}`,
      parentId: this.currentSpanId,
      name,
      start: Date.now(),
      end: 0,
      duration: 0,
      status: "ok",
      metadata: metadata ?? {},
      children: [],
    };

    // 建立父子关系
    if (this.currentSpanId) {
      const parent = this.spans.find((s) => s.id === this.currentSpanId);
      if (parent) parent.children.push(span);
    }

    this.spans.push(span);
    this.currentSpanId = span.id;
    return span;
  }

  /** 结束当前 Span */
  endSpan(status: "ok" | "error" = "ok", extra?: Record<string, unknown>): void {
    const span = this.spans.find((s) => s.id === this.currentSpanId);
    if (!span) return;

    span.end = Date.now();
    span.duration = span.end - span.start;
    span.status = status;
    if (extra) Object.assign(span.metadata, extra);

    // 回到父 Span
    this.currentSpanId = span.parentId;
  }

  /** 获取完整 Trace */
  getTrace(): Trace {
    const rootSpan = this.spans.find((s) => s.parentId === null);
    return {
      traceId: this.traceId,
      requestId: this.requestId,
      rootSpan: rootSpan ?? this.spans[0]!,
      allSpans: [...this.spans],
      createdAt: Date.now(),
    };
  }

  /**
   * 生成 Waterfall 格式的数据（供 Dashboard 渲染）
   */
  toWaterfall(): string {
    const trace = this.getTrace();
    const maxDuration = Math.max(...trace.allSpans.map((s) => s.duration), 1);
    const barWidth = 50;

    const lines: string[] = [
      `Trace: ${trace.traceId}`,
      `Request: ${trace.requestId}`,
      `Total: ${maxDuration}ms`,
      `${"─".repeat(barWidth + 20)}`,
    ];

    function render(spans: Span[], depth: number) {
      for (const s of spans) {
        const indent = "  ".repeat(depth);
        const bar = "█".repeat(Math.max(1, Math.round((s.duration / maxDuration) * barWidth)));
        const statusIcon = s.status === "ok" ? "✅" : "❌";
        lines.push(`${indent}${statusIcon} ${s.name.padEnd(15)} ${s.duration}ms ${bar}`);
        if (s.metadata && Object.keys(s.metadata).length > 0) {
          const meta = Object.entries(s.metadata)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ");
          lines.push(`${indent}   ↳ ${meta}`);
        }
        render(s.children, depth + 1);
      }
    }

    if (trace.rootSpan) {
      render([trace.rootSpan], 0);
    }
    // 也渲染其他根级 span（非 child 的 top-level spans）
    const otherRoots = trace.allSpans.filter(
      (s) => s.parentId === null && s.id !== trace.rootSpan?.id,
    );
    if (otherRoots.length > 0) {
      render(otherRoots, 0);
    }

    return lines.join("\n");
  }

  /** 记录为结构化日志 */
  log(): void {
    const trace = this.getTrace();
    logger.info(
      {
        traceId: trace.traceId,
        requestId: trace.requestId,
        totalDuration: Math.max(...trace.allSpans.map((s) => s.duration)),
        spanCount: trace.allSpans.length,
        spans: trace.allSpans.map((s) => ({
          name: s.name,
          duration: s.duration,
          status: s.status,
        })),
      },
      "trace completed",
    );
  }
}

// ===== Trace 存储（内存环形缓冲区）=====

export class TraceStore {
  private traces: Trace[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  save(trace: Trace): void {
    this.traces.push(trace);
    if (this.traces.length > this.maxSize) {
      this.traces.shift();
    }
  }

  /** 获取最近的 Trace */
  recent(count = 20): Trace[] {
    return this.traces.slice(-count).reverse();
  }

  /** 按 requestId 查找 */
  findByRequestId(requestId: string): Trace | undefined {
    return this.traces.find((t) => t.requestId === requestId);
  }

  /** 统计 */
  stats(): {
    total: number;
    avgDuration: number;
    p95Duration: number;
    errorRate: number;
  } {
    if (this.traces.length === 0) {
      return { total: 0, avgDuration: 0, p95Duration: 0, errorRate: 0 };
    }

    const durations = this.traces
      .map((t) => Math.max(...t.allSpans.map((s) => s.duration)))
      .sort((a, b) => a - b);

    const errors = this.traces.filter((t) =>
      t.allSpans.some((s) => s.status === "error"),
    );

    return {
      total: this.traces.length,
      avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p95Duration: durations[Math.floor(durations.length * 0.95)] ?? 0,
      errorRate: this.traces.length > 0 ? errors.length / this.traces.length : 0,
    };
  }

  /** 清空 */
  clear(): void {
    this.traces.length = 0;
  }
}

// ===== 全局单例 =====

let _traceStore: TraceStore | null = null;

export function getTraceStore(): TraceStore {
  if (!_traceStore) _traceStore = new TraceStore();
  return _traceStore;
}

export function resetTraceStore(): void {
  _traceStore = null;
}

/**
 * 创建 Tracer 并在 Pipeline 中使用
 * 用法：
 *   const tracer = new Tracer(requestId);
 *   tracer.startSpan("auth"); ... tracer.endSpan("ok");
 *   tracer.startSpan("cache"); ... tracer.endSpan("ok");
 *   tracer.log();
 *   getTraceStore().save(tracer.getTrace());
 */
