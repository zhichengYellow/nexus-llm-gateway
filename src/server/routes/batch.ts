/**
 * Nexus LLM Gateway - Batch 批量请求路由
 *
 * Phase 11: OpenAI 兼容的 /v1/batch 端点。
 * 支持批量提交多个请求，异步处理。
 *
 * API:
 *   POST /v1/batch         提交批量请求
 *   GET  /v1/batch/:id      查询批量任务状态
 *   GET  /v1/batch/:id/result  获取结果
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { nanoid } from "nanoid";
import { logger } from "../../shared/logger.js";
import { getConfig } from "../../shared/config.js";
import type { AuthEnv } from "../middleware/auth.js";
import type { LoggingEnv } from "../middleware/logging.js";

type BatchEnv = AuthEnv & LoggingEnv;

export const batchRoute = new Hono<BatchEnv>();

// ===== 批量任务存储（内存） =====

interface BatchRequest {
  custom_id?: string;
  method: string;
  url: string;
  body: Record<string, unknown>;
}

interface BatchJob {
  id: string;
  tenantId: string | null;
  status: "validating" | "in_progress" | "completed" | "failed" | "cancelled";
  requests: BatchRequest[];
  results: Array<{
    custom_id?: string;
    status: number;
    body: unknown;
    error?: string;
  }>;
  createdAt: number;
  completedAt: number | null;
}

/** 允许的批量请求路径白名单 */
const ALLOWED_BATCH_PATHS = new Set([
  "/v1/chat/completions",
  "/v1/embeddings",
]);

/** SSRF 防护：禁止 URL 中包含 @ // ../ 等注入字符 */
function isValidBatchUrl(url: string): boolean {
  if (url.includes("@") || url.includes("//") || url.includes("..")) return false;
  return ALLOWED_BATCH_PATHS.has(url);
}

const jobs = new Map<string, BatchJob>();

// ===== 路由 =====

batchRoute.post(
  "/",
  zValidator(
    "json",
    z.object({
      input_file_id: z.string().optional(),
      requests: z.array(z.object({
        custom_id: z.string().optional(),
        method: z.string(),
        url: z.string(),
        body: z.record(z.unknown()),
      })).optional(),
      completion_window: z.string().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const requests = body.requests ?? [];
    if (requests.length === 0) {
      return c.json({ error: { message: "no requests provided" } }, 400);
    }

    // SSRF 防护：验证所有请求 URL
    for (const req of requests) {
      if (!isValidBatchUrl(req.url)) {
        return c.json({ error: { message: `invalid or disallowed batch URL: ${req.url}` } }, 400);
      }
    }

    // 请求数上限
    if (requests.length > 100) {
      return c.json({ error: { message: "max 100 requests per batch" } }, 400);
    }

    const tenant = c.get("tenant");
    const config = getConfig();
    const jobId = `batch_${nanoid(16)}`;
    const job: BatchJob = {
      id: jobId,
      tenantId: tenant?.id ?? null,
      status: "validating",
      requests,
      results: [],
      createdAt: Date.now(),
      completedAt: null,
    };

    jobs.set(jobId, job);

    // 异步处理
    setImmediate(async () => {
      try {
        job.status = "in_progress";
        for (const req of requests) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30000);

            const res = await fetch(`http://localhost:${config.port}${req.url}`, {
              method: req.method,
              headers: {
                "Content-Type": "application/json",
                // 不转发用户 Authorization，用服务端 master key
                Authorization: `Bearer ${config.masterKey}`,
              },
              body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
              signal: controller.signal,
            });

            clearTimeout(timer);
            const data = await res.json();
            job.results.push({
              custom_id: req.custom_id,
              status: res.status,
              body: data,
            });
          } catch (e) {
            job.results.push({
              custom_id: req.custom_id,
              status: 500,
              error: (e as Error).message,
              body: null,
            });
          }
        }
        job.status = "completed";
        job.completedAt = Date.now();
        logger.info({ jobId, results: job.results.length }, "batch job completed");
      } catch (e) {
        job.status = "failed";
        job.completedAt = Date.now();
        logger.error({ jobId, err: (e as Error).message }, "batch job failed");
      }
    });

    return c.json({
      id: jobId,
      object: "batch",
      status: "validating",
      created_at: job.createdAt,
      request_counts: { total: requests.length, completed: 0, failed: 0 },
    }, 201);
  },
);

// 查询批量任务状态
batchRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const job = jobs.get(id);
  if (!job) return c.json({ error: { message: "batch job not found" } }, 404);

  return c.json({
    id: job.id,
    object: "batch",
    status: job.status,
    created_at: job.createdAt,
    completed_at: job.completedAt,
    request_counts: {
      total: job.requests.length,
      completed: job.results.length,
      failed: job.results.filter((r) => r.status >= 400).length,
    },
  });
});

// 获取批量任务结果
batchRoute.get("/:id/result", async (c) => {
  const id = c.req.param("id");
  const job = jobs.get(id);
  if (!job) return c.json({ error: { message: "batch job not found" } }, 404);
  if (job.status !== "completed") {
    return c.json({ error: { message: `batch job is ${job.status}` } }, 400);
  }

  return c.json({
    id: job.id,
    results: job.results,
  });
});

// 取消批量任务
batchRoute.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const job = jobs.get(id);
  if (!job) return c.json({ error: { message: "batch job not found" } }, 404);
  if (job.status === "completed" || job.status === "cancelled") {
    return c.json({ error: { message: `batch job already ${job.status}` } }, 400);
  }

  job.status = "cancelled";
  job.completedAt = Date.now();
  return c.json({ id: job.id, status: "cancelled" });
});

// 列出所有批量任务（按租户隔离）
batchRoute.get("/", async (c) => {
  const tenant = c.get("tenant");
  const tenantId = tenant?.id ?? null;
  const list = [...jobs.values()]
    .filter((j) => !tenantId || j.tenantId === tenantId)
    .map((j) => ({
      id: j.id,
      status: j.status,
      created_at: j.createdAt,
      request_counts: { total: j.requests.length, completed: j.results.length },
    }));
  return c.json({ data: list });
});
