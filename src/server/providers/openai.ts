/**
 * Nexus LLM Gateway - OpenAI Provider
 * 兼容 OpenAI 协议，复用基类。主要用于 embedding 模型。
 */
import { OpenAiLikeProvider } from "./base.js";
import type { ProviderConfig } from "../../shared/types.js";

export class OpenAiProvider extends OpenAiLikeProvider {
  type = "openai" as const;

  constructor(config: ProviderConfig) {
    super(config);
  }
}