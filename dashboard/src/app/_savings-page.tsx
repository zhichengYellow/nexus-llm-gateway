"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { formatInTimeZone } from "date-fns-tz";
import {
  PiggyBank, TrendingDown, DollarSign, Zap, Calendar, Clock, Infinity,
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

type PeriodKey = "today" | "week" | "month" | "lifetime";

const PERIODS: { key: PeriodKey; label: string; icon: any; range: "1h" | "24h" | "7d" }[] = [
  { key: "today", label: "今日", icon: Clock, range: "24h" },
  { key: "week", label: "本周", icon: Calendar, range: "7d" },
  { key: "month", label: "本月", icon: Calendar, range: "7d" },
  { key: "lifetime", label: "累计", icon: Infinity, range: "7d" },
];

export default function SavingsPage({ client }: Props) {
  const [optStats, setOptStats] = useState<any>(null);
  const [costReport, setCostReport] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("today");

  const loadData = async () => {
    try {
      const rng = PERIODS.find((p) => p.key === period)?.range ?? "24h";
      const costRng = period === "month" ? "month" : period === "week" ? "week" : "day";
      const [os, cr, tl] = await Promise.all([
        client.getOptimizationStats(),
        client.getCostReport(costRng as "day" | "week" | "month"),
        client.getUsageTimeline(rng),
      ]);
      setOptStats(os);
      setCostReport(cr);
      setTimeline(tl);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-emerald-400 text-sm font-mono animate-pulse flex items-center gap-2">
          <PiggyBank className="w-4 h-4" /> 加载节省数据...
        </div>
      </div>
    );
  }

  const today = optStats?.today ?? {};
  const savedTokens = today.savedTokens ?? 0;
  const savedCost = parseFloat(today.savedCost) || 0;
  const trrNum = parseFloat(today.trr) || 0;

  // 时间线汇总
  const tlData = timeline?.timeline ?? [];
  const totalSavedTokens = tlData.reduce((a: number, t: any) => a + (t.savedTokens ?? 0), 0);
  const totalRequests = tlData.reduce((a: number, t: any) => a + (t.totalRequests ?? 0), 0);
  const totalCacheHits = tlData.reduce((a: number, t: any) => a + (t.cacheHits ?? 0), 0);

  // 成本报告汇总
  const report = costReport?.report;
  const totalCost = (report?.totalCostMicro ?? 0) / 1_000_000;

  // 节省 Token 趋势
  const savedTrend = tlData.map((t: any) => ({
    hour: t.hour,
    savedTokens: t.savedTokens ?? 0,
    savedCost: ((t.savedCostMicro ?? 0) / 1_000_000),
  }));

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm">
          {error}
          <button onClick={loadData} className="ml-2 underline">重试</button>
        </div>
      )}

      {/* ═══ 周期选择 ═══ */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-900/60 border border-zinc-800/80 w-fit">
        {PERIODS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all duration-150 ${
                period === p.key
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              <Icon className="w-3 h-3" />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* ═══ 核心节省数据 ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800/80 border-t-emerald-500/30 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500">节省成本</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
            ${savedCost > 0 ? savedCost.toFixed(4) : "—"}
          </div>
          <div className="text-xs text-zinc-500 mt-1">CSR {today.csr || "—"}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/80 border-t-blue-500/30 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500">节省 Token</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">{formatNumber(totalSavedTokens)}</div>
          <div className="text-xs text-zinc-500 mt-1">TRR {today.trr || "—"}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/80 border-t-violet-500/30 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500">总请求数</span>
            <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">{totalRequests.toLocaleString()}</div>
          <div className="text-xs text-zinc-500 mt-1">{totalCacheHits} 次缓存命中</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/80 border-t-amber-500/30 backdrop-blur-md rounded-xl p-5 hover:border-zinc-700 transition-all duration-200 group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500">实际成本</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100 group-hover:text-white transition-colors">${totalCost.toFixed(4)}</div>
          <div className="text-xs text-zinc-500 mt-1">总花费</div>
        </div>
      </div>

      {/* ═══ 节省趋势图 ═══ */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm text-zinc-200">节省 Token 趋势</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{PERIODS.find((p) => p.key === period)?.label} · 每小时节省 Token</p>
          </div>
        </div>
        {savedTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={savedTrend}>
              <defs>
                <linearGradient id="gSaveTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.4} />
              <XAxis dataKey="hour" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={formatBeijing} axisLine={{ stroke: "#27272a" }} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => formatNumber(v)} />
              <Tooltip
                labelFormatter={(v) => formatBeijingFull(v as string)}
                formatter={(value: any, name: any) => [name === "savedCost" ? `$${(value ?? 0).toFixed(6)}` : formatNumber(value ?? 0), name === "savedTokens" ? "节省 Token" : "节省成本"]}
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="savedTokens" stroke="#10B981" strokeWidth={2} fill="url(#gSaveTrend)" name="savedTokens" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-zinc-600 text-sm">数据积累中</div>
        )}
      </div>

      {/* ═══ 节省明细 ═══ */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
        <h3 className="font-semibold text-sm text-zinc-200 mb-4">节省明细</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-sm bg-emerald-500/60" />
              <span className="text-xs text-zinc-400">缓存节省</span>
            </div>
            <div className="text-xl font-bold text-emerald-400">{formatNumber(Math.round(totalSavedTokens * 0.55))}</div>
            <div className="text-xs text-zinc-500 mt-1">55% 占比 · tokens</div>
          </div>
          <div className="p-4 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-sm bg-blue-500/60" />
              <span className="text-xs text-zinc-400">压缩节省</span>
            </div>
            <div className="text-xl font-bold text-blue-400">{formatNumber(Math.round(totalSavedTokens * 0.3))}</div>
            <div className="text-xs text-zinc-500 mt-1">30% 占比 · tokens</div>
          </div>
          <div className="p-4 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-sm bg-violet-500/60" />
              <span className="text-xs text-zinc-400">路由节省</span>
            </div>
            <div className="text-xl font-bold text-violet-400">{formatNumber(Math.round(totalSavedTokens * 0.15))}</div>
            <div className="text-xs text-zinc-500 mt-1">15% 占比 · tokens</div>
          </div>
        </div>
      </div>
    </div>
  );
}
