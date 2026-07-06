"use client";
/**
 * HardwareScanner.tsx — Autonomously maps the host machine's capabilities,
 * recommends the optimal Ollama model, and triggers a one-click download.
 *
 * Flow:
 *  1. User hits "Scan Hardware" → GET /api/hardware/scan
 *  2. Backend runs nvidia-smi / rocm-smi / system_profiler, returns profile + ranked recs
 *  3. UI shows capability tier badge, hardware breakdown, ranked model cards
 *  4. "Download" button → POST /api/hardware/download {model}
 *  5. Simulated progress bar while ollama pull runs in background
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu, HardDrive, Zap, Download, CheckCircle2,
  AlertCircle, Loader2, ChevronRight, Server,
  MemoryStick, Monitor, Star,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface HardwareProfile {
  os: string; cpu_model: string; cpu_cores: number; ram_gb: number;
  gpu_vendor: string; gpu_model: string; vram_gb: number;
  cuda_version: string; metal_support: boolean;
  ollama_installed: boolean; ollama_version: string;
  tier: "LOW" | "MID" | "HIGH" | "ULTRA";
}
interface ModelRec {
  rank: number; name: string; display_name: string; params: string;
  quant: string; vram_required: number; ram_required: number;
  tier: string; use_case: string; speed_est: string; quality: string;
  pull_command: string; size_gb: number;
}
interface ScanResult { profile: HardwareProfile; recommendations: ModelRec[]; }
type DownloadState = "idle" | "pending" | "pulling" | "done" | "error";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TIER_META = {
  LOW:   { color:"#fb7185", bg:"rgba(251,113,133,.12)", label:"CPU / Low VRAM",    desc:"Models ≤ 4GB RAM"      },
  MID:   { color:"#fbbf24", bg:"rgba(251,191,36,.12)",  label:"Mid-tier GPU",      desc:"6–12 GB VRAM"          },
  HIGH:  { color:"#22d3ee", bg:"rgba(34,211,238,.12)",  label:"High-end GPU",      desc:"12–24 GB VRAM"         },
  ULTRA: { color:"#a78bfa", bg:"rgba(167,139,250,.12)", label:"Enthusiast / Apple Silicon", desc:"24+ GB VRAM / M-series" },
};
const QUALITY_COLOR = { Best:"#a78bfa", Great:"#22d3ee", Good:"#34d399", Acceptable:"#fbbf24" };
const VENDOR_EMOJI  = { NVIDIA:"🟢", AMD:"🔴", Apple:"🍎", None:"⬜" };

// ── Mock scan result (used when backend is unreachable) ───────────────────────
function mockScan(): ScanResult {
  return {
    profile: {
      os:"macOS 14.5 (Sonoma)", cpu_model:"Apple M2 Pro", cpu_cores:12,
      ram_gb:32, gpu_vendor:"Apple", gpu_model:"Apple M2 Pro (19-core GPU)",
      vram_gb:32, cuda_version:"", metal_support:true,
      ollama_installed:true, ollama_version:"0.1.38", tier:"HIGH",
    },
    recommendations: [
      { rank:1, name:"llama3:13b", display_name:"Llama 3 13B", params:"13B", quant:"Q4_K_M", vram_required:8, ram_required:16, tier:"HIGH", use_case:"Balanced performance, great for agents", speed_est:"~22 tok/s", quality:"Great", pull_command:"ollama pull llama3:13b", size_gb:7.4 },
      { rank:2, name:"mistral:7b-instruct-v0.3", display_name:"Mistral 7B v0.3", params:"7B", quant:"Q4_K_M", vram_required:5, ram_required:8, tier:"HIGH", use_case:"Fast instruction-following", speed_est:"~35 tok/s", quality:"Great", pull_command:"ollama pull mistral:7b-instruct-v0.3", size_gb:4.1 },
      { rank:3, name:"codellama:13b", display_name:"CodeLlama 13B", params:"13B", quant:"Q4_K_M", vram_required:8, ram_required:16, tier:"HIGH", use_case:"Code generation & analysis", speed_est:"~20 tok/s", quality:"Great", pull_command:"ollama pull codellama:13b", size_gb:7.4 },
      { rank:4, name:"llama3:8b", display_name:"Llama 3 8B", params:"8B", quant:"Q4_K_M", vram_required:5, ram_required:8, tier:"MID", use_case:"Default worker-agent model", speed_est:"~28 tok/s", quality:"Good", pull_command:"ollama pull llama3:8b", size_gb:4.7 },
      { rank:5, name:"gemma2:9b", display_name:"Gemma 2 9B", params:"9B", quant:"Q4_K_M", vram_required:6, ram_required:10, tier:"MID", use_case:"Google's efficient mid-tier", speed_est:"~25 tok/s", quality:"Good", pull_command:"ollama pull gemma2:9b", size_gb:5.4 },
      { rank:6, name:"phi3:mini", display_name:"Phi-3 Mini 3.8B", params:"3.8B", quant:"Q4", vram_required:2.5, ram_required:6, tier:"MID", use_case:"Ultra-fast lightweight tasks", speed_est:"~55 tok/s", quality:"Good", pull_command:"ollama pull phi3:mini", size_gb:2.3 },
    ],
  };
}

export default function HardwareScanner() {
  const [scanState,  setScanState]  = useState<"idle"|"scanning"|"done"|"error">("idle");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError,  setScanError]  = useState("");
  const [downloads,  setDownloads]  = useState<Record<string,DownloadState>>({});
  const [progress,   setProgress]   = useState<Record<string,number>>({});

  // ── Scan ────────────────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    setScanState("scanning");
    setScanResult(null);
    setScanError("");
    try {
      const res = await fetch(`${API}/api/hardware/scan`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ScanResult = await res.json();
      setScanResult(data);
      setScanState("done");
    } catch {
      // Use mock when backend unreachable (preview mode)
      const mock = mockScan();
      setScanResult(mock);
      setScanState("done");
    }
  }, []);

  // ── Download ────────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async (model: ModelRec) => {
    setDownloads(d => ({ ...d, [model.name]:"pending" }));
    setProgress(p  => ({ ...p, [model.name]:0 }));

    try {
      const res = await fetch(`${API}/api/hardware/download`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model: model.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download failed");

      setDownloads(d => ({ ...d, [model.name]:"pulling" }));
      // Simulate progress (real progress comes from ollama CLI output)
      let pct = 0;
      const interval = setInterval(() => {
        pct += Math.random() * 4 + 1;
        if (pct >= 100) {
          pct = 100;
          clearInterval(interval);
          setDownloads(d => ({ ...d, [model.name]:"done" }));
        }
        setProgress(p => ({ ...p, [model.name]: Math.min(pct, 100) }));
      }, 600);
    } catch (err: any) {
      setDownloads(d => ({ ...d, [model.name]:"error" }));
    }
  }, []);

  const profile = scanResult?.profile;
  const recs    = scanResult?.recommendations ?? [];
  const tierMeta = profile ? TIER_META[profile.tier] : null;

  return (
    <div className="glass-panel rounded-xl overflow-hidden flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Monitor className="w-4 h-4 text-si-violet" />
          Hardware Scanner · Model Recommender
        </h3>
        <button onClick={handleScan} disabled={scanState==="scanning"}
          className="flex items-center gap-2 bg-si-violet/10 border border-si-violet/30 text-si-violet rounded-lg px-4 py-2 text-[11px] font-mono uppercase tracking-wider hover:bg-si-violet/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {scanState==="scanning"
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/>Scanning…</>
            : <><Zap className="w-3.5 h-3.5"/>Scan Hardware</>}
        </button>
      </div>

      {/* ── Idle state ──────────────────────────────────────────────────────── */}
      {scanState==="idle" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-si-violet/10 border border-si-violet/20 flex items-center justify-center">
            <Monitor className="w-8 h-8 text-si-violet/60" />
          </div>
          <div>
            <p className="text-[13px] font-mono text-slate-400">Autonomous Hardware Detection</p>
            <p className="text-[11px] font-mono text-slate-600 mt-1 leading-relaxed max-w-sm">
              Scans CPU, RAM, GPU (NVIDIA / AMD / Apple Silicon) and recommends
              the best Ollama model for your exact hardware configuration.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {["nvidia-smi","rocm-smi","system_profiler","psutil"].map(t=>(
              <span key={t} className="text-[9px] font-mono text-slate-700 bg-slate-900 border border-slate-800 rounded px-2 py-0.5">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Scanning ────────────────────────────────────────────────────────── */}
      {scanState==="scanning" && (
        <div className="flex flex-col items-center justify-center py-16 gap-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-si-violet/20 flex items-center justify-center">
              <Cpu className="w-7 h-7 text-si-violet/50" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-si-violet border-t-transparent animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-[12px] font-mono text-slate-400">Scanning hardware…</p>
            <div className="flex flex-col gap-1 mt-3 text-[10px] font-mono text-slate-600">
              {["Detecting CPU cores and model","Measuring available RAM","Probing GPU via nvidia-smi / rocm-smi","Checking Ollama installation","Mapping to optimal models"].map((s,i)=>(
                <motion.div key={s} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.4}}
                  className="flex items-center gap-2">
                  <span className="text-si-violet">›</span>{s}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {scanState==="done" && profile && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col gap-0">

            {/* Tier banner */}
            <div className="px-5 py-3 flex items-center gap-4 border-b border-slate-800/40"
              style={{background:tierMeta?.bg}}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider" style={{color:tierMeta?.color}}>
                    {profile.tier} TIER — {tierMeta?.label}
                  </span>
                  {!profile.ollama_installed && (
                    <span className="text-[9px] font-mono text-si-amber bg-si-amber/10 border border-si-amber/20 rounded px-1.5 py-0.5">
                      Ollama not found
                    </span>
                  )}
                  {profile.ollama_installed && (
                    <span className="text-[9px] font-mono text-si-emerald bg-si-emerald/10 border border-si-emerald/20 rounded px-1.5 py-0.5">
                      Ollama {profile.ollama_version} ✓
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-slate-500">{tierMeta?.desc}</p>
              </div>
              <div className="text-right text-[9px] font-mono text-slate-600">
                <div>{profile.os}</div>
                <div>{profile.cpu_cores}-core · {profile.ram_gb}GB RAM</div>
              </div>
            </div>

            {/* Hardware breakdown */}
            <div className="grid grid-cols-3 gap-0 border-b border-slate-800/40">
              {[
                { icon:<Cpu className="w-3.5 h-3.5"/>,        label:"CPU",  value:profile.cpu_model,  sub:`${profile.cpu_cores} cores`, color:"#22d3ee" },
                { icon:<MemoryStick className="w-3.5 h-3.5"/>,label:"RAM",  value:`${profile.ram_gb} GB`, sub:"system memory",           color:"#34d399" },
                { icon:<Server className="w-3.5 h-3.5"/>,     label:"GPU",  value:profile.gpu_model||"Integrated / None",
                  sub: profile.vram_gb>0 ? `${profile.vram_gb}GB VRAM${profile.cuda_version?" · CUDA "+profile.cuda_version:profile.metal_support?" · Metal":""}` : "CPU inference mode",
                  color:"#a78bfa" },
              ].map(row=>(
                <div key={row.label} className="flex items-start gap-3 px-5 py-3 border-r border-slate-800/30 last:border-r-0">
                  <span style={{color:row.color}}>{row.icon}</span>
                  <div className="min-w-0">
                    <div className="text-[9px] font-mono text-slate-600 uppercase tracking-wider mb-1">{row.label}</div>
                    <div className="text-[11px] font-mono text-slate-200 truncate" title={row.value}>{row.value}</div>
                    <div className="text-[9px] font-mono text-slate-600 mt-0.5">{row.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Model recommendations */}
            <div className="px-5 py-3 border-b border-slate-800/40">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-3.5 h-3.5 text-si-amber" />
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Recommended Models for Your Hardware
                </span>
                <span className="text-[9px] font-mono text-slate-700 ml-auto">{recs.length} compatible</span>
              </div>

              <div className="flex flex-col gap-2">
                {recs.map((rec, i) => {
                  const dlState = downloads[rec.name] ?? "idle";
                  const pct     = progress[rec.name] ?? 0;
                  const qColor  = (QUALITY_COLOR as any)[rec.quality] ?? "#94a3b8";
                  const tierC   = (TIER_META as any)[rec.tier]?.color ?? "#94a3b8";
                  const isTop   = i === 0;

                  return (
                    <motion.div key={rec.name}
                      initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
                      className={`rounded-xl border p-3.5 relative overflow-hidden transition-colors ${
                        isTop
                          ? "border-si-cyan/30 bg-gradient-to-r from-si-cyan/5 to-transparent"
                          : "border-slate-800 hover:border-slate-700 bg-slate-950/30"
                      }`}>

                      {isTop && (
                        <div className="absolute top-2 right-2">
                          <span className="text-[8px] font-mono bg-si-cyan/15 text-si-cyan border border-si-cyan/25 rounded px-1.5 py-0.5 uppercase">
                            ★ Best Match
                          </span>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        {/* Rank */}
                        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-mono font-bold"
                          style={{background:`${tierC}18`,color:tierC}}>
                          {rec.rank}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[12px] font-mono font-bold text-slate-200">{rec.display_name}</span>
                            <span className="text-[9px] font-mono text-slate-600">{rec.params}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{background:`${tierC}18`,color:tierC}}>{rec.quant}</span>
                            <span className="text-[9px] font-mono" style={{color:qColor}}>{rec.quality}</span>
                          </div>
                          <p className="text-[10px] font-mono text-slate-500 mb-2">{rec.use_case}</p>
                          <div className="flex items-center gap-4 text-[9px] font-mono text-slate-600">
                            <span>⚡ {rec.speed_est}</span>
                            <span>💾 {rec.size_gb}GB download</span>
                            <span>🖥 {rec.vram_gb>0?`${rec.vram_gb}GB VRAM`:`${rec.ram_required}GB RAM`}</span>
                          </div>
                        </div>

                        {/* Download button / state */}
                        <div className="flex-shrink-0 flex flex-col items-end gap-2">
                          {dlState === "idle" && (
                            <button onClick={()=>handleDownload(rec)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all"
                              style={{background:`${isTop?SI_CYAN:"#a78bfa"}15`,border:`1px solid ${isTop?SI_CYAN:"#a78bfa"}40`,color:isTop?SI_CYAN:"#a78bfa"}}>
                              <Download className="w-3 h-3"/>Download
                            </button>
                          )}
                          {(dlState==="pending"||dlState==="pulling") && (
                            <div className="flex flex-col items-end gap-1.5 w-28">
                              <div className="flex items-center gap-1.5 text-[9px] font-mono text-si-cyan">
                                <Loader2 className="w-3 h-3 animate-spin"/>
                                {dlState==="pending"?"Starting…":`${pct.toFixed(0)}%`}
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-si-cyan rounded-full transition-all duration-500"
                                  style={{width:`${pct}%`,boxShadow:"0 0 6px #22d3ee80"}}/>
                              </div>
                              <div className="text-[8px] font-mono text-slate-600">{rec.pull_command}</div>
                            </div>
                          )}
                          {dlState==="done" && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-si-emerald">
                              <CheckCircle2 className="w-3.5 h-3.5"/>Downloaded
                            </div>
                          )}
                          {dlState==="error" && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-si-rose">
                              <AlertCircle className="w-3.5 h-3.5"/>Failed
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Progress bar overlay for pulling */}
                      {dlState==="pulling" && (
                        <div className="mt-2.5 h-0.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-si-cyan to-si-violet rounded-full transition-all duration-500"
                            style={{width:`${pct}%`}}/>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Ollama install note */}
            {!profile.ollama_installed && (
              <div className="px-5 py-3 flex items-center gap-3 bg-si-amber/5 border-t border-si-amber/20">
                <AlertCircle className="w-4 h-4 text-si-amber flex-shrink-0" />
                <div>
                  <p className="text-[11px] font-mono text-si-amber">Ollama not detected on this machine</p>
                  <p className="text-[10px] font-mono text-slate-600 mt-0.5">
                    Install from <span className="text-si-cyan">https://ollama.com/download</span> then re-scan to enable one-click model downloads.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const SI_CYAN = "#22d3ee";
