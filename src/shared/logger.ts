/**
 * Nexus LLM Gateway - 结构化日志
 * 基于 pino，开发环境美化输出。
 */
import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const isDev = process.env.NODE_ENV !== "production";

/**
 * 敏感字段脱敏路径（pino redact）。
 * API Key / Authorization / 密码等一律以 [REDACTED] 输出，防日志泄漏凭据。
 */
export const REDACT_PATHS = [
  "authorization",
  "*.authorization",
  "req.headers.authorization",
  "headers.authorization",
  "apiKey",
  "*.apiKey",
  "*.*.apiKey",
  "*.*.*.apiKey",
  "api_key",
  "*.api_key",
  "*.*.api_key",
  "*.*.*.api_key",
  "api-key",
  "*.api-key",
  "password",
  "*.password",
  "secret",
  "*.secret",
];

export const logger = pino({
  level,
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  ...(isDev
    ? {
         transport: {
           target: "pino-pretty",
           options: {
             colorize: true,
             translateTime: "SYS:standard",
             ignore: "pid,hostname",
             // 固定北京时间，避免 CI/容器 UTC 与本地时区不一致
             timeZone: "Asia/Shanghai",
           },
         },
      }
    : {}),
});

export type Logger = typeof logger;