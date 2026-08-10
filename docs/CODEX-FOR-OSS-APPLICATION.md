# Codex for OSS — Application Text

> For submitting to Codex for OSS program. Each answer ≤500 characters.

---

## Q1: What does your project do?

Nexus is an AI Cost Optimization Gateway. It sits between your app and LLM providers (OpenAI, DeepSeek, Gemini, etc.), automatically reducing token usage by 30-80% through prompt compression, semantic caching, request deduplication, and smart routing — while maintaining response quality ≥95%. OpenAI-compatible API. BYOK. Privacy-first with per-tenant isolation and encrypted key storage.

## Q2: What stage is the project at?

Actively developed, publicly deployed. 395+ automated tests across 53 files. CI/CD pipeline (GitHub Actions). Public Render deployment. v2.2.0 released with complete optimization pipeline: compression → cache → routing → cost control → quality evaluation. Dashboard with real-time savings metrics. Open registration (BYOK mode). Used daily for personal LLM cost optimization.

## Q3: How will Codex help?

Codex will accelerate feature development velocity — each optimization module (compression algorithms, cache strategies, routing decisions) requires careful implementation + testing + benchmarking. Codex enables rapid iteration on the token optimization pipeline while maintaining the strict quality bar (395+ tests, TypeScript strict mode, zero unused variables). Key areas: benchmark automation, new compression strategies, provider integration testing.

---

## Decision

- Role: Primary maintainer
- Codex Security: ✅ Acceptable
- API Credits: ✅ Acceptable
- Apply at: https://openai.com/codex-for-oss (when available)
- GitHub: https://github.com/bran-huang/nexus-llm-gateway (public)
