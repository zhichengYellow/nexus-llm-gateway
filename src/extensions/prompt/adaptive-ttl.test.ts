import { describe, it, expect, beforeEach } from "vitest";
import { AdaptiveTtl, resetAdaptiveTtl } from "./adaptive-ttl.js";

beforeEach(() => resetAdaptiveTtl());

describe("AdaptiveTtl", () => {
  it("价格类 → 30s TTL", () => {
    const attl = new AdaptiveTtl();
    const result = attl.determine("比特币价格查询");
    expect(result.ttl).toBe(30);
    expect(result.category).toBe("price");
  });

  it("天气类 → 10min TTL", () => {
    const attl = new AdaptiveTtl();
    const result = attl.determine("今天北京天气怎么样");
    expect(result.ttl).toBe(600);
  });

  it("新闻类 → 30min TTL", () => {
    const attl = new AdaptiveTtl();
    const result = attl.determine("今天最新新闻");
    expect(result.ttl).toBe(1800);
  });

  it("代码类 → 30天 TTL", () => {
    const attl = new AdaptiveTtl();
    const result = attl.determine("写一个 Python 函数");
    expect(result.ttl).toBe(30 * 86400);
  });

  it("翻译类 → 7天 TTL", () => {
    const attl = new AdaptiveTtl();
    const result = attl.determine("翻译成英文：你好世界");
    expect(result.ttl).toBe(7 * 86400);
  });

  it("问候类 → 30天 TTL", () => {
    const attl = new AdaptiveTtl();
    const result = attl.determine("你好");
    expect(result.ttl).toBe(30 * 86400);
  });

  it("未匹配 → 默认 TTL", () => {
    const attl = new AdaptiveTtl();
    const result = attl.determine("random text xyz");
    expect(result.ttl).toBe(86400);
    expect(result.category).toBe("default");
  });

  it("addRule 添加自定义规则", () => {
    const attl = new AdaptiveTtl();
    attl.addRule({
      category: "custom",
      ttl: 120,
      keywords: ["custom-keyword"],
      patterns: [],
      priority: 200,
    });
    const result = attl.determine("this is a custom-keyword test");
    expect(result.ttl).toBe(120);
  });

  it("setDefaultTtl 修改默认值", () => {
    const attl = new AdaptiveTtl();
    attl.setDefaultTtl(3600);
    const result = attl.determine("random text");
    expect(result.ttl).toBe(3600);
  });
});
