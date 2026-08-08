/**
 * Nexus LLM Gateway - Provider API Key 静态加密（AES-256-GCM）
 *
 * 存储格式: `enc:v1:<iv_b64>.<tag_b64>.<ciphertext_b64>`
 * 密钥来源: 环境变量 `ENCRYPTION_KEY`（64 位 hex 或任意字符串，字符串经 SHA-256 派生 32 字节）。
 * 安全策略:
 *  - production 未配置 `ENCRYPTION_KEY` 时抛出异常（拒绝明文降级）；
 *  - 开发环境无 key 时使用内置 dev 密钥（仅限本地，日志警告）。
 * 兼容: `decryptSecret` 对非 `enc:v1:` 前缀的旧明文原样返回（支持懒迁移）。
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";
const IV_LEN = 12;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  // 每次派生（SHA-256 微秒级），避免模块级缓存导致密钥切换后仍用旧 key
  if (raw) {
    return /^[0-9a-f]{64}$/i.test(raw)
      ? Buffer.from(raw, "hex")
      : createHash("sha256").update(raw).digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY is required in production: provider API keys are encrypted at rest");
  }
  // 仅限本地开发（不用于生产）
  return createHash("sha256").update("nexus-local-dev-encryption-key").digest();
}

/** 加密明文密钥，返回 `enc:v1:...` 存储格式 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/** 解密存储值；旧明文（无前缀）原样返回，解密失败抛错（不静默返回错误明文） */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // 旧明文兼容（懒迁移）
  const parts = stored.slice(PREFIX.length).split(".");
  if (parts.length !== 3) throw new Error("malformed encrypted secret");
  const [ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("malformed encrypted secret");
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** 是否加密格式（用于识别旧明文） */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** 脱敏展示: `sk-****abcd`（短 key 全遮蔽） */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}
