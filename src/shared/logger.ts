/**
 * Nexus LLM Gateway - 结构化日志
 * 基于 pino，开发环境美化输出。
 */
import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level,
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