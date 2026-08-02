/**
 * Nexus LLM Gateway - TypeScript SDK
 *
 * 用法：
 *   import { NexusClient } from '@nexus/sdk';
 *   const client = new NexusClient({ baseUrl: 'http://localhost:8787', apiKey: 'sk-...' });
 *   const resp = await client.chat('deepseek-v4-flash', '你好');
 */
export interface NexusClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  systemPrompt?: string;
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cached: boolean;
  requestId: string;
}

export class NexusClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(options: NexusClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 30000;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async fetch(path: string, body?: any): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new NexusError(data.error?.message ?? 'unknown error', res.status, data.error?.type);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 发送对话 */
  async chat(prompt: string, model?: string, options?: ChatOptions): Promise<ChatResponse> {
    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const data = await this.fetch('/v1/chat/completions', {
      model: model ?? 'deepseek-v4-flash',
      messages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      stream: false,
    });

    return {
      id: data.id,
      content: data.choices?.[0]?.message?.content ?? '',
      model: data.model,
      provider: data.nexus?.provider ?? 'unknown',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      cached: data.nexus?.cached ?? false,
      requestId: data.nexus?.requestId ?? '',
    };
  }

  /** 流式对话 */
  async *chatStream(prompt: string, model?: string, options?: ChatOptions): AsyncIterable<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: model ?? 'deepseek-v4-flash',
        messages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      throw new NexusError('stream request failed', res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try {
          const chunk = JSON.parse(payload);
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch { /* skip malformed */ }
      }
    }
  }

  /** 获取模型列表 */
  async listModels(): Promise<Array<{ id: string; ownedBy: string }>> {
    const data = await this.fetch('/v1/models');
    return (data.data ?? []).map((m: any) => ({ id: m.id, ownedBy: m.owned_by }));
  }

  /** 健康检查 */
  async health(): Promise<{ status: string; db: boolean; redis: boolean }> {
    return this.fetch('/health');
  }

  /** 跳过缓存发送请求 */
  async chatNoCache(prompt: string, model?: string): Promise<ChatResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'x-nexus-no-cache': '1',
    };

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model ?? 'deepseek-v4-flash',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    return {
      id: data.id,
      content: data.choices?.[0]?.message?.content ?? '',
      model: data.model,
      provider: data.nexus?.provider ?? 'unknown',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      cached: false,
      requestId: data.nexus?.requestId ?? '',
    };
  }
}

export class NexusError extends Error {
  status: number;
  type: string;
  constructor(message: string, status: number, type?: string) {
    super(message);
    this.name = 'NexusError';
    this.status = status;
    this.type = type ?? 'unknown';
  }
}
