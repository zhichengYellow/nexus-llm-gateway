/**
 * Nexus LLM Gateway - 中间件相关类型
 */

export interface Tenant {
  id: string;
  name: string;
  monthlyTokenQuota: number | null;
}

export interface ApiKeyRow {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
}