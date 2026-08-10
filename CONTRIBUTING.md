# Contributing to Nexus LLM Gateway

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Prerequisites: Node.js >=20, Docker (for Postgres + Redis)

git clone https://github.com/bran-huang/nexus-llm-gateway.git
cd nexus-llm-gateway
npm install
docker compose up -d postgres redis
cp .env.example .env  # edit with your keys
npx drizzle-kit push --force
npm run seed
npm run dev
```

## Running Tests

Every change must pass the CI pipeline:

```bash
npm ci  # Clean install
npx tsc --noEmit       # TypeScript check (0 errors required)
npm test         # All tests must pass
```

## Code Standards

- **TypeScript strict mode** — `noUnusedLocals` + `noUnusedParameters` enabled
- **Import paths** — relative imports must have `.js` suffix (`from "../foo.js"`)
- **Type imports** — use `import type` for type-only imports
- **No unused variables** — unused imports/vars/params = compile error (prefix with `_` to exempt params)

## Commit Convention

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation
- `refactor:` — code restructuring
- `test:` — test additions/changes
- `chore:` — tooling/config

## Pull Request Checklist

- [ ] `npx tsc --noEmit` passes (0 errors)
- [ ] `npm test` all green
- [ ] New features include tests
- [ ] Documentation updated if needed
- [ ] Commit message follows convention

## Architecture

```
src/
├── shared/       # Config, logger, types, utils
├── providers/    # LLM provider implementations
├── optimizer/    # Core optimization pipeline
├── analytics/    # Stats, metrics, trends
├── server/       # API gateway (Hono)
└── extensions/   # Experimental/enterprise modules
```

## Core Principle

Every feature must answer three questions:
1. **TRR** — How many tokens does it save?
2. **CSR** — How much cost does it save?
3. **QPS** — Does it maintain quality?

If a feature doesn't improve at least one of these, it goes to `extensions/`.

## Questions?

Open a [Discussion](../../discussions) or [Issue](../../issues).
