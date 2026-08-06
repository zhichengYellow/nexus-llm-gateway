"use client";

/**
 * ⚠️ 未来方向:多租户用户端(见 docs/SPEC.md 1.3.1)
 * 当前产品为个人单租户工作台,登录统一走 Master Key → 个人控制台(_dashboard-client)。
 * 本组件保留作为多租户(用户端视角)的参考实现,不接入主流程。
 */
import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area,
} from "recharts";
import { User, LogOut, Activity, Timer, Zap, Database, ArrowUpRight } from "lucide-react";

interface Props {
  client: ApiClient;
  onLogout?: () => void;
}

/** 强制北京时间 */
function formatBeijing(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${(bj.getUTCHours()).toString().padStart(2, "0")}:${(bj.getUTCMinutes()).toString().padStart(2, "0")}`;
}

export default function UserDashboard({ client, onLogout }: Props) {
  const [overview, setOverview] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      const [ov, tl] = await Promise.all([
        client.get("/user/overview"),
        client.get("/user/timeline"),
      ]);
      setOverview(ov);
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
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <div className="text-emerald-400 text-sm font-mono animate-pulse">loading dashboard...</div>
      </div>
    );
  }

  const cachePlan = overview?.tenant?.cachePlan || "free";
  const day = overview?.day || {};
  const month = overview?.month || {};
  const cache = overview?.cache || {};
  const tenant = overview?.tenant || {};
  const apiKeyInfo = overview?.apiKey || {};

  const stats = [
    { title: "今日请求", value: (day.totalRequests || 0).toLocaleString(), sub: `${(day.cacheHits || 0)} 缓存命中`, icon: Activity, color: "#10B981" },
    { title: "今日 Token", value: (day.totalTokens || 0).toLocaleString(), sub: "消耗 tokens", icon: Zap, color: "#3B82F6" },
    { title: "缓存命中率", value: day.cacheRate || "0.0%", sub: "节省调用成本", icon: Database, color: "#8B5CF6" },
    { title: "本月 Token", value: (month.monthTokens || 0).toLocaleString(), sub: tenant.monthlyTokenQuota ? `配额 ${tenant.monthlyTokenQuota.toLocaleString()}` : "不限配额", icon: Timer, color: "#F59E0B" },
  ];

  return (
    <div className="min-h-screen bg-[#0A0D14] text-zinc-100">
      {/* Header */}
      <header className="h-16 border-b border-zinc-800/60 bg-zinc-900/40 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
            <User className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="font-semibold text-sm">用户中心</div>
            <div className="text-xs text-zinc-500">{tenant.name} · {apiKeyInfo.keyPrefix}...</div>
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

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
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

        {/* Trend chart */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm text-zinc-200">请求趋势</h3>
              <p className="text-xs text-zinc-500 mt-0.5">过去 24 小时 · 北京时间</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />请求数</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />缓存命中</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={timeline?.timeline || []}>
              <defs>
                <linearGradient id="gUReq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.4} />
              <XAxis dataKey="hour" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={formatBeijing} axisLine={{ stroke: "#27272a" }} tickLine={false} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                labelFormatter={(v) => `北京时间 ${formatBeijing(v as string)}`}
                formatter={(value: any, name: any) => [(value ?? 0).toLocaleString(), name]}
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontSize: 12 }}
                labelStyle={{ color: "#a1a1aa", fontWeight: 600, marginBottom: 4, fontSize: 11 }}
                itemStyle={{ color: "#d4d4d8" }}
              />
              <Area type="monotone" dataKey="totalRequests" stroke="#3B82F6" strokeWidth={2} fill="url(#gUReq)" name="请求数" dot={false} />
              <Line type="monotone" dataKey="cacheHits" stroke="#10B981" strokeWidth={1.5} dot={false} name="缓存命中" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 缓存计划 / 申请增强缓存 */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-zinc-200">缓存计划</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {cachePlan === "premium_approved" ? "🔮 已开通增强缓存（更低相似度阈值，更高命中率）"
                  : cachePlan === "premium_pending" ? "⏳ 申请审核中，请等待管理员审批"
                  : cachePlan === "premium_rejected" ? "❌ 申请被拒绝"
                  : "当前为免费缓存（严格匹配）"}
              </p>
            </div>
            {cachePlan === "free" && (
              <button
                onClick={async () => { try { await client.post("/user/premium/request", {}); loadData(); } catch (e) { setError((e as Error).message); } }}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-500 transition font-medium"
              >
                申请增强缓存
              </button>
            )}
          </div>
        </div>

        {/* Cache + Usage guide */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
            <h3 className="font-semibold text-sm text-zinc-200 mb-4">缓存信息</h3>
            <div className="space-y-3">
              {[
                ["缓存条目", cache.totalEntries || 0, "#a1a1aa"],
                ["总命中", cache.totalHits || 0, "#10B981"],
                ["平均命中/条", cache.avgHits || 0, "#F59E0B"],
              ].map(([label, val, color]: any) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-zinc-800/60 last:border-0">
                  <span className="text-xs text-zinc-500">{label}</span>
                  <span className="font-mono text-sm" style={{ color }}>{val.toLocaleString?.() ?? val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-xl p-6 hover:border-zinc-700 transition-all duration-200">
            <h3 className="font-semibold text-sm text-zinc-200 mb-4 flex items-center gap-2">
              📋 使用指南 <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600" />
            </h3>
            <div className="space-y-2 text-sm text-zinc-400">
              <div className="flex items-center gap-2"><span className="text-zinc-600">Base URL:</span><code className="bg-zinc-950/60 border border-zinc-800 px-2 py-0.5 rounded text-blue-400 text-xs">http://localhost:8787/v1</code></div>
              <div className="flex items-center gap-2"><span className="text-zinc-600">API Key:</span><code className="bg-zinc-950/60 border border-zinc-800 px-2 py-0.5 rounded text-emerald-400 text-xs">{apiKeyInfo.keyPrefix}...</code></div>
              <div className="flex items-center gap-2"><span className="text-zinc-600">模型:</span><code className="bg-zinc-950/60 border border-zinc-800 px-2 py-0.5 rounded text-violet-400 text-xs">deepseek-v4-flash</code> <code className="bg-zinc-950/60 border border-zinc-800 px-2 py-0.5 rounded text-violet-400 text-xs">deepseek-v4-pro</code></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}