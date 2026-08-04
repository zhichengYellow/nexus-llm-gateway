import { describe, it, expect, beforeEach } from "vitest";
import { ChunkCache, resetChunkCache } from "./chunk-cache.js";

beforeEach(() => resetChunkCache());

describe("ChunkCache", () => {
  it("chunk 分块", () => {
    const cache = new ChunkCache();
    const text = "第一段内容第一段内容。第二段内容第二段内容。第三段内容第三段内容。";
    const chunks = cache.chunk(text, 5);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("storeChunk 和 lookup", () => {
    const cache = new ChunkCache();
    const chunks = cache.chunk("测试内容", 100);
    expect(chunks.length).toBe(1);

    cache.storeChunk(chunks[0]!, "缓存响应");
    const result = cache.lookup(chunks);
    expect(result.hits).toBe(1);
    expect(result.responses[0]).toBe("缓存响应");
  });

  it("未命中返回 hits=0", () => {
    const cache = new ChunkCache();
    const chunks = cache.chunk("新内容", 100);
    const result = cache.lookup(chunks);
    expect(result.hits).toBe(0);
  });

  it("stats 返回统计", () => {
    const cache = new ChunkCache();
    const chunks = cache.chunk("内容A。内容B。", 10);
    for (const c of chunks) cache.storeChunk(c, "resp");

    const stats = cache.stats();
    expect(stats.totalEntries).toBeGreaterThan(0);
  });
});
