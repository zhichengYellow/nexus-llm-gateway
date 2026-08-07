/**
 * Nexus LLM Gateway - 用量记录与计费
 * 将每次请求的 token 用量、延迟、成本写入数据库。
 */
import { db } from "../db/client.js";
import { usageLogs } from "../db/schema.js";
import { getCostEstimator } from "../../optimizer/cost/cost-controller.js";
import type { Usage, ProviderType } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

export interface UsageRecordInput {
  requestId: string;
  tenantId: string | null;
  apiKeyId: string | null;
  provider: string;
  model: string;
  upstreamModel?: string;
  usage: Usage;
  latencyMs: number;
  cached: boolean;
  stream: boolean;
  status: number;
  /** 输入价格（每 1M token，美元） */
  priceInputPerM?: number;
  /** 输出价格（每 1M token，美元） */
  priceOutputPerM?: number;
  /** 节省的 Token（压缩/缓存命中） */
  savedTokens?: number;
  /** 节省的成本（微美元） */
  savedCostMicro?: number;
}

/** 计算成本（微美元，1 美元 = 1_000_000 微美元） */
function calcCostMicro(usage: Usage, priceInPerM?: number, priceOutPerM?: number): number {
  const inCost = (usage.prompt_tokens / 1_000_000) * (priceInPerM ?? 0);
  const outCost = (usage.completion_tokens / 1_000_000) * (priceOutPerM ?? 0);
  return Math.round((inCost + outCost) * 1_000_000);
}

/** 异步记录用量（不阻塞响应） */
export function recordUsage(input: UsageRecordInput): void {
  // 价格优先用调用方传入，否则按 provider/model 查价格表
  const price = getCostEstimator().getPrice(input.provider as ProviderType, input.model);
  const costMicro = calcCostMicro(
    input.usage,
    input.priceInputPerM ?? price?.inputPrice,
    input.priceOutputPerM ?? price?.outputPrice,
  );
  // 缓存命中：本次响应本应产生的成本全部视为节省
  const savedCostMicro = input.savedCostMicro ?? (input.cached ? costMicro : 0);
  db.insert(usageLogs)
    .values({
      requestId: input.requestId,
      tenantId: input.tenantId,
      apiKeyId: input.apiKeyId,
      provider: input.provider,
      model: input.model,
      upstreamModel: input.upstreamModel,
      promptTokens: input.usage.prompt_tokens,
      completionTokens: input.usage.completion_tokens,
      totalTokens: input.usage.total_tokens,
      costMicro,
      latencyMs: input.latencyMs,
      cached: input.cached,
      stream: input.stream,
      status: input.status,
      savedTokens: input.savedTokens ?? 0,
      savedCostMicro,
    })
    .execute()
    .catch((e) => logger.error({ err: e, requestId: input.requestId }, "record usage failed"));
}