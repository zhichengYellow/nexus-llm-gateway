/**
 * Nexus LLM Gateway - Mock Provider 实现
 * 用于集成测试，模拟上游 LLM 的响应，不依赖真实 API。
 */
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatProvider,
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelInfo,
  ProviderType,
  Usage,
} from "../../shared/types.js";
import { ProviderError } from "../../shared/types.js";
import { genCompletionId } from "../../shared/utils.js";

export interface MockProviderConfig {
  type: ProviderType;
  /** 模拟延迟（ms），默认 0 */
  latency?: number;
  /** 是否模拟失败，默认 false */
  shouldFail?: boolean;
  /** 失败时返回的状态码，默认 500 */
  failStatus?: number;
  /** 自定义模型列表，默认 ['mock-model'] */
  models?: string[];
  /** 调用记录，用于验证 */
  callLog: Array<{
    method: "chat" | "chatStream" | "embed" | "listModels";
    model: string;
    timestamp: number;
  }>;
}

const DEFAULT_USAGE: Usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };

export class MockProvider implements ChatProvider, EmbeddingProvider {
  type: ProviderType;
  private config: MockProviderConfig;

  constructor(config?: Partial<MockProviderConfig> & { type: ProviderType }) {
    this.type = config?.type ?? ("mock" as ProviderType);
    this.config = {
      type: this.type,
      latency: config?.latency ?? 0,
      shouldFail: config?.shouldFail ?? false,
      failStatus: config?.failStatus ?? 500,
      models: config?.models ?? ["mock-model"],
      callLog: config?.callLog ?? [],
    };
  }

  get callLog() {
    return this.config.callLog;
  }

  clearCallLog() {
    this.config.callLog.length = 0;
  }

  setShouldFail(val: boolean) {
    this.config.shouldFail = val;
  }

  setLatency(ms: number) {
    this.config.latency = ms;
  }

  private async delay() {
    if (this.config.latency && this.config.latency > 0) {
      await new Promise((r) => setTimeout(r, this.config.latency));
    }
  }

  private checkFailure() {
    if (this.config.shouldFail) {
      throw new ProviderError(
        `mock upstream error for ${this.type}`,
        this.config.failStatus ?? 500,
        this.type,
      );
    }
  }

  async chat(req: ChatCompletionRequest, model: string): Promise<ChatCompletionResponse> {
    this.config.callLog.push({ method: "chat", model, timestamp: Date.now() });
    await this.delay();
    this.checkFailure();

    return {
      id: genCompletionId(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: req.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: `Mock response from ${this.type} for model ${model}` },
          finish_reason: "stop",
        },
      ],
      usage: DEFAULT_USAGE,
      nexus: { provider: this.type, upstreamModel: model },
    };
  }

  async *chatStream(req: ChatCompletionRequest, model: string): AsyncIterable<ChatCompletionChunk> {
    this.config.callLog.push({ method: "chatStream", model, timestamp: Date.now() });
    await this.delay();
    this.checkFailure();

    const id = genCompletionId();
    const created = Math.floor(Date.now() / 1000);

    yield {
      id,
      object: "chat.completion.chunk",
      created,
      model: req.model,
      choices: [{ index: 0, delta: { role: "assistant", content: "Mock " }, finish_reason: null }],
    };
    yield {
      id,
      object: "chat.completion.chunk",
      created,
      model: req.model,
      choices: [{ index: 0, delta: { content: "stream" }, finish_reason: null }],
    };
    yield {
      id,
      object: "chat.completion.chunk",
      created,
      model: req.model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: DEFAULT_USAGE,
    };
  }

  async embed(req: EmbeddingRequest, model: string): Promise<EmbeddingResponse> {
    this.config.callLog.push({ method: "embed", model, timestamp: Date.now() });
    await this.delay();
    this.checkFailure();

    return {
      object: "list",
      model: req.model,
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] }],
      usage: DEFAULT_USAGE,
      nexus: { provider: this.type },
    };
  }

  listModels(): ModelInfo[] {
    const now = Math.floor(Date.now() / 1000);
    return (this.config.models ?? []).map((id) => ({
      id,
      object: "model" as const,
      created: now,
      owned_by: this.type,
    }));
  }

  listEmbeddingModels(): ModelInfo[] {
    return [];
  }
}
