# Provider 配置

Nexus Gateway 支持 7 种 LLM Provider，通过 `.env` 文件统一配置。

## 支持的 Provider

| Provider | 类型标识 | 需要 API Key | 说明 |
|----------|---------|-------------|------|
| DeepSeek | `deepseek` | ✅ | 国产高性价比模型 |
| OpenAI | `openai` | ✅ | GPT 系列 |
| Google Gemini | `gemini` | ✅ | 通过 OpenAI 兼容端点 |
| 通义千问 | `qwen` | ✅ | 阿里云 |
| Kimi | `moonshot` | ✅ | 月之暗面 |
| 智谱 GLM | `zhipu` | ✅ | 智谱 AI |
| Ollama | `ollama` | ❌ | 本地部署 |

## 通用配置格式

在 `.env` 中为每个 Provider 设置：

```bash
# {PROVIDER}_BASE_URL: API 端点地址
# {PROVIDER}_API_KEY: API 密钥（留空则不注册该 Provider）
# {PROVIDER}_PROXY: （可选）HTTP 代理地址
```

## 各 Provider 配置示例

### DeepSeek

```bash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=sk-your-deepseek-key
```

默认注册模型：
- `deepseek-v4-flash` → `deepseek-chat`
- `deepseek-v4-pro` → `deepseek-reasoner`

### OpenAI

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-your-openai-key
# 国内需要代理
OPENAI_PROXY=http://127.0.0.1:7897
```

默认注册模型：
- `gpt-4o-mini`
- `gpt-4o`
- `text-embedding-3-small`
- `text-embedding-3-large`

### Google Gemini

```bash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
GEMINI_API_KEY=your-gemini-api-key
# 国内需要代理
GEMINI_PROXY=http://127.0.0.1:7897
```

默认注册模型：
- `gemini-flash-lite` → `gemini-flash-lite-latest`
- `gemini-2.0-flash` → `gemini-2.0-flash`

> **注意**：`gemini-2.0-flash` 免费层对新用户不开放，建议用 `gemini-flash-lite`。

### 通义千问 (Qwen)

```bash
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_API_KEY=sk-your-qwen-key
```

默认注册模型：
- `qwen-max`
- `qwen-plus`
- `qwen-turbo`

### Kimi (Moonshot)

```bash
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
MOONSHOT_API_KEY=sk-your-moonshot-key
```

默认注册模型：
- `kimi-k2`
- `moonshot-v1-8k`
- `moonshot-v1-32k`

### 智谱 GLM (Zhipu)

```bash
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_API_KEY=your-zhipu-key
```

默认注册模型：
- `glm-4-plus`
- `glm-4-flash`
- `glm-4`

### Ollama（本地）

```bash
OLLAMA_BASE_URL=http://localhost:11434
# Ollama 无需 API Key
```

默认注册模型：
- `ollama-llama3` → `llama3`
- `ollama-qwen2.5` → `qwen2.5`

## 自定义模型别名

修改 `src/shared/config.ts` 中对应 Provider 的 `models` 字段：

```typescript
// 示例：为 DeepSeek 添加自定义别名
deepseek: {
  type: "deepseek",
  baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
  models: {
    "deepseek-v4-flash": "deepseek-chat",
    "deepseek-v4-pro": "deepseek-reasoner",
    "my-custom-model": "deepseek-chat",  // 新增别名
  },
},
```

## 无 Key 自动禁用

网关启动时会检查每个 Provider 的 API Key 是否已配置：
- **有 Key** → 正常注册，模型可用
- **无 Key** → 自动跳过，该 Provider 的模型不出现在 `/v1/models` 中
- **Ollama 例外** → 本地服务无需 Key，始终注册

## 健康探测

每个 Provider 注册后，网关会定期检查其可用性。如果某个 Provider 不可达或返回错误，该 Provider 会被标记为不健康，路由时自动跳过。

可通过管理看板的「Provider 测速」页面手动测试所有 Provider 的延迟和状态。
