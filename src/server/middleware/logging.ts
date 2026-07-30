/**
 * Nexus LLM Gateway - 请求日志中间件
 * 注入 requestId，记录请求耗时与状态。
 */
import type { MiddlewareHandler } from "hono";
import { genRequestId } from "../../shared/utils.js";
import { logger } from "../../shared/logger.js";

export interface LoggingEnv {
  Variables: {
    requestId: string;
  };
}

export const loggingMiddleware: MiddlewareHandler<LoggingEnv> = async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? genRequestId();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);

  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
    },
    "request",
  );
};