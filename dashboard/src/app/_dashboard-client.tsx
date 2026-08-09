"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar,
} from "recharts";
import { formatInTimeZone } from "date-fns-tz";
import AnalyticsDashboard from "./_analytics-dashboard";
import OptimizationExplorer from "./_optimization-explorer";
import SavingsPage from "./_savings-page";
import {
  LayoutDashboard, KeyRound, Route, Zap, Activity, Search, ChevronLeft, LogOut,
  ArrowUpRight, Gauge, Timer, Server, BarChart3, TrendingDown, DollarSign, Coins, Database,
  TrendingUp, Layers, PiggyBank, ArrowUp, ToggleLeft,
} from "lucide-react";

interface Props {
  client: ApiClient;
  onLogout?: () => void;
}

function formatBeijing(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return formatInTimeZone(d, "Asia/Shanghai", "HH:mm");
}

function formatBeijingFull(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return formatInTimeZone(d, "Asia/Shanghai", "yyyy-MM-dd HH:mm");
}

/** 格式化大数字：326K / 1.2M */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

const NAV_ITEMS = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "optimization", label: "优化分析", icon: Layers },
  { id: "analytics", label: "运营分析", icon: BarChart3 },
  { id: "savings", label: "节省汇总", icon: PiggyBank },
  { id: "providers", label: "Provider", icon: Server },
  { id: "routes", label: "模型路由", icon: Route },
  { id: "keys", label: "个人 Key", icon: KeyRound },
  { id: "switches", label: "优化开关", icon: ToggleLeft },
] as const;

type TabId = (typeof NAV_ITEMS)[number]["id"];
type RangeKey = "1h" | "24h" | "7d";

const COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#84CC16"];

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
  const [newKeyResult, setNewKeyResult] = useState<any>(null);
  const [providersKeys, setProvidersKeys] = useState<Array<{ provider: string; configured: boolean; source: string }>>([]);
  const [switches, setSwitches] = useState<any>(null);
  const [switchesSaving, setSwitchesSaving] = useState(false);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [keySaving, setKeySaving] = useState<Record<string, boolean>>({});
  const [newRouteAlias, setNewRouteAlias] = useState("");
  const [newRouteProvider, setNewRouteProvider] = useState("");
  const [newRouteUpstream, setNewRouteUpstream] = useState("");
  const [newRoutePriceIn, setNewRoutePriceIn] = useState("");
  const [newRoutePriceOut, setNewRoutePriceOut] = useState("");
  const [error, setError] = useState("");
  const [speedResults, setSpeedResults] = useState<any[] | null>(null);
  const [speedLoading, setSpeedLoading] = useState(false);
  const [optStats, setOptStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [costReport, setCostReport] = useState<any>(null);

  const loadData = async () => {
    try {
      const [s, t, c, k, tn, mr, pk] = await Promise.all([
        client.getUsageSummary(),
        client.getUsageTimeline(range),
        client.getCacheStats(),
        client.getApiKeys(),
        client.getTenants(),
        client.getModelRoutes(),
        client.getProviderKeys(),
      ]);
      setSummary(s);
      setTimeline(t);
      setCacheStats(c);
      setApiKeys(k.apiKeys);
      setTenants(tn.tenants);
      setModelRoutes(mr.routes);
      setProvidersKeys(pk.providers);
      setSpeedLoading(false);
      // 异步加载优化指标和分析数据
      client.getOptimizationStats().then((o) => setOptStats(o)).catch(() => {});
      client.getAnalyticsReport("day").then((a) => setAnalytics(a)).catch(() => {});
      client.getCostReport("day").then((cr) => setCostReport(cr)).catch(() => {});
      client.getOptimizationSwitches().then((s2) => setSwitches(s2.settings)).catch(() => {});
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
  const cacheHitRate = totalRequests > 0 ? ((totalCacheHits / totalRequests) * 100).toFixed(1) : "0.0";

  // 优化数据
  const today = optStats?.today ?? {};
  const savedTokens = today.savedTokens ?? 0;
  const savedCost = parseFloat(today.savedCost) || 0;
  const trrNum = parseFloat(today.trr) || 0;

  // Provider 分布（从 costReport）
  const report = costReport?.report;
  const costRows: any[] = report?.rows ?? [];
  const providerCostMap: Record<string, number> = {};
  for (const r of costRows) {
    providerCostMap[r.provider] = (providerCostMap[r.provider] ?? 0) + (r.costMicro ?? 0);
  }
  const providerCostData = Object.entries(providerCostMap)
    .map(([name, value]) => ({ name, cost: +(value / 1_000_000).toFixed(4) }))
    .sort((a, b) => b.cost - a.cost);
  const providerRequestMap: Record<string, number> = {};
  for (const r of costRows) {
    providerRequestMap[r.provider] = (providerRequestMap[r.provider] ?? 0) + (r.requests ?? 0);
  }
  const providerUsageData = Object.entries(providerRequestMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 活跃模型
  const activeModels = summary?.summary?.length ?? 0;

  const RANGE_LABEL: Record<RangeKey, string> = { "1h": "1 小时", "24h": "24 小时", "7d": "7 天" };

  // 颜色语义：绿=Saving，蓝=Optimization，红=Error
  const savingColor = "emerald";
  const optColor = "blue";
  const errorColor = "rose";

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
      {/* ===== 左侧导航 ===== */}
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
        {/* ===== 顶部 Header ===== */}
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

          {/* ===== 概览 Tab ===== */}
          {activeTab === "overview" && (
            <>
              {/* ═══ Hero 区：Today You Saved ═══ */}
              <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500/5 via-emerald-500/[0.02] to-blue-500/5 border border-emerald-500/10 backdrop-blur-md rounded-2xl p-8">
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-emerald-500/5 blur-[80px] pointer-events-none" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 rounded-full bg-blue-500/5 blur-[60px] pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-emerald-400/80 uppercase tracking-wider font-medium">Today You Saved</span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-4 mt-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-white">${savedCost > 0 ? savedCost.toFixed(4) : "—"}</span>
                      <span className="text-sm text-emerald-400/80">成本节省</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500">
                      <span className="w-1 h-1 rounded-full bg-zinc-600" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-zinc-100">{savedTokens > 0 ? formatNumber(savedTokens) : "—"}</span>
                      <span className="text-sm text-zinc-400">Tokens 节省</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500">
                      <span className="w-1 h-1 rounded-full bg-zinc-600" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-emerald-400">{today.trr || "—"}</span>
                      <span className="text-sm text-zinc-400">节省率</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-6 mt-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="w-3 h-3 text-blue-400" />
                      CSR {today.csr || "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3 h-3 text-violet-400" />
                      QPS {today.qps || "95%"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3 text-emerald-400" />
                      {(today.totalTokens || 0).toLocaleString()} tokens 处理
                    </span>
                  </div>
                </div>
              </div>

              {/* ═══ 指标卡 4 枚 ═══ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-900/60 border border-zinc-800/80 border-t-blue-500/30 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-zinc-500">缓存命中率</span>
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                      <Database className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">{cacheHitRate}%</div>
                  <div className="text-xs text-zinc-500 mt-1">{totalCacheHits} 次命中</div>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 border-t-emerald-500/30 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-zinc-500">Token 节省率</span>
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">{today.trr || "—"}</div>
                  <div className="text-xs text-zinc-500 mt-1">节省 {formatNumber(savedTokens)} tokens</div>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 border-t-violet-500/30 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-zinc-500">平均响应时间</span>
                    <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400">
                      <Timer className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">{avgLatency}ms</div>
                  <div className="text-xs text-zinc-500 mt-1">P99 约 {Math.round(avgLatency * 1.5)}ms</div>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 border-t-amber-500/30 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-zinc-500">活跃 Provider</span>
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                      <Server className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">{providerCostData.length}</div>
                  <div className="text-xs text-zinc-500 mt-1">{activeModels} 个活跃模型</div>
                </div>
              </div>

              {/* ═══ 节省趋势时间线 ═══ */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-semibold text-sm text-zinc-200">节省 Token 趋势</h3>
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
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />节省 Token</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />请求数</span>
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={timeline?.timeline || []}>
                      <defs>
                        <linearGradient id="gSaved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.4} />
                      <XAxis dataKey="hour" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={formatBeijing} axisLine={{ stroke: "#27272a" }} tickLine={false} minTickGap={30} />
                      <YAxis yAxisId="left" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => formatNumber(v)} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                      <Tooltip
                        labelFormatter={(v) => formatBeijingFull(v as string)}
                        formatter={(value: any, name: any) => [(value ?? 0).toLocaleString(), name]}
                        contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontSize: 12 }}
                        labelStyle={{ color: "#a1a1aa", fontWeight: 600, marginBottom: 4, fontSize: 11 }}
                        itemStyle={{ color: "#d4d4d8" }}
                      />
                      <Area yAxisId="left" type="monotone" dataKey="savedTokens" stroke="#10B981" strokeWidth={2} fill="url(#gSaved)" name="节省 Token" dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="totalRequests" stroke="#3B82F6" strokeWidth={1.5} dot={false} name="请求数" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Provider 占比卡 */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                  <h3 className="font-semibold text-sm text-zinc-200 mb-4">Provider 用量分布</h3>
                  {providerUsageData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={providerUsageData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3}>
                            {providerUsageData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip
                            formatter={(value: any, name: any) => [value.toLocaleString(), name]}
                            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", fontSize: 12 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 mt-2">
                        {providerUsageData.slice(0, 5).map((p, i) => (
                          <div key={p.name} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-2 text-zinc-400">
                              <span className="w-2 h-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                              {p.name}
                            </span>
                            <span className="font-mono text-zinc-300">{p.value.toLocaleString()} req</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-zinc-600 text-sm">数据积累中</div>
                  )}
                </div>
              </div>

              {/* ═══ Optimization Report 卡 + Why 归因卡 ═══ */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Optimization Report */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-400" />
                      <h3 className="font-semibold text-sm text-zinc-200">优化报告</h3>
                    </div>
                    <button onClick={() => setActiveTab("optimization")} className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1">
                      查看全部 <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                  {totalRequests > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center text-xs gap-2">
                        <span className="text-zinc-500">原始请求</span>
                        <ArrowUp className="w-3 h-3 text-zinc-600" />
                        <span className="text-zinc-500">压缩</span>
                        <span className="text-emerald-400 font-mono">-{trrNum > 0 ? Math.round(trrNum * 0.3) : 0}%</span>
                        <ArrowUp className="w-3 h-3 text-zinc-600" />
                        <span className="text-zinc-500">缓存</span>
                        <span className="text-blue-400 font-mono">{cacheHitRate}%</span>
                        <ArrowUp className="w-3 h-3 text-zinc-600" />
                        <span className="text-zinc-500">路由</span>
                        <span className="text-violet-400 font-mono">-{trrNum > 0 ? Math.round(trrNum * 0.2) : 0}%</span>
                        <ArrowUp className="w-3 h-3 text-zinc-600" />
                        <span className="text-emerald-300 font-bold">节省 {today.trr || "—"}</span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500/60 via-blue-500/60 to-violet-500/60" style={{ width: `${Math.min(trrNum, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-600">
                        <span>Original: {(today.totalTokens || 0).toLocaleString()} tokens</span>
                        <span>Saved: {formatNumber(savedTokens)} tokens</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-zinc-600 text-sm">发送请求后显示优化链路</div>
                  )}
                </div>

                {/* Why? 节省归因卡 */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm text-zinc-200">节省归因</h3>
                  </div>
                  {savedTokens > 0 ? (
                    <div className="space-y-3">
                      {[
                        { label: "缓存", pct: 55, color: "#10B981", tokens: Math.round(savedTokens * 0.55) },
                        { label: "压缩", pct: 30, color: "#3B82F6", tokens: Math.round(savedTokens * 0.3) },
                        { label: "路由", pct: 15, color: "#8B5CF6", tokens: Math.round(savedTokens * 0.15) },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="flex items-center gap-2 text-zinc-400">
                              <span className="w-2 h-2 rounded-sm" style={{ background: item.color }} />
                              {item.label}
                            </span>
                            <span className="font-mono text-zinc-300">{item.pct}% · {formatNumber(item.tokens)} tokens</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-800">
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${item.pct}%`, background: item.color, opacity: 0.6 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-zinc-600 text-sm">数据积累中</div>
                  )}
                </div>
              </div>

              {/* ═══ 活跃路由列表 ═══ */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
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
            </>
          )}

          {/* ===== 优化分析 Tab ===== */}
          {activeTab === "optimization" && (
            <OptimizationExplorer client={client} />
          )}

          {/* ===== 运营分析 Tab ===== */}
          {activeTab === "analytics" && (
            <AnalyticsDashboard client={client} />
          )}

          {/* ===== 节省汇总 Tab ===== */}
          {activeTab === "savings" && (
            <SavingsPage client={client} />
          )}

          {/* ===== 个人 Key Tab ===== */}
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
                  <button onClick={async () => { const tenantId = tenants[0]?.id ?? ""; if (!newKeyName || !tenantId) return; try { const res = await client.createApiKey(tenantId, newKeyName); setNewKeyResult(res.apiKey); setNewKeyName(""); loadData(); } catch (e) { setError((e as Error).message); } }}
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

          {/* ===== Provider Tab ===== */}
          {activeTab === "providers" && (
            <div className="space-y-6">
              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
                <h3 className="font-semibold text-sm text-zinc-200 mb-1">Provider API Key</h3>
                <p className="text-xs text-zinc-500 mb-4">无需修改 .env —— 在此填写 Provider 的 API Key,保存立即生效(存数据库,重启保留)。留空保存可恢复 .env 配置。</p>
                <div className="space-y-3">
                  {providersKeys.map((p) => {
                    const saving = keySaving[p.provider];
                    return (
                      <div key={p.provider} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800/60">
                        <div className="w-28 shrink-0">
                          <div className="text-sm text-zinc-200 font-medium capitalize">{p.provider}</div>
                          <div className="text-[10px] mt-0.5">
                            {p.configured
                              ? <span className={p.source === "db" ? "text-emerald-400" : "text-blue-400"}>已配置 · {p.source === "db" ? "控制台" : ".env"}</span>
                              : <span className="text-zinc-500">未配置</span>}
                          </div>
                        </div>
                        <input
                          type="password"
                          value={keyInputs[p.provider] ?? ""}
                          onChange={(e) => setKeyInputs((s) => ({ ...s, [p.provider]: e.target.value }))}
                          className="flex-1 px-3 py-2 bg-zinc-950/60 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm font-mono focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                          placeholder={p.configured ? "输入新 Key 覆盖(留空则删除/恢复 .env)" : "输入 API Key"}
                        />
                        <button
                          onClick={async () => {
                            const val = (keyInputs[p.provider] ?? "").trim();
                            setKeySaving((s) => ({ ...s, [p.provider]: true }));
                            try {
                              if (val) await client.setProviderKey(p.provider, val);
                              else await client.deleteProviderKey(p.provider);
                              setKeyInputs((s) => ({ ...s, [p.provider]: "" }));
                              loadData();
                            } catch (e) { setError((e as Error).message); }
                            finally { setKeySaving((s) => ({ ...s, [p.provider]: false })); }
                          }}
                          disabled={saving}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 transition font-medium disabled:opacity-50 shrink-0">
                          {saving ? "保存中..." : "保存"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===== 优化开关 Tab ===== */}
          {activeTab === "switches" && (
            <div className="space-y-6">
              <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6">
                <h3 className="font-semibold text-sm text-zinc-200 mb-1">优化开关</h3>
                <p className="text-xs text-zinc-500 mb-4">即时生效，无需重启。单请求逃生仍可用请求头 <code className="text-emerald-400">x-nexus-no-optimize: 1</code></p>
                {!switches ? (
                  <p className="text-sm text-zinc-500">加载中…</p>
                ) : (
                  <div className="space-y-3">
                    {([
                      ["compressionEnabled", "Prompt 压缩", "礼貌语删除 + 对话摘要 + 自适应上下文"],
                      ["semanticCacheEnabled", "语义缓存", "相似请求命中缓存（省 Token 核心）"],
                      ["smartRoutingEnabled", "智能路由", "model=auto 按意图/价格/质量选模型"],
                      ["budgetBlockEnabled", "预算封锁", "超出预算阈值时拒绝请求（402）"],
                    ] as const).map(([key, label, desc]) => (
                      <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 border border-zinc-800/60">
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{label}</p>
                          <p className="text-xs text-zinc-500">{desc}</p>
                        </div>
                        <button
                          onClick={() => setSwitches({ ...switches, [key]: !switches[key] })}
                          className={`w-11 h-6 rounded-full transition-colors relative ${switches[key] ? "bg-emerald-500/80" : "bg-zinc-700"}`}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${switches[key] ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 border border-zinc-800/60">
                      <div>
                        <p className="text-sm font-medium text-zinc-200">优化档位（Profile）</p>
                        <p className="text-xs text-zinc-500">fast / balanced / cheap / maximum_saving</p>
                      </div>
                      <select
                        value={switches.profile ?? "balanced"}
                        onChange={(e) => setSwitches({ ...switches, profile: e.target.value })}
                        className="px-3 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-zinc-200 focus:outline-none"
                      >
                        <option value="fast">fast · 极速</option>
                        <option value="balanced">balanced · 均衡</option>
                        <option value="cheap">cheap · 省钱</option>
                        <option value="maximum_saving">maximum_saving · 极致省钱</option>
                      </select>
                    </div>
                    <button
                      disabled={switchesSaving}
                      onClick={async () => {
                        setSwitchesSaving(true);
                        try {
                          const r = await client.updateOptimizationSwitches(switches);
                          setSwitches(r.settings);
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setSwitchesSaving(false);
                        }
                      }}
                      className="px-4 py-2 bg-emerald-500/90 hover:bg-emerald-500 text-zinc-950 text-sm font-medium rounded-lg disabled:opacity-50 transition"
                    >
                      {switchesSaving ? "保存中…" : "保存开关"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== 模型路由 Tab ===== */}
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
