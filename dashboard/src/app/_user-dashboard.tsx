"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";

interface Props {
  client: ApiClient;
  onLogout?: () => void;
}

/** 强制转换为北京时间（东八区），不依赖浏览器时区 */
function formatBeijing(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  // 手动加 8 小时并取 UTC 字段，即为北京时间
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${(bj.getUTCHours()).toString().padStart(2, "0")}:${(bj.getUTCMinutes()).toString().padStart(2, "0")}`;
}

export default function UserDashboard({ client, onLogout }: Props) {
  const [overview, setOverview] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [firstLoad, setFirstLoad] = useState(true);

  const loadData = async () => {
    try {
      const [ov, tl] = await Promise.all([
        client.get("/user/overview"),
        client.get("/user/timeline"),
      ]);
      setOverview(ov);
      setTimeline(tl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFirstLoad(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // 每 10 秒自动刷新
    return () => clearInterval(interval);
  }, []);

  if (firstLoad) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-indigo-600 text-lg">加载中...</div>
      </div>
    );
  }

  const day = overview?.day || {};
  const month = overview?.month || {};
  const cache = overview?.cache || {};
  const tenant = overview?.tenant || {};
  const apiKeyInfo = overview?.apiKey || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <span className="text-gray-800 font-semibold">用户中心</span>
              <span className="text-gray-400 text-xs ml-2">{tenant.name} · {apiKeyInfo.keyPrefix}...</span>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            退出
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm">
            {error}
            <button onClick={loadData} className="ml-2 underline">重试</button>
          </div>
        )}

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="text-gray-500 text-xs mb-1">今日请求</div>
            <div className="text-2xl font-bold text-indigo-600">{day.totalRequests || 0}</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="text-gray-500 text-xs mb-1">今日 Token</div>
            <div className="text-2xl font-bold text-blue-600">{(day.totalTokens || 0).toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="text-gray-500 text-xs mb-1">缓存命中率</div>
            <div className="text-2xl font-bold text-emerald-600">{day.cacheRate || "0.0%"}</div>
            <div className="text-gray-400 text-xs mt-1">{day.cacheHits || 0} 次命中</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="text-gray-500 text-xs mb-1">本月 Token</div>
            <div className="text-2xl font-bold text-amber-600">{(month.monthTokens || 0).toLocaleString()}</div>
            <div className="text-gray-400 text-xs mt-1">
              {tenant.monthlyTokenQuota ? `配额 ${tenant.monthlyTokenQuota.toLocaleString()}` : "不限"}
              {month.quotaExceeded && <span className="text-red-500 ml-1">已超限</span>}
            </div>
          </div>
        </div>

        {/* 请求趋势 */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm mb-6">
          <h3 className="text-gray-800 font-medium mb-4">请求趋势（24h）</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={timeline?.timeline || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={formatBeijing} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }} />
              <Line type="monotone" dataKey="totalRequests" stroke="#6366f1" strokeWidth={2} name="请求数" dot={false} />
              <Line type="monotone" dataKey="totalTokens" stroke="#3b82f6" strokeWidth={2} name="Token" dot={false} />
              <Line type="monotone" dataKey="cacheHits" stroke="#10b981" strokeWidth={2} name="缓存命中" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 缓存信息 */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-gray-800 font-medium mb-4">缓存信息</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-gray-500 text-xs">缓存条目</div>
              <div className="text-xl font-bold text-gray-800 mt-1">{cache.totalEntries || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-xs">总命中</div>
              <div className="text-xl font-bold text-emerald-600 mt-1">{cache.totalHits || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-xs">平均命中/条</div>
              <div className="text-xl font-bold text-amber-600 mt-1">{cache.avgHits || 0}</div>
            </div>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100 mt-6">
          <h3 className="text-indigo-800 font-medium mb-2">📋 如何使用</h3>
          <div className="text-sm text-indigo-600 space-y-1">
            <div>Base URL: <code className="bg-white px-2 py-0.5 rounded text-indigo-700">http://localhost:8787/v1</code></div>
            <div>API Key: <code className="bg-white px-2 py-0.5 rounded text-indigo-700">{apiKeyInfo.keyPrefix}...</code></div>
            <div>模型: <code className="bg-white px-2 py-0.5 rounded text-indigo-700">deepseek-v4-flash</code> / <code className="bg-white px-2 py-0.5 rounded text-indigo-700">deepseek-v4-pro</code></div>
          </div>
        </div>
      </main>
    </div>
  );
}