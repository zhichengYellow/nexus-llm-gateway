/**
 * Nexus LLM Gateway - 缓存引擎单元测试
 * 用 Vitest 覆盖核心纯函数：canonical / isCacheable / hash 碰撞 / TTL / SingleFlight 并发
 */
import { describe, it, expect } from "vitest";
import {
  canonicalText,
  isCacheable,
  cacheHash,
  classifyTtl,
  SemanticCache,
} from "./semantic-cache.js";
import type { ChatCompletionRequest } from "../../shared/types.js";

function mkReq(messages: Array<{ role: string; content: string }>, extra: Record<string, unknown> = {}): ChatCompletionRequest {
  return { model: "deepseek-v4-flash", messages: messages as any, ...extra } as ChatCompletionRequest;
}

describe("canonicalText（Prompt 标准化）", () => {
  it("trim + 空白折叠，使 ' 你好  ' 归一为 '你好'", () => {
    expect(canonicalText("  你好  ")).toBe("你好");
  });

  it("首尾语气标点剔除，'hello！' ≈ 'hello'", () => {
    expect(canonicalText("hello！")).toBe("hello");
    expect(canonicalText("hello!")).toBe("hello");
    expect(canonicalText("你好。")).toBe("你好");
    expect(canonicalText("真的吗？")).toBe("真的吗");
  });

  it("小写化，'HELLO' → 'hello'", () => {
    expect(canonicalText("HELLO")).toBe("hello");
  });

  it("中间代码符号保留，防止碰撞：'C++' 不会变 'c'、'1+1' 不会变 '11'", () => {
    expect(canonicalText("C++是什么")).toContain("c++");
    expect(canonicalText("1+1=?")).toContain("1+1");
    // 语义不同的词 canonical 后必须仍不同（False Positive 是最危险的）
    expect(canonicalText("C++是什么")).not.toBe(canonicalText("C 是什么"));
  });
});

describe("isCacheable（准入策略）", () => {
  it("空提示不缓存", () => {
    expect(isCacheable("", "")).toBe(false);
  });

  it("上下文指示词（继续/谢谢/ok）绝不缓存，防止命中旧上下文", () => {
    expect(isCacheable("继续", "继续")).toBe(false);
    expect(isCacheable("谢谢", "谢谢")).toBe(false);
    expect(isCacheable("ok", "ok")).toBe(false);
  });

  it("过短非问候语不缓存（闲聊打断）", () => {
    expect(isCacheable("嗯", "嗯")).toBe(false);
  });

  it("问候语允许缓存（hello/你好）", () => {
    expect(isCacheable("hello", "hello")).toBe(true);
    expect(isCacheable("你好", "你好")).toBe(true);
  });

  it("正常提问可缓存", () => {
    expect(isCacheable("请解释一下缓存是什么", "请解释一下缓存是什么")).toBe(true);
  });
});

describe("cacheHash（Provider/Model 隔离 + 参数分桶）", () => {
  it("不同 Provider 产生不同 key（DeepSeek vs OpenAI 不污染）", () => {
    const req = mkReq([{ role: "user", content: "你好" }]);
    expect(cacheHash(req, "deepseek-v4-flash", "deepseek")).not.toBe(
      cacheHash(req, "deepseek-v4-flash", "openai"),
    );
  });

  it("不同 Model 产生不同 key", () => {
    const req = mkReq([{ role: "user", content: "你好" }]);
    expect(cacheHash(req, "deepseek-v4-flash", "deepseek")).not.toBe(
      cacheHash(req, "deepseek-v4-pro", "deepseek"),
    );
  });

  it("temperature 分桶：0.71 与 0.72 命中同一 key（微小差异不破坏命中）", () => {
    const a = mkReq([{ role: "user", content: "你好" }], { temperature: 0.71 });
    const b = mkReq([{ role: "user", content: "你好" }], { temperature: 0.72 });
    expect(cacheHash(a, "m", "d")).toBe(cacheHash(b, "m", "d"));
  });

  it("标点变体（hello vs hello！）命中同一 key", () => {
    const a = mkReq([{ role: "user", content: "hello" }]);
    const b = mkReq([{ role: "user", content: "hello！" }]);
    expect(cacheHash(a, "m", "d")).toBe(cacheHash(b, "m", "d"));
  });
});

describe("classifyTtl（分类 TTL - Cache Policy）", () => {
  it("问候/常识类 → 最长 TTL（7天）", () => {
    expect(classifyTtl("你好", 86400)).toBe(7 * 86400);
    expect(classifyTtl("解释一下什么是缓存", 86400)).toBe(7 * 86400);
  });

  it("强时效（价格/行情）→ 30s", () => {
    expect(classifyTtl("比特币价格", 86400)).toBe(30);
  });

  it("天气 → 10min", () => {
    expect(classifyTtl("今天北京天气", 86400)).toBe(600);
  });

  it("新闻/最新 → 30min", () => {
    expect(classifyTtl("今天最新新闻", 86400)).toBe(1800);
  });

  it("时政 → 1h", () => {
    expect(classifyTtl("美国总统是谁", 86400)).toBe(3600);
  });

  it("未命中分类 → 默认 TTL", () => {
    expect(classifyTtl("abcd", 100)).toBe(100);
  });
});

describe("SemanticCache.deduplicate（SingleFlight 并发防击穿）", () => {
  it("同 key 并发只执行一次 fn，其余共享结果", async () => {
    const cache = new SemanticCache();
    let executions = 0;

    const work = async () => {
      executions++;
      // 模拟 50ms 上游耗时
      await new Promise((r) => setTimeout(r, 50));
      return "result";
    };

    // 10 个并发同 key 请求
    const results = await Promise.all(
      Array.from({ length: 10 }, () => cache.deduplicate("same-key", work)),
    );

    expect(results.every((r) => r === "result")).toBe(true);
    expect(executions).toBe(1); // 只打了一次上游
  });

  it("不同 key 互不影响，各自执行", async () => {
    const cache = new SemanticCache();
    let count = 0;

    // 每个 key 返回自己的次数（含 key 区分），验证独立执行
    const workA = async () => { count++; await new Promise((r) => setTimeout(r, 10)); return `A-${count}`; };
    const workB = async () => { count++; await new Promise((r) => setTimeout(r, 10)); return `B-${count}`; };

    const [a, b] = await Promise.all([
      cache.deduplicate("key-a", workA),
      cache.deduplicate("key-b", workB),
    ]);

    expect(count).toBe(2); // 两个独立 key 各执行一次
    expect(a).toContain("A");
    expect(b).toContain("B");
  });
});