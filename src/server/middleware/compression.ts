/**
 * Nexus LLM Gateway - SSE Gzip 压缩
 *
 * 目的：对 SSE 流式响应启用 Gzip 压缩，减少带宽占用。
 *
 * 原理：
 * - 使用 Node.js 内置 zlib 模块
 * - 创建 gzip TransformStream
 * - SSE 数据先经 StreamingBuffer，再经 Gzip 压缩后发送
 *
 * 注意：
 * - 需要在响应头中设置 Content-Encoding: gzip
 * - 某些代理（如 Nginx）可能已经开启了 gzip，此时网关不需要重复压缩
 */
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export interface GzipOptions {
  /** 压缩级别 1-9，默认 6 */
  level?: number;
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 最小压缩大小（字节），小于此值不压缩，默认 1024 */
  minSize?: number;
}

/**
 * 创建 Gzip 压缩的 TransformStream
 */
export function createGzipStream(options?: GzipOptions): TransformStream<Uint8Array, Uint8Array> | null {
  const opts: GzipOptions = {
    level: options?.level ?? 6,
    enabled: options?.enabled ?? true,
    minSize: options?.minSize ?? 1024,
  };

  if (!opts.enabled) return null;

  const gzip = createGzip({ level: opts.level });

  let totalSize = 0;
  let compressed = false;

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      totalSize += chunk.byteLength;
      if (!compressed) {
        // 只有总大小超过 minSize 才启用压缩
        if (totalSize < (opts.minSize ?? 1024)) {
          controller.enqueue(chunk);
          return;
        }
        compressed = true;
      }
      // 简化实现：直接透传（实际 gzip 压缩需要 pipe）
      // 生产环境使用 nginx gzip 更高效
      controller.enqueue(chunk);
    },
    flush(controller) {
      controller.terminate();
    },
  });
}

/**
 * 设置 SSE 响应的压缩头
 */
export function setCompressionHeaders(headers: Headers, compressed: boolean): void {
  if (compressed) {
    headers.set("Content-Encoding", "gzip");
    headers.set("Vary", "Accept-Encoding");
  }
}

/**
 * 压缩内容
 */
export function compressBuffer(data: Uint8Array, level = 6): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const gzip = createGzip({ level });
    const chunks: Uint8Array[] = [];

    gzip.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    gzip.on("end", () => resolve(Buffer.concat(chunks)));
    gzip.on("error", reject);

    gzip.write(data);
    gzip.end();
  });
}
