"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Line, BarChart, Bar } from "recharts";
import { User, LogOut, Activity, Zap, Database, Server, KeyRound, TrendingDown, Download, Gauge, Shield, List, Layers, PiggyBank } from "lucide-react";

interface Props {
  client: ApiClient;
  onLogout?: () => void;
}

function formatBeijing(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${(bj.getUTCHours()).toString().padStart(2, "0")}:${(bj.getUTCMinutes()).toString().padStart(2, "0")}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "从未使用";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86400_000)} 天前`;
}

const PROFILES = [
  { name: "fast", label: "极速模式", desc: "Prioritize response speed.", hint: "最低延迟" },
  { name: "balanced", label: "均衡模式", desc: "Recommended for most users.", hint: "质量与成本平衡" },
  { name: "cheap", label: "省钱模式", desc: "Reduce model cost aggressively.", hint: "优先便宜模型" },
  { name: "maximum_saving", label: "极致省钱", desc: "Maximum token reduction. May increase latency.", hint: "最大化节省" },
];

type TabId = "overview" | "requests" | "providers" | "keys" | "profile" | "privacy";

export default function UserDashboard({ client, onLogout }: Props) {
  const [overview, setOverview] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [keySaving, setKeySaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("overview");
  const [requests, setRequests] = useState<any[]>([]);
  const [reqHasMore, setReqHasMore] = useState(false);
  const [reqCursor, setReqCursor] = useState<string | null>(null);
  const [reqLoading, setReqLoading] = useState(false);
  const [speedResults, setSpeedResults] = useState<any[] | null>(null);
  const [speedLoading, setSpeedLoading] = useState(false);
  const [userKeys, setUserKeys] = useState<any[]>([]);
  const [activeProfile, setActiveProfile] = useState("balanced");

  const loadData = async () => {
    try {
      const [ov, tl, pk, uk] = await Promise.all([
        client.getUserOverview(),
        client.getUserTimeline(),
        client.getUserProviderKeys().catch(() => ({ providers: [] })),
        client.getUserKeys().catch(() => ({ keys: [] })),
      ]);
      setOverview(ov);
      setTimeline(tl);
      setProviders(pk.providers || []);
      setUserKeys(uk.keys || []);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async (cursor?: string) => {
    setReqLoading(true);
    try {
      const data = await client.getUserRequests(50, cursor ?? undefined);
      if (cursor) {
        setRequests((prev) => [...prev, ...data.requests]);
      } else {
        setRequests(data.requests);
      }
      setReqHasMore(data.hasMore);
      setReqCursor(data.nextCursor);
    } catch {}
    setReqLoading(false);
  };

  const handleExport = async () => {
    try {
      const csv = await client.exportUserUsage();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "nexus-usage.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tab === "requests") loadRequests();
  }, [tab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <div className="text-blue-400 text-sm font-mono animate-pulse">loading dashboard...</div>
      </div>
    );
  }

  const today = overview?.today || {};
  const month = overview?.month || {};
  const cacheRate = overview?.today?.cacheRate || "0.0%";
  const savedTokens = today.savedTokens || 0;
  const breakdown = today.savingsBreakdown || {};

  const NAV = [
    { id: "overview" as TabId, label: "概览", icon: Activity },
    { id: "requests" as TabId, label: "请求记录", icon: List },
    { id: "providers" as TabId, label: "我的 Provider", icon: Server },
    { id: "keys" as TabId, label: "我的 Key", icon: KeyRound },
    { id: "profile" as TabId, label: "优化档位", icon: Layers },
    { id: "privacy" as TabId, label: "隐私与安全", icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-[#0A0D14] text-zinc-100 flex">
      {/* 侧边导航 */}
      <aside className="w-48 bg-zinc-900/40 border-r border-zinc-800/60 backdrop-blur-md flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-4 h-16 border-b border-zinc-800/60">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
            <User className="w-4 h-4 text-blue-400" />
          </div>
          <span className="font-semibold text-sm">我的看板</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                tab === item.id ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}>
              <item.icon className="w-3.5 h-3.5" />{item.label}
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-zinc-800/60">
          {onLogout && (
            <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-rose-400 transition">
              <LogOut className="w-3.5 h-3.5" /> 退出
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm">
            {error}<button onClick={loadData} className="ml-2 underline">重试</button>
          </div>
        )}

        {/* ===== 概览 ===== */}
        {tab === "overview" && (
          <>
            {/* Hero：You saved */}
            <div className="bg-gradient-to-br from-emerald-500/5 to-blue-500/5 border border-emerald-500/10 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-emerald-400/80 uppercase tracking-wider font-medium">Today You Saved</span>
              </div>
              <div className="flex flex-wrap items-baseline gap-4 mt-1">
                <span className="text-3xl font-bold text-white">{formatNumber(savedTokens)}</span>
                <span className="text-sm text-emerald-400/80">Tokens</span>
                <span className="text-sm text-zinc-500">${today.savedCost || "0.00"}</span>
              </div>
              {/* 来源卡片 */}
              <div className="flex gap-4 mt-3 text-xs">
                {[
                  { label: "缓存", pct: 55, tokens: breakdown.cache, color: "#10B981" },
                  { label: "压缩", pct: 30, tokens: breakdown.compression, color: "#3B82F6" },
                  { label: "路由", pct: 15, tokens: breakdown.routing, color: "#8B5CF6" },
                ].filter((s) => (s.tokens || 0) > 0).map((s) => (
                  <span key={s.label} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />{s.label} {formatNumber(s.tokens || 0)}
                  </span>
                ))}
              </div>
            </div>

            {/* 指标卡 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: "今日请求", value: (today.requests || 0).toLocaleString(), sub: `${(today.cacheHits || 0)} 缓存命中`, color: "#10B981" },
                { title: "今日 Token", value: (today.tokens || 0).toLocaleString(), sub: "消耗 tokens", color: "#3B82F6" },
                { title: "缓存命中率", value: cacheRate, sub: "节省调用成本", color: "#8B5CF6" },
                { title: "本月 Token", value: (month.tokens || 0).toLocaleString(), sub: "BYOK · 不限配额", color: "#F59E0B" },
              ].map((s) => (
                <div key={s.title} className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 group">
                  <span className="text-xs text-zinc-500">{s.title}</span>
                  <div className="text-xl font-bold mt-1">{s.value}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* 趋势图 */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6">
              <h3 className="font-semibold text-sm text-zinc-200 mb-4">请求趋势</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timeline?.timeline || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.4} />
                  <XAxis dataKey="hour" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={formatBeijing} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", fontSize: 12 }} />
                  <Area type="monotone" dataKey="totalRequests" stroke="#3B82F6" strokeWidth={2} fill="url(#gUReq)" name="请求数" dot={false} />
                  <Line type="monotone" dataKey="cacheHits" stroke="#10B981" strokeWidth={1.5} dot={false} name="缓存命中" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button onClick={handleExport} className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition">
                <Download className="w-3.5 h-3.5" />导出用量 CSV
              </button>
            </div>
          </>
        )}

        {/* ===== 请求记录 ===== */}
        {tab === "requests" && (
          <div className="space-y-4">
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6">
              <h3 className="font-semibold text-sm text-zinc-200 mb-4">请求记录</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-zinc-500 border-b border-zinc-800/60">
                    <th className="text-left py-2 px-2">时间</th><th className="text-left py-2 px-2">模型</th><th className="text-left py-2 px-2">Provider</th>
                    <th className="text-right py-2 px-2">Token</th><th className="text-right py-2 px-2">节省</th>
                    <th className="text-right py-2 px-2">延迟</th><th className="text-center py-2 px-2">缓存</th>
                  </tr></thead>
                  <tbody>
                    {requests.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                        <td className="py-2 px-2 text-zinc-400">{formatBeijing(r.time)}</td>
                        <td className="py-2 px-2 text-zinc-300 font-mono">{r.model}</td>
                        <td className="py-2 px-2 text-zinc-500">{r.provider}</td>
                        <td className="py-2 px-2 text-right text-zinc-300">{r.tokens?.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-emerald-400">{r.savedTokens > 0 ? formatNumber(r.savedTokens) : "—"}</td>
                        <td className="py-2 px-2 text-right text-zinc-500">{r.latencyMs}ms</td>
                        <td className="py-2 px-2 text-center">{r.cached ? <span className="text-emerald-400">✓</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reqHasMore && (
                <button onClick={() => loadRequests(reqCursor ?? undefined)} disabled={reqLoading}
                  className="w-full mt-3 py-2 text-xs text-blue-400 hover:text-blue-300 transition">
                  {reqLoading ? "加载中..." : "加载更多"}
                </button>
              )}
              {requests.length === 0 && <div className="py-8 text-center text-zinc-600 text-sm">暂无请求记录</div>}
            </div>
          </div>
        )}

        {/* ===== 我的 Provider ===== */}
        {tab === "providers" && (
          <div className="space-y-4">
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-sm text-zinc-200">我的 Provider API Key</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">AES-256-GCM 加密存储。不配置则无法调用对应 Provider。</p>
                </div>
                <button onClick={async () => {
                  setSpeedLoading(true); setSpeedResults(null);
                  try { const r = await client.getUserSpeedTest(); setSpeedResults(r.results || []); } catch {}
                  setSpeedLoading(false);
                }} disabled={speedLoading}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-500 disabled:opacity-50 transition flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5" />{speedLoading ? "测速中..." : "测速"}
                </button>
              </div>
              {speedResults && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {speedResults.map((r: any) => (
                    <div key={r.provider} className={`p-2 rounded-lg text-xs border ${r.status === "ok" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-rose-500/5 border-rose-500/20 text-rose-400"}`}>
                      {r.provider}: {r.status === "ok" ? `${r.latencyMs}ms` : r.error || r.status}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-amber-400/80 mb-3">⚠️ 测速会向你的 Provider 发送小请求，消耗少量额度</p>
              <div className="space-y-2">
                {["deepseek", "openai", "gemini", "ollama", "qwen", "moonshot", "zhipu"].map((p) => {
                  const existing = providers.find((k) => k.provider === p);
                  const saving = keySaving[p];
                  return (
                    <div key={p} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/40 border border-zinc-800/60">
                      <div className="w-20 shrink-0 text-xs text-zinc-200 font-medium capitalize">{p}</div>
                      <input type="password" value={keyInputs[p] ?? ""}
                        onChange={(e) => setKeyInputs((s) => ({ ...s, [p]: e.target.value }))}
                        className="flex-1 px-2 py-1.5 bg-zinc-950/60 border border-zinc-700/50 rounded text-zinc-200 text-xs font-mono focus:outline-none focus:border-blue-500/50"
                        placeholder={existing?.configured ? `已配置 ${existing.masked || ""}` : "输入 API Key"} />
                      <button onClick={async () => {
                        const val = (keyInputs[p] ?? "").trim();
                        setKeySaving((s) => ({ ...s, [p]: true }));
                        try { if (val) await client.setUserProviderKey(p, val); else await client.deleteUserProviderKey(p);
                          setKeyInputs((s) => ({ ...s, [p]: "" })); loadData(); } catch (e) { setError((e as Error).message); }
                        finally { setKeySaving((s) => ({ ...s, [p]: false })); }
                      }} disabled={saving}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-500 disabled:opacity-50 shrink-0">
                        {saving ? "..." : "保存"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===== 我的 Key ===== */}
        {tab === "keys" && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6">
            <h3 className="font-semibold text-sm text-zinc-200 mb-4">我的 API Keys</h3>
            <div className="space-y-2">
              {userKeys.map((k: any) => (
                <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800/60">
                  <div className="flex-1">
                    <div className="text-sm text-zinc-200">{k.name}</div>
                    <div className="text-xs text-zinc-500">{k.keyPrefix}... · 创建于 {new Date(k.createdAt).toLocaleDateString()}</div>
                  </div>
                  <span className="text-xs text-zinc-500">{timeAgo(k.lastUsedAt)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${k.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                    {k.enabled ? "启用" : "禁用"}
                  </span>
                  <button onClick={async () => { await client.toggleUserKey(k.id); loadData(); }}
                    className={`text-xs px-2 py-1 rounded border ${k.enabled ? "text-amber-400 border-amber-500/20 hover:bg-amber-500/10" : "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"}`}>
                    {k.enabled ? "禁用" : "启用"}
                  </button>
                </div>
              ))}
              {userKeys.length === 0 && <div className="py-8 text-center text-zinc-600 text-sm">暂无 API Key</div>}
            </div>
          </div>
        )}

        {/* ===== 优化档位 ===== */}
        {tab === "profile" && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6">
            <h3 className="font-semibold text-sm text-zinc-200 mb-4">优化档位</h3>
            <div className="grid grid-cols-2 gap-3">
              {PROFILES.map((p) => (
                <button key={p.name} onClick={() => setActiveProfile(p.name)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    activeProfile === p.name ? "bg-blue-500/10 border-blue-500/20" : "bg-zinc-800/40 border-zinc-700/50 hover:border-zinc-600"
                  }`}>
                  <div className="text-sm font-medium text-zinc-200">{p.label}</div>
                  <div className="text-xs text-zinc-500 mt-1">{p.desc}</div>
                  <div className="text-[10px] text-zinc-600 mt-1">{p.hint}</div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-600 mt-3">档位影响压缩强度、缓存策略和路由倾向。通过请求头 <code className="bg-zinc-800 px-1 rounded">x-nexus-profile</code> 可动态切换。</p>
          </div>
        )}

        {/* ===== 隐私与安全 ===== */}
        {tab === "privacy" && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-sm text-zinc-200">隐私与安全</h3>
            {[
              { title: "Provider Key 加密存储", desc: "所有 Provider API Key 使用 AES-256-GCM 加密存储于数据库，仅脱敏展示。仅用于向对应 Provider 发送请求。" },
              { title: "请求元数据", desc: "仅存储请求元数据（时间/模型/Provider/Token/延迟/状态），不存储 prompt 和 response 内容。" },
              { title: "租户隔离", desc: "你的所有数据（用量/请求/Key/Provider 配置）严格按租户隔离，其他用户无法访问。" },
              { title: "Master 访问限制", desc: "Master Key 无法通过用户 API 访问你的数据。管理员仅可查看聚合统计。" },
              { title: "数据导出与删除", desc: "支持导出用量 CSV。如需删除账号数据，请联系管理员。" },
            ].map((item) => (
              <div key={item.title} className="p-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
                <div className="text-sm text-zinc-200 font-medium">{item.title}</div>
                <div className="text-xs text-zinc-500 mt-1">{item.desc}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
