import { describe, it, expect, beforeEach } from "vitest";
import { AdaptiveContext, resetAdaptiveContext } from "./adaptive-context.js";

beforeEach(() => resetAdaptiveContext());

function mkMsg(role: string, content: string) {
  return { role, content } as any;
}

describe("AdaptiveContext", () => {
  it("问候语检测 → history=0", () => {
    const ac = new AdaptiveContext();
    const result = ac.analyze([mkMsg("user", "你好")]);
    expect(result.type).toBe("greeting");
    expect(result.keepHistoryRounds).toBe(0);
  });

  it("继续检测 → 保留全历史", () => {
    const ac = new AdaptiveContext();
    const result = ac.analyze([
      mkMsg("user", "之前的问题"),
      mkMsg("assistant", "回答"),
      mkMsg("user", "继续"),
    ]);
    expect(result.type).toBe("continuation");
    expect(result.keepHistoryRounds).toBeGreaterThan(5);
  });

  it("新对话检测 → history=0", () => {
    const ac = new AdaptiveContext();
    const result = ac.analyze([mkMsg("user", "什么是 Docker")]);
    expect(result.type).toBe("new_conversation");
    expect(result.keepHistoryRounds).toBe(0);
  });

  it("代码请求 → 少量历史", () => {
    const ac = new AdaptiveContext();
    const result = ac.analyze([mkMsg("user", "```python\ndef hello():\n    pass\n```")]);
    expect(result.type).toBe("code");
    expect(result.keepHistoryRounds).toBeLessThanOrEqual(2);
  });

  it("filterHistory 截断", () => {
    const ac = new AdaptiveContext();
    const msgs = [];
    for (let i = 0; i < 10; i++) {
      msgs.push(mkMsg("user", `问题${i}`));
      msgs.push(mkMsg("assistant", `回答${i}`));
    }
    const result = ac.analyze(msgs);
    expect(result.filteredMessages.length).toBeLessThan(msgs.length);
  });
});
