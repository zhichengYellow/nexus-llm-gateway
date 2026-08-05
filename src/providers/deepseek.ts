/**
 * Nexus LLM Gateway - DeepSeek Provider
 * DeepSeek 兼容 OpenAI 协议，复用基类。
 */
import { OpenAiLikeProvider } from "./base.js";
import type { ProviderConfig } from "../shared/types.js";

export class DeepSeekProvider extends OpenAiLikeProvider {
  type = "deepseek" as const;

  constructor(config: ProviderConfig) {
    super(config);
  }
}