/**
 * Nexus LLM Gateway - Streaming Buffer 测试
 */
import { describe, it, expect, vi } from "vitest";
import { StreamingBuffer } from "./streaming-buffer.js";

function createMockWriter() {
  const writes: string[] = [];
  return {
    writes,
    writer: {
      write: vi.fn(async (chunk: Uint8Array) => {
        writes.push(new TextDecoder().decode(chunk));
      }),
      close: vi.fn(async () => {}),
      releaseLock: vi.fn(),
    } as any,
  };
}

describe("StreamingBuffer", () => {
  it("达到 maxBatchSize 时立即 flush", async () => {
    const { writer, writes } = createMockWriter();
    const buffer = new StreamingBuffer(writer, { maxBatchSize: 3, flushIntervalMs: 1000 });

    buffer.write("data: 1\n\n");
    buffer.write("data: 2\n\n");
    expect(writes).toHaveLength(0); // 还没到 3

    buffer.write("data: 3\n\n");
    expect(writes.length).toBeGreaterThan(0); // 到了 3，立即 flush
    expect(writes[0]).toContain("data: 1");
    expect(writes[0]).toContain("data: 3");
  });

  it("flushInterval 到期自动 flush", async () => {
    vi.useFakeTimers();
    const { writer, writes } = createMockWriter();
    const buffer = new StreamingBuffer(writer, { flushIntervalMs: 32, maxBatchSize: 10 });

    buffer.write("data: hello\n\n");
    expect(writes).toHaveLength(0);

    vi.advanceTimersByTime(35);
    expect(writes.length).toBeGreaterThan(0);

    vi.useRealTimers();
    await buffer.close();
  });

  it("close 时 flush 剩余数据", async () => {
    const { writer, writes } = createMockWriter();
    const buffer = new StreamingBuffer(writer, { flushIntervalMs: 1000, maxBatchSize: 10 });

    buffer.write("data: pending\n\n");
    expect(writes).toHaveLength(0);

    await buffer.close();
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0]).toContain("pending");
  });

  it("bufferSize 返回当前缓冲大小", () => {
    const { writer } = createMockWriter();
    const buffer = new StreamingBuffer(writer, { maxBatchSize: 10 });

    expect(buffer.bufferSize).toBe(0);
    buffer.write("a");
    expect(buffer.bufferSize).toBe(1);
    buffer.write("b");
    expect(buffer.bufferSize).toBe(2);
  });
});
