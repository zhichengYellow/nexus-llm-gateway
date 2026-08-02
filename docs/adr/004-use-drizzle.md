# ADR 004: 使用 Drizzle ORM 而非 Prisma

- **状态**: ✅ 已采纳
- **日期**: 2025-01
- **决策者**: Nexus Team

## 背景

需要选择一个 TypeScript ORM 来操作 PostgreSQL 数据库。候选方案包括 Prisma、Drizzle ORM、TypeORM。

## 决策

选择 **Drizzle ORM**。

## 理由

1. **SQL-like API**：Drizzle 的查询语法接近原生 SQL，可读性强，学习成本低
2. **零运行时依赖**：Drizzle 在编译时生成 SQL，无反射开销
3. **类型安全**：完整的 TypeScript 类型推断，Schema 定义即类型
4. **轻量**：包体积小（~100KB vs Prisma ~5MB），安装速度快
5. **迁移灵活**：`drizzle-kit push` 可直接同步 Schema 到数据库，适合快速迭代

## 替代方案

### Prisma
- ✅ 生态成熟，文档丰富
- ❌ 引擎层是 Rust 二进制，增加部署复杂度
- ❌ 生成的客户端代码量大
- ❌ `prisma migrate` 需要生成迁移文件，不够灵活

### TypeORM
- ✅ 功能全面（Active Record / Data Mapper）
- ❌ 装饰器语法与 ESM 兼容性差
- ❌ 维护活跃度下降

## 影响

- Schema 定义在 `src/server/db/schema.ts`，使用 `pgTable()` 定义
- 迁移使用 `drizzle-kit push`（开发）或 `drizzle-kit generate` + `drizzle-kit migrate`（生产）
- 所有数据库操作通过 `db.select().from().where()` 链式调用
