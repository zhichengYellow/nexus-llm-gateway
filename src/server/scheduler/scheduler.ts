/**
 * Nexus LLM Gateway - Scheduler（任务调度器）
 *
 * Phase 8: Cron 引擎 + 任务注册/管理
 *
 * 内置任务：
 * - benchmark: 每日性能基准测试
 * - health-check: Provider 健康检查
 * - cache-ttl-refresh: 刷新过期缓存
 * - embedding-refresh: 刷新热门缓存 embedding
 * - analytics-report: 生成分析报告
 */
import { logger } from "../../shared/logger.js";

// ===== Cron 解析 =====

export interface CronSchedule {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export interface ScheduledTask {
  name: string;
  description?: string;
  schedule: CronSchedule;
  enabled: boolean;
  handler: () => Promise<void>;
  /** 失败重试次数 */
  maxRetries: number;
  /** 当前重试计数 */
  retryCount: number;
  /** 最后执行时间 */
  lastRunAt: number | null;
  /** 最后执行状态 */
  lastStatus: "success" | "failure" | "pending" | null;
  /** 下次执行时间 */
  nextRunAt: number | null;
}

function parseCron(expr: string): CronSchedule {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`invalid cron expression: ${expr}`);
  return {
    minute: parts[0]!,
    hour: parts[1]!,
    dayOfMonth: parts[2]!,
    month: parts[3]!,
    dayOfWeek: parts[4]!,
  };
}

function matchField(value: string, target: number): boolean {
  if (value === "*") return true;
  if (value.includes(",")) return value.split(",").some((v) => matchField(v.trim(), target));
  if (value.includes("/")) {
    const [base, step] = value.split("/");
    const baseNum = base === "*" ? 0 : parseInt(base!, 10);
    return (target - baseNum) % parseInt(step!, 10) === 0;
  }
  if (value.includes("-")) {
    const [lo, hi] = value.split("-").map(Number);
    return target >= lo! && target <= hi!;
  }
  return parseInt(value, 10) === target;
}

function nextRunTime(schedule: CronSchedule): number {
  const now = new Date();
  // 简单实现：返回下一秒（实际应计算下一次匹配时间）
  // 生产环境用 cron-parser 库
  now.setMinutes(now.getMinutes() + 1);
  now.setSeconds(0, 0);
  return now.getTime();
}

// ===== Scheduler =====

export class Scheduler {
  private tasks = new Map<string, ScheduledTask>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** 注册任务 */
  register(task: { name: string; description?: string; schedule: string | CronSchedule; enabled: boolean; handler: () => Promise<void>; maxRetries: number }): void {
    const schedule = typeof task.schedule === "string" ? parseCron(task.schedule) : task.schedule;
    const scheduled: ScheduledTask = {
      name: task.name,
      description: task.description,
      schedule,
      enabled: task.enabled,
      handler: task.handler,
      maxRetries: task.maxRetries,
      retryCount: 0,
      lastRunAt: null,
      lastStatus: null,
      nextRunAt: nextRunTime(schedule),
    };
    this.tasks.set(task.name, scheduled);
    logger.info({ taskName: task.name }, "scheduler: task registered");
  }

  /** 注销任务 */
  unregister(name: string): void {
    this.tasks.delete(name);
  }

  /** 获取任务 */
  get(name: string): ScheduledTask | undefined {
    return this.tasks.get(name);
  }

  /** 列出所有任务 */
  list(): Array<{ name: string; enabled: boolean; lastStatus: string | null; nextRunAt: string | null }> {
    return [...this.tasks.values()].map((t) => ({
      name: t.name,
      enabled: t.enabled,
      lastStatus: t.lastStatus,
      nextRunAt: t.nextRunAt ? new Date(t.nextRunAt).toISOString() : null,
    }));
  }

  /** 启用/禁用任务 */
  toggle(name: string, enabled: boolean): boolean {
    const task = this.tasks.get(name);
    if (!task) return false;
    task.enabled = enabled;
    return true;
  }

  /** 立即执行一次 */
  async runNow(name: string): Promise<boolean> {
    const task = this.tasks.get(name);
    if (!task) return false;
    await this.executeTask(task);
    return true;
  }

  /** 启动调度器 */
  start(intervalMs = 60000): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), intervalMs);
    logger.info({ intervalMs }, "scheduler started");
  }

  /** 停止调度器 */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("scheduler stopped");
  }

  /** 每个 tick 检查所有任务 */
  private async tick(): Promise<void> {
    const now = Date.now();

    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;
      if (task.lastStatus === "pending") continue; // 正在执行

      // 检查是否到了执行时间
      if (task.nextRunAt && now >= task.nextRunAt) {
        await this.executeTask(task);
      }
    }
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    task.lastStatus = "pending";
    const start = Date.now();

    try {
      await task.handler();
      task.lastStatus = "success";
      task.retryCount = 0;
      logger.info({ taskName: task.name, duration: Date.now() - start }, "scheduler: task completed");
    } catch (e) {
      task.lastStatus = "failure";
      logger.error({ taskName: task.name, err: (e as Error).message }, "scheduler: task failed");

      // 重试
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        logger.warn({ taskName: task.name, retry: task.retryCount }, "scheduler: retrying task");
        setTimeout(() => this.executeTask(task), 1000 * task.retryCount);
      }
    } finally {
      task.lastRunAt = start;
      task.nextRunAt = nextRunTime(task.schedule);
    }
  }
}

// ===== 全局单例 =====

let _scheduler: Scheduler | null = null;

export function getScheduler(): Scheduler {
  if (!_scheduler) _scheduler = new Scheduler();
  return _scheduler;
}

export function resetScheduler(): void {
  if (_scheduler) {
    _scheduler.stop();
    _scheduler = null;
  }
}
