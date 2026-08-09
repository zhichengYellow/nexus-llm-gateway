import { describe, it, expect } from "vitest";
import { authErrorMessage } from "./auth.js";
import { z } from "zod";

const registerSchema = z.object({
  username: z.string().min(2, "用户名至少 2 位").max(30, "用户名最多 30 位").regex(/^[a-zA-Z0-9_-]+$/, "仅允许字母、数字、下划线、短横"),
  password: z.string().min(8, "密码至少 8 位").max(100, "密码最多 100 位"),
});

describe("authErrorMessage", () => {
  it("用户名太短", () => {
    const r = registerSchema.safeParse({ username: "a", password: "12345678" });
    expect(r.success).toBe(false);
    if (!r.success) expect(authErrorMessage(r.error.issues)).toBe("用户名至少 2 位");
  });

  it("用户名含非法字符", () => {
    const r = registerSchema.safeParse({ username: "hello world!", password: "12345678" });
    expect(r.success).toBe(false);
    if (!r.success) expect(authErrorMessage(r.error.issues)).toBe("仅允许字母、数字、下划线、短横");
  });

  it("密码太短", () => {
    const r = registerSchema.safeParse({ username: "alice", password: "123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(authErrorMessage(r.error.issues)).toBe("密码至少 8 位");
  });

  it("空输入取第一个错误", () => {
    const r = registerSchema.safeParse({ username: "", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(authErrorMessage(r.error.issues)).toBe("用户名至少 2 位");
  });

  it("有效输入通过", () => {
    const r = registerSchema.safeParse({ username: "alice", password: "12345678" });
    expect(r.success).toBe(true);
  });
});
