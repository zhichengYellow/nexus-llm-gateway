/**
 * Nexus LLM Gateway - Audit Logger（审计日志）
 *
 * Layer 5: 记录所有管理操作的审计日志
 */

import { db } from "../../server/db/client.js";
import { auditLogs } from "../../server/db/schema.js";
import { sql } from "drizzle-orm";
import { logger } from "../../shared/logger.js";
import type { Role } from "../rbac/rbac.js";

export interface AuditEntry {
  actor: string;
  actorRole: Role;
  tenantId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  detail?: string;
  result?: "success" | "failure";
  ip?: string;
}

export class AuditLogger {
  /**
   * 记录一条审计日志
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        actor: entry.actor,
        actorRole: entry.actorRole,
        tenantId: (entry.tenantId ?? null) as any,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        detail: entry.detail ?? null,
        result: entry.result ?? "success",
        ip: entry.ip ?? null,
        createdAt: new Date(),
      } as any);
    } catch (e) {
      logger.warn({ err: (e as Error).message, entry }, "audit log write failed");
    }
  }

  /**
   * 查询审计日志
   */
  async query(options: {
    actor?: string;
    action?: string;
    resource?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<AuditEntry[]> {
    try {
      const rows = await db
        .select()
        .from(auditLogs)
        .orderBy((t: any) => t.createdAt)
        .limit(options.limit ?? 50)
        .offset(options.offset ?? 0);

      return rows.map((r: any) => ({
        actor: r.actor,
        actorRole: r.actorRole as Role,
        tenantId: r.tenantId,
        action: r.action,
        resource: r.resource,
        resourceId: r.resourceId,
        detail: r.detail,
        result: r.result,
        ip: r.ip,
      }));
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "audit log query failed");
      return [];
    }
  }

  /**
   * 统计审计日志数量
   */
  async count(): Promise<number> {
    try {
      const [row] = await db.select({ cnt: sql<number>`count(*)::int` }).from(auditLogs);
      return (row as any)?.cnt ?? 0;
    } catch {
      return 0;
    }
  }
}

let _auditLogger: AuditLogger | null = null;
export function getAuditLogger(): AuditLogger {
  if (!_auditLogger) _auditLogger = new AuditLogger();
  return _auditLogger;
}
export function resetAuditLogger(): void { _auditLogger = null; }
