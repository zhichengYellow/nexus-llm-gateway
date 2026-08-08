import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted, maskKey } from "./crypto.js";

describe("crypto (Provider API Key 静态加密)", () => {
  it("加密-解密往返一致", () => {
    const plain = "sk-nexus-test-abcdefghijklmn";
    const stored = encryptSecret(plain);
    expect(stored).not.toContain(plain);
    expect(isEncrypted(stored)).toBe(true);
    expect(decryptSecret(stored)).toBe(plain);
  });

  it("密文格式为 enc:v1:iv.tag.ciphertext 三段", () => {
    const stored = encryptSecret("sk-test-123456");
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(stored.split(".")).toHaveLength(3);
  });

  it("同一明文两次加密结果不同(随机 IV)", () => {
    const a = encryptSecret("sk-same-key");
    const b = encryptSecret("sk-same-key");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("旧明文(无前缀)原样返回,兼容懒迁移", () => {
    expect(decryptSecret("sk-legacy-plaintext")).toBe("sk-legacy-plaintext");
    expect(isEncrypted("sk-legacy-plaintext")).toBe(false);
  });

  it("篡改密文导致解密失败(不静默返回错误明文)", () => {
    const stored = encryptSecret("sk-original");
    const tampered = stored.slice(0, -4) + "AAAA";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("maskKey 脱敏:保留头尾,短 key 全遮蔽", () => {
    expect(maskKey("sk-nexus-abcdefghij")).toBe("sk-n****ghij");
    expect(maskKey("short")).toBe("****");
    expect(maskKey("")).toBe("");
  });

  it("不同 ENCRYPTION_KEY 无法解密(密钥隔离)", () => {
    const prev = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "test-key-A-0123456789abcdef";
    const stored = encryptSecret("sk-secret");
    process.env.ENCRYPTION_KEY = "test-key-B-0123456789abcdef";
    expect(() => decryptSecret(stored)).toThrow();
    if (prev === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = prev;
  });
});
