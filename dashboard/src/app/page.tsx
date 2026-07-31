"use client";

import { useState } from "react";
import { ApiClient } from "@/lib/api";
import ManagerDashboard from "./_dashboard-client";
import UserDashboard from "./_user-dashboard";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<ApiClient | null>(null);
  const [role, setRole] = useState<"manager" | "user" | null>(null);

  const handleLogin = async () => {
    if (!apiKey.trim()) {
      setError("请输入 API Key");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const c = new ApiClient(apiKey.trim());
      // 先尝试 master key（管理端）
      try {
        await c.getTenants();
        setClient(c);
        setRole("manager");
        return;
      } catch {
        // 不是 master key，尝试 user 端
      }
      // 尝试 user 端
      try {
        await c.get("/user/overview");
        setClient(c);
        setRole("user");
        return;
      } catch {
        setError("API Key 无效，请检查后重试");
      }
    } catch (e) {
      setError((e as Error).message || "认证失败");
    } finally {
      setLoading(false);
    }
  };

  if (client && role === "manager") {
    return <ManagerDashboard client={client} />;
  }
  if (client && role === "user") {
    return <UserDashboard client={client} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 mb-4 shadow-lg shadow-indigo-200">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Nexus LLM Gateway</h1>
          <p className="text-gray-500 mt-2">AI 统一网关管理平台</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50"
                placeholder="输入 Master Key 或 API Key"
              />
            </div>
            {error && (
              <div className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2 border border-red-100">{error}</div>
            )}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm"
            >
              {loading ? "验证中..." : "进入看板"}
            </button>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex gap-4 text-xs text-gray-400">
              <div>
                <div className="font-medium text-gray-600">管理员</div>
                <div>Master Key → 管理端</div>
              </div>
              <div>
                <div className="font-medium text-gray-600">用户</div>
                <div>API Key → 用户端</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}