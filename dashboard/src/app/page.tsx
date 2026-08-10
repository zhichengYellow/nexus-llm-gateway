"use client";

import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/api";
import ManagerDashboard from "./_dashboard-client";
import UserDashboard from "./_user-dashboard";
import { KeyRound, Zap, Shield, Server, UserPlus, RefreshCw, Copy } from "lucide-react";

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
  const [regCaptcha, setRegCaptcha] = useState<{ captchaId: string; prompt: string } | null>(null);
  const [regCaptchaAnswer, setRegCaptchaAnswer] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787"}/auth/status`);
      const data = await res.json().catch(() => ({}));
      setRegEnabled(!!data.registrationEnabled);
    } catch {
      setRegEnabled(false);
    }
  };

  const loadCaptcha = async (retry = 0) => {
    setCaptchaLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787"}/auth/captcha`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        setRegCaptcha({ captchaId: data.captchaId ?? data.id, prompt: data.prompt });
      } else if (retry < 3) {
        // 失败自动重试（最多 3 次，间隔 1s），避免冷启动/瞬时错误导致无验证码可用
        setTimeout(() => loadCaptcha(retry + 1), 1000);
      }
    } catch {
      if (retry < 3) {
        setTimeout(() => loadCaptcha(retry + 1), 1000);
      } else {
        setRegCaptcha(null);
      }
    } finally {
      setCaptchaLoading(false);
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
    if (!regCaptcha || !regCaptchaAnswer.trim()) {
      // 验证码还没加载出来：自动触发加载并提示，避免"卡死"
      setError("验证码加载中，请稍候或点击题目刷新");
      if (!regCaptcha) loadCaptcha();
      return;
    }
    setRegLoading(true); setError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: regUser.trim(),
          password: regPass,
          captchaId: regCaptcha.captchaId,
          captchaAnswer: Number(regCaptchaAnswer.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "注册失败");
        // 验证码是一次性的：任何失败后都刷新验证码，保证下次提交必可用
        setRegCaptchaAnswer("");
        loadCaptcha();
        return;
      }
      setRegResult(data);
    } catch (e) {
      setError((e as Error).message || "网络错误");
      loadCaptcha();
    } finally {
      setRegLoading(false);
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(regResult?.apiKey ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const clearRegForm = () => {
    setRegUser(""); setRegPass(""); setRegResult(null); setShowRegister(false);
    setRegCaptchaAnswer(""); setRegCaptcha(null);
  };

  const openRegister = () => {
    setError("");
    setShowRegister(true);
    loadCaptcha();
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
                  onClick={openRegister}
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
              <p className="text-zinc-400 text-sm mb-4">你的 API Key <span className="text-amber-400">仅显示一次</span>，请立即复制并妥善保存</p>
              <div className="relative">
                <div className="bg-zinc-950/60 rounded-lg px-3 py-2.5 border border-zinc-800 font-mono text-sm text-zinc-200 break-all mb-3 pr-20">
                  {regResult.apiKey}
                </div>
                <button
                  onClick={copyKey}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 text-zinc-300 transition flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />{copied ? "已复制 ✓" : "复制"}
                </button>
              </div>
              <p className="text-amber-400/80 text-xs mb-5">
                ⚠️ 关闭此页后将无法再次查看该 Key。BYOK 模式：需自配 Provider API Key，成本自理
              </p>
              <button
                onClick={clearRegForm}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500 transition"
              >
                我已保存 Key，去登录
              </button>
              <button
                onClick={clearRegForm}
                className="w-full mt-2 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition"
              >
                重新注册（将无法再查看此 Key）
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
                <p className="text-[10px] text-zinc-600 mt-1 ml-1">至少 8 位（当前版本密码为预留字段，实际凭 API Key 登录）</p>
              </div>
              <div>
                <div className="flex items-stretch gap-2">
                  <input
                    type="text" value={regCaptchaAnswer}
                    onChange={(e) => setRegCaptchaAnswer(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    inputMode="numeric" maxLength={3}
                    className="w-24 px-3 py-2.5 bg-zinc-800/40 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-emerald-500/50"
                    placeholder="答案"
                    onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  />
                  <button
                    type="button" onClick={() => loadCaptcha()} disabled={captchaLoading}
                    className="flex-1 px-3 py-2.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-zinc-300 text-sm font-mono hover:bg-zinc-800 transition flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <span>{captchaLoading ? "加载中…" : (regCaptcha?.prompt ?? "验证码加载失败，点击重试")}</span>
                    <RefreshCw className={`w-3 h-3 ${captchaLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1 ml-1">输入算式结果（防止机器人注册）</p>
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
