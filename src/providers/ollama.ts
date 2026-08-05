/**
 * Nexus LLM Gateway - Ollama Provider
 * Ollama 使用自有 API（/api/chat、/api/embeddings），非 OpenAI 协议。
 * 这里做协议适配，统一到内部 ChatProvider / EmbeddingProvider 接口。
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
  ProviderConfig,
  Usage,
} from "../shared/types.js";
import { ProviderError } from "../shared/types.js";
import { genCompletionId, estimateTokens, safeJsonParse } from "../shared/utils.js";

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbedResponse {
  embedding: number[];
}

export class OllamaProvider implements ChatProvider, EmbeddingProvider {
  type = "ollama" as const;
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  protected get headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`;
    return h;
  }

  protected get chatUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}/api/chat`;
  }

  protected get embedUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}/api/embeddings`;
  }

  protected get modelsUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}/api/tags`;
  }

  async chat(req: ChatCompletionRequest, upstreamModel: string): Promise<ChatCompletionResponse> {
    const body = this.buildChatBody(req, upstreamModel, false);
    const res = await fetch(this.chatUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(`upstream ollama chat error: ${text}`, res.status, this.type);
    }
    const data = (await res.json()) as OllamaChatResponse;
    const promptTokens = data.prompt_eval_count ?? estimateTokens(JSON.stringify(req.messages));
    const completionTokens = data.eval_count ?? estimateTokens(data.message.content);
    return {
      id: genCompletionId(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: req.model,
      choices: [
        {
          index: 0,
          message: { role: data.message.role as never, content: data.message.content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      nexus: { provider: this.type, upstreamModel },
    };
  }

  async *chatStream(req: ChatCompletionRequest, upstreamModel: string): AsyncIterable<ChatCompletionChunk> {
    const body = this.buildChatBody(req, upstreamModel, true);
    const res = await fetch(this.chatUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const text = res.body ? await res.text() : "no body";
      throw new ProviderError(`upstream ollama stream error: ${text}`, res.status, this.type);
    }

    const id = genCompletionId();
    const created = Math.floor(Date.now() / 1000);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Ollama 流式按换行分隔 JSON 对象
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const chunk = safeJsonParse<OllamaChatResponse>(line);
          if (!chunk) continue;
          if (chunk.prompt_eval_count) promptTokens = chunk.prompt_eval_count;
          if (chunk.eval_count) completionTokens = chunk.eval_count;
          const content = chunk.message?.content ?? "";
          if (content || chunk.done) {
            yield {
              id,
              object: "chat.completion.chunk",
              created,
              model: req.model,
              choices: [
                {
                  index: 0,
                  delta: content ? { content } : {},
                  finish_reason: chunk.done ? "stop" : null,
                },
              ],
              ...(chunk.done
                ? {
                    usage: {
                      prompt_tokens: promptTokens,
                      completion_tokens: completionTokens,
                      total_tokens: promptTokens + completionTokens,
                    },
                  }
                : {}),
            };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embed(req: EmbeddingRequest, upstreamModel: string): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const data: { object: "embedding"; index: number; embedding: number[] }[] = [];
    let totalTokens = 0;
    for (let i = 0; i < inputs.length; i++) {
      const text = inputs[i] ?? "";
      const res = await fetch(this.embedUrl, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ model: upstreamModel, prompt: text }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new ProviderError(`upstream ollama embed error: ${errText}`, res.status, this.type);
      }
      const d = (await res.json()) as OllamaEmbedResponse;
      data.push({ object: "embedding", index: i, embedding: d.embedding });
      totalTokens += estimateTokens(text);
    }
    return {
      object: "list",
      model: req.model,
      data,
      usage: { prompt_tokens: totalTokens, completion_tokens: 0, total_tokens: totalTokens },
      nexus: { provider: this.type },
    };
  }

  listModels(): ModelInfo[] {
    const now = Math.floor(Date.now() / 1000);
    return Object.keys(this.config.models)
      .filter((alias) => !alias.startsWith("text-embedding"))
      .map((alias) => ({ id: alias, object: "model" as const, created: now, owned_by: this.type }));
  }

  listEmbeddingModels(): ModelInfo[] {
    const now = Math.floor(Date.now() / 1000);
    return Object.keys(this.config.models)
      .filter((alias) => alias.startsWith("text-embedding"))
      .map((alias) => ({ id: alias, object: "model" as const, created: now, owned_by: this.type }));
  }

  /** 拉取 Ollama 本地已安装模型 */
  async fetchUpstreamModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(this.modelsUrl);
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const now = Math.floor(Date.now() / 1000);
      return (data.models ?? []).map((m) => ({
        id: m.name,
        object: "model" as const,
        created: now,
        owned_by: this.type,
      }));
    } catch {
      return [];
    }
  }

  protected buildChatBody(req: ChatCompletionRequest, upstreamModel: string, stream: boolean) {
    const body: Record<string, unknown> = {
      model: upstreamModel,
      messages: req.messages,
      stream,
    };
    if (req.temperature !== undefined) body.options = { temperature: req.temperature };
    if (req.top_p !== undefined) {
      body.options = { ...(body.options as object), top_p: req.top_p };
    }
    if (req.stop !== undefined) body.options = { ...(body.options as object), stop: req.stop };
    return body;
  }
}

// 显式标注 Usage 仅用于类型完整性
export type { Usage };