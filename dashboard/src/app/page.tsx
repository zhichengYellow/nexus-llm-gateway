"use client";

import { useState } from "react";
import { ApiClient } from "@/lib/api";
import Dashboard from "./_dashboard-client";

export default function Home() {
  const [masterKey, setMasterKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<ApiClient | null>(null);

  const handleLogin = async () => {
    if (!masterKey.trim()) {
      setError("请输入 Master Key");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const c = new ApiClient(masterKey.trim());
      await c.get("/health");
      setClient(c);
    } catch (e) {
      setError((e as Error).message || "认证失败，请检查 Master Key 和网关是否启动");
    } finally {
      setLoading(false);
    }
  };

  if (client) {
    return <Dashboard client={client} />;
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
          <p className="text-gray-500 mt-2">AI 统一网关管理看板</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Master Key</label>
              <input
                type="password"
                value={masterKey}
                onChange={(e) => setMasterKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50"
                placeholder="sk-nexus-master-change-me"
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
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          需要网关的 Master Key 才能登录
        </p>
      </div>
    </div>
  );
}
