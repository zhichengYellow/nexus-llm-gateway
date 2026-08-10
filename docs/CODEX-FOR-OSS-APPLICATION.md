# Codex for OSS — Application Text

> For submitting to Codex for OSS program. Each answer ≤500 characters.
> 2026-08-10 更新：真实 Benchmark 数据已提交（[benchmark-report.md](../benchmark/benchmark-report.md)），数字全部对齐当前状态（403 tests / v2.3.0）。

---

## Q1: Why does this repository qualify?（≤500 chars）

Nexus is an actively maintained open-source, OpenAI-compatible LLM gateway focused on reducing token consumption for individual developers through semantic caching, compression, request deduplication (SingleFlight), adaptive routing, and explainable savings metrics. It supports BYOK providers including OpenAI, DeepSeek, Gemini, Qwen, Moonshot, Zhipu and Ollama, with CI, 403+ automated tests, regular releases, and a publicly deployed instance.

## Q2: How will you use API credits?（≤500 chars）

I would use the credits as part of Nexus's ongoing open-source maintenance workflow: automated PR review, regression and security testing, issue investigation, release preparation, documentation updates, and CI-assisted refactoring. I also plan to use Codex to extend the reproducible benchmark suite (8 workloads × baseline vs 3 optimization profiles, with raw results committed to the repo) and improve the token-optimization pipeline while keeping tests and reproducible evaluation as release gates.

## Q3: Anything else?（≤500 chars）

Nexus is intentionally designed from an individual-developer perspective rather than as an enterprise billing platform. It uses BYOK, keeps users' provider credentials under their control, and exposes optimization results transparently instead of hiding them behind proprietary infrastructure. Real benchmark on DeepSeek shows 100% token reduction on repeated prompts (cache), 47.9% on long context, 33.5% on conversation — and ~0% on short prompts, where optimization is intentionally not forced. My goal is to make token efficiency a measurable, explainable property of an open-source gateway.

---

## 决策与检查

- Role: **Primary maintainer**
- Codex Security: ✅ 勾选（处理 API keys / provider credentials / 多租户隔离 / 认证授权，安全敏感项目）
- API Credits: ✅ 勾选（持续 coding + testing + security review + release maintenance）
- Apply at: https://openai.com/form/codex-for-oss/（官方申请入口）
- GitHub: **https://github.com/zhichengYellow/nexus-llm-gateway**（public）✅
- 证据链接：README 首屏 → Benchmark 摘要 → [benchmark-report.md](../benchmark/benchmark-report.md) + 原始数据 `benchmark/results/2026-08-10.json`
- 诚实原则：不声称 "production ready / used by thousands"；无证据不写

## 提交前检查（48h checklist 摘要）

- [x] repo public（zhichengYellow/nexus-llm-gateway）
- [x] README 英文首屏 + Project Status（CI/tests/releases/benchmark 徽章）
- [x] LICENSE（MIT）+ CONTRIBUTING + Issues 模板 + Discussions 引导
- [x] Releases ≥ v2.3.0（tag + GitHub Release）
- [x] 403+ tests / CI 绿
- [x] Benchmark 真实数据 + 方法学 + limitations + 原始数据（可复现）
- [ ] 提交申请（用上方三问，直接复制）
