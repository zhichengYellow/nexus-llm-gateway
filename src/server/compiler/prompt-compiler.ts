/**
 * Nexus LLM Gateway - Prompt Compiler
 *
 * Phase 4: 多阶段 Prompt 编译优化。
 *
 * 编译流程：
 *   User Prompt → Rewrite → ContextMerge → ToolPrompt → SafetyPrompt → ProviderFormat → Compiled
 *
 * 每个阶段是一个编译 Pass，可插拔。
 */
import type { ChatMessage, ProviderType } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";

// ===== AST =====

export interface PromptAst {
  original: string;
  stages: PromptStage[];
  compiled: string;
  tokens: number;
}

export interface PromptStage {
  name: string;
  input: string;
  output: string;
  metadata?: Record<string, unknown>;
}

// ===== 编译 Pass 接口 =====

export interface CompilePass {
  name: string;
  enabled: boolean;
  transform: (text: string, context: CompileContext) => string;
}

export interface CompileContext {
  provider?: ProviderType;
  model?: string;
  maxTokens?: number;
  tenantName?: string;
  systemPrompt?: string;
  tools?: string[];
}

// ===== 内置 Pass =====

const DEFAULT_PASSES: CompilePass[] = [
  {
    name: "rewrite",
    enabled: true,
    transform: (text) => {
      // 优化：去除多余空白、统一标点
      return text.replace(/\s+/g, " ").trim();
    },
  },
  {
    name: "contextMerge",
    enabled: true,
    transform: (text, ctx) => {
      // 合并租户 System Prompt
      if (ctx.systemPrompt) {
        return `${ctx.systemPrompt}\n\n${text}`;
      }
      return text;
    },
  },
  {
    name: "toolPrompt",
    enabled: true,
    transform: (text, ctx) => {
      // 注入工具提示
      if (ctx.tools && ctx.tools.length > 0) {
        const toolList = ctx.tools.map((t) => `- ${t}`).join("\n");
        return `${text}\n\nAvailable tools:\n${toolList}`;
      }
      return text;
    },
  },
  {
    name: "safetyPrompt",
    enabled: true,
    transform: (text) => {
      // 安全提示（可选注入）
      return text;
    },
  },
  {
    name: "providerFormat",
    enabled: true,
    transform: (text, ctx) => {
      // Provider 特定格式化
      if (ctx.provider === "gemini") {
        // Gemini 不需要特殊格式
        return text;
      }
      return text;
    },
  },
];

// ===== Compiler =====

export class PromptCompiler {
  private passes: CompilePass[];

  constructor(passes?: CompilePass[]) {
    this.passes = passes ? [...passes] : DEFAULT_PASSES.map((p) => ({ ...p }));
  }

  /** 添加/替换 Pass */
  addPass(pass: CompilePass): void {
    const idx = this.passes.findIndex((p) => p.name === pass.name);
    if (idx >= 0) {
      this.passes[idx] = pass;
    } else {
      this.passes.push(pass);
    }
  }

  /** 移除 Pass */
  removePass(name: string): void {
    this.passes = this.passes.filter((p) => p.name !== name);
  }

  /** 获取所有 Pass */
  getPasses(): CompilePass[] {
    return [...this.passes];
  }

  /**
   * 编译 Prompt
   */
  compile(text: string, context?: CompileContext): PromptAst {
    const ctx = context ?? {};
    let current = text;
    const stages: PromptStage[] = [];

    for (const pass of this.passes) {
      if (!pass.enabled) continue;

      const output = pass.transform(current, ctx);
      stages.push({
        name: pass.name,
        input: current,
        output,
        metadata: {
          inputLength: current.length,
          outputLength: output.length,
          reduction: current.length - output.length,
        },
      });
      current = output;
    }

    const tokens = Math.ceil(current.length / 4);

    return {
      original: text,
      stages,
      compiled: current,
      tokens,
    };
  }

  /**
   * 编译消息列表（ChatMessage[]）
   */
  compileMessages(messages: ChatMessage[], context?: CompileContext): { messages: ChatMessage[]; tokens: number } {
    let totalTokens = 0;
    const compiled: ChatMessage[] = [];

    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const ast = this.compile(content, context);
      totalTokens += ast.tokens;
      compiled.push({ ...msg, content: ast.compiled });
    }

    return { messages: compiled, tokens: totalTokens };
  }

  /**
   * Debug：查看每个 Pass 的输出
   */
  debug(text: string, context?: CompileContext): string[] {
    const ast = this.compile(text, context);
    return ast.stages.map(
      (s) => `[${s.name}] ${s.input.length} → ${s.output.length} chars (${s.metadata?.reduction ?? 0 > 0 ? "-" : "+"}${Math.abs(s.metadata?.reduction as number ?? 0)})`,
    );
  }
}

// ===== 全局单例 =====

let _compiler: PromptCompiler | null = null;

export function getPromptCompiler(): PromptCompiler {
  if (!_compiler) _compiler = new PromptCompiler();
  return _compiler;
}

export function resetPromptCompiler(): void {
  _compiler = null;
}
