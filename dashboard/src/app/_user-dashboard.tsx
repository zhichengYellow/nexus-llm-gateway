"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Line } from "recharts";
import { User, LogOut, Activity, Zap, Database, Server, KeyRound, ArrowUpRight } from "lucide-react";

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

export default function UserDashboard({ client, onLogout }: Props) {
  const [overview, setOverview] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [keySaving, setKeySaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "providers">("overview");

  const loadData = async () => {
    try {
      const [ov, tl, pk] = await Promise.all([
        client.getUserOverview(),
        client.getUserTimeline(),
        client.getUserProviderKeys().catch(() => ({ providers: [] })),
      ]);
      setOverview(ov);
      setTimeline(tl);
      setProviders(pk.providers || []);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <div className="text-blue-400 text-sm font-mono animate-pulse">loading dashboard...</div>
      </div>
    );
  }

  const day = overview?.today || {};
  const month = overview?.month || {};
  const cacheRate = overview?.cacheHitRate || "0.0%";

  return (
    <div className="min-h-screen bg-[#0A0D14] text-zinc-100">
      <header className="h-16 border-b border-zinc-800/60 bg-zinc-900/40 backdrop-blur-md flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
            <User className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">我的看板</span>
            <button onClick={() => setTab("overview")} className={`px-2 py-0.5 rounded text-xs ${tab === "overview" ? "bg-blue-500/10 text-blue-400" : "text-zinc-500 hover:text-zinc-300"}`}>概览</button>
            <button onClick={() => setTab("providers")} className={`px-2 py-0.5 rounded text-xs ${tab === "providers" ? "bg-blue-500/10 text-blue-400" : "text-zinc-500 hover:text-zinc-300"}`}>我的 Provider</button>
          </div>
        </div>
        {onLogout && (
          <button onClick={onLogout} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-400 transition px-2 py-1.5 rounded hover:bg-rose-500/10">
            <LogOut className="w-3.5 h-3.5" /> 退出
          </button>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm">
            {error}
            <button onClick={loadData} className="ml-2 underline">重试</button>
          </div>
        )}

        {tab === "overview" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: "今日请求", value: (day.requests || 0).toLocaleString(), sub: `${(day.cacheHits || 0)} 缓存命中`, icon: Activity, color: "#10B981" },
                { title: "今日 Token", value: (day.tokens || 0).toLocaleString(), sub: "消耗 tokens", icon: Zap, color: "#3B82F6" },
                { title: "缓存命中率", value: cacheRate, sub: "节省调用成本", icon: Database, color: "#8B5CF6" },
                { title: "本月 Token", value: (month.tokens || 0).toLocaleString(), sub: "BYOK 模式 · 不限配额", icon: Server, color: "#F59E0B" },
              ].map((s) => (
                <div key={s.title} className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-zinc-500">{s.title}</span>
                    <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${s.color}14`, color: s.color }}>
                      <s.icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">{s.value}</div>
                  <div className="text-xs text-zinc-500 mt-1">{s.sub}</div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm text-zinc-200">请求趋势</h3>
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />请求数</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />缓存命中</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timeline?.timeline || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.4} />
                  <XAxis dataKey="hour" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={formatBeijing} axisLine={{ stroke: "#27272a" }} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    labelFormatter={(v) => `北京时间 ${formatBeijing(v as string)}`}
                    formatter={(value: any, name: any) => [(value ?? 0).toLocaleString(), name]}
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="totalRequests" stroke="#3B82F6" strokeWidth={2} fill="url(#gUReq)" name="请求数" dot={false} />
                  <Line type="monotone" dataKey="cacheHits" stroke="#10B981" strokeWidth={1.5} dot={false} name="缓存命中" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-sm text-zinc-200">使用说明</h3>
              </div>
              <div className="space-y-1.5 text-sm text-zinc-400">
                <div>Base URL: <code className="bg-zinc-950/60 border border-zinc-800 px-2 py-0.5 rounded text-blue-400 text-xs">http://localhost:8787/v1</code></div>
                <div>Model: <code className="bg-zinc-950/60 border border-zinc-800 px-2 py-0.5 rounded text-violet-400 text-xs">deepseek-v4-flash</code></div>
                <div className="text-xs text-amber-400/80 mt-2">⚠️ BYOK 模式：请先在「我的 Provider」配置自己的 API Key，Nexus 不提供免费额度</div>
              </div>
            </div>
          </>
        )}

        {tab === "providers" && (
          <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-4 h-4 text-blue-400" />
              <h3 className="font-semibold text-sm text-zinc-200">我的 Provider API Key</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-4">配置你自己的 Provider API Key（AES-256-GCM 加密存储）。不配置则无法调用对应 Provider。</p>
            <div className="space-y-3">
              {["deepseek", "openai", "gemini", "ollama", "qwen", "moonshot", "zhipu"].map((p) => {
                const existing = providers.find((k) => k.provider === p);
                const saving = keySaving[p];
                return (
                  <div key={p} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800/60">
                    <div className="w-24 shrink-0">
                      <div className="text-sm text-zinc-200 font-medium capitalize">{p}</div>
                      <div className="text-[10px] mt-0.5">
                        {existing?.configured
                          ? <span className="text-emerald-400">已配置 · {existing.masked || "****"}</span>
                          : <span className="text-zinc-500">未配置</span>}
                      </div>
                    </div>
                    <input
                      type="password" value={keyInputs[p] ?? ""}
                      onChange={(e) => setKeyInputs((s) => ({ ...s, [p]: e.target.value }))}
                      className="flex-1 px-3 py-2 bg-zinc-950/60 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm font-mono focus:outline-none focus:border-blue-500/50"
                      placeholder={existing?.configured ? "输入新 Key 覆盖" : "输入 API Key"}
                    />
                    <button
                      onClick={async () => {
                        const val = (keyInputs[p] ?? "").trim();
                        setKeySaving((s) => ({ ...s, [p]: true }));
                        try {
                          if (val) await client.setUserProviderKey(p, val);
                          else await client.deleteUserProviderKey(p);
                          setKeyInputs((s) => ({ ...s, [p]: "" }));
                          loadData();
                        } catch (e) { setError((e as Error).message); }
                        finally { setKeySaving((s) => ({ ...s, [p]: false })); }
                      }}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition font-medium disabled:opacity-50 shrink-0"
                    >
                      {saving ? "保存中..." : "保存"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
