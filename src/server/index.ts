/**
 * Nexus LLM Gateway - 服务入口
 * 组装中间件与路由，启动 Hono 服务。
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { loadProviderKeysFromDB } from "./config/provider-keys.js";
import { cors } from "hono/cors";
import { logger } from "../shared/logger.js";
import { getConfig } from "../shared/config.js";
import { authMiddleware, type AuthEnv } from "./middleware/auth.js";
import { loggingMiddleware, type LoggingEnv } from "./middleware/logging.js";
import { chatRoute } from "./routes/chat.js";
import { embeddingsRoute } from "./routes/embeddings.js";
import { modelsRoute } from "./routes/models.js";
import { healthRoute } from "./routes/health.js";
import { metricsRoute } from "./middleware/metrics.js";
import { adminRoute } from "./routes/admin.js";
import { userRoute } from "./routes/user.js";
import { batchRoute } from "./routes/batch.js";
import { authRoute } from "./routes/auth.js";

type AppEnv = AuthEnv & LoggingEnv;

const app = new Hono<AppEnv>();

// 全局错误处理
app.onError((err, c) => {
  logger.error({ err: err.message, stack: err.stack, path: c.req.path }, "unhandled error");
  return c.json({ error: { message: "internal server error", type: "server_error" } }, 500);
});

// 全局日志
app.use("*", loggingMiddleware);

// CORS（白名单模式：仅允许 dashboard 域名）
app.use("*", cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000", ...(process.env.CORS_ORIGINS?.split(",") ?? [])].filter(Boolean),
}));

// 健康检查（无需认证）
app.route("/health", healthRoute);

// 认证保护的所有 API
const api = new Hono<AppEnv>();
api.use("*", authMiddleware);

// 指标（仅 master key 可访问，防公网探测）
api.route("/metrics", metricsRoute);

// OpenAI 兼容路由
api.route("/v1/chat/completions", chatRoute);
api.route("/v1/embeddings", embeddingsRoute);
api.route("/v1/models", modelsRoute);
api.route("/v1/batch", batchRoute);

// 管理路由（master key）
api.route("/admin", adminRoute);

// 用户路由（API Key）
api.route("/user", userRoute);

app.route("/", api);

// 注册路由（无需认证）
app.route("/auth", authRoute);

// 启动
const config = getConfig();
await loadProviderKeysFromDB(); // 启动时从 DB 加载 UI 配置的 Provider Key

// 定期清理过期缓存（每小时）
setInterval(async () => {
  const { getSemanticCache } = await import("../optimizer/cache/semantic-cache.js");
  await getSemanticCache().cleanupExpired();
}, 3600_000);

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    logger.info(`🚀 Nexus LLM Gateway listening on http://localhost:${info.port}`);
    logger.info(`   OpenAI 兼容: POST /v1/chat/completions, /v1/embeddings, GET /v1/models`);
    logger.info(`   管理 API:    /admin/* (需 master key)`);
    logger.info(`   用户 API:    /user/* (需 API key)`);
    logger.info(`   健康检查:    /health`);
  },
);

server.on("error", (err: NodeJS.ErrnoException) => {
  logger.error({ err: err.message, code: err.code }, "server error");
  if (err.code === "EADDRINUSE") {
    logger.error(`Port ${config.port} is already in use`);
    process.exit(1);
  }
});

// 全局兜底：unhandled rejections / uncaught exceptions 不崩进程
process.on("unhandledRejection", (reason) => {
  logger.error({ err: (reason as Error)?.message ?? String(reason) }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err: err.message, stack: err.stack }, "uncaughtException");
  process.exit(1);
});