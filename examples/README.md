# Nexus LLM Gateway - 使用示例

## Cline (VS Code AI 插件)

在 Cline 设置中修改 API 配置：

```json
{
  "apiProvider": "openai",
  "openAiBaseUrl": "http://localhost:8787/v1",
  "openAiApiKey": "sk-nexus-<your-api-key>",
  "openAiModelId": "deepseek-v4-flash"
}
```

## Continue (VS Code AI 插件)

`~/.continue/config.json`:

```json
{
  "models": [{
    "title": "Nexus Gateway",
    "provider": "openai",
    "model": "deepseek-v4-flash",
    "apiBase": "http://localhost:8787/v1",
    "apiKey": "sk-nexus-your-key"
  }]
}
```

## Open WebUI

在 Open WebUI 中添加 OpenAI 兼容连接：

- **URL**: `http://localhost:8787/v1`
- **Key**: 你的 Nexus API Key
- **模型**: deepseek-v4-flash / gemini-flash-lite

## LangChain (Python)

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://localhost:8787/v1",
    api_key="sk-nexus-your-key",
    model="deepseek-v4-flash",
)

response = llm.invoke("你好")
print(response.content)
```

## LangChain (JavaScript)

```javascript
import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({
  configuration: { baseURL: "http://localhost:8787/v1" },
  apiKey: "sk-nexus-your-key",
  model: "deepseek-v4-flash",
});

const response = await llm.invoke("你好");
```

## Spring AI (Java)

`application.yml`:

```yaml
spring:
  ai:
    openai:
      api-key: sk-nexus-your-key
      base-url: http://localhost:8787
      chat:
        options:
          model: deepseek-v4-flash
```

## MCP Server

```json
{
  "mcpServers": {
    "nexus-gateway": {
      "command": "npx",
      "args": ["-y", "@nexus/mcp-server"],
      "env": {
        "NEXUS_BASE_URL": "http://localhost:8787/v1",
        "NEXUS_API_KEY": "sk-nexus-your-key"
      }
    }
  }
}
```

## Cherry Studio

在 Cherry Studio 中添加 OpenAI 兼容 Provider：

- **API 地址**: `http://localhost:8787/v1`
- **API Key**: 你的 Nexus API Key
