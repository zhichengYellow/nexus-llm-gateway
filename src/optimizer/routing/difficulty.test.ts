import { describe, it, expect } from "vitest";
import { scoreDifficulty, pickStrongModel, pickCheapModel } from "./difficulty.js";

describe("scoreDifficulty 难度感知", () => {
  it("简单问候 → simple", () => {
    const r = scoreDifficulty("你好");
    expect(r.level).toBe("simple");
    expect(r.score).toBeLessThan(25);
  });

  it("短问答 → simple/standard", () => {
    const r = scoreDifficulty("用一句话解释什么是反向传播");
    expect(["simple", "standard"]).toContain(r.level);
  });

  it("长代码重构 → hard", () => {
    const prompt = `
请帮我重构下面这个函数,它有很多 bug,需要分析和优化性能:
\`\`\`typescript
async function processData(items: any[], config: any) {
  const results = [];
  for (const item of items) {
    try {
      const r = await fetch(config.url, { method: "POST", body: JSON.stringify(item) });
      if (r.status !== 200) throw new Error("failed");
      results.push(await r.json());
    } catch (e) {
      console.error("error processing", item.id, e);
    }
  }
  return results;
}
\`\`\`
请分析这个函数的复杂度、异常处理问题,并设计一个更高效的实现,解释为什么你的方案更好。
`;
    const r = scoreDifficulty(prompt);
    expect(r.level).toBe("hard");
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it("多信号推理问题 → hard", () => {
    const prompt = `
这是一个架构评审任务,请认真分析以下系统设计并给出完整评估。

背景: 我们有一个分布式事件处理系统,每秒处理 50 万条消息,需要保证数据不丢失、顺序一致,同时控制成本。现有方案使用了消息队列 + 批处理,但延迟波动大,出错率在高峰期达到 3%。

请执行以下任务:
1. 分析当前架构的性能瓶颈,证明你的判断(给出复杂度分析);
2. 评估三种备选方案(事件溯源 / 分区流处理 / 混合架构)的优劣,对比它们在吞吐、一致性、运维复杂度上的差异;
3. 设计一个改进方案,解释为什么你的设计优于现有方案,并说明如何在保证数据不丢失的前提下优化性能;
4. 分析新方案的错误处理和回滚机制,评估故障恢复时间。

请给出详细的架构设计文档级别的回答。
`;
    const r = scoreDifficulty(prompt);
    expect(r.level).toBe("hard");
  });
});

describe("pickStrongModel / pickCheapModel", () => {
  it("deepseek 强模型是 v4-pro(价格最高)", () => {
    expect(pickStrongModel("deepseek")).toBe("deepseek-v4-pro");
  });

  it("deepseek 便宜模型是 v4-flash", () => {
    expect(pickCheapModel("deepseek")).toBe("deepseek-v4-flash");
  });

  it("gemini 强模型是 2.0-flash", () => {
    expect(pickStrongModel("gemini")).toBe("gemini-2.0-flash");
  });
});
