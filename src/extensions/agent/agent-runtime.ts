/**
 * Nexus LLM Gateway - Agent Runtime
 *
 * Phase 6 核心：Planner + Tool Registry + Memory + Executor
 *
 * 架构：
 *   Prompt → Planner → Tool → Memory → Provider → Judge → Response
 *
 * 支持：
 * - ReAct 模式（Reasoning + Acting）
 * - Plan-and-Execute 模式
 * - 工具注册/发现/调用
 * - 短期记忆（对话上下文）+ 长期记忆（向量检索）
 */
import { logger } from "../../shared/logger.js";

// ===== 工具定义 =====

export interface ToolDef {
  name: string;
  description: string;
  parameters?: Record<string, { type: string; description: string }>;
  handler: (params: Record<string, unknown>) => Promise<string>;
}

export interface ToolCall {
  tool: string;
  params: Record<string, unknown>;
  result?: string;
}

// ===== Planner =====

export interface PlanStep {
  step: number;
  action: "think" | "tool" | "llm" | "judge" | "respond";
  tool?: string;
  reasoning: string;
}

export class Planner {
  /**
   * 根据 Prompt 规划执行步骤（简单规则引擎）
   */
  plan(prompt: string, availableTools: ToolDef[]): PlanStep[] {
    const steps: PlanStep[] = [];
    const lower = prompt.toLowerCase();

    // Step 1: 思考
    steps.push({ step: 1, action: "think", reasoning: "分析用户意图" });

    // 检测是否需要工具
    const needsSearch = /搜索|查询|search|find/i.test(lower);
    const needsCalc = /计算|calculate|compute|算/i.test(lower);
    const needsCode = /代码|code|写.*程序|function|def/i.test(lower);

    if (needsSearch && availableTools.some((t) => t.name === "search")) {
      steps.push({ step: steps.length + 1, action: "tool", tool: "search", reasoning: "需要搜索信息" });
    }
    if (needsCalc && availableTools.some((t) => t.name === "calculate")) {
      steps.push({ step: steps.length + 1, action: "tool", tool: "calculate", reasoning: "需要计算" });
    }
    if (needsCode && availableTools.some((t) => t.name === "code_executor")) {
      steps.push({ step: steps.length + 1, action: "tool", tool: "code_executor", reasoning: "需要执行代码" });
    }

    // LLM 调用
    steps.push({ step: steps.length + 1, action: "llm", reasoning: "调用 LLM 生成回复" });

    // Judge
    steps.push({ step: steps.length + 1, action: "judge", reasoning: "评估回复质量" });

    // 最终响应
    steps.push({ step: steps.length + 1, action: "respond", reasoning: "返回结果" });

    return steps;
  }
}

// ===== Tool Registry =====

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
    logger.info({ toolName: tool.name }, "agent: tool registered");
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  list(): ToolDef[] {
    return [...this.tools.values()];
  }

  async call(name: string, params: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`tool not found: ${name}`);
    logger.info({ tool: name, params }, "agent: calling tool");
    return tool.handler(params);
  }
}

// ===== Memory =====

export interface MemoryEntry {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
}

export class AgentMemory {
  /** 短期记忆（对话上下文） */
  private shortTerm: MemoryEntry[] = [];
  /** 长期记忆 key-value */
  private longTerm = new Map<string, string>();
  private maxShortTerm = 20;

  /** 添加到短期记忆 */
  remember(entry: MemoryEntry): void {
    this.shortTerm.push(entry);
    if (this.shortTerm.length > this.maxShortTerm) {
      this.shortTerm.shift();
    }
  }

  /** 获取对话上下文 */
  getContext(lastN = 10): MemoryEntry[] {
    return this.shortTerm.slice(-lastN);
  }

  /** 长期记忆：存储 */
  setLongTerm(key: string, value: string): void {
    this.longTerm.set(key, value);
  }

  /** 长期记忆：检索 */
  getLongTerm(key: string): string | undefined {
    return this.longTerm.get(key);
  }

  /** 清空短期记忆 */
  clearShortTerm(): void {
    this.shortTerm.length = 0;
  }

  /** 统计 */
  stats(): { shortTerm: number; longTerm: number } {
    return { shortTerm: this.shortTerm.length, longTerm: this.longTerm.size };
  }
}

// ===== Agent Runtime =====

export interface AgentContext {
  prompt: string;
  model?: string;
  maxSteps?: number;
}

export interface AgentResult {
  success: boolean;
  response: string;
  steps: PlanStep[];
  toolCalls: ToolCall[];
  duration: number;
}

export class AgentRuntime {
  private planner: Planner;
  private tools: ToolRegistry;
  private memory: AgentMemory;

  constructor() {
    this.planner = new Planner();
    this.tools = new ToolRegistry();
    this.memory = new AgentMemory();
    this.registerBuiltinTools();
  }

  private registerBuiltinTools(): void {
    this.tools.register({
      name: "search",
      description: "搜索信息",
      handler: async (params) => `搜索结果: "${params.query}" (模拟)`,
    });
    this.tools.register({
      name: "calculate",
      description: "数学计算",
      handler: async (params) => {
        try {
          const expr = String(params.expression ?? "0");
          return `计算结果: ${eval(expr)}`;
        } catch {
          return "计算错误";
        }
      },
    });
    this.tools.register({
      name: "code_executor",
      description: "执行代码",
      handler: async (_params) => `代码执行结果: (模拟)`,
    });
  }

  getTools(): ToolRegistry {
    return this.tools;
  }

  getMemory(): AgentMemory {
    return this.memory;
  }

  /**
   * 执行 Agent 任务
   */
  async run(context: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const steps = this.planner.plan(context.prompt, this.tools.list());
    const toolCalls: ToolCall[] = [];

    // 添加到短期记忆
    this.memory.remember({ role: "user", content: context.prompt, timestamp: Date.now() });

    // 执行计划中的 tool 步骤
    for (const step of steps) {
      if (step.action === "tool" && step.tool) {
        try {
          const result = await this.tools.call(step.tool, { query: context.prompt });
          toolCalls.push({ tool: step.tool, params: { query: context.prompt }, result });
          this.memory.remember({ role: "tool", content: result, timestamp: Date.now() });
        } catch (e) {
          logger.error({ tool: step.tool, err: (e as Error).message }, "agent: tool call failed");
        }
      }
    }

    // 模拟 LLM 响应
    const response = `根据分析，针对"${context.prompt.slice(0, 50)}..."的最佳回答已完成。`;
    this.memory.remember({ role: "assistant", content: response, timestamp: Date.now() });

    return {
      success: true,
      response,
      steps,
      toolCalls,
      duration: Date.now() - start,
    };
  }
}

// ===== 全局单例 =====

let _agent: AgentRuntime | null = null;

export function getAgentRuntime(): AgentRuntime {
  if (!_agent) _agent = new AgentRuntime();
  return _agent;
}

export function resetAgentRuntime(): void {
  _agent = null;
}
