/**
 * Nexus LLM Gateway - 工具函数单元测试
 */
import { describe, it, expect } from "vitest";
import {
  genRequestId,
  genCompletionId,
  estimateTokens,
  parseSseLines,
  safeJsonParse,
} from "./utils.js";

describe("genRequestId", () => {
  it("生成以 req_ 开头的 ID", () => {
    const id = genRequestId();
    expect(id.startsWith("req_")).toBe(true);
  });

  it("每次生成唯一 ID", () => {
    const ids = new Set(Array.from({ length: 100 }, () => genRequestId()));
    expect(ids.size).toBe(100);
  });
});

describe("genCompletionId", () => {
  it("生成以 chatcmpl- 开头的 ID", () => {
    const id = genCompletionId();
    expect(id.startsWith("chatcmpl-")).toBe(true);
  });
});

describe("estimateTokens", () => {
  it("空字符串返回 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("4 字符约等于 1 token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("非整数长度向上取整", () => {
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("parseSseLines", () => {
  it("解析标准 SSE 数据行", () => {
    const lines = parseSseLines('data: {"id":"1"}\ndata: {"id":"2"}\n');
    expect(lines).toEqual(['{"id":"1"}', '{"id":"2"}']);
  });

  it("跳过 [DONE] 标记", () => {
    const lines = parseSseLines('data: {"id":"1"}\ndata: [DONE]\ndata: {"id":"2"}\n');
    expect(lines).toEqual(['{"id":"1"}', '{"id":"2"}']);
  });

  it("跳过空行和非 data: 行", () => {
    const lines = parseSseLines('\nevent: message\ndata: {"id":"1"}\n\n');
    expect(lines).toEqual(['{"id":"1"}']);
  });

  it("空字符串返回空数组", () => {
    expect(parseSseLines("")).toEqual([]);
  });

  it("处理多余空白", () => {
    const lines = parseSseLines('  data:   {"key":"val"}  \n');
    expect(lines).toEqual(['{"key":"val"}']);
  });
});

describe("safeJsonParse", () => {
  it("正常 JSON 解析成功", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("非法 JSON 返回 null", () => {
    expect(safeJsonParse("{invalid}")).toBeNull();
  });

  it("空字符串返回 null", () => {
    expect(safeJsonParse("")).toBeNull();
  });

  it("解析数组", () => {
    expect(safeJsonParse("[1,2,3]")).toEqual([1, 2, 3]);
  });
});
