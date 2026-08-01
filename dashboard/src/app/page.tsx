"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import ManagerDashboard from "./_dashboard-client";
import UserDashboard from "./_user-dashboard";
import { KeyRound, Zap, Shield, Users, Server } from "lucide-react";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<ApiClient | null>(null);
  const [role, setRole] = useState<"manager" | "user" | null>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem("nexus_api_key");
    if (savedKey) {
      setApiKey(savedKey);
      autoLogin(savedKey);
    }
  }, []);

  const autoLogin = async (key: string) => {
    try {
      const c = new ApiClient(key);
      try { await c.getTenants(); setClient(c); setRole("manager"); localStorage.setItem("nexus_api_key", key); return; } catch {}
      try { await c.get("/user/overview"); setClient(c); setRole("user"); localStorage.setItem("nexus_api_key", key); return; } catch {}
    } catch {}
  };

  const handleLogin = async () => {
    if (!apiKey.trim()) { setError("请输入 API Key"); return; }
    setLoading(true); setError("");
    try {
      const c = new ApiClient(apiKey.trim());
      try { await c.getTenants(); setClient(c); setRole("manager"); localStorage.setItem("nexus_api_key", apiKey.trim()); return; } catch {}
      try { await c.get("/user/overview"); setClient(c); setRole("user"); localStorage.setItem("nexus_api_key", apiKey.trim()); return; }
      catch { setError("API Key 无效，请检查后重试"); }
    } catch (e) { setError((e as Error).message || "认证失败"); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem("nexus_api_key");
    setClient(null); setRole(null); setApiKey("");
  };

  if (client && role === "manager") return <ManagerDashboard client={client} onLogout={handleLogout} />;
  if (client && role === "user") return <UserDashboard client={client} onLogout={handleLogout} />;

  return (
    <div className="min-h-screen bg-[#0A0D14] relative overflow-hidden flex items-center justify-center p-4 text-zinc-100">
      {/* 背景光晕 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 mb-4 shadow-lg shadow-emerald-500/10">
            <Zap className="w-6 h-6 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Nexus LLM Gateway</h1>
          <p className="text-zinc-500 text-sm mt-1">AI 统一网关管理平台</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-8 shadow-2xl hover:border-zinc-700 transition-all duration-200">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5 font-medium">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="w-full px-4 py-2.5 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition"
                placeholder="输入 Master Key 或 API Key"
              />
            </div>
            {error && (
              <div className="text-rose-400 text-sm bg-rose-500/10 rounded-lg px-3 py-2 border border-rose-500/20">{error}</div>
            )}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500 transition disabled:opacity-50 shadow-lg shadow-emerald-500/20"
            >
              {loading ? "验证中..." : "进入看板"}
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-zinc-800/60">
            <div className="flex justify-center gap-6 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-emerald-400" />Master Key → 管理端</span>
              <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-blue-400" />API Key → 用户端</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-600 mt-3">
              <Server className="w-3 h-3" /> gateway running · live monitoring
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}