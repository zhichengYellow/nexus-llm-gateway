import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { REDACT_PATHS } from "../../shared/logger.js";
import { encryptSecret, decryptSecret, maskKey } from "../../shared/crypto.js";

/**
 * 凭据安全测试（P0/P1 隐私边界）:
 *  - 日志脱敏配置真实生效（apiKey / authorization 不落日志）
 *  - 加密存储不落明文
 *  - 脱敏展示不泄漏完整 key
 */
function memoryLogger() {
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      logs.push(chunk.toString());
      cb();
    },
  });
  const logger = pino({ level: "info", redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } }, stream);
  return { logger, logs };
}

describe("credential security (凭据安全)", () => {
  it("redact 配置覆盖关键敏感字段路径", () => {
    const joined = REDACT_PATHS.join(",");
    expect(joined).toContain("authorization");
    expect(joined).toContain("apiKey");
    expect(joined).toContain("api_key");
    expect(joined).toContain("password");
    expect(joined).toContain("secret");
  });

  it("日志输出不包含 apiKey 明文", () => {
    const { logger, logs } = memoryLogger();
    logger.info({ apiKey: "sk-super-secret-123456", msg: "hello" });
    const out = logs.join("");
    expect(out).not.toContain("sk-super-secret-123456");
    expect(out).toContain("[REDACTED]");
  });

  it("日志输出不包含 Authorization 明文", () => {
    const { logger, logs } = memoryLogger();
    logger.info({ authorization: "Bearer sk-auth-secret-789", req: { headers: { authorization: "Bearer sk-nested" } } });
    const out = logs.join("");
    expect(out).not.toContain("sk-auth-secret-789");
    expect(out).not.toContain("sk-nested");
  });

  it("日志输出不包含嵌套 apiKey(如 provider 配置对象)", () => {
    const { logger, logs } = memoryLogger();
    logger.info({ providers: { deepseek: { apiKey: "sk-ds-hidden-key" } } });
    const out = logs.join("");
    expect(out).not.toContain("sk-ds-hidden-key");
  });

  it("加密存储不含明文(密文为 enc:v1: 前缀)", () => {
    const stored = encryptSecret("sk-plaintext-never-in-db");
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(stored).not.toContain("sk-plaintext-never-in-db");
    expect(decryptSecret(stored)).toBe("sk-plaintext-never-in-db");
  });

  it("脱敏展示只暴露头尾 4 位", () => {
    const masked = maskKey("sk-abcdefghijklmnop");
    expect(masked).toContain("****");
    expect(masked).not.toContain("abcdefghijklmnop");
  });
});
