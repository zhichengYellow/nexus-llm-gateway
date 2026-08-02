/**
 * Nexus LLM Gateway - Prompt Guard 测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PromptGuard, resetPromptGuard } from "../prompt/guard.js";

beforeEach(() => {
  resetPromptGuard();
});

describe("PromptGuard PII 检测", () => {
  it("检测手机号", () => {
    const guard = new PromptGuard();
    expect(guard.detect("我的手机是13812345678")).toBe(true);
  });

  it("检测邮箱", () => {
    const guard = new PromptGuard();
    expect(guard.detect("联系我 test@example.com")).toBe(true);
  });

  it("检测 API Key", () => {
    const guard = new PromptGuard();
    expect(guard.detect("用这个 key: sk-abc123def456ghi789jkl0123456")).toBe(true);
  });

  it("检测身份证号", () => {
    const guard = new PromptGuard();
    expect(guard.detect("身份证号是110101199001011234")).toBe(true);
  });

  it("不含 PII 返回 false", () => {
    const guard = new PromptGuard();
    expect(guard.detect("今天天气怎么样")).toBe(false);
  });
});

describe("PromptGuard PII 脱敏", () => {
  it("脱敏手机号", () => {
    const guard = new PromptGuard();
    const result = guard.mask("我的手机是13812345678，请帮我查一下");
    expect(result.hasPii).toBe(true);
    expect(result.maskedText).toContain("[PHONE]");
    expect(result.maskedText).not.toContain("13812345678");
    expect(result.matches[0]!.type).toBe("PHONE");
  });

  it("脱敏邮箱", () => {
    const guard = new PromptGuard();
    const result = guard.mask("发邮件到 test@example.com");
    expect(result.maskedText).toContain("[EMAIL]");
  });

  it("脱敏多种 PII", () => {
    const guard = new PromptGuard();
    const result = guard.mask("手机13812345678 邮箱test@example.com");
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
    expect(result.maskedText).toContain("[PHONE]");
    expect(result.maskedText).toContain("[EMAIL]");
  });

  it("不含 PII 时原样返回", () => {
    const guard = new PromptGuard();
    const result = guard.mask("解释一下什么是机器学习");
    expect(result.hasPii).toBe(false);
    expect(result.maskedText).toBe("解释一下什么是机器学习");
  });

  it("rejectOnPii 模式拒绝含 PII 请求", () => {
    const guard = new PromptGuard({ rejectOnPii: true });
    expect(() => guard.guard("我的手机13812345678")).toThrow("PII detected");
  });

  it("rejectOnPii=false 时仅脱敏不拒绝", () => {
    const guard = new PromptGuard({ rejectOnPii: false });
    const result = guard.guard("我的手机13812345678");
    expect(result.hasPii).toBe(true);
    expect(result.maskedText).toContain("[PHONE]");
  });

  it("addPattern 添加自定义规则", () => {
    const guard = new PromptGuard();
    guard.addPattern("CUSTOM", /secret-\d{3}/g, "[SECRET]");
    const result = guard.mask("my code is secret-123");
    expect(result.maskedText).toContain("[SECRET]");
  });
});
