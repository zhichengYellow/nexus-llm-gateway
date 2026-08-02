/**
 * Nexus LLM Gateway - Compression 测试
 */
import { describe, it, expect } from "vitest";
import { compressBuffer, createGzipStream } from "./compression.js";

describe("compression", () => {
  it("compressBuffer 压缩数据", async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode("hello world ".repeat(100));
    const compressed = await compressBuffer(data);
    expect(compressed.length).toBeLessThan(data.length);
  });

  it("小数据压缩后可能更大（但不会报错）", async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode("hi");
    const compressed = await compressBuffer(data);
    expect(compressed).toBeInstanceOf(Uint8Array);
  });

  it("createGzipStream 返回 TransformStream", () => {
    const stream = createGzipStream({ enabled: true });
    expect(stream).toBeInstanceOf(TransformStream);
  });

  it("enabled=false 返回 null", () => {
    const stream = createGzipStream({ enabled: false });
    expect(stream).toBeNull();
  });
});
