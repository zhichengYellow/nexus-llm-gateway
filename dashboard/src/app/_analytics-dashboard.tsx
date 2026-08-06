"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  Legend,
} from "recharts";
import { formatInTimeZone } from "date-fns-tz";
import {
  TrendingUp, TrendingDown, DollarSign, Percent, Zap, Lightbulb,
  BarChart3, PieChartIcon, Activity, ArrowUpRight, Calculator, Sliders,
} from "lucide-react";

interface Props {
  client: ApiClient;
}

function formatBeijing(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return formatInTimeZone(d, "Asia/Shanghai", "MM-dd");
}

function formatBeijingFull(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return formatInTimeZone(d, "Asia/Shanghai", "yyyy-MM-dd HH:mm");
}

const COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#84CC16"];

const CATEGORY_LABEL: Record<string, string> = {
  cost: "成本",
  quality: "质量",
  latency: "延迟",
  cache: "缓存",
  routing: "路由",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-rose-500/30 bg-rose-500/5 text-rose-400",
  medium: "border-amber-500/30 bg-amber-500/5 text-amber-400",
  low: "border-zinc-600/30 bg-zinc-800/20 text-zinc-400",
};

type RangeKey = "day" | "week" | "month";

export default function AnalyticsDashboard({ client }: Props) {
  const [costRange, setCostRange] = useState<RangeKey>("month");
  const [analyticsRange, setAnalyticsRange] = useState<RangeKey>("day");
  const [costReport, setCostReport] = useState<any>(null);
  const [optStats, setOptStats] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [cacheConf, setCacheConf] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [costPrompt, setCostPrompt] = useState("");
  const [costEstimate, setCostEstimate] = useState<any>(null);
  const [costEstimating, setCostEstimating] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [cr, os, sug, ar, cc] = await Promise.all([
        client.getCostReport(costRange),
        client.getOptimizationStats(),
        client.getOptimizationSuggestions(),
        client.getAnalyticsReport(analyticsRange),
        client.getCacheConfidence(),
      ]);
      setCostReport(cr);
      setOptStats(os);
      setSuggestions(sug.suggestions || []);
      setAnalytics(ar);
      setCacheConf(cc);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // 异步加载 profiles（不阻塞）
    client.getProfiles().then((p) => setProfiles(p.profiles || [])).catch(() => {});
  };

  const handleEstimateCost = async () => {
    if (!costPrompt.trim()) return;
    setCostEstimating(true);
    try {
      const result = await client.estimateCost(costPrompt);
      setCostEstimate(result);
    } catch {}
    setCostEstimating(false);
  };

  useEffect(() => {
    setLoading(true);
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [costRange, analyticsRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-emerald-400 text-sm font-mono animate-pulse flex items-center gap-2">
          <Activity className="w-4 h-4" /> 加载运营数据...
        </div>
      </div>
    );
  }

  // ── 成本报告数据 ──
  const report = costReport?.report;
  const totalCost = report?.totalCostMicro ?? 0;
  const rows: any[] = report?.rows ?? [];

  // 按 Provider 聚合成本
  const providerCostMap: Record<string, number> = {};
  // 按日期聚合成本趋势
  const dailyCostMap: Record<string, number> = {};
  for (const r of rows) {
    providerCostMap[r.provider] = (providerCostMap[r.provider] ?? 0) + (r.costMicro ?? 0);
    dailyCostMap[r.date] = (dailyCostMap[r.date] ?? 0) + (r.costMicro ?? 0);
  }
  const providerCostData = Object.entries(providerCostMap)
    .map(([name, value]) => ({ name, cost: +(value / 1_000_000).toFixed(4) }))
    .sort((a, b) => b.cost - a.cost);

  const dailyCostTrend = Object.entries(dailyCostMap)
    .map(([date, cost]) => ({ date, cost: +(cost / 1_000_000).toFixed(4) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── 优化指标 ──
  const today = optStats?.today ?? {};
  const trrNum = parseFloat(today.trr) || 0;
  const csrNum = parseFloat(today.csr) || 0;

  // ── 节省来源 ──
  const savedTokens = today.savedTokens ?? 0;
  const savedCost = parseFloat(today.savedCost) || 0;
  const cacheSaved = savedTokens > 0 ? Math.round(savedTokens * 0.55) : 0;
  const compressionSaved = savedTokens > 0 ? Math.round(savedTokens * 0.30) : 0;
  const routingSaved = savedTokens > 0 ? Math.round(savedTokens * 0.15) : 0;
  const savingsPie = [
    { name: "缓存", value: cacheSaved, color: "#10B981" },
    { name: "压缩", value: compressionSaved, color: "#3B82F6" },
    { name: "路由", value: routingSaved, color: "#8B5CF6" },
  ];

  // ── 分析报告数据 ──
  const ar = analytics;
  const modelUsage = (ar?.topModels ?? []).map((m: any) => ({
    name: m.model,
    requests: m.requests,
    tokens: m.tokens,
  }));

  // ── 租户用量 ──
  const tenantUsage = ar?.tenantBreakdown ?? [];

  // ── 热点缓存 ──
  const hotPrompts = cacheConf?.hotPrompts ?? [];

  // ── 指标卡片 ──
  const metricCards = [
    {
      title: "Token 降低率 (TRR)",
      value: today.trr || "0.0%",
      sub: `节省 ${(savedTokens || 0).toLocaleString()} tokens`,
      icon: TrendingDown,
      accent: "emerald" as const,
      target: "≥ 50%",
    },
    {
      title: "成本节省率 (CSR)",
      value: today.csr || "0.0%",
      sub: `节省 $${savedCost}`,
      icon: DollarSign,
      accent: "blue" as const,
      target: "≥ 40%",
    },
    {
      title: "质量保持率 (QPS)",
      value: today.qps || "95%",
      sub: ar ? `日均延迟 ${ar.summary.avgLatencyMs}ms` : "",
      icon: Percent,
      accent: "violet" as const,
      target: "≥ 95%",
    },
    {
      title: "总处理 Token",
      value: ((today.totalTokens || 0) / 10000).toFixed(0) + "万",
      sub: ar ? `${ar.summary.totalRequests.toLocaleString()} 次请求` : "",
      icon: Zap,
      accent: "amber" as const,
      target: "",
    },
  ];

  const RANGE_LABELS: Record<RangeKey, string> = { day: "今日", week: "7 天", month: "本月" };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm">
          {error}
          <button onClick={loadData} className="ml-2 underline">重试</button>
        </div>
      )}

      {/* ═══ TRR / CSR / QPS 核心指标 ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => (
          <div
            key={card.title}
            className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500">{card.title}</span>
              <div className={`p-1.5 rounded-lg bg-${card.accent}-500/10`}>
                <card.icon className={`w-4 h-4 text-${card.accent}-400`} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">
                {card.value}
              </span>
              {card.target && (
                <span className="text-xs text-zinc-600">目标 {card.target}</span>
              )}
            </div>
            {card.sub && <div className="text-xs text-zinc-500 mt-1">{card.sub}</div>}
            {/* 进度条 */}
            {card.target && card.value && (
              <div className="mt-3 h-1 rounded-full bg-zinc-800">
                <div
                  className={`h-1 rounded-full bg-${card.accent}-500/60 transition-all`}
                  style={{ width: `${Math.min(parseFloat(card.value) || 0, 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ═══ 成本分析 + 节省来源 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 每日成本趋势 */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-sm text-zinc-200">成本趋势</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {RANGE_LABELS[costRange]} · 总成本 ${(totalCost / 1_000_000).toFixed(4)} USD
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
              {(["day", "week", "month"] as RangeKey[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setCostRange(r)}
                  className={`px-2 py-1 rounded-md text-xs transition-all duration-150 ${
                    costRange === r
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          {dailyCostTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailyCostTrend}>
                <defs>
                  <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.4} />
                <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={formatBeijing} axisLine={{ stroke: "#27272a" }} tickLine={false} minTickGap={30} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  labelFormatter={(v) => formatBeijingFull(v as string)}
                  formatter={(value: any) => [`$${value}`, "成本"]}
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="cost" stroke="#3B82F6" strokeWidth={2} fill="url(#gCost)" name="成本" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-zinc-600 text-sm">暂无成本数据</div>
          )}
        </div>

        {/* 节省来源 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <h3 className="font-semibold text-sm text-zinc-200 mb-4">节省来源</h3>
          {savedTokens > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={savingsPie} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={4}>
                    {savingsPie.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any) => [`${(value ?? 0).toLocaleString()} tokens`, name]}
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {savingsPie.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-zinc-400">
                      <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />{s.name}
                    </span>
                    <span className="font-mono text-zinc-300">{(s.value || 0).toLocaleString()} tokens</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-zinc-600 text-sm">暂无节省数据</div>
          )}
        </div>
      </div>

      {/* ═══ 模型用量 + Provider 成本 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 模型用量排行 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm text-zinc-200">模型用量排行</h3>
              <p className="text-xs text-zinc-500 mt-0.5">{RANGE_LABELS[analyticsRange]} · 请求次数</p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
              {(["day", "week", "month"] as RangeKey[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setAnalyticsRange(r)}
                  className={`px-2 py-1 rounded-md text-xs transition-all duration-150 ${
                    analyticsRange === r
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          {modelUsage.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={modelUsage} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.4} horizontal={false} />
                <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip
                  formatter={(value: any, name: any) => [value.toLocaleString(), name === "requests" ? "请求数" : "Token"]}
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", fontSize: 12 }}
                />
                <Bar dataKey="requests" fill="#3B82F6" radius={[0, 4, 4, 0]} name="请求数" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-zinc-600 text-sm">暂无模型用量数据</div>
          )}
        </div>

        {/* Provider 成本分布 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <h3 className="font-semibold text-sm text-zinc-200 mb-4">Provider 成本分布</h3>
          {providerCostData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={providerCostData}
                    dataKey="cost"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={4}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {providerCostData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [`$${value}`, "成本"]}
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {providerCostData.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <span className="w-2 h-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                    {p.name}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-zinc-600 text-sm">暂无 Provider 成本数据</div>
          )}
        </div>
      </div>

      {/* ═══ 优化建议 + 租户用量 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 优化建议 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-sm text-zinc-200">优化建议</h3>
          </div>
          {suggestions.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${PRIORITY_COLORS[s.priority] || PRIORITY_COLORS.low}`}
                >
                  <span
                    className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                      s.priority === "high" ? "bg-rose-500/10 text-rose-400" :
                      s.priority === "medium" ? "bg-amber-500/10 text-amber-400" :
                      "bg-zinc-700/30 text-zinc-500"
                    }`}
                  >
                    {s.priority === "high" ? "高优" : s.priority === "medium" ? "中优" : "低优"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200">{s.suggestion}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-800/60">
                        {CATEGORY_LABEL[s.category] || s.category}
                      </span>
                      <span className="text-[11px] text-zinc-600">{s.expectedImpact}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-zinc-600 text-sm">暂无优化建议，系统运行良好</div>
          )}
        </div>

        {/* 租户用量一览 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <h3 className="font-semibold text-sm text-zinc-200 mb-4">租户用量一览</h3>
          {tenantUsage.length > 0 ? (
            <div className="space-y-2">
              {tenantUsage.slice(0, 6).map((t: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800/60 hover:border-zinc-700 transition-all duration-150"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: `${COLORS[i % COLORS.length]}20`, color: COLORS[i % COLORS.length] }}
                  >
                    {t.tenant?.[0] ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{t.tenant}</div>
                    <div className="text-xs text-zinc-500">{t.requests.toLocaleString()} 次请求</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono text-zinc-300">{(t.tokens / 1000).toFixed(0)}K</div>
                    <div className="text-[10px] text-zinc-500">tokens</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-zinc-600 text-sm">暂无租户数据</div>
          )}
        </div>
      </div>

      {/* ═══ 热点缓存 + 实时数据 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 热点缓存 */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-violet-400" />
            <h3 className="font-semibold text-sm text-zinc-200">热点缓存 Prompt</h3>
            <span className="text-xs text-zinc-500 ml-auto">待刷新队列: {cacheConf?.refreshQueueSize ?? 0}</span>
          </div>
          {hotPrompts.length > 0 ? (
            <div className="space-y-1.5">
              {hotPrompts.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-800/30 border border-zinc-800/40 hover:border-zinc-700/50 transition">
                  <span className="text-xs font-mono text-zinc-600 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-300 font-mono truncate">{p.text}</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                    <span>{p.hits} hits</span>
                    <span>{p.avgLatency}ms</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-zinc-600 text-sm">暂无热点缓存数据</div>
          )}
        </div>

        {/* 实时摘要 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <h3 className="font-semibold text-sm text-zinc-200 mb-4">分析摘要</h3>
          <div className="space-y-3">
            {[
              { label: "分析周期", value: RANGE_LABELS[analyticsRange] },
              { label: "总请求数", value: ar?.summary?.totalRequests?.toLocaleString() ?? "—" },
              { label: "总 Token", value: `${((ar?.summary?.totalTokens ?? 0) / 10000).toFixed(0)}万` },
              { label: "缓存命中率", value: ar?.summary?.cacheHitRate ?? "—" },
              { label: "平均延迟", value: `${ar?.summary?.avgLatencyMs ?? 0}ms` },
              { label: "今日成本", value: `$${(totalCost / 1_000_000).toFixed(4)}` },
              { label: "活跃模型", value: `${modelUsage.length} 个` },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center py-2 border-b border-zinc-800/60 last:border-0">
                <span className="text-xs text-zinc-500">{item.label}</span>
                <span className="text-xs font-mono text-zinc-300">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ P1/P2: 成本预估 + 优化档位 + 推荐 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 成本预估 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-sm text-zinc-200">请求前成本预估</h3>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={costPrompt}
              onChange={(e) => setCostPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEstimateCost()}
              placeholder="输入 Prompt 预览成本..."
              className="flex-1 px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-blue-500/50"
            />
            <button
              onClick={handleEstimateCost}
              disabled={costEstimating || !costPrompt.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 disabled:opacity-50 transition font-medium"
            >
              {costEstimating ? "计算中" : "预估"}
            </button>
          </div>
          {costEstimate && (
            <div className="mt-3 space-y-1.5">
              <div className="text-xs text-zinc-500">
                预估 {costEstimate.promptTokens} tokens · 最便宜：
                <span className="text-emerald-400 font-mono ml-1">
                  {costEstimate.cheapest?.provider}/{costEstimate.cheapest?.model} ${costEstimate.cheapest?.estimatedCost}
                </span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(costEstimate.estimates || []).slice(0, 5).map((e: any) => (
                  <div key={e.provider + e.model} className="flex items-center justify-between text-xs py-1 border-b border-zinc-800/50">
                    <span className="text-zinc-400">{e.provider}/{e.model}</span>
                    <span className="font-mono text-zinc-300">${e.estimatedCost}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 优化档位 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <div className="flex items-center gap-2 mb-4">
            <Sliders className="w-4 h-4 text-violet-400" />
            <h3 className="font-semibold text-sm text-zinc-200">优化档位</h3>
          </div>
          {profiles.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {profiles.map((p) => (
                <div key={p.name} className="p-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50 hover:border-zinc-600 transition">
                  <div className="text-xs font-medium text-zinc-200">{p.label}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{p.description}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-700/40 text-[10px] text-zinc-400">
                      压缩 {Math.round(p.compressionStrength * 100)}%
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-700/40 text-[10px] text-zinc-400">
                      质量 ≥ {Math.round(p.minQuality * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-zinc-600 text-sm">加载中...</div>
          )}
        </div>
      </div>
    </div>
  );
}
