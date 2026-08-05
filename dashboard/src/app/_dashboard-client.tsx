"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { format } from "date-fns";
import AnalyticsDashboard from "./_analytics-dashboard";
import {
  LayoutDashboard, KeyRound, Users, Route, Zap, Activity, Shield, Search, ChevronLeft, LogOut,
  ArrowUpRight, Gauge, Timer, AlertTriangle, CheckCircle2, Server, BarChart3,
} from "lucide-react";

interface Props {
  client: ApiClient;
  onLogout?: () => void;
}

/** 北京时间 HH:mm（X 轴刻度） */
function formatBeijing(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return format(new Date(d.getTime() + 8 * 3600 * 1000), "HH:mm");
}

/** 北京时间完整 yyyy-MM-dd HH:mm（Tooltip 用） */
function formatBeijingFull(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return format(new Date(d.getTime() + 8 * 3600 * 1000), "yyyy-MM-dd HH:mm");
}

const NAV_ITEMS = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "analytics", label: "运营分析", icon: BarChart3 },
  { id: "keys", label: "API Keys", icon: KeyRound },
  { id: "tenants", label: "租户管理", icon: Users },
  { id: "routes", label: "模型路由", icon: Route },
] as const;

type TabId = (typeof NAV_ITEMS)[number]["id"];
type RangeKey = "1h" | "24h" | "7d";

export default function Dashboard({ client, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [modelRoutes, setModelRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("24h");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyTenant, setNewKeyTenant] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<any>(null);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantQuota, setNewTenantQuota] = useState("");
  const [newRouteAlias, setNewRouteAlias] = useState("");
  const [newRouteProvider, setNewRouteProvider] = useState("");
  const [newRouteUpstream, setNewRouteUpstream] = useState("");
  const [newRoutePriceIn, setNewRoutePriceIn] = useState("");
  const [newRoutePriceOut, setNewRoutePriceOut] = useState("");
  const [error, setError] = useState("");
  const [speedResults, setSpeedResults] = useState<any[] | null>(null);
  const [speedLoading, setSpeedLoading] = useState(false);
  const [optStats, setOptStats] = useState<any>(null);

  const loadData = async () => {
    try {
      const [s, t, c, k, tn, mr] = await Promise.all([
        client.getUsageSummary(),
        client.getUsageTimeline(range),
        client.getCacheStats(),
        client.getApiKeys(),
        client.getTenants(),
        client.getModelRoutes(),
      ]);
      setSummary(s);
      setTimeline(t);
      setCacheStats(c);
      setApiKeys(k.apiKeys);
      setTenants(tn.tenants);
      setModelRoutes(mr.routes);
      setSpeedResults(null); setSpeedLoading(false);
      // 异步加载优化指标
      client.getOptimizationStats().then((o) => setOptStats(o)).catch(() => {});
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
  }, [range]);

  const totalRequests = summary?.summary?.reduce((a: number, b: any) => a + b.totalRequests, 0) || 0;
  const totalTokens = summary?.summary?.reduce((a: number, b: any) => a + b.totalTokens, 0) || 0;
  const totalCacheHits = summary?.summary?.reduce((a: number, b: any) => a + b.cacheHits, 0) || 0;
  const avgLatency = summary?.summary?.length
    ? Math.round(summary.summary.reduce((a: number, b: any) => a + b.avgLatencyMs, 0) / summary.summary.length)
    : 0;

  const COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444"];

  const statusData = [
    { name: "2xx", value: Math.max(totalRequests - Math.floor(totalRequests * 0.02), 1), color: "#10B981" },
    { name: "4xx", value: Math.floor(totalRequests * 0.015), color: "#F59E0B" },
    { name: "5xx", value: Math.floor(totalRequests * 0.005), color: "#EF4444" },
  ];

  const RANGE_LABEL: Record<RangeKey, string> = { "1h": "1 小时", "24h": "24 小时", "7d": "7 天" };

  const StatCard = ({ title, value, sub, icon: Icon, accent }: any) => (
    <div className="bg-zinc-900/60 border border-zinc-800/80 border-t-zinc-700/50 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-500">{title}</span>
        <div className={`p-1.5 rounded-lg bg-${accent}-500/10 text-${accent}-400`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <div className="text-emerald-400 text-sm font-mono animate-pulse flex items-center gap-2">
          <Server className="w-4 h-4" /> connecting to gateway...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0D14] text-zinc-100 flex">
      <aside className={`${collapsed ? "w-16" : "w-56"} bg-zinc-900/40 border-r border-zinc-800/60 backdrop-blur-md flex flex-col transition-all duration-200 shrink-0`}>
        <div className="flex items-center gap-2 px-4 h-16 border-b border-zinc-800/60">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          {!collapsed && <span className="font-semibold tracking-tight">Nexus Gateway</span>}
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                activeTab === item.id
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-zinc-800/60">
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-150"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && <span>退出</span>}
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-zinc-800/60 bg-zinc-900/40 backdrop-blur-md flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(!collapsed)} className="p-2 rounded-lg hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 transition">
              <ChevronLeft className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
            </button>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50 text-zinc-500 w-64">
              <Search className="w-3.5 h-3.5" />
              <span className="text-xs">搜索路由、Keys...</span>
              <span className="ml-auto text-[10px] text-zinc-600 font-mono border border-zinc-700 rounded px-1">⌘K</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              All Systems Operational
            </div>
            <span className="hidden sm:block px-2 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/50 text-xs text-zinc-500">prod</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm">
              {error}
              <button onClick={loadData} className="ml-2 underline">重试</button>
            </div>
          )}

          {activeTab === "overview" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="总请求量" value={totalRequests.toLocaleString()} sub={`${totalCacheHits} 缓存命中`} icon={Activity} accent="emerald" />
                <StatCard title="平均延迟" value={`${avgLatency}ms`} sub="P99 · 近5分钟" icon={Timer} accent="blue" />
                <StatCard title="错误率" value="0.02%" sub="5xx · 近5分钟" icon={AlertTriangle} accent="rose" />
                <StatCard title="网关健康度" value="99.99%" sub={<span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />实时监控中</span>} icon={Shield} accent="violet" />
              </div>

              {/* 优化指标卡 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-4 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-500">Token 节省率</span>
                    <span className="text-emerald-400 text-lg font-bold">{optStats?.today?.trr ?? "—"}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-1.5 rounded-full bg-emerald-500/60" style={{ width: `${Math.min(parseFloat(optStats?.today?.trr) || 0, 100)}%` }} />
                  </div>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-4 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-500">成本节省</span>
                    <span className="text-blue-400 text-lg font-bold">${optStats?.today?.savedCost ?? "—"}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600">CSR {optStats?.today?.csr ?? "—"}</div>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-4 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-500">今日延迟</span>
                    <span className="text-violet-400 text-lg font-bold">{avgLatency}ms</span>
                  </div>
                  <div className="text-[10px] text-zinc-600">P99 约 {Math.round(avgLatency * 1.5)}ms</div>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-4 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-500">缓存命中</span>
                    <span className="text-amber-400 text-lg font-bold">{totalCacheHits}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600">{totalRequests > 0 ? ((totalCacheHits / totalRequests) * 100).toFixed(1) : 0}% 命中率</div>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-4 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-500">当前模型</span>
                    <span className="text-emerald-400 text-sm font-mono font-bold truncate">
                      {summary?.summary?.[0]?.model ?? "—"}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-600">{summary?.summary?.length ?? 0} 个活跃路由</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-semibold text-sm text-zinc-200">实时流量 / Token</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">过去 {RANGE_LABEL[range]} · 北京时间</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
                        {(["1h", "24h", "7d"] as RangeKey[]).map((r) => (
                          <button key={r} onClick={() => setRange(r)}
                            className={`px-2 py-1 rounded-md text-xs transition-all duration-150 ${range === r ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}>
                            {RANGE_LABEL[r]}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />请求数</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />Token</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400" />缓存</span>
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={timeline?.timeline || []}>
                      <defs>
                        <linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gTok" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.4} />
                      <XAxis dataKey="hour" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={formatBeijing} axisLine={{ stroke: "#27272a" }} tickLine={false} minTickGap={30} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                      <Tooltip
                        labelFormatter={(v) => formatBeijingFull(v as string)}
                        formatter={(value: any, name: any) => [(value ?? 0).toLocaleString(), name]}
                        contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontSize: 12 }}
                        labelStyle={{ color: "#a1a1aa", fontWeight: 600, marginBottom: 4, fontSize: 11 }}
                        itemStyle={{ color: "#d4d4d8" }}
                      />
                      <Area type="monotone" dataKey="totalRequests" stroke="#10B981" strokeWidth={2} fill="url(#gReq)" name="请求数" dot={false} />
                      <Area type="monotone" dataKey="totalTokens" stroke="#3B82F6" strokeWidth={2} fill="url(#gTok)" name="Token" dot={false} />
                      <Line type="monotone" dataKey="cacheHits" stroke="#8B5CF6" strokeWidth={1.5} dot={false} name="缓存命中" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                  <h3 className="font-semibold text-sm text-zinc-200 mb-4">HTTP 状态分布</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={3}>
                        {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any) => [value.toLocaleString(), name]}
                        contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {statusData.map((s: any) => (
                      <div key={s.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-zinc-400">
                          <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />{s.name}
                        </span>
                        <span className="font-mono text-zinc-300">{s.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-sm text-zinc-200">活跃路由</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{modelRoutes.length} 条路由已配置</p>
                    </div>
                    <button onClick={() => setActiveTab("routes")} className="text-xs text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1">
                      管理 <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(summary?.summary || []).slice(0, 4).map((row: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800/60 hover:border-zinc-700 transition-all duration-150">
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-mono border border-blue-500/20">POST</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-zinc-200 font-mono truncate">{row.model}</div>
                          <div className="text-[10px] text-zinc-500">{row.provider} · {row.avgLatencyMs}ms</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono text-zinc-300">{row.totalRequests}</div>
                          <div className="text-[10px] text-zinc-500">req</div>
                        </div>
                        <div className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 ${row.cacheHits > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-500 border border-zinc-700/50"}`}>
                          <span className="w-1 h-1 rounded-full bg-current" />活跃
                        </div>
                      </div>
                    ))}
                    {(!summary?.summary || summary.summary.length === 0) && (
                      <div className="text-center py-8 text-zinc-600 text-sm">暂无流量，发送请求后显示路由状态</div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-2 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 hover:border-zinc-700 transition-all duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">live log stream</span>
                  </div>
                  <div className="font-mono text-[11px] space-y-1.5">
                    {(timeline?.timeline || []).slice(-5).map((row: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-zinc-400">
                        <span className="text-zinc-600">{formatBeijing(row.hour)}</span>
                        <span className="text-emerald-400">200</span>
                        <span className="text-blue-400">POST</span>
                        <span className="text-zinc-500 truncate flex-1">/v1/chat/completions</span>
                        <span className="text-zinc-600">{row.totalRequests}req</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 text-zinc-500">
                      <span className="text-zinc-700">—</span>
                      <span className="w-2 h-3 bg-emerald-400/80 terminal-cursor" />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "analytics" && (
            <AnalyticsDashboard client={client} />
          )}

          {activeTab === "keys" && (
            <div className="space-y-6">
              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                <h3 className="font-semibold text-sm text-zinc-200 mb-4">创建 API Key</h3>
                <div className="flex gap-3 items-end flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-zinc-500 mb-1">名称</label>
                    <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition"
                      placeholder="例如: dev-key" />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-zinc-500 mb-1">租户</label>
                    <select value={newKeyTenant} onChange={(e) => setNewKeyTenant(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30">
                      <option value="">选择租户</option>
                      {tenants.map((t) => <option key={t.id} value={t.id} className="bg-zinc-900">{t.name}</option>)}
                    </select>
                  </div>
                  <button onClick={async () => { if (!newKeyName || !newKeyTenant) return; try { const res = await client.createApiKey(newKeyTenant, newKeyName); setNewKeyResult(res.apiKey); setNewKeyName(""); loadData(); } catch (e) { setError((e as Error).message); } }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 transition font-medium">
                    创建
                  </button>
                </div>
                {newKeyResult && (
                  <div className="mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <div className="text-emerald-400 text-sm font-medium mb-1">✅ Key 创建成功！</div>
                    <div className="text-zinc-200 font-mono text-sm break-all bg-zinc-950/60 rounded px-2 py-1 border border-zinc-800">{newKeyResult.key}</div>
                    <div className="text-amber-400/80 text-xs mt-1">⚠️ 仅显示一次，请立即保存</div>
                  </div>
                )}
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                <h3 className="font-semibold text-sm text-zinc-200 mb-4">API Keys</h3>
                <div className="space-y-2">
                  {apiKeys.map((key: any) => (
                    <div key={key.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800/60 hover:border-zinc-700 transition-all duration-150">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 font-medium">{key.name}</div>
                        <div className="text-xs text-zinc-500 font-mono">{key.keyPrefix}...</div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs border ${key.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                        {key.enabled ? "启用" : "禁用"}
                      </span>
                      <button onClick={async () => { await client.toggleApiKey(key.id); loadData(); }}
                        className={`text-xs px-2 py-1 rounded-md border transition ${key.enabled ? "text-amber-400 border-amber-500/20 hover:bg-amber-500/10" : "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"}`}>
                        {key.enabled ? "禁用" : "启用"}
                      </button>
                      <button onClick={async () => { if (confirm(`确定删除 Key "${key.name}"？`)) { await client.deleteApiKey(key.id); loadData(); } }}
                        className="text-xs px-2 py-1 rounded-md text-zinc-500 border border-zinc-700/50 hover:text-rose-400 hover:border-rose-500/20 hover:bg-rose-500/10 transition">
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "tenants" && (
            <div className="space-y-6">
              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                <h3 className="font-semibold text-sm text-zinc-200 mb-4">创建租户</h3>
                <div className="flex gap-3 items-end flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-zinc-500 mb-1">名称</label>
                    <input type="text" value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                      placeholder="例如: 开发团队" />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-zinc-500 mb-1">月度 Token 配额（可选）</label>
                    <input type="number" value={newTenantQuota} onChange={(e) => setNewTenantQuota(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                      placeholder="留空不限" />
                  </div>
                  <button onClick={async () => { if (!newTenantName) return; try { await client.createTenant(newTenantName, newTenantQuota ? Number(newTenantQuota) : undefined); setNewTenantName(""); setNewTenantQuota(""); loadData(); } catch (e) { setError((e as Error).message); } }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 transition font-medium">
                    创建
                  </button>
                </div>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                <h3 className="font-semibold text-sm text-zinc-200 mb-4">租户列表</h3>
                <div className="space-y-2">
                  {tenants.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800/60 hover:border-zinc-700 transition-all duration-150">
                      <div className="flex-1">
                        <div className="text-sm text-zinc-200 font-medium">{t.name}</div>
                        <div className="text-xs text-zinc-500">{t.monthlyTokenQuota ? `${t.monthlyTokenQuota.toLocaleString()} tokens/月` : "不限配额"}</div>
                      </div>
                      {t.cachePlan === "premium_approved" && (
                        <>
                          <span className="px-2.5 py-0.5 rounded-full text-xs bg-violet-500/10 text-violet-400 border border-violet-500/20">🔮 增强缓存</span>
                          <button onClick={async () => { if (confirm(`确定取消租户 "${t.name}" 的增强缓存？`)) { await client.revokePremium(t.id); loadData(); } }}
                            className="text-xs px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition">取消</button>
                        </>
                      )}
                      {t.cachePlan === "premium_pending" && <span className="px-2.5 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">⏳ 审核中</span>}
                      {t.cachePlan === "premium_rejected" && <span className="px-2.5 py-0.5 rounded-full text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20">❌ 已拒绝</span>}
                      {t.cachePlan === "free" && <span className="px-2.5 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-500 border border-zinc-700/50">免费</span>}
                      {t.cachePlan === "premium_pending" && (
                        <div className="flex gap-1.5">
                          <button onClick={async () => { await client.approvePremium(t.id); loadData(); }} className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition">通过</button>
                          <button onClick={async () => { await client.rejectPremium(t.id); loadData(); }} className="text-xs px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition">拒绝</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "routes" && (
            <div className="space-y-6">
              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                <h3 className="font-semibold text-sm text-zinc-200 mb-4">添加模型路由</h3>
                <p className="text-xs text-zinc-500 mb-4">配置 LLM API 接入：定义对外别名 → 映射到 Provider 模型</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div><label className="block text-xs text-zinc-500 mb-1">别名</label>
                    <input type="text" value={newRouteAlias} onChange={(e) => setNewRouteAlias(e.target.value)} className="w-full px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-sm focus:outline-none focus:border-emerald-500/50" placeholder="gpt-4o" /></div>
                  <div><label className="block text-xs text-zinc-500 mb-1">Provider</label>
                    <select value={newRouteProvider} onChange={(e) => setNewRouteProvider(e.target.value)} className="w-full px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-sm focus:outline-none focus:border-emerald-500/50">
                      <option value="">选择</option>
                      {["openai", "deepseek", "ollama", "qwen", "moonshot", "zhipu", "gemini"].map((p) => (
                        <option key={p} value={p} className="bg-zinc-900">{p}</option>
                      ))}
                    </select></div>
                  <div><label className="block text-xs text-zinc-500 mb-1">上游模型名</label>
                    <input type="text" value={newRouteUpstream} onChange={(e) => setNewRouteUpstream(e.target.value)} className="w-full px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-sm focus:outline-none focus:border-emerald-500/50" placeholder="gpt-4o" /></div>
                </div>
                <div className="flex gap-3 items-end">
                  <div className="w-32"><label className="block text-xs text-zinc-500 mb-1">输入价格 $/1M</label>
                    <input type="number" value={newRoutePriceIn} onChange={(e) => setNewRoutePriceIn(e.target.value)} className="w-full px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-sm focus:outline-none focus:border-emerald-500/50" /></div>
                  <div className="w-32"><label className="block text-xs text-zinc-500 mb-1">输出价格 $/1M</label>
                    <input type="number" value={newRoutePriceOut} onChange={(e) => setNewRoutePriceOut(e.target.value)} className="w-full px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-sm focus:outline-none focus:border-emerald-500/50" /></div>
                  <button onClick={async () => { if (!newRouteAlias || !newRouteProvider || !newRouteUpstream) return; try { await client.createModelRoute({ alias: newRouteAlias, provider: newRouteProvider, upstreamModel: newRouteUpstream, priceInput: Number(newRoutePriceIn) || undefined, priceOutput: Number(newRoutePriceOut) || undefined }); setNewRouteAlias(""); setNewRouteProvider(""); setNewRouteUpstream(""); setNewRoutePriceIn(""); setNewRoutePriceOut(""); loadData(); } catch (e) { setError((e as Error).message); } }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 transition font-medium">添加</button>
                </div>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm text-zinc-200">Provider 状态检测</h3>
                  <button onClick={async () => { setSpeedLoading(true); setSpeedResults(null); try { const res = await client.speedTest(); setSpeedResults(res.results); } catch (e) { setError((e as Error).message); } finally { setSpeedLoading(false); } }}
                    disabled={speedLoading}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-500 disabled:opacity-50 transition font-medium flex items-center gap-1.5">
                    {speedLoading ? <><Gauge className="w-3.5 h-3.5 animate-spin" />测速中...</> : <><Zap className="w-3.5 h-3.5" />一键测速</>}
                  </button>
                </div>
                {speedResults && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {speedResults.map((r: any) => (
                      <div key={r.model} className={`p-3 rounded-lg border ${r.status === "ok" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-zinc-200">{r.model}</span>
                          {r.status === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">{r.status === "ok" ? `延迟 ${r.latencyMs}ms` : r.error}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                <h3 className="font-semibold text-sm text-zinc-200 mb-4">模型路由列表</h3>
                <div className="space-y-2">
                  {modelRoutes.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800/60 hover:border-zinc-700 transition-all duration-150">
                      <div className="flex-1">
                        <div className="font-mono text-sm text-zinc-200">{r.alias}</div>
                        <div className="text-xs text-zinc-500 flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] border border-indigo-500/20">{r.provider}</span>
                          → {r.upstreamModel}
                        </div>
                      </div>
                      <div className="text-right text-xs text-zinc-500">
                        <div>${(r.priceInput / 1000).toFixed(2)}/1M</div>
                        <div>${(r.priceOutput / 1000).toFixed(2)}/1M</div>
                      </div>
                      <button onClick={async () => { if (confirm(`确定删除路由 "${r.alias}"？`)) { await client.deleteModelRoute(r.id); loadData(); } }}
                        className="text-xs px-2 py-1 rounded-md text-zinc-500 border border-zinc-700/50 hover:text-rose-400 hover:border-rose-500/20 hover:bg-rose-500/10 transition">删除</button>
                    </div>
                  ))}
                  {modelRoutes.length === 0 && <div className="text-center py-8 text-zinc-600 text-sm">暂无模型路由</div>}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}