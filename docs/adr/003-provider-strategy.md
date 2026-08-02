# ADR 003: Provider 架构采用策略模式

- **状态**: ✅ 已采纳
- **日期**: 2025-01
- **决策者**: Nexus Team

## 背景

需要支持多种 LLM Provider（DeepSeek、OpenAI、Gemini、Ollama 等），它们有共同的接口但也有各自的差异（如 Ollama 使用非 OpenAI 协议）。

## 决策

采用**策略模式**，定义 `ChatProvider` 和 `EmbeddingProvider` 接口，各 Provider 独立实现。

## 理由

1. **接口统一**：所有 Provider 暴露相同的 `chat()` / `chatStream()` / `embed()` / `listModels()` 方法
2. **易于扩展**：新增 Provider 只需实现接口并注册到 `ProviderRegistry`
3. **代码复用**：OpenAI 兼容的 Provider（DeepSeek、Gemini、Qwen、Moonshot、Zhipu）共用 `OpenAiLikeProvider` 基类
4. **独立测试**：每个 Provider 可单独 Mock 和测试

## 替代方案

### 配置驱动（纯配置文件）
- ✅ 无需写代码即可添加 Provider
- ❌ 无法处理协议差异（如 Ollama 的非 OpenAI 格式）
- ❌ 特殊逻辑（如 Gemini 的 thought_signature）难以配置化

### 适配器链
- ✅ 灵活组合
- ❌ 过度设计，当前 7 个 Provider 不需要

## 影响

- `providers/` 目录包含基类 `base.ts`、各 Provider 实现、`registry.ts` 注册中心
- 无 API Key 的云 Provider 自动跳过注册（v2 Capability Discovery）
- Mock Provider (`mock-provider.ts`) 用于集成测试
