/**
 * Nexus LLM Gateway - OpenAI 兼容 Provider 基类
 * DeepSeek / OpenAI 等遵循 OpenAI 协议的 provider 共用此实现。
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
  ProviderType,
  Usage,
} from "../shared/types.js";
import { ProviderError } from "../shared/types.js";
import { genCompletionId, parseSseLines, safeJsonParse } from "../shared/utils.js";
import { logger } from "../shared/logger.js";
import { ProxyAgent, fetch as ufetch } from "undici";

interface OpenAiLikeChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
  usage?: Usage;
}

export abstract class OpenAiLikeProvider implements ChatProvider, EmbeddingProvider {
  abstract type: ProviderType;
  protected config: ProviderConfig;
  private _dispatcher: ProxyAgent | undefined | null = null;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  protected get headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`;
    return h;
  }

  /** 若该 provider 配置了代理（如 GEMINI_PROXY=http://127.0.0.1:7897），返回 undici dispatcher（单例复用） */
  protected get dispatcher(): ProxyAgent | undefined {
    if (this._dispatcher === null) {
      const proxy = process.env[`${this.type.toUpperCase()}_PROXY`];
      if (!proxy) {
        this._dispatcher = undefined;
        return undefined;
      }
      this._dispatcher = new ProxyAgent(proxy);
    }
    return this._dispatcher;
  }

  protected get hasProxy(): boolean {
    return !!process.env[`${this.type.toUpperCase()}_PROXY`];
  }

  /** 统一请求：有代理走 undici ufetch（同源 dispatcher），无代理走全局 fetch；返回 any 放宽类型差异 */
  protected doFetch(url: string, init: RequestInit): Promise<any> {
    if (this.hasProxy) {
      return ufetch(url, { ...init, dispatcher: this.dispatcher } as any);
    }
    return fetch(url, init);
  }

  protected get chatUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }

  protected get embedUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}/v1/embeddings`;
  }

  protected get modelsUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}/v1/models`;
  }

  async chat(req: ChatCompletionRequest, upstreamModel: string): Promise<ChatCompletionResponse> {
    const body = this.buildChatBody(req, upstreamModel, false);
    const timeoutMs = this.config.upstreamTimeoutMs ?? 60_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await this.doFetch(this.chatUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      const safeText = text.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "sk-***").slice(0, 200);
      throw new ProviderError(`upstream ${this.type} error: ${safeText}`, res.status, this.type);
    }
    const data = (await res.json()) as ChatCompletionResponse & { model: string };
    return {
      id: data.id ?? genCompletionId(),
      object: "chat.completion",
      created: data.created ?? Math.floor(Date.now() / 1000),
      model: req.model,
      choices: data.choices.map((c) => ({
        index: c.index,
        message: c.message,
        finish_reason: c.finish_reason ?? "stop",
      })),
      usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      nexus: { provider: this.type, upstreamModel },
    };
  }

  async *chatStream(req: ChatCompletionRequest, upstreamModel: string): AsyncIterable<ChatCompletionChunk> {
    const body = this.buildChatBody(req, upstreamModel, true);
    const timeoutMs = this.config.upstreamTimeoutMs ?? 60_000;
    // 初始连接超时
    const connectController = new AbortController();
    const connectTimeout = setTimeout(() => connectController.abort(), timeoutMs);
    const res = await this.doFetch(this.chatUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: connectController.signal,
    }).finally(() => clearTimeout(connectTimeout));
    if (!res.ok || !res.body) {
      const text = res.body ? await res.text() : "no body";
      const safeText = text.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "sk-***").slice(0, 200);
      throw new ProviderError(`upstream ${this.type} stream error: ${safeText}`, res.status, this.type);
    }

    const id = genCompletionId();
    const created = Math.floor(Date.now() / 1000);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // inactivity 超时：读取无数据超时则 abort，每收到 chunk 则重置
    let inactivityTimer: ReturnType<typeof setTimeout> | null = setTimeout(
      () => reader.cancel("upstream stream inactivity timeout"),
      timeoutMs,
    );

    const resetInactivity = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(
        () => reader.cancel("upstream stream inactivity timeout"),
        timeoutMs,
      );
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetInactivity();
        buffer += decoder.decode(value, { stream: true });
        const lines = parseSseLines(buffer);
        // 保留未完成的最后一行
        const lastNl = buffer.lastIndexOf("\n");
        buffer = lastNl >= 0 ? buffer.slice(lastNl + 1) : buffer;

        for (const line of lines) {
          const chunk = safeJsonParse<OpenAiLikeChunk>(line);
          if (!chunk) continue;
          yield {
            id: chunk.id ?? id,
            object: "chat.completion.chunk",
            created,
            model: req.model,
            choices: (chunk.choices ?? []).map((c) => ({
              index: c.index,
              delta: { role: c.delta.role as never, content: c.delta.content ?? "" },
              finish_reason: c.finish_reason,
            })),
            ...(chunk.usage ? { usage: chunk.usage } : {}),
          };
        }
      }
    } finally {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      reader.releaseLock();
    }
  }

  async embed(req: EmbeddingRequest, upstreamModel: string): Promise<EmbeddingResponse> {
    const body = { model: upstreamModel, input: req.input };
    const res = await this.doFetch(this.embedUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      const safeText = text.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "sk-***").slice(0, 200);
      throw new ProviderError(`upstream ${this.type} embed error: ${safeText}`, res.status, this.type);
    }
    const data = (await res.json()) as EmbeddingResponse;
    return {
      object: "list",
      model: req.model,
      data: data.data.map((d) => ({ object: "embedding", index: d.index, embedding: d.embedding })),
      usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      nexus: { provider: this.type },
    };
  }

  listModels(): ModelInfo[] {
    const now = Math.floor(Date.now() / 1000);
    return Object.keys(this.config.models)
      .filter((alias) => !alias.startsWith("text-embedding"))
      .map((alias) => ({
        id: alias,
        object: "model" as const,
        created: now,
        owned_by: this.type,
      }));
  }

  listEmbeddingModels(): ModelInfo[] {
    const now = Math.floor(Date.now() / 1000);
    return Object.keys(this.config.models)
      .filter((alias) => alias.startsWith("text-embedding"))
      .map((alias) => ({
        id: alias,
        object: "model" as const,
        created: now,
        owned_by: this.type,
      }));
  }

  /** 远程拉取模型列表（可选，用于调试） */
  async fetchUpstreamModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(this.modelsUrl, { headers: this.headers });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: ModelInfo[] };
      return data.data ?? [];
    } catch (e) {
      logger.debug({ err: e }, `fetch upstream models failed for ${this.type}`);
      return [];
    }
  }

  protected buildChatBody(req: ChatCompletionRequest, upstreamModel: string, stream: boolean) {
    const body: Record<string, unknown> = {
      model: upstreamModel,
      messages: req.messages,
      stream,
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.top_p !== undefined) body.top_p = req.top_p;
    if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;
    if (req.stop !== undefined) body.stop = req.stop;
    if (req.presence_penalty !== undefined) body.presence_penalty = req.presence_penalty;
    if (req.frequency_penalty !== undefined) body.frequency_penalty = req.frequency_penalty;
    if (req.user !== undefined) body.user = req.user;
    if (stream) body.stream_options = { include_usage: true };
    return body;
  }
}