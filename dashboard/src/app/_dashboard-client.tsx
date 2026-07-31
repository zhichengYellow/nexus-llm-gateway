"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

interface Props {
  client: ApiClient;
  onLogout?: () => void;
}

export default function Dashboard({ client, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "keys" | "tenants" | "routes">("overview");
  const [summary, setSummary] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [modelRoutes, setModelRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, t, c, k, tn, mr] = await Promise.all([
        client.getUsageSummary(),
        client.getUsageTimeline(),
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const totalRequests = summary?.summary?.reduce((a: number, b: any) => a + b.totalRequests, 0) || 0;
  const totalTokens = summary?.summary?.reduce((a: number, b: any) => a + b.totalTokens, 0) || 0;
  const totalCacheHits = summary?.summary?.reduce((a: number, b: any) => a + b.cacheHits, 0) || 0;
  const cacheRate = totalRequests > 0 ? ((totalCacheHits / totalRequests) * 100).toFixed(1) : "0.0";

  const COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

  const StatCard = ({ title, value, sub }: { title: string; value: string; sub?: string }) => (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition">
      <div className="text-gray-500 text-xs mb-1">{title}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-gray-400 text-xs mt-1">{sub}</div>}
    </div>
  );

  const tabLabels: Record<string, string> = {
    overview: "概览",
    keys: "API Keys",
    tenants: "租户",
    routes: "模型路由",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-indigo-600 text-lg">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-gray-800 font-semibold">Nexus Gateway</span>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["overview", "keys", "tenants", "routes"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === tab
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tabLabels[tab]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm">
            {error}
            <button onClick={loadData} className="ml-2 underline">重试</button>
          </div>
        )}

        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard title="总请求数（24h）" value={totalRequests.toLocaleString()} />
              <StatCard title="Token 消耗" value={totalTokens.toLocaleString()} sub={`≈ $${(totalTokens * 0.00015).toFixed(2)} USD`} />
              <StatCard title="缓存命中率" value={`${cacheRate}%`} sub={`${totalCacheHits} 次命中`} />
              <StatCard title="节省金额（估算）" value={`$${((totalCacheHits * 500 * 0.00015)).toFixed(2)}`} sub={`${totalCacheHits} 次缓存 × 500 token × $0.15/1M`} />
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-gray-800 font-medium mb-4">请求趋势（24h）</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeline?.timeline || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(v) => v.slice(11, 16)} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }} labelStyle={{ color: "#374151" }} />
                  <Line type="monotone" dataKey="totalRequests" stroke="#6366f1" strokeWidth={2} name="请求数" dot={false} />
                  <Line type="monotone" dataKey="totalTokens" stroke="#3b82f6" strokeWidth={2} name="Token" dot={false} />
                  <Line type="monotone" dataKey="cacheHits" stroke="#10b981" strokeWidth={2} name="缓存命中" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-gray-800 font-medium mb-4">模型请求分布</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={summary?.summary || []} dataKey="totalRequests" nameKey="model" cx="50%" cy="50%" outerRadius={80} label={({ model, percent }: any) => `${model} (${((percent || 0) * 100).toFixed(0)}%)`}>
                      {(summary?.summary || []).map((_: any, i: number) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-gray-800 font-medium mb-4">缓存统计</h3>
                <div className="space-y-3">
                  {[["缓存条目数", cacheStats?.cache?.totalEntries || 0, "text-gray-800"], ["总命中次数", cacheStats?.cache?.totalHits || 0, "text-emerald-600"], ["平均命中/条", cacheStats?.cache?.avgHits || 0, "text-amber-600"], ["节省 Token（估算）", ((cacheStats?.cache?.totalHits || 0) * 500).toLocaleString(), "text-blue-600"]].map(([label, val, color]) => (
                    <div key={label as string} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0"><span className="text-gray-500 text-sm">{label}</span><span className={`font-semibold text-sm ${color}`}>{val}</span></div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-gray-800 font-medium mb-4">模型用量详情</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500 border-b border-gray-100"><th className="text-left py-2 px-3">Provider</th><th className="text-left py-2 px-3">模型</th><th className="text-right py-2 px-3">请求数</th><th className="text-right py-2 px-3">Token</th><th className="text-right py-2 px-3">缓存命中</th><th className="text-right py-2 px-3">平均延迟</th></tr></thead>
                  <tbody>
                    {(summary?.summary || []).map((row: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50"><td className="py-2 px-3 text-gray-600">{row.provider}</td><td className="py-2 px-3 text-gray-800 font-medium">{row.model}</td><td className="py-2 px-3 text-right text-gray-600">{row.totalRequests}</td><td className="py-2 px-3 text-right text-gray-600">{row.totalTokens?.toLocaleString()}</td><td className="py-2 px-3 text-right text-emerald-600">{row.cacheHits}</td><td className="py-2 px-3 text-right text-gray-600">{row.avgLatencyMs}ms</td></tr>
                    ))}
                    {(!summary?.summary || summary.summary.length === 0) && (<tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无数据</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "keys" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-gray-800 font-medium mb-4">创建 API Key</h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1"><label className="block text-xs text-gray-500 mb-1">名称</label><input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" placeholder="例如: dev-key" /></div>
                <div className="flex-1"><label className="block text-xs text-gray-500 mb-1">租户</label><select value={newKeyTenant} onChange={(e) => setNewKeyTenant(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"><option value="">选择租户</option>{tenants.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
                <button onClick={async () => { if (!newKeyName || !newKeyTenant) return; try { const res = await client.createApiKey(newKeyTenant, newKeyName); setNewKeyResult(res.apiKey); setNewKeyName(""); loadData(); } catch (e) { setError((e as Error).message); } }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition font-medium">创建</button>
              </div>
              {newKeyResult && (<div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3"><div className="text-green-700 text-sm font-medium mb-1">✅ Key 创建成功！</div><div className="text-gray-800 font-mono text-sm break-all bg-white rounded px-2 py-1 border border-gray-100">{newKeyResult.key}</div><div className="text-amber-600 text-xs mt-1">⚠️ 仅显示一次，请立即保存</div></div>)}
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-gray-800 font-medium mb-4">API Keys</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500 border-b border-gray-100"><th className="text-left py-2 px-3">名称</th><th className="text-left py-2 px-3">Key 前缀</th><th className="text-left py-2 px-3">状态</th><th className="text-left py-2 px-3">最后使用</th><th className="text-right py-2 px-3">操作</th></tr></thead>
                  <tbody>
                    {apiKeys.map((key: any) => (
                      <tr key={key.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-800 font-medium">{key.name}</td>
                        <td className="py-2 px-3 text-gray-500 font-mono">{key.keyPrefix}...</td>
                        <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${key.enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{key.enabled ? "启用" : "禁用"}</span></td>
                        <td className="py-2 px-3 text-gray-500">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "从未使用"}</td>
                        <td className="py-2 px-3 text-right flex gap-2 justify-end">
                          <button onClick={async () => { await client.toggleApiKey(key.id); loadData(); }} className={`text-xs px-2 py-1 rounded-md font-medium transition ${key.enabled ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>{key.enabled ? "禁用" : "启用"}</button>
                          <button onClick={async () => { if (confirm(`确定删除 Key "${key.name}"？`)) { await client.deleteApiKey(key.id); loadData(); } }} className="text-xs px-2 py-1 rounded-md font-medium bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-600 transition">删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "tenants" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-gray-800 font-medium mb-4">创建租户</h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1"><label className="block text-xs text-gray-500 mb-1">名称</label><input type="text" value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" placeholder="例如: 开发团队" /></div>
                <div className="flex-1"><label className="block text-xs text-gray-500 mb-1">月度 Token 配额（可选）</label><input type="number" value={newTenantQuota} onChange={(e) => setNewTenantQuota(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" placeholder="留空不限" /></div>
                <button onClick={async () => { if (!newTenantName) return; try { await client.createTenant(newTenantName, newTenantQuota ? Number(newTenantQuota) : undefined); setNewTenantName(""); setNewTenantQuota(""); loadData(); } catch (e) { setError((e as Error).message); } }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition font-medium">创建</button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-gray-800 font-medium mb-4">租户列表</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500 border-b border-gray-100"><th className="text-left py-2 px-3">名称</th><th className="text-left py-2 px-3">缓存计划</th><th className="text-right py-2 px-3">月度配额</th><th className="text-right py-2 px-3">创建时间</th><th className="text-right py-2 px-3">操作</th></tr></thead>
                  <tbody>
                    {tenants.map((t: any) => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-800 font-medium">{t.name}</td>
                        <td className="py-2 px-3">
                          {t.cachePlan === "premium_approved" && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">🔮 增强缓存</span>}
                          {t.cachePlan === "premium_pending" && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">⏳ 审核中</span>}
                          {t.cachePlan === "premium_rejected" && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">❌ 已拒绝</span>}
                          {t.cachePlan === "free" && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">免费</span>}
                          {t.cacheThreshold && <span className="ml-1 text-xs text-gray-400">阈值 {t.cacheThreshold / 100}</span>}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">{t.monthlyTokenQuota ? t.monthlyTokenQuota.toLocaleString() : "不限"}</td>
                        <td className="py-2 px-3 text-right text-gray-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                        <td className="py-2 px-3 text-right flex gap-1 justify-end">
                          {t.cachePlan === "free" && (
                            <button onClick={async () => { await client.requestPremium(t.id); loadData(); }} className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-600 hover:bg-purple-100 font-medium">申请增强缓存</button>
                          )}
                          {t.cachePlan === "premium_pending" && (
                            <>
                              <button onClick={async () => { await client.approvePremium(t.id); loadData(); }} className="text-xs px-2 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100 font-medium">通过</button>
                              <button onClick={async () => { await client.rejectPremium(t.id); loadData(); }} className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium">拒绝</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "routes" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-gray-800 font-medium mb-4">添加模型路由</h3>
              <p className="text-gray-400 text-xs mb-4">配置 LLM API 接入：定义对外暴露的模型别名，映射到实际 Provider 和模型名</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div><label className="block text-xs text-gray-500 mb-1">别名（对外模型名）</label><input type="text" value={newRouteAlias} onChange={(e) => setNewRouteAlias(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" placeholder="例如: gpt-4o" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Provider</label><select value={newRouteProvider} onChange={(e) => setNewRouteProvider(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"><option value="">选择</option><option value="openai">openai</option><option value="deepseek">deepseek</option><option value="ollama">ollama</option></select></div>
                <div><label className="block text-xs text-gray-500 mb-1">上游模型名</label><input type="text" value={newRouteUpstream} onChange={(e) => setNewRouteUpstream(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" placeholder="例如: gpt-4o" /></div>
              </div>
              <div className="flex gap-3 items-end">
                <div className="w-32"><label className="block text-xs text-gray-500 mb-1">输入价格（$/1M token）</label><input type="number" value={newRoutePriceIn} onChange={(e) => setNewRoutePriceIn(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" placeholder="可选" /></div>
                <div className="w-32"><label className="block text-xs text-gray-500 mb-1">输出价格（$/1M token）</label><input type="number" value={newRoutePriceOut} onChange={(e) => setNewRoutePriceOut(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" placeholder="可选" /></div>
                <button onClick={async () => { if (!newRouteAlias || !newRouteProvider || !newRouteUpstream) return; try { await client.createModelRoute({ alias: newRouteAlias, provider: newRouteProvider, upstreamModel: newRouteUpstream, priceInput: newRoutePriceIn ? Number(newRoutePriceIn) : undefined, priceOutput: newRoutePriceOut ? Number(newRoutePriceOut) : undefined }); setNewRouteAlias(""); setNewRouteProvider(""); setNewRouteUpstream(""); setNewRoutePriceIn(""); setNewRoutePriceOut(""); loadData(); } catch (e) { setError((e as Error).message); } }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition font-medium">添加</button>
              </div>
            </div>

            {/* 测速按钮 */}
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-800 font-medium">Provider 状态检测</h3>
                <button
                  onClick={async () => {
                    setSpeedLoading(true);
                    setSpeedResults(null);
                    try {
                      const res = await client.speedTest();
                      setSpeedResults(res.results);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setSpeedLoading(false);
                    }
                  }}
                  disabled={speedLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 font-medium transition"
                >
                  {speedLoading ? "测速中..." : "⚡ 一键测速"}
                </button>
              </div>
              {speedResults && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {speedResults.map((r: any) => (
                    <div key={r.model} className={`rounded-lg p-3 border ${r.status === "ok" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">{r.model}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {r.status === "ok" ? "✅ 正常" : "❌ 异常"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {r.status === "ok" ? `延迟: ${r.latencyMs}ms` : r.error}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-gray-800 font-medium mb-4">模型路由列表</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500 border-b border-gray-100"><th className="text-left py-2 px-3">别名</th><th className="text-left py-2 px-3">Provider</th><th className="text-left py-2 px-3">上游模型</th><th className="text-right py-2 px-3">输入价格</th><th className="text-right py-2 px-3">输出价格</th><th className="text-right py-2 px-3">操作</th></tr></thead>
                  <tbody>
                    {modelRoutes.map((r: any) => (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-800 font-medium font-mono">{r.alias}</td>
                        <td className="py-2 px-3 text-gray-600"><span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">{r.provider}</span></td>
                        <td className="py-2 px-3 text-gray-600 font-mono text-xs">{r.upstreamModel}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{r.priceInput > 0 ? `$${(r.priceInput / 1000).toFixed(2)}/1M` : "-"}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{r.priceOutput > 0 ? `$${(r.priceOutput / 1000).toFixed(2)}/1M` : "-"}</td>
                        <td className="py-2 px-3 text-right">
                          <button onClick={async () => { if (confirm(`确定删除路由 "${r.alias}"？`)) { await client.deleteModelRoute(r.id); loadData(); } }} className="text-xs px-2 py-1 rounded-md font-medium bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-600 transition">删除</button>
                        </td>
                      </tr>
                    ))}
                    {modelRoutes.length === 0 && (<tr><td colSpan={6} className="text-center py-8 text-gray-400">暂无模型路由，请添加</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}