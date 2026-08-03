/**
 * Nexus LLM Gateway - Workflow Engine
 *
 * Phase 3: 像 LangGraph 一样的 DAG 工作流引擎。
 *
 * 概念：
 * - Node：执行单元（Router/Judge/Retry/Rewrite/LLM/Cache）
 * - Edge：节点间连接（条件跳转、循环、并行）
 * - Workflow：DAG 定义，YAML DSL
 *
 * 用法：
 * ```yaml
 * workflow:
 *   name: "smart-chat"
 *   nodes:
 *     - id: router
 *       type: RouterNode
 *     - id: cache
 *       type: CacheNode
 *     - id: llm
 *       type: ProviderNode
 *       config: { model: deepseek-v4-flash }
 *     - id: judge
 *       type: JudgeNode
 *   edges:
 *     - from: router
 *       to: cache
 *     - from: cache
 *       to: llm
 *       condition: "!cache.hit"
 *     - from: cache
 *       to: end
 *       condition: "cache.hit"
 *     - from: llm
 *       to: judge
 *     - from: judge
 *       to: llm
 *       condition: "judge.score < 0.7 && retry < 3"
 *     - from: judge
 *       to: end
 *       condition: "judge.score >= 0.7 || retry >= 3"
 * ```
 */
import { logger } from "../../shared/logger.js";

// ===== Node 抽象 =====

export type NodeType = "RouterNode" | "CacheNode" | "ProviderNode" | "JudgeNode" | "RetryNode" | "RewriteNode" | "ParallelNode" | "EndNode";

export interface WorkflowNodeConfig {
  [key: string]: unknown;
}

export interface WorkflowNodeDef {
  id: string;
  type: NodeType;
  config?: WorkflowNodeConfig;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;  // JS 表达式
}

export interface WorkflowDef {
  name: string;
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdge[];
}

// ===== 执行上下文 =====

export interface WorkflowContext {
  /** 输入 prompt */
  input: string;
  /** 模型名 */
  model?: string;
  /** 节点输出缓存 */
  outputs: Map<string, unknown>;
  /** 当前重试次数 */
  retryCount: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 已访问节点 */
  visited: Set<string>;
  /** 自定义变量 */
  vars: Record<string, unknown>;
}

export interface WorkflowResult {
  success: boolean;
  output: unknown;
  nodePath: string[];
  retries: number;
  duration: number;
}

// ===== Node Handler =====

export type NodeHandler = (ctx: WorkflowContext, config?: WorkflowNodeConfig) => Promise<unknown>;

// ===== 条件求值 =====

function evalCondition(condition: string, ctx: WorkflowContext): boolean {
  try {
    const scope: Record<string, unknown> = {};
    for (const [k, v] of ctx.outputs) scope[k] = v;
    scope["retry"] = ctx.retryCount;
    scope["input"] = ctx.input;
    Object.assign(scope, ctx.vars);

    const expr = condition.trim();

    // !cache.hit
    if (expr === "!cache.hit") {
      return !(scope["cache"] as any)?.hit;
    }
    // cache.hit
    if (expr === "cache.hit") {
      return !!(scope["cache"] as any)?.hit;
    }
    // 通用 obj.prop op val
    const simpleMatch = expr.match(/^!?(\w+)\.(\w+)\s*([<>=!]+)\s*([\d.]+)$/);
    if (simpleMatch) {
      const negate = expr.startsWith("!");
      const objName = simpleMatch[1]!;
      const prop = simpleMatch[2]!;
      const op = simpleMatch[3]!;
      const val = parseFloat(simpleMatch[4]!);
      const objVal = (scope[objName] as any)?.[prop];
      if (objVal === undefined) return false;
      let result = false;
      switch (op) {
        case "<": result = objVal < val; break;
        case ">": result = objVal > val; break;
        case "<=": result = objVal <= val; break;
        case ">=": result = objVal >= val; break;
        case "==": result = objVal == val; break;
        case "!=": result = objVal != val; break;
      }
      return negate ? !result : result;
    }
    // 复合条件
    const complexMatch = expr.match(/^(\w+)\.(\w+)\s*([<>=!]+)\s*([\d.]+)\s*&&\s*(\w+)\s*([<>=!]+)\s*([\d.]+)$/);
    if (complexMatch) {
      const obj1 = complexMatch[1]!; const prop1 = complexMatch[2]!;
      const op1 = complexMatch[3]!; const val1 = parseFloat(complexMatch[4]!);
      const obj2 = complexMatch[5]!; const op2 = complexMatch[6]!;
      const val2 = parseFloat(complexMatch[7]!);
      const v1 = (scope[obj1] as any)?.[prop1];
      const v2 = scope[obj2];
      if (v1 === undefined || v2 === undefined) return false;
      const r1 = op1 === "<" ? v1 < val1 : op1 === ">" ? v1 > val1 : op1 === "<=" ? v1 <= val1 : op1 === ">=" ? v1 >= val1 : false;
      const r2 = op2 === "<" ? v2 < val2 : op2 === ">" ? v2 > val2 : op2 === "<=" ? v2 <= val2 : op2 === ">=" ? v2 >= val2 : false;
      return r1 && r2;
    }

    return true;
  } catch {
    return true;
  }
}

// ===== Workflow Engine =====

export class WorkflowEngine {
  private handlers = new Map<NodeType, NodeHandler>();

  constructor() {
    this.registerBuiltinHandlers();
  }

  /** 注册内置 handler */
  private registerBuiltinHandlers(): void {
    this.register("RouterNode", async (ctx) => {
      logger.info("workflow: router node");
      return { intent: "general", provider: "deepseek" };
    });

    this.register("CacheNode", async (ctx) => {
      logger.info("workflow: cache node");
      return { hit: false };
    });

    this.register("ProviderNode", async (ctx, config) => {
      logger.info({ config }, "workflow: provider node");
      return {
        content: `Response for: ${ctx.input}`,
        usage: { total_tokens: 10 },
      };
    });

    this.register("JudgeNode", async (ctx) => {
      logger.info("workflow: judge node");
      return { score: 0.85, passed: true };
    });

    this.register("RetryNode", async (ctx) => {
      ctx.retryCount++;
      logger.info({ retry: ctx.retryCount }, "workflow: retry node");
      return { retryCount: ctx.retryCount };
    });

    this.register("RewriteNode", async (ctx) => {
      logger.info("workflow: rewrite node");
      return { rewritten: ctx.input };
    });

    this.register("EndNode", async () => {
      return { done: true };
    });

    this.register("ParallelNode", async (ctx) => {
      logger.info("workflow: parallel node");
      return { results: [] };
    });
  }

  /** 注册自定义 handler */
  register(type: NodeType, handler: NodeHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * 执行 Workflow
   */
  async execute(workflow: WorkflowDef, input: string, options?: { maxRetries?: number }): Promise<WorkflowResult> {
    const ctx: WorkflowContext = {
      input,
      model: options?.maxRetries ? undefined : undefined,
      outputs: new Map(),
      retryCount: 0,
      maxRetries: options?.maxRetries ?? 3,
      visited: new Set(),
      vars: {},
    };

    const nodePath: string[] = [];
    const start = Date.now();
    let currentNodeId = workflow.nodes[0]?.id ?? "end";

    while (currentNodeId !== "end" && ctx.retryCount <= ctx.maxRetries) {
      // 防死循环
      if (ctx.visited.has(currentNodeId)) {
        logger.warn({ nodeId: currentNodeId }, "workflow: cycle detected, breaking");
        break;
      }
      ctx.visited.add(currentNodeId);
      nodePath.push(currentNodeId);

      // 执行节点
      const nodeDef = workflow.nodes.find((n) => n.id === currentNodeId);
      if (!nodeDef) {
        logger.error({ nodeId: currentNodeId }, "workflow: node not found");
        break;
      }

      const handler = this.handlers.get(nodeDef.type);
      if (!handler) {
        logger.error({ nodeType: nodeDef.type }, "workflow: handler not found");
        break;
      }

      try {
        const output = await handler(ctx, nodeDef.config);
        ctx.outputs.set(currentNodeId, output);
      } catch (e) {
        logger.error({ nodeId: currentNodeId, err: (e as Error).message }, "workflow: node execution error");
        return { success: false, output: null, nodePath, retries: ctx.retryCount, duration: Date.now() - start };
      }

      // 找到下一个节点
      const edges = workflow.edges.filter((e) => e.from === currentNodeId);
      let nextNode: string | null = null;

      for (const edge of edges) {
        if (!edge.condition || evalCondition(edge.condition, ctx)) {
          nextNode = edge.to;
          break;
        }
      }

      if (!nextNode) break;
      currentNodeId = nextNode;
    }

    return {
      success: true,
      output: ctx.outputs,
      nodePath,
      retries: ctx.retryCount,
      duration: Date.now() - start,
    };
  }

  /**
   * 解析 YAML Workflow DSL
   */
  parseWorkflow(yamlText: string): WorkflowDef {
    const lines = yamlText.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    const def: WorkflowDef = { name: "", nodes: [], edges: [] };
    let section: "nodes" | "edges" | null = null;
    let currentNode: Partial<WorkflowNodeDef> | null = null;
    let currentEdge: Partial<WorkflowEdge> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("name:")) {
        def.name = trimmed.slice(5).trim().replace(/^["']|["']$/g, "");
        continue;
      }
      if (trimmed === "nodes:") { section = "nodes"; continue; }
      if (trimmed === "edges:") { section = "edges"; continue; }

      if (section === "nodes") {
        if (trimmed.startsWith("- id:")) {
          if (currentNode) def.nodes.push(currentNode as WorkflowNodeDef);
          currentNode = { id: trimmed.slice(5).trim(), type: "EndNode" };
        } else if (currentNode) {
          const kv = trimmed.match(/^(\w+):\s*(.+)/);
          if (kv) {
            if (kv[1] === "type") currentNode.type = kv[2]!.trim() as NodeType;
          }
        }
      }

      if (section === "edges") {
        if (trimmed.startsWith("- from:")) {
          if (currentEdge) def.edges.push(currentEdge as WorkflowEdge);
          currentEdge = { from: trimmed.slice(7).trim(), to: "end" };
        } else if (currentEdge) {
          const kv = trimmed.match(/^(\w+):\s*(.+)/);
          if (kv) {
            if (kv[1] === "to") currentEdge.to = kv[2]!.trim().replace(/^["']|["']$/g, "");
            if (kv[1] === "condition") currentEdge.condition = kv[2]!.trim().replace(/^["']|["']$/g, "");
          }
        }
      }
    }

    if (currentNode) def.nodes.push(currentNode as WorkflowNodeDef);
    if (currentEdge) def.edges.push(currentEdge as WorkflowEdge);

    return def;
  }
}

// ===== 全局单例 =====

let _engine: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!_engine) _engine = new WorkflowEngine();
  return _engine;
}

export function resetWorkflowEngine(): void {
  _engine = null;
}
