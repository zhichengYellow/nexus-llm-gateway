# ADR 002: 缓存引擎使用 PostgreSQL + pgvector

- **状态**: ✅ 已采纳
- **日期**: 2025-01
- **决策者**: Nexus Team

## 背景

LLM Gateway 需要语义缓存能力，能够对相似但不完全相同的 Prompt 返回缓存结果。需要选择缓存存储方案。

## 决策

选择 **PostgreSQL + pgvector 扩展**作为语义缓存的存储层。

## 理由

1. **统一数据存储**：项目已使用 PostgreSQL 作为主数据库，缓存复用同一实例降低运维复杂度
2. **pgvector 支持向量搜索**：`vector(1536)` 类型 + IVFFlat 索引支持高效的余弦相似度搜索
3. **ACID 保证**：缓存写入与用量记录可在同一事务中完成
4. **成熟稳定**：PostgreSQL 是经过验证的生产级数据库，pgvector 已被广泛使用

## 替代方案

### Redis + 向量模块
- ✅ 读取速度更快
- ❌ 额外运维负担
- ❌ 持久化不如 PostgreSQL 可靠

### 专用向量数据库 (Pinecone/Weaviate)
- ✅ 向量搜索性能最优
- ❌ 额外服务依赖和成本
- ❌ 对于 Gateway 场景过度设计

## 影响

- `semantic_cache` 表包含 `embedding vector(1536)` 列
- 缓存查询使用 `key_hash` 精确匹配（无需实际调用向量搜索，因为已用 Canonical Key 去重）
- 向量字段保留为未来语义相似度搜索预留
