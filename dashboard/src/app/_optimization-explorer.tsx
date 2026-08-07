"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import { formatInTimeZone } from "date-fns-tz";
import {
  Layers, ArrowUp, TrendingDown, Zap, Database, Route, Search, Filter, ChevronDown,
} from "lucide-react";

interface Props {
  client: ApiClient;
}

function formatBeijing(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return formatInTimeZone(d, "Asia/Shanghai", "HH:mm");
}

/** 格式化大数字 */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

export default function OptimizationExplorer({ client }: Props) {
  const [optStats, setOptStats] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [costReport, setCostReport] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const loadData = async () => {
    try {
      const [os, sug, cr, tl] = await Promise.all([
        client.getOptimizationStats(),
        client.getOptimizationSuggestions(),
        client.getCostReport("day"),
        client.getUsageTimeline("24h"),
      ]);
      setOptStats(os);
      setSuggestions(sug.suggestions || []);
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
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-blue-400 text-sm font-mono animate-pulse flex items-center gap-2">
          <Layers className="w-4 h-4" /> 加载优化数据...
        </div>
      </div>
    );
  }

  const today = optStats?.today ?? {};
  const savedTokens = today.savedTokens ?? 0;
  const trrNum = parseFloat(today.trr) || 0;

  // 时间线优化详情
  const tlData = timeline?.timeline ?? [];
  const filteredTl = filter === "all"
    ? tlData
    : filter === "cached"
      ? tlData.filter((t: any) => (t.cacheHits ?? 0) > 0)
      : tlData.filter((t: any) => (t.savedTokens ?? 0) > 0);

  const FILTERS = [
    { key: "all", label: "全部", icon: Layers },
    { key: "cached", label: "缓存命中", icon: Database },
    { key: "saved", label: "有节省", icon: TrendingDown },
  ];

  const PRIORITY_COLORS: Record<string, string> = {
    high: "border-rose-500/30 bg-rose-500/5 text-rose-400",
    medium: "border-amber-500/30 bg-amber-500/5 text-amber-400",
    low: "border-zinc-600/30 bg-zinc-800/20 text-zinc-400",
  };

  const CATEGORY_LABEL: Record<string, string> = {
    cost: "成本", quality: "质量", latency: "延迟", cache: "缓存", routing: "路由",
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm">
          {error}
          <button onClick={loadData} className="ml-2 underline">重试</button>
        </div>
      )}

      {/* ═══ 优化管线概览 ═══ */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-sm text-zinc-200">优化管线</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-300">压缩</span>
            <span className="text-emerald-400 font-mono text-xs">-{trrNum > 0 ? Math.round(trrNum * 0.3) : 0}%</span>
          </div>
          <ArrowUp className="w-4 h-4 text-zinc-600" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-zinc-300">缓存门控</span>
            <span className="text-blue-400 font-mono text-xs">—</span>
          </div>
          <ArrowUp className="w-4 h-4 text-zinc-600" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
            <Route className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-zinc-300">智能路由</span>
            <span className="text-violet-400 font-mono text-xs">-{trrNum > 0 ? Math.round(trrNum * 0.2) : 0}%</span>
          </div>
          <ArrowUp className="w-4 h-4 text-zinc-600" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-300 font-semibold">总计节省 {today.trr || "—"}</span>
            <span className="text-emerald-400 font-mono text-xs">{formatNumber(savedTokens)} tokens</span>
          </div>
        </div>
      </div>

      {/* ═══ 逐小时优化记录表 ═══ */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-zinc-500" />
            <h3 className="font-semibold text-sm text-zinc-200">逐小时优化记录</h3>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
            {FILTERS.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all duration-150 ${
                    filter === f.key
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {filteredTl.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800/60">
                  <th className="text-left py-2 px-3 font-medium">时间</th>
                  <th className="text-right py-2 px-3 font-medium">请求数</th>
                  <th className="text-right py-2 px-3 font-medium">Token</th>
                  <th className="text-right py-2 px-3 font-medium">
                    <span className="text-emerald-400">节省 Token</span>
                  </th>
                  <th className="text-right py-2 px-3 font-medium">节省率</th>
                  <th className="text-right py-2 px-3 font-medium">缓存命中</th>
                  <th className="text-right py-2 px-3 font-medium">缓存未命中</th>
                </tr>
              </thead>
              <tbody>
                {filteredTl.map((row: any, i: number) => {
                  const sTokens = row.savedTokens ?? 0;
                  const tTokens = row.totalTokens ?? 1;
                  const saveRate = tTokens > 0 ? ((sTokens / (tTokens + sTokens)) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition">
                      <td className="py-2 px-3 text-zinc-400 font-mono">{formatBeijing(row.hour)}</td>
                      <td className="py-2 px-3 text-right text-zinc-300">{row.totalRequests.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-zinc-300">{formatNumber(tTokens)}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-emerald-400 font-mono">{formatNumber(sTokens)}</span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-emerald-400">{saveRate}%</span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-blue-400">{row.cacheHits}</span>
                      </td>
                      <td className="py-2 px-3 text-right text-zinc-500">{row.cacheMisses ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-zinc-600 text-sm">
            <Filter className="w-5 h-5 mx-auto mb-2 opacity-50" />
            暂无匹配的优化记录
          </div>
        )}
      </div>

      {/* ═══ 优化建议 ═══ */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-400" />
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
    </div>
  );
}
