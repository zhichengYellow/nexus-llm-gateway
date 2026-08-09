"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import ManagerDashboard from "./_dashboard-client";
import UserDashboard from "./_user-dashboard";
import { KeyRound, Zap, Shield, Server, UserPlus } from "lucide-react";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<ApiClient | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [regEnabled, setRegEnabled] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regResult, setRegResult] = useState<any>(null);
  const [regLoading, setRegLoading] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem("nexus_api_key");
    if (savedKey) {
      setApiKey(savedKey);
      autoLogin(savedKey);
    }
    // 检测注册开关
    checkRegEnabled();
  }, []);

  const checkRegEnabled = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787"}/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "_check", password: "________" }),
      });
      // 403 = disabled, 429 = rate-limited, 409 = username exists → all mean enabled
      const status = res.status;
      if (status === 403) {
        setRegEnabled(false);
      } else {
        // 任何非 403 响应都说明端点存在且开启
        setRegEnabled(true);
      }
    } catch {
      setRegEnabled(false);
    }
  };

  const autoLogin = async (key: string) => {
    try {
      const c = new ApiClient(key);
      try {
        await c.getTenants(); // Master Key 可访问
        setClient(c);
        setIsMaster(true);
        localStorage.setItem("nexus_api_key", key);
      } catch {
        // 非 Master Key → 尝试用户端
        try {
          await c.getUserOverview();
          setClient(c);
          setIsMaster(false);
          localStorage.setItem("nexus_api_key", key);
        } catch {
          // 无效 key
        }
      }
    } catch {}
  };

  const handleLogin = async () => {
    if (!apiKey.trim()) { setError("请输入 API Key 或 Master Key"); return; }
    setLoading(true); setError("");
    try {
      const c = new ApiClient(apiKey.trim());
      try {
        await c.getTenants();
        setClient(c);
        setIsMaster(true);
        localStorage.setItem("nexus_api_key", apiKey.trim());
      } catch {
        // 尝试作为用户 API Key
        try {
          await c.getUserOverview();
          setClient(c);
          setIsMaster(false);
          localStorage.setItem("nexus_api_key", apiKey.trim());
        } catch {
          setError("Key 无效，请检查后重试");
        }
      }
    } catch (e) { setError((e as Error).message || "认证失败"); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!regUser.trim() || !regPass.trim()) { setError("请填写用户名和密码"); return; }
    setRegLoading(true); setError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUser.trim(), password: regPass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "注册失败");
        return;
      }
      setRegResult(data);
    } catch (e) {
      setError((e as Error).message || "网络错误");
    } finally {
      setRegLoading(false);
    }
  };

  const clearRegForm = () => {
    setRegUser(""); setRegPass(""); setRegResult(null); setShowRegister(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("nexus_api_key");
    setClient(null); setApiKey(""); setIsMaster(false);
    clearRegForm();
  };

  if (client && isMaster) return <ManagerDashboard client={client} onLogout={handleLogout} />;
  if (client && !isMaster) return <UserDashboard client={client} onLogout={handleLogout} />;

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
          <p className="text-zinc-500 text-sm mt-1">AI Cost Optimization Platform</p>
        </div>

        {!showRegister ? (
          <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-8 shadow-2xl hover:border-zinc-700 transition-all duration-200">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5 font-medium">API Key / Master Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full px-4 py-2.5 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition"
                  placeholder="输入 Key 进入看板"
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
                <span className="flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5 text-blue-400" />API Key → 用户端</span>
              </div>
              {regEnabled && (
                <button
                  onClick={() => setShowRegister(true)}
                  className="w-full mt-3 py-2 text-xs text-zinc-400 hover:text-emerald-400 border border-zinc-800/60 rounded-lg hover:border-emerald-500/20 transition flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-3 h-3" /> 没有 Key？注册一个（BYOK 模式）
                </button>
              )}
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-600 mt-3">
                <Server className="w-3 h-3" /> gateway running · live monitoring
              </div>
            </div>
          </div>
        ) : regResult ? (
          <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-8 shadow-2xl hover:border-zinc-700 transition-all duration-200">
            <div className="text-center">
              <div className="text-emerald-400 text-lg font-semibold mb-2">✅ 注册成功！</div>
              <p className="text-zinc-400 text-sm mb-4">请立即保存你的 API Key（仅显示一次）</p>
              <div className="bg-zinc-950/60 rounded-lg px-3 py-2 border border-zinc-800 font-mono text-sm text-zinc-200 break-all mb-3">
                {regResult.apiKey}
              </div>
              <p className="text-amber-400/80 text-xs mb-4">
                ⚠️ BYOK 模式：你需自配 Provider API Key，成本自理，无免费额度
              </p>
              <button
                onClick={() => {
                  setApiKey(regResult.apiKey);
                  clearRegForm();
                }}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500 transition"
              >
                使用此 Key 登录
              </button>
              <button
                onClick={clearRegForm}
                className="w-full mt-2 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition"
              >
                返回登录
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded-2xl p-8 shadow-2xl hover:border-zinc-700 transition-all duration-200">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4 text-center">注册新账号（BYOK 模式）</h3>
            <div className="space-y-3">
              <div>
                <input
                  type="text" value={regUser} onChange={(e) => setRegUser(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-emerald-500/50"
                  placeholder="用户名"
                />
                <p className="text-[10px] text-zinc-600 mt-1 ml-1">2-30 位，仅允许字母、数字、下划线、短横</p>
              </div>
              <div>
                <input
                  type="password" value={regPass} onChange={(e) => setRegPass(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-emerald-500/50"
                  placeholder="密码"
                />
                <p className="text-[10px] text-zinc-600 mt-1 ml-1">至少 8 位</p>
              </div>
              {error && (
                <div className="text-rose-400 text-sm bg-rose-500/10 rounded-lg px-3 py-2 border border-rose-500/20">{error}</div>
              )}
              <button
                onClick={handleRegister}
                disabled={regLoading}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500 transition disabled:opacity-50"
              >
                {regLoading ? "注册中..." : "注册"}
              </button>
              <button
                onClick={clearRegForm}
                className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 transition"
              >
                返回登录
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
