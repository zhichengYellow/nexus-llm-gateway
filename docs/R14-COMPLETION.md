# R14+ Completion Report（Token Optimization 产品化）

> 2026-08-09 · 版本 v2.3.0 · 与 R14 任务书逐项对照（ALREADY IMPLEMENTED 已核实）

## 1. 已完成任务

| 任务 | 状态 | 说明 |
|---|---|---|
| R14-1 用户端测速 | ✅ | `POST /user/speed-test`，租户自己的 key，并发/冷却防滥用 |
| R14-2 请求记录 + 分页 | ✅ | `GET /user/requests`（cursor，数据库层 tenantId 过滤） |
| R14-3 节省统计 | ✅ | overview 含节省字段；来源拆分见 R14-7 归因 |
| R14-4 用量导出 | ✅ | `GET /user/export?format=csv` |
| R14-5 我的 Key + LastUsed | ✅ | `GET /user/keys` + toggle |
| R14-6 接入体验 | ✅ | 注册引导 + Base URL/curl/Python + 档位说明 |
| R14-7 Savings Engine | ✅ | `src/analytics/savings-attribution.ts`（互斥归因 + ACTUAL/ESTIMATED） |
| R14-8 Explainability | ✅ | `GET /user/requests/:id` + 前端详情面板 |
| R14-9 Profile 产品化 | ✅ | 4 档真正影响压缩（chat.ts:98/145）与路由 |
| R14-10 Privacy Center | ✅ | 用户端 privacy tab + 真实文案 |
| R14-11 Data Integrity | ✅ | 缓存节省落库修复 + SingleFlight waiter 不重复计费；失败/重试不记账 |
| R14-12 一致性/测试/文档 | ✅ | 无 fake 数据；归因 6 测试；README/CHANGELOG 更新；本报告 |
| R15 注册逻辑完善 | ✅ | 中文报错、表单重置、退出回登录页、校验测试 |
| 安全加固 | ✅ | Provider Key 加密、日志脱敏、/metrics 鉴权、DELETE 真移除、闲置清理 |

## 2. 新增 API（均 tenant 隔离）

| Endpoint | Method | 用途 | 权限 |
|---|---|---|---|
| `/auth/register` | POST | 注册（开关 REGISTRATION_ENABLED） | 公开 |
| `/user/speed-test` | POST | 测速（自己 key） | API Key |
| `/user/requests` | GET | 请求列表（cursor） | API Key |
| `/user/requests/:id` | GET | 请求详情 + 归因 | API Key |
| `/user/keys` | GET | 我的 Gateway Key | API Key |
| `/user/keys/:id/toggle` | PATCH | 启停 Key | API Key |
| `/user/export` | GET | 用量 CSV | API Key |
| `/user/providers/keys` | GET/POST | 我的 Provider Key | API Key |
| `/admin/optimization/switches` | GET/PUT | 优化开关 | Master |

## 3. 数据库变化

- `provider_configs`：主键 provider → `id`(uuid) + 新增 `tenant_id`（迁移脚本 `scripts/migrate-pc.mjs`，幂等）
- 新增表：`optimization_settings`（优化开关单行）、`auth 相关`（tenants/api_keys 已有）
- 索引：`usage_logs(tenant_id, created_at)` 已有
- **零新增归因字段**：Savings 归因由 `savings-attribution.ts` 从现有字段派生（cached/compressionRatio/routerReason/savedTokens/savedCostMicro）

## 4. Savings Engine 公式

```
savedTokens   = usageLogs.savedTokens   （压缩 + 缓存节省）
savedCostMicro= usageLogs.savedCostMicro（真实价格表 × 节省 token）
costMicro     = usageLogs.costMicro      （真实价格表 × 实际 token；缓存/waiter 为 0）
reductionRate = savedTokens / (totalTokens + savedTokens)
```

缓存命中：`usage` 用缓存响应的真实 usage（修复前为 0），`cached=true` → costMicro=0、节省=全部。
SingleFlight waiter：`usage` 置空 → 不重复计费。

## 5. Attribution（防 double counting）

互斥优先级（`attributeSavings`）：**CACHE → COMPRESSION → ROUTING → REWRITE → NONE**
- 缓存命中时即使压缩比/路由原因有值，也只归 CACHE
- 压缩节省（compressionRatio>0）归 COMPRESSION
- 仅剩路由决策（routerReason 含 cost/cheap 等）归 ROUTING
- `summarizeSavings` 按来源分组，总节省 = 各来源之和（无重叠）

## 6. ACTUAL / ESTIMATED / PROJECTED

- **ACTUAL**：CACHE / COMPRESSION（真实避免的上游 token，来自真实 usage 差值）
- **ESTIMATED**：ROUTING（基于路由决策推算，kind 字段标注）
- **PROJECTED**：未实现（无预测功能；不做假预测）
- 前端展示区分：详情面板显示 `(ACTUAL)` / `(ESTIMATED)`

## 7. Privacy

- 用户端点全部 `tenantId` 过滤；越权访问 `/admin` → 403
- 请求详情/列表**只返回元数据**（无 prompt/response/content）
- Provider Key AES-256-GCM 加密，GET 只返回脱敏值；日志全局 redact
- 无远程遥测；`/metrics` 需 master key

## 8. Tests

```
Before: 385 tests / 51 files
After:  401 tests / 54 files
```
新增：归因 6 用例（缓存优先/压缩/路由/多优化不重复/无优化/缓存+压缩共存）、auth 注册 5 用例、开关 4 用例、清理 4 用例。

## 9. Git Commits（本阶段）

```
724f29c feat(dashboard): 重构用户面板并新增请求记录、Key 管理和优化档位页面
2f45463 chore: 修正 R14-7/8/11/12 虚标(已核实未完成,改回 TODO)
640c1f2 feat(savings): 本地完成 R14-7/8/11 —— Savings 归因闭环 + 缓存节省修复
<本次>   fix(savings): SingleFlight waiter 不重复计费 + R14-12 文档
```

## 10. CI

- `npx tsc --noEmit`：0 错误
- `npm test`：401/401 通过（54 文件）
- dashboard `tsc`：0 错误
- 云端：Render 网关 + Dashboard 均部署 v2.3.0（autoDeploy）

## 11. Remaining Risks（诚实列出）

1. **SingleFlight waiter 仍记一条 usage 记录**（costMicro=0/savedTokens=0）——不会重复计费，但 waiter 在请求列表显示"0 token"，与 origin 记录并存，语义上可优化为合并展示。
2. **ROUTING 归因为 ESTIMATED**：路由节省基于 routerReason 推断，无独立 baseline model 对照，数值为保守估算。
3. **缓存节省依赖缓存响应自带 usage**：若上游响应缺 usage 字段（部分 provider），缓存命中节省会偏低（记 0）。
4. **优化开销（Optimization Overhead）未实现**：Total 延迟 = 优化 + provider 的拆分未做，Net Saving 未展示。
5. 注册密码不落库（登录凭证为 API Key，tenants 无 password 列）——如需密码登录需另立任务。

## 12. 下一阶段建议（仅建议）

1. **Optimization Overhead 计量**（R14-17）：pipeline 内记录优化阶段耗时，Total/Provider/Optimization 三分展示
2. **SingleFlight waiter 合并展示**：请求列表对去重 waiter 打 `dedup` 徽标
3. **PROJECTED 月度预测**：基于 usage 趋势做本月节省预测（明确标注 estimated）
4. 用户端概览「本月节省」按来源拆分图（复用 summarizeSavings）
5. 云端演示数据清理 + demo 账号轮换
