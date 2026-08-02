# Nexus LLM Gateway - 兼容性矩阵

| 客户端 | 协议 | 状态 | 备注 |
|--------|------|------|------|
| OpenAI Python SDK | `/v1/chat/completions` | ✅ 完全兼容 | 改 `base_url` 即可 |
| OpenAI Node.js SDK | `/v1/chat/completions` | ✅ 完全兼容 | 改 `baseURL` 即可 |
| LangChain (Python) | `/v1/chat/completions` | ✅ 兼容 | 使用 `ChatOpenAI` |
| LangChain (JS) | `/v1/chat/completions` | ✅ 兼容 | 使用 `ChatOpenAI` |
| Spring AI | `/v1/chat/completions` | ✅ 兼容 | OpenAI starter |
| LlamaIndex | `/v1/chat/completions` | ✅ 兼容 | 使用 `OpenAI` LLM |
| Cline (VS Code) | `/v1/chat/completions` | ✅ 兼容 | OpenAI 兼容模式 |
| Continue (VS Code) | `/v1/chat/completions` | ✅ 兼容 | OpenAI provider |
| Cherry Studio | `/v1/chat/completions` | ✅ 兼容 | OpenAI 兼容 |
| Open WebUI | `/v1/chat/completions` | ✅ 兼容 | OpenAI 连接 |
| Aider | `/v1/chat/completions` | ✅ 兼容 | 改 `OPENAI_API_BASE` |
| @nexus/sdk (TS) | `/v1/*` | ✅ 原生支持 | TypeScript SDK |
| nexus-sdk (Python) | `/v1/*` | ✅ 原生支持 | Python SDK |

## 支持的 OpenAI 兼容端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | 对话（流式 + 非流式） |
| `/v1/embeddings` | POST | 向量嵌入 |
| `/v1/models` | GET | 模型列表 |

## 不兼容项

- `/v1/audio/*` — 不支持语音
- `/v1/images/*` — 不支持图像生成
- `/v1/files/*` — 不支持文件管理
- `/v1/fine_tuning/*` — 不支持微调
- Function Calling — 取决于上游 Provider 支持
