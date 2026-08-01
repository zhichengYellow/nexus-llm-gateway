/**
 * Nexus LLM Gateway - 共享类型定义
 * 统一 OpenAI 兼容协议的内部表示，屏蔽各 Provider 差异。
 */

// ===== 消息与请求 =====

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
  // 透传字段（网关不解析，直接传给 provider）
  [key: string]: unknown;
}

// ===== 响应（非流式）=====

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: Usage;
  /** 网关扩展：来源信息 */
  nexus: {
    provider: string;
    /** 命中语义缓存时为 true */
    cached?: boolean;
    /** 实际调用的底层模型 */
    upstreamModel?: string;
    /** 请求追踪 ID */
    requestId?: string;
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ===== 流式（SSE chunk）=====

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  /** 仅在最后一个 chunk 出现 */
  usage?: Usage;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: string | null;
}

// ===== Embeddings =====

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  /** 透传 */
  [key: string]: unknown;
}

export interface EmbeddingResponse {
  object: "list";
  model: string;
  data: EmbeddingItem[];
  usage: Usage;
  nexus: {
    provider: string;
    cached?: boolean;
    requestId?: string;
  };
}

export interface EmbeddingItem {
  object: "embedding";
  index: number;
  embedding: number[];
}

// ===== 模型列表 =====

export interface ModelInfo {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface ModelListResponse {
  object: "list";
  data: ModelInfo[];
}

// ===== Provider 抽象 =====

// 目前支持：deepseek / ollama / openai / 以及 4 个 OpenAI 兼容供应商
// qwen=通义千问 moonshot=Kimi zhipu=智谱GLM gemini=Google(经 OpenAI 兼容端点)
export type ProviderType =
  | "deepseek"
  | "ollama"
  | "openai"
  | "qwen"
  | "moonshot"
  | "zhipu"
  | "gemini";

export interface ProviderConfig {
  type: ProviderType;
  baseUrl: string;
  apiKey?: string;
  /** 该 provider 暴露给上层的模型别名 → 实际模型名 */
  models: Record<string, string>;
}

export interface ChatProvider {
  type: ProviderType;
  /** 非流式 chat completion */
  chat(req: ChatCompletionRequest, model: string): Promise<ChatCompletionResponse>;
  /** 流式 chat completion，返回 async iterable */
  chatStream(req: ChatCompletionRequest, model: string): AsyncIterable<ChatCompletionChunk>;
  /** 列出该 provider 支持的模型 */
  listModels(): ModelInfo[];
}

export interface EmbeddingProvider {
  type: ProviderType;
  embed(req: EmbeddingRequest, model: string): Promise<EmbeddingResponse>;
  listEmbeddingModels(): ModelInfo[];
}

// ===== 错误 =====

export class ProviderError extends Error {
  status: number;
  provider: string;
  constructor(message: string, status: number, provider: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.provider = provider;
  }
}