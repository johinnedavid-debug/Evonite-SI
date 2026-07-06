"use client";
/**
 * TaskDispatch.tsx  v1
 *
 * Full task-dispatch panel with three input modes:
 *  1. Text — free-form instruction to any agent / the orchestrator
 *  2. URL  — paste a link; the backend fetches + passes as context
 *  3. File — drag-and-drop zone OR local file picker (multi-file)
 *
 * Features:
 *  - Agent selector (specific agent or "Auto-route via Orchestrator")
 *  - Priority P1–P10 slider
 *  - Pipeline toggle (Coder→Designer→Assessor→Finaliser)
 *  - Attachment preview chips with remove
 *  - Live dispatch result card
 *  - Dispatched task history (last 10)
 */

import {
  useState, useRef, useCallback, useEffect, type DragEvent,
  type ChangeEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Link2, Upload, X, FileText, FileCode, FileImage,
  FilePieChart, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, Zap, GitBranch, Clock,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;        // bytes
  data: string;        // base64
  preview?: string;    // first 200 chars for text files
}

interface DispatchResult {
  status: "dispatched" | "error";
  task_id?: string;
  routed_to?: string;
  priority?: number;
  use_pipeline?: boolean;
  attachments?: string[];
  context_url?: string;
  message: string;
}

interface HistoryEntry {
  id: string;
  ts: string;
  task: string;
  routed_to: string;
  attachments: number;
  status: "dispatched" | "error";
}

type InputMode = "text" | "url" | "file";
type DispatchStatus = "idle" | "sending" | "success" | "error";

// ── Mock agents (real app gets these from useSSE data) ────────────────────────
const MOCK_AGENTS = [
  { id: "auto",     label: "🧠 Auto-route via Orchestrator", type: "auto"       },
  { id: "meta-001", label: "🧠 meta-001 · meta-reflector",   type: "reflection" },
  { id: "cod-7d26", label: "⌨️  cod-7d26 · code",            type: "code"       },
  { id: "dsg-c20c", label: "🎨 dsg-c20c · designer",         type: "designer"   },
  { id: "asr-065f", label: "✅ asr-065f · assessor",         type: "assessor"   },
  { id: "fnl-3b9a", label: "⭐ fnl-3b9a · finaliser",        type: "finaliser"  },
  { id: "rsc-f12a", label: "🔍 rsc-f12a · researcher",       type: "researcher" },
];

const ACCEPT_TYPES = ".txt,.md,.py,.js,.ts,.json,.csv,.pdf,.png,.jpg,.jpeg,.svg,.html,.xml";
const MAX_FILE_MB  = 10;
const API_BASE     = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── File icon helper ──────────────────────────────────────────────────────────
function fileIcon(type: string) {
  if (type.startsWith("image/"))                    return <FileImage   className="w-3.5 h-3.5" />;
  if (type === "application/pdf")                   return <FilePieChart className="w-3.5 h-3.5" />;
  if (type.startsWith("text/") || type.includes("json")) return <FileText  className="w-3.5 h-3.5" />;
  return <FileCode className="w-3.5 h-3.5" />;
}

function fmtSize(bytes: number) {
  return bytes < 1024 ? `${bytes}B` : bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)}KB` : `${(bytes/1024/1024).toFixed(1)}MB`;
}

function nowTs() {
  return new Date().toTimeString().slice(0, 8);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TaskDispatch() {
  // ── Input state ────────────────────────────────────────────────────────────
  const [mode,         setMode]         = useState<InputMode>("text");
  const [taskText,     setTaskText]     = useState("");
  const [contextUrl,   setContextUrl]   = useState("");
  const [attachments,  setAttachments]  = useState<Attachment[]>([]);
  const [agentId,      setAgentId]      = useState("auto");
  const [priority,     setPriority]     = useState(5);
  const [usePipeline,  setUsePipeline]  = useState(false);
  const [isDragging,   setIsDragging]   = useState(false);

  // ── Dispatch state ─────────────────────────────────────────────────────────
  const [dispatchStatus, setDispatchStatus] = useState<DispatchStatus>("idle");
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);
  const [history,        setHistory]        = useState<HistoryEntry[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [agentOpen,    setAgentOpen]    = useState(false);
  const [urlError,     setUrlError]     = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const dropRef      = useRef<HTMLDivElement>(null);

  // ── Read file as base64 ────────────────────────────────────────────────────
  const readFile = useCallback((file: File): Promise<Attachment> => {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        reject(new Error(`${file.name} exceeds ${MAX_FILE_MB}MB limit`));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64  = dataUrl.split(",")[1] ?? "";
        const isText  = file.type.startsWith("text/") || ["application/json","application/xml"].includes(file.type);
        const preview = isText ? atob(base64).slice(0, 200) : undefined;
        resolve({
          id:      `att-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          name:    file.name,
          type:    file.type || "application/octet-stream",
          size:    file.size,
          data:    base64,
          preview,
        });
      };
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }, []);

  // ── Handle file input / drop ───────────────────────────────────────────────
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 5 - attachments.length);
    const results = await Promise.allSettled(list.map(readFile));
    const newAtts: Attachment[] = [];
    results.forEach((r) => {
      if (r.status === "fulfilled") newAtts.push(r.value);
    });
    setAttachments((prev) => [...prev, ...newAtts]);
    if (newAtts.length > 0) setMode("file");
  }, [attachments.length, readFile]);

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  // ── URL validation ─────────────────────────────────────────────────────────
  const validateUrl = (url: string) => {
    try { new URL(url); setUrlError(""); return true; }
    catch { setUrlError("Enter a valid URL including https://"); return false; }
  };

  // ── Dispatch handler ───────────────────────────────────────────────────────
  const handleDispatch = useCallback(async () => {
    const hasText = taskText.trim().length > 0;
    const hasUrl  = contextUrl.trim().length > 0;
    const hasFile = attachments.length > 0;
    if (!hasText && !hasUrl && !hasFile) return;
    if (hasUrl && !validateUrl(contextUrl)) return;

    setDispatchStatus("sending");
    setDispatchResult(null);

    const body = {
      task:         taskText.trim(),
      agent_id:     agentId === "auto" ? null : agentId,
      priority,
      use_pipeline: usePipeline,
      context_url:  contextUrl.trim() || undefined,
      attachments:  attachments.map(({ name, type, data }) => ({ name, type, data })),
    };

    try {
      const res  = await fetch(`${API_BASE}/api/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: DispatchResult = await res.json();
      setDispatchResult(data);
      setDispatchStatus(data.status === "dispatched" ? "success" : "error");

      if (data.status === "dispatched") {
        const entry: HistoryEntry = {
          id:          data.task_id ?? `task-${Date.now()}`,
          ts:          nowTs(),
          task:        taskText.trim() || contextUrl || attachments[0]?.name || "—",
          routed_to:   data.routed_to ?? agentId,
          attachments: attachments.length,
          status:      "dispatched",
        };
        setHistory((h) => [entry, ...h].slice(0, 10));
        // Reset inputs
        setTaskText("");
        setContextUrl("");
        setAttachments([]);
        setMode("text");
      }
    } catch {
      setDispatchStatus("error");
      setDispatchResult({ status: "error", message: "Network error — is the backend running on :8000?" });
    }

    setTimeout(() => {
      setDispatchStatus("idle");
      setDispatchResult(null);
    }, 6000);
  }, [taskText, contextUrl, attachments, agentId, priority, usePipeline]);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleDispatch();
  };

  const selectedAgent = MOCK_AGENTS.find((a) => a.id === agentId) ?? MOCK_AGENTS[0];
  const canDispatch   = (taskText.trim() || contextUrl.trim() || attachments.length > 0) && dispatchStatus !== "sending";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="glass-panel rounded-xl overflow-hidden flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Send className="w-4 h-4 text-si-cyan" />
          Task Dispatch
        </h3>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-600">
          <span>{history.length} dispatched</span>
          <span>·</span>
          <span>⌘↵ to send</span>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">

        {/* ── Agent selector ──────────────────────────────────────────────── */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAgentOpen((o) => !o)}
            className="w-full flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-[11px] font-mono text-slate-300 hover:border-slate-700 transition-colors"
          >
            <span>{selectedAgent.label}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-600 transition-transform ${agentOpen ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {agentOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-20 w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-xl"
              >
                {MOCK_AGENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setAgentId(a.id); setAgentOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-[11px] font-mono transition-colors hover:bg-white/[0.04] ${agentId === a.id ? "text-si-cyan bg-si-cyan/5" : "text-slate-400"}`}
                  >
                    {a.label}
                    {a.id === "auto" && <span className="ml-2 text-[9px] text-slate-600">(orchestrator picks best agent)</span>}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Mode tabs ───────────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          {([
            { key:"text", icon:<FileText className="w-3.5 h-3.5"/>, label:"Text" },
            { key:"url",  icon:<Link2    className="w-3.5 h-3.5"/>, label:"URL"  },
            { key:"file", icon:<Upload   className="w-3.5 h-3.5"/>, label:"Files" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors ${
                mode === tab.key
                  ? "bg-si-cyan/10 border border-si-cyan/30 text-si-cyan"
                  : "text-slate-600 hover:text-slate-400"
              }`}
            >
              {tab.icon}{tab.label}
              {tab.key === "file" && attachments.length > 0 && (
                <span className="ml-1 bg-si-violet/20 text-si-violet rounded-full text-[8px] px-1.5">{attachments.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Text input ──────────────────────────────────────────────────── */}
        {mode === "text" && (
          <textarea
            ref={textareaRef}
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={"Describe the task in plain English…\n\nExamples:\n• Summarise the project's capability gaps and suggest 3 new skills\n• Write a Python CSV parser that handles malformed rows\n• Review the latest pipeline output and flag quality issues"}
            rows={6}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-[12px] font-mono text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none focus:border-si-cyan/40 transition-colors leading-relaxed"
          />
        )}

        {/* ── URL input ───────────────────────────────────────────────────── */}
        {mode === "url" && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
              <input
                type="url"
                value={contextUrl}
                onChange={(e) => { setContextUrl(e.target.value); if (e.target.value) validateUrl(e.target.value); }}
                placeholder="https://docs.example.com/api-reference"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2.5 text-[12px] font-mono text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-si-cyan/40 transition-colors"
              />
            </div>
            {urlError && <p className="text-[10px] font-mono text-si-rose">{urlError}</p>}
            <textarea
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Optional: describe what to do with the URL content…"
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-[12px] font-mono text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none focus:border-si-cyan/40 transition-colors"
            />
          </div>
        )}

        {/* ── File drop zone ───────────────────────────────────────────────── */}
        {mode === "file" && (
          <div className="flex flex-col gap-3">
            {/* Drop zone */}
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? "border-si-cyan/60 bg-si-cyan/5 scale-[1.01]"
                  : "border-slate-800 hover:border-slate-700 hover:bg-white/[0.01]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_TYPES}
                onChange={handleFileInput}
                className="hidden"
              />
              <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? "text-si-cyan" : "text-slate-700"}`} />
              <p className={`text-[12px] font-mono ${isDragging ? "text-si-cyan" : "text-slate-600"}`}>
                {isDragging ? "Drop files here" : "Drag & drop files or click to browse"}
              </p>
              <p className="text-[10px] font-mono text-slate-700 mt-1">
                .txt .md .py .js .json .csv .pdf .png .jpg · max {MAX_FILE_MB}MB each · up to 5 files
              </p>
              {isDragging && (
                <div className="absolute inset-0 rounded-xl ring-2 ring-si-cyan/40 pointer-events-none" />
              )}
            </div>

            {/* Task text for files */}
            <textarea
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What should the agent do with these files?"
              rows={2}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-[12px] font-mono text-slate-200 placeholder:text-slate-700 resize-none focus:outline-none focus:border-si-cyan/40 transition-colors"
            />
          </div>
        )}

        {/* ── Attachment chips ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }}
              className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <motion.div key={att.id} initial={{ scale:0.8, opacity:0 }} animate={{ scale:1, opacity:1 }}
                  className="group flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-slate-400 hover:border-slate-700 transition-colors max-w-[200px]">
                  <span className="text-si-violet flex-shrink-0">{fileIcon(att.type)}</span>
                  <span className="truncate">{att.name}</span>
                  <span className="text-slate-700 flex-shrink-0">{fmtSize(att.size)}</span>
                  <button type="button" onClick={() => removeAttachment(att.id)}
                    className="flex-shrink-0 text-slate-700 hover:text-si-rose transition-colors ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Options row ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          {/* Priority */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-600 whitespace-nowrap">Priority</span>
            <div className="flex gap-1">
              {[1,2,3,5,7,10].map((p) => (
                <button key={p} type="button" onClick={() => setPriority(p)}
                  className={`w-7 h-6 text-[10px] font-mono rounded transition-colors ${
                    priority === p
                      ? "bg-si-cyan/15 border border-si-cyan/40 text-si-cyan"
                      : "bg-slate-950 border border-slate-800 text-slate-600 hover:border-slate-700"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-4 bg-slate-800" />

          {/* Pipeline toggle */}
          <button type="button" onClick={() => setUsePipeline((p) => !p)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono uppercase transition-colors ${
              usePipeline
                ? "bg-si-violet/10 border-si-violet/40 text-si-violet"
                : "bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-700"
            }`}
          >
            <GitBranch className="w-3 h-3" />Pipeline
          </button>

          {/* Dispatch button */}
          <button type="button" onClick={handleDispatch} disabled={!canDispatch}
            className="ml-auto flex items-center gap-2 bg-si-cyan/10 border border-si-cyan/40 text-si-cyan rounded-lg px-4 py-2 text-[11px] font-mono uppercase tracking-wider hover:bg-si-cyan/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {dispatchStatus === "sending"
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/>Sending…</>
              : <><Send className="w-3.5 h-3.5"/>Dispatch</>
            }
          </button>
        </div>

        {/* ── Result card ─────────────────────────────────────────────────── */}
        <AnimatePresence>
          {dispatchResult && (
            <motion.div initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }}
              className={`rounded-lg border p-3 text-[11px] font-mono ${
                dispatchStatus === "success"
                  ? "border-si-emerald/30 bg-si-emerald/5"
                  : "border-si-rose/30 bg-si-rose/5"
              }`}>
              {dispatchStatus === "success" ? (
                <div>
                  <div className="text-si-emerald font-bold flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-3.5 h-3.5"/>Task Dispatched
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
                    {[
                      ["Task ID",    dispatchResult.task_id,   "#e2e8f0"],
                      ["Routed to",  dispatchResult.routed_to, "#22d3ee"],
                      ["Priority",   `P${dispatchResult.priority}`,   "#e2e8f0"],
                      ["Pipeline",   dispatchResult.use_pipeline ? "Yes" : "No", "#a78bfa"],
                      ...(dispatchResult.context_url ? [["URL", dispatchResult.context_url.slice(0,30)+"…", "#fbbf24"]] : []),
                      ...(dispatchResult.attachments?.length ? [["Files", dispatchResult.attachments.join(", ").slice(0,40), "#a78bfa"]] : []),
                    ].map(([k,v,c]) => (
                      <div key={k}><span className="text-slate-600">{k} </span><span style={{ color:c as string }}>{v}</span></div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-si-rose flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0"/>
                  {dispatchResult.message}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Dispatch history ─────────────────────────────────────────────── */}
        {history.length > 0 && (
          <div className="border-t border-slate-800/60 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3 h-3 text-slate-600"/>
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider">Recent Dispatches</span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-slate-700 w-14 flex-shrink-0">{h.ts}</span>
                  <span className="text-slate-500 truncate flex-1">{h.task.slice(0, 45)}{h.task.length > 45 ? "…" : ""}</span>
                  <span className="text-si-cyan flex-shrink-0">{h.routed_to.slice(0, 20)}</span>
                  {h.attachments > 0 && (
                    <span className="text-si-violet flex-shrink-0">+{h.attachments}f</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
