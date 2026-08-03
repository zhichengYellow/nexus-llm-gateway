# 贡献指南

欢迎为 Nexus LLM Gateway 贡献代码！本文档将帮助你快速上手。

## 快速开始

```bash
git clone https://github.com/zhichengYellow/nexus-llm-gateway.git
cd nexus-llm-gateway
npm install
```

## 开发环境

- Node.js >= 20
- Docker（用于 PostgreSQL + Redis）
- TypeScript + Hono + Drizzle ORM

## 项目结构

```
src/
├── server/
│   ├── routes/          # API 路由（chat/embeddings/models/admin）
│   ├── middleware/       # 中间件（auth/pipeline/bulkhead/retry/...）
│   ├── providers/        # LLM Provider 适配器
│   ├── cache/            # 语义缓存引擎
│   ├── prompt/           # Prompt 处理（router/guard/rewrite/optimizer）
│   ├── dsl/              # DSL 引擎（router-dsl/policy-engine）
│   ├── workflow/         # Workflow 引擎
│   ├── compiler/         # Prompt 编译器
│   ├── event/            # 事件总线
│   ├── scheduler/        # 任务调度器
│   ├── judge/            # LLM Judge
│   ├── analytics/        # 分析引擎
│   ├── plugins/          # 插件系统
│   ├── config/           # 配置热加载
│   └── db/               # 数据库 Schema + Seed
├── shared/               # 共享类型/工具/日志
├── dashboard/            # Next.js 管理看板
├── benchmark/            # 基准测试脚本
├── cli/                  # CLI 工具
├── sdk/                  # TypeScript + Python SDK
├── examples/             # 接入示例
└── docs/                 # 文档 + ADR
```

## 提交规范

使用 Conventional Commits 格式：

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
refactor: 重构
test: 测试
chore: 构建/工具/配置
```

示例：
```bash
git commit -m "feat: add intent router for model=auto"
git commit -m "fix: cache hit rate calculation"
```

## 运行测试

```bash
# 全部测试（28 文件，250 用例）
npm test

# 监听模式
npm run test:watch

# 运行特定文件
npx vitest run src/server/middleware/pipeline.test.ts
```

## 添加新 Provider

1. 在 `src/server/providers/` 创建新文件
2. 继承 `OpenAiLikeProvider` 或实现 `ChatProvider` 接口
3. 在 `src/shared/types.ts` 的 `ProviderType` 中添加类型
4. 在 `src/server/providers/registry.ts` 中注册
5. 在 `.env.example` 中添加配置示例
6. 添加单元测试

## 添加新中间件

1. 在 `src/server/middleware/` 创建文件
2. 实现 `MiddlewareHandler` 接口（name/enabled/order/handler）
3. 在 `createDefaultPipeline()` 中注册
4. 添加单元测试

## 代码规范

- 使用 ESLint `eqeqeq` 规则（必须用 `===`）
- 所有新功能必须有对应测试
- TypeScript 严格模式
- 函数和类添加 JSDoc 注释

## 分支管理

- `main`：主分支，CI 全绿
- `feature/*`：功能分支
- `fix/*`：修复分支

## 提交流程

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/my-feature`
3. 编写代码和测试
4. 运行 `npm test` 确保全绿
5. 提交并推送
6. 创建 Pull Request

## 问题反馈

- [GitHub Issues](https://github.com/zhichengYellow/nexus-llm-gateway/issues)

## License

MIT
