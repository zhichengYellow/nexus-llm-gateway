/**
 * Nexus LLM Gateway - OpenAI Provider
 * 兼容 OpenAI 协议，复用基类。主要用于 embedding 模型。
 */
import { OpenAiLikeProvider } from "./base.js";
import type { ProviderConfig } from "../../shared/types.js";

export class OpenAiProvider extends OpenAiLikeProvider {
  /** type 取 config.type，使 qwen/moonshot/zhipu/gemini 等复用类时标签正确 */
  type = this.config.type;

  constructor(config: ProviderConfig) {
    super(config);
  }
}
