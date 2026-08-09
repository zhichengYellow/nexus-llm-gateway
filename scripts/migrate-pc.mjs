/**
 * 一次性迁移:provider_configs 旧结构(provider 主键) → 新结构(id 主键 + tenant_id)
 *
 * 背景: R13 将主键从 provider 改为 id + 新增 tenant_id(支持多租户 BYOK)。
 * drizzle push 无法在带数据/旧约束的表上完成该重建(42P16 drop constraint 失败)。
 * 本脚本检测旧表结构并 DROP(数据仅 provider key,迁移后需在控制台重配),随后
 * buildCommand 里的 `drizzle-kit push --force` 会用新 schema 重建空表。
 * 幂等: 新结构已存在时 no-op。
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate-pc] DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(url, { ssl: { rejectUnauthorized: false } });

try {
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='provider_configs'`;
  const names = cols.map((c) => c.column_name);
  if (!names.includes("id")) {
    console.log("[migrate-pc] old provider_configs detected (no id column) — dropping; drizzle push will recreate");
    await sql`DROP TABLE IF EXISTS provider_configs CASCADE`;
  } else {
    console.log("[migrate-pc] provider_configs already migrated — no-op");
  }
} catch (e) {
  console.error("[migrate-pc] failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
