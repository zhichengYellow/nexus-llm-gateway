/**
 * Nexus LLM Gateway - RBAC 中间件
 *
 * Layer 5: Role-Based Access Control
 *
 * 角色定义：
 * - owner: 全部权限（master key 默认）
 * - admin: 管理所属租户 + 创建/撤销 API Keys
 * - developer: API 调用 + 查看自己的用量
 * - viewer: 只读查看用量
 * - auditor: 跨租户只读（审计）
 *
 * 权限矩阵：
 *                    owner  admin  developer  viewer  auditor
 * chat completions    ✓      ✓      ✓          ✗       ✗
 * view own usage      ✓      ✓      ✓          ✓       ✗
 * view all usage      ✓      ✗      ✗          ✗       ✓
 * manage api keys     ✓      ✓      ✗          ✗       ✗
 * manage tenants      ✓      ✗      ✗          ✗       ✗
 * manage routes       ✓      ✗      ✗          ✗       ✗
 * view audit logs     ✓      ✓      ✗          ✗       ✓
 */

import type { Context } from "hono";
import { logger } from "../../shared/logger.js";

export type Role = "owner" | "admin" | "developer" | "viewer" | "auditor";

export const ALL_ROLES: Role[] = ["owner", "admin", "developer", "viewer", "auditor"];

/** 权限定义 */
export interface Permission {
  action: string;
  resource: string;
}

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner: ["*"],
  admin: [
    "chat:send",
    "usage:read:own",
    "keys:manage",
    "audit:read:own",
  ],
  developer: [
    "chat:send",
    "usage:read:own",
  ],
  viewer: [
    "usage:read:own",
  ],
  auditor: [
    "usage:read:all",
    "audit:read:all",
  ],
};

/**
 * 检查角色是否有指定权限
 */
export function hasPermission(role: Role, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

/**
 * 检查是否有 admin 及以上权限
 */
export function isAdmin(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/**
 * 创建权限守卫中间件工厂
 */
export function requirePermission(permission: string) {
  return async (c: Context, next: () => Promise<void>) => {
    const role = (c.get("role") as Role) ?? "developer";
    const isMaster = c.get("isMaster") as boolean;

    // master key = owner，全部权限
    if (isMaster) return next();

    if (!hasPermission(role, permission)) {
      logger.warn({ role, permission }, "rbac: permission denied");
      return c.json({
        error: {
          message: `Permission denied: ${permission} requires higher role than ${role}`,
          type: "permission_denied",
        },
      }, 403);
    }

    await next();
  };
}

/**
 * 解析角色字符串
 */
export function parseRole(raw: string | null | undefined): Role {
  if (!raw) return "developer";
  const normalized = raw.toLowerCase().trim();
  return ALL_ROLES.includes(normalized as Role) ? (normalized as Role) : "developer";
}
