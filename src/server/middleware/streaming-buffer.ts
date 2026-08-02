/**
 * Nexus LLM Gateway - Streaming Buffer（SSE 缓冲）
 *
 * 目的：将零散的 SSE chunk 缓冲 32ms 后批量 flush，减少 TCP 小包，提高吞吐。
 *
 * 原理：
 * - 上游 Provider 逐 token 产出 SSE chunk
 * - Buffer 收集 chunk，每 32ms 或达到批量大小时 flush
 * - 减少系统调用和 TCP 分段
 */
import { logger } from "../../shared/logger.js";

export interface StreamingBufferOptions {
  /** 缓冲间隔（ms），默认 32 */
  flushIntervalMs: number;
  /** 最大缓冲块数，达到后立即 flush */
  maxBatchSize: number;
}

export class StreamingBuffer {
  private buffer: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private options: StreamingBufferOptions;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private closed = false;

  constructor(writer: WritableStreamDefaultWriter<Uint8Array>, options?: Partial<StreamingBufferOptions>) {
    this.writer = writer;
    this.options = {
      flushIntervalMs: options?.flushIntervalMs ?? 32,
      maxBatchSize: options?.maxBatchSize ?? 10,
    };
  }

  /** 写入一个 chunk 到缓冲 */
  write(chunk: string): void {
    if (this.closed) return;
    this.buffer.push(chunk);

    // 达到批量大小立即 flush
    if (this.buffer.length >= this.options.maxBatchSize) {
      this.flush();
      return;
    }

    // 启动定时器（只启动一次）
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.options.flushIntervalMs);
    }
  }

  /** 立即 flush 缓冲 */
  flush(): void {
    if (this.closed || !this.writer || this.buffer.length === 0) {
      this.clearTimer();
      return;
    }

    const data = this.buffer.join("");
    this.buffer.length = 0;
    this.clearTimer();

    this.writer.write(this.encoder.encode(data)).catch(() => {
      // 客户端断开，忽略
    });
  }

  /** 关闭缓冲，flush 剩余数据 */
  async close(): Promise<void> {
    if (this.closed) return;
    this.flush();
    this.closed = true;
    try {
      await this.writer?.close();
    } catch { /* ignore */ }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 获取当前缓冲大小 */
  get bufferSize(): number {
    return this.buffer.length;
  }
}

/**
 * 将 AsyncIterable 的 SSE chunk 通过 StreamingBuffer 写入
 */
export async function streamWithBuffer(
  chunks: AsyncIterable<any>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  options?: Partial<StreamingBufferOptions>,
): Promise<void> {
  const buffer = new StreamingBuffer(writer, options);
  const encoder = new TextEncoder();

  try {
    for await (const chunk of chunks) {
      const line = `data: ${JSON.stringify(chunk)}\n\n`;
      buffer.write(line);
    }

    // 写入 DONE 标记（直接写，不缓冲）
    buffer.flush();
    await writer.write(encoder.encode("data: [DONE]\n\n"));
  } catch (e) {
    logger.error({ err: (e as Error).message }, "stream buffer error");
  } finally {
    await buffer.close();
  }
}
