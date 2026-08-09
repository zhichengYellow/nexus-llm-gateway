"use client";

import { useEffect, useState } from "react";
import type { ApiClient } from "@/lib/api";
import {
  Gauge, CheckCircle2, XCircle, Copy, RefreshCw, ArrowRight, ArrowLeft,
  Send, Sparkles, Zap, ShieldCheck, Plug, Layers,
} from "lucide-react";

const PROVIDER_OPTIONS = ["deepseek", "openai", "gemini", "qwen", "moonshot", "zhipu", "ollama"];

const PROFILES = [
  { name: "fast", label: "⚡ Fast", desc: "最低延迟，不做任何优化处理", hint: "适合实时交互" },
  { name: "balanced", label: "⚖ Balanced", desc: "质量与成本平衡，适度压缩与缓存", hint: "推荐默认" },
  { name: "cheap", label: "💰 Cheap", desc: "优先便宜 Provider，积极压缩与缓存", hint: "省钱模式" },
  { name: "maximum_saving", label: "🪙 Maximum Saving", desc: "最大化成本节省，允许激进优化", hint: "可能增加延迟" },
];

interface Props {
  client: ApiClient;
  apiUrl: string;
  onDone: () => void;
  onDismiss: () => void;
}

export default function OnboardingWizard({ client, apiUrl, onDone, onDismiss }: Props) {
  const [step, setStep] = useState(1);
  const [providers, setProviders] = useState<any[]>([]);
  const [selProvider, setSelProvider] = useState("deepseek");
  const [keyInput, setKeyInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [profile, setProfile] = useState("balanced");
  const [copied, setCopied] = useState<string | null>(null);
  const [modelInput, setModelInput] = useState("deepseek-chat");
  const [message, setMessage] = useState("用一句话介绍 Nexus 网关能做什么？");
  const [sending, setSending] = useState(false);
  const [reqResult, setReqResult] = useState<any>(null);
  const [reqError, setReqError] = useState("");

  useEffect(() => { loadProviders(); }, []);

  const loadProviders = async () => {
    try {
      const r = await client.getUserProviderKeys();
      setProviders(r.providers || []);
    } catch {}
  };

  const configured = (p: string) => providers.find((k) => k.provider === p)?.configured;
  const configuredCount = providers.filter((k) => k.configured).length;
  const hasTestedProvider = testResult?.status === "ok";

  const saveKeyAndTest = async () => {
    const val = keyInput.trim();
    if (!val) { setTestResult({ status: "error", error: "请先输入 API Key" }); return; }
    setTesting(true); setTestResult(null);
    try {
      await client.setUserProviderKey(selProvider, val);
      setKeyInput("");
      await loadProviders();
      const { result } = await client.postUserSpeedTest(selProvider);
      setTestResult(result);
    } catch (e) {
      setTestResult({ status: "error", error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const baseUrl = `${apiUrl}/v1`;

  const curlExample = `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${client.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelInput}",
    "messages": [{"role": "user", "content": "你好"}]
  }'`;

  const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${client.apiKey}",
)

resp = client.chat.completions.create(
    model="${modelInput}",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)`;

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500); })
      .catch(() => {});
  };

  const sendTest = async () => {
    setSending(true); setReqError(""); setReqResult(null);
    try {
      const res = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${client.apiKey}`,
          ...(profile !== "balanced" ? { "x-nexus-profile": profile } : {}),
        },
        body: JSON.stringify({ model: modelInput, messages: [{ role: "user", content: message }], max_tokens: 60 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      const requestId = data.nexus?.requestId;
      if (requestId) {
        try {
          const d = await client.getUserRequest(requestId);
          setReqResult({ ...d.request, reply: data.choices?.[0]?.message?.content ?? "" });
        } catch {
          setReqResult({ reply: data.choices?.[0]?.message?.content ?? "" });
        }
      } else {
        setReqResult({ reply: data.choices?.[0]?.message?.content ?? "" });
      }
    } catch (e) {
      setReqError((e as Error).message || "请求失败");
    } finally {
      setSending(false);
    }
  };

  const steps = [
    { n: 1, label: "Provider", icon: Plug },
    { n: 2, label: "优化档位", icon: Layers },
    { n: 3, label: "连接", icon: Zap },
    { n: 4, label: "首次请求", icon: Send },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl w-full max-w-2xl shadow-2xl">
        {/* 头部：步骤条 */}
        <div className="px-6 pt-5 pb-4 border-b border-zinc-800/70">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-zinc-100">首次使用引导</h2>
              <span className="text-[11px] text-zinc-500 ml-1">3 分钟跑通第一次请求</span>
            </div>
            <button onClick={onDismiss} className="text-xs text-zinc-500 hover:text-zinc-300 transition">跳过引导</button>
          </div>
          <div className="flex gap-2">
            {steps.map((s) => (
              <div key={s.n} className={`flex-1 flex items-center gap-2 rounded-lg px-3 py-2 border transition-all ${step === s.n ? "bg-emerald-500/10 border-emerald-500/30" : step > s.n ? "bg-zinc-800/60 border-zinc-700/50" : "bg-zinc-800/30 border-zinc-800/60 opacity-60"}`}>
                <s.icon className={`w-4 h-4 shrink-0 ${step >= s.n ? "text-emerald-400" : "text-zinc-600"}`} />
                <span className={`text-xs ${step === s.n ? "text-zinc-100" : "text-zinc-500"}`}>{s.n}. {s.label}</span>
                {step > s.n && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* ============ Step 1: Provider ============ */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">连接你的模型 Provider</h3>
                <p className="text-xs text-zinc-500">Nexus 采用 <span className="text-zinc-300">BYOK</span> 模式——你用自己的 Provider API Key，Nexus 不提供模型额度。你的 Key 仅用于向对应 Provider 发送请求（AES-256-GCM 加密存储）。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_OPTIONS.map((p) => (
                  <button key={p} onClick={() => { setSelProvider(p); setTestResult(null); }}
                    className={`px-3 py-1.5 rounded-lg text-xs border capitalize transition ${
                      selProvider === p ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "bg-zinc-800/40 border-zinc-700/50 text-zinc-400 hover:border-zinc-600"
                    }`}>
                    {p}{configured(p) && <span className="ml-1.5 text-emerald-400">✓</span>}
                  </button>
                ))}
              </div>
              {configured(selProvider) ? (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4" /> 已配置 {selProvider} 的 API Key
                </div>
              ) : (
                <div className="flex items-stretch gap-2">
                  <input
                    type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveKeyAndTest()}
                    className="flex-1 px-3 py-2.5 bg-zinc-950/60 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm font-mono focus:outline-none focus:border-emerald-500/50"
                    placeholder={`输入 ${selProvider} 的 API Key`}
                  />
                  <button onClick={saveKeyAndTest} disabled={testing}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2 shrink-0">
                    <Gauge className={`w-4 h-4 ${testing ? "animate-spin" : ""}`} />{testing ? "测试中…" : "保存并测试"}
                  </button>
                </div>
              )}
              {testResult && (
                <div className={`text-xs rounded-lg px-3 py-2 border flex items-center gap-2 ${testResult.status === "ok" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-rose-500/5 border-rose-500/20 text-rose-400"}`}>
                  {testResult.status === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                  {testResult.status === "ok"
                    ? <>连接成功 · 端到端 {testResult.totalMs >= 1000 ? (testResult.totalMs / 1000).toFixed(1) + "s" : testResult.totalMs + "ms"}（真实最小对话请求）</>
                    : <>连接失败：{testResult.error || testResult.status}</>}
                </div>
              )}
              <div className="flex justify-end pt-2">
                <button onClick={() => setStep(2)} disabled={configuredCount === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 disabled:opacity-40 flex items-center gap-1.5">
                  下一步 <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ============ Step 2: Profile ============ */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">想省多少？</h3>
                <p className="text-xs text-zinc-500">选择优化档位，Nexus 自动决定压缩强度、缓存策略与路由倾向。底层细节无需关心。</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {PROFILES.map((p) => (
                  <button key={p.name} onClick={() => setProfile(p.name)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      profile === p.name ? "bg-blue-500/10 border-blue-500/30" : "bg-zinc-800/40 border-zinc-700/50 hover:border-zinc-600"
                    }`}>
                    <div className="text-sm font-medium text-zinc-100">{p.label}{p.name === "balanced" && <span className="ml-1.5 text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">推荐</span>}</div>
                    <div className="text-xs text-zinc-400 mt-1">{p.desc}</div>
                    <div className="text-[10px] text-zinc-600 mt-1">{p.hint}</div>
                  </button>
                ))}
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />上一步</button>
                <button onClick={() => setStep(3)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 flex items-center gap-1.5">下一步 <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {/* ============ Step 3: Connect ============ */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">接入你的工具</h3>
                <p className="text-xs text-zinc-500">把下面的 Base URL 与 API Key 填进任何 OpenAI 兼容客户端（Cursor / Cline / LangChain / SDK），模型名用你 Provider 的真实模型名（如 <code className="bg-zinc-800 px-1 rounded">deepseek-chat</code>）。</p>
              </div>
              <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3">
                <div>
                  <div className="text-[10px] text-zinc-600 mb-1">BASE URL</div>
                  <div className="font-mono text-sm text-emerald-400 break-all">{baseUrl}</div>
                </div>
                <button onClick={() => copy("url", baseUrl)} className="px-2.5 py-1.5 text-[11px] bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 text-zinc-300 flex items-center gap-1 shrink-0 ml-3">
                  <Copy className="w-3 h-3" />{copied === "url" ? "已复制 ✓" : "复制"}
                </button>
              </div>
              <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3">
                <div>
                  <div className="text-[10px] text-zinc-600 mb-1">API KEY（你的 Nexus Key）</div>
                  <div className="font-mono text-sm text-zinc-300 break-all">{client.apiKey.slice(0, 16)}…{client.apiKey.slice(-4)}</div>
                </div>
                <button onClick={() => copy("key", client.apiKey)} className="px-2.5 py-1.5 text-[11px] bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 text-zinc-300 flex items-center gap-1 shrink-0 ml-3">
                  <Copy className="w-3 h-3" />{copied === "key" ? "已复制 ✓" : "复制"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-zinc-500 font-mono">curl</span>
                    <button onClick={() => copy("curl", curlExample)} className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                      <Copy className="w-3 h-3" />{copied === "curl" ? "已复制 ✓" : "复制"}
                    </button>
                  </div>
                  <pre className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 text-[11px] text-zinc-300 overflow-x-auto leading-relaxed">{curlExample}</pre>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-zinc-500 font-mono">Python (openai SDK)</span>
                    <button onClick={() => copy("py", pythonExample)} className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                      <Copy className="w-3 h-3" />{copied === "py" ? "已复制 ✓" : "复制"}
                    </button>
                  </div>
                  <pre className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 text-[11px] text-zinc-300 overflow-x-auto leading-relaxed">{pythonExample}</pre>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(2)} className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />上一步</button>
                <button onClick={() => setStep(4)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 flex items-center gap-1.5">下一步 <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {/* ============ Step 4: First Request ============ */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">发出你的第一次请求</h3>
                <p className="text-xs text-zinc-500">通过网关发一条真实请求，看看 Nexus 帮你省了什么。</p>
              </div>
              <div className="flex items-stretch gap-2">
                <input
                  type="text" value={modelInput} onChange={(e) => setModelInput(e.target.value)}
                  className="w-40 px-3 py-2.5 bg-zinc-950/60 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm font-mono focus:outline-none focus:border-emerald-500/50"
                  placeholder="模型名，如 deepseek-chat"
                />
                <input
                  type="text" value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendTest()}
                  className="flex-1 px-3 py-2.5 bg-zinc-950/60 border border-zinc-700/50 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-emerald-500/50"
                  placeholder="输入测试消息"
                />
                <button onClick={sendTest} disabled={sending}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2 shrink-0">
                  <Send className={`w-4 h-4 ${sending ? "animate-pulse" : ""}`} />{sending ? "请求中…" : "发送"}
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                当前档位：{PROFILES.find((p) => p.name === profile)?.label}（通过 <code className="bg-zinc-800 px-1 rounded">x-nexus-profile</code> 请求头生效）
              </div>

              {reqError && (
                <div className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2">{reqError}</div>
              )}

              {reqResult && (
                <div className="space-y-3">
                  {/* 节省卡片 */}
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-zinc-100">Nexus Optimization</span>
                      {reqResult.cached && (
                        <span className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">⚡ 缓存命中 · 上游请求已避免</span>
                      )}
                    </div>
                    {(reqResult.originalTokens != null || reqResult.savedTokens > 0) ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-900/60 rounded-lg p-3">
                          <div className="text-[10px] text-zinc-600 mb-1">ORIGINAL</div>
                          <div className="text-lg font-semibold text-zinc-300">{reqResult.originalTokens ?? 0}</div>
                          <div className="text-[10px] text-zinc-600">tokens</div>
                        </div>
                        <div className="bg-zinc-900/60 rounded-lg p-3">
                          <div className="text-[10px] text-zinc-600 mb-1">OPTIMIZED</div>
                          <div className="text-lg font-semibold text-zinc-300">{reqResult.optimizedTokens ?? 0}</div>
                          <div className="text-[10px] text-zinc-600">tokens</div>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                          <div className="text-[10px] text-emerald-500/70 mb-1">SAVED</div>
                          <div className="text-lg font-semibold text-emerald-400">{(reqResult.savedTokens ?? 0).toLocaleString()}</div>
                          <div className="text-[10px] text-emerald-500/70">tokens · 来源：{reqResult.savings?.source ?? "—"}</div>
                        </div>
                        <div className="bg-zinc-900/60 rounded-lg p-3">
                          <div className="text-[10px] text-zinc-600 mb-1">REDUCTION</div>
                          <div className="text-lg font-semibold text-zinc-300">{((reqResult.reductionRate ?? 0) * 100).toFixed(1)}%</div>
                          <div className="text-[10px] text-zinc-600">token 缩减率</div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">本次请求较短或未触发优化（<code className="bg-zinc-800 px-1 rounded">max_tokens: 60</code>）。多轮/长消息能体现更明显的节省——去「请求记录」可查看每次请求的归因明细。</p>
                    )}
                    {reqResult.latencyMs != null && (
                      <div className="mt-3 pt-3 border-t border-zinc-800/60 text-[11px] text-zinc-500 flex gap-4">
                        <span>总延迟：{reqResult.latencyMs}ms</span>
                        {reqResult.compressionRatio != null && reqResult.compressionRatio > 0 && <span>压缩比：{reqResult.compressionRatio.toFixed(1)}x</span>}
                        <span>Provider：{reqResult.provider}</span>
                      </div>
                    )}
                  </div>
                  {reqResult.reply && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                      <div className="text-[10px] text-zinc-600 mb-2">模型回复</div>
                      <div className="text-xs text-zinc-300 leading-relaxed">{reqResult.reply}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(3)} className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />上一步</button>
                <button onClick={onDone} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 flex items-center gap-1.5">
                  完成，进入控制台 <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
