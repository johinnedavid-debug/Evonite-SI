"use client";
/**
 * Terminal.tsx  v2
 *
 * Two-panel component:
 *  TOP  — live system log (scrolling, auto-appended)
 *  BOT  — Agent Spawn Console
 *          • Type a plain-English agent description
 *          • "Self-prompt" toggle — newly spawned agent introduces itself
 *          • AI checks for duplicates, reports back, spawns + skill-injects if new
 *          • All spawn events stream back into the log panel
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal as TerminalIcon,
  Cpu,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogLine {
  id: number;
  ts: string;
  level: "INFO" | "ERROR" | "WARN" | "EVENT" | "SPAWN" | "SYS";
  source: string;
  message: string;
}

type SpawnStatus = "idle" | "thinking" | "duplicate" | "spawned" | "error";

interface SpawnResult {
  status: "already_exists" | "spawned" | "error";
  agent_id?: string;
  archetype?: string;
  role?: string;
  confidence?: number;
  existing_ids?: string[];
  skills_injected?: string[];
  fleet_updated?: number;
  self_prompted?: boolean;
  self_prompt_task?: string;
  message: string;
}

// ── Mock data + live log pool ─────────────────────────────────────────────────

const SEED_LOGS: LogLine[] = [
  { id: 1,  ts: "18:29:01", level: "EVENT", source: "orchestrator",        message: "Goal completed: g-01 [self-evaluation]" },
  { id: 2,  ts: "18:29:03", level: "INFO",  source: "agent-factory",       message: "Spawned cod-7d26 (type=code, tools=[filesystem,memory,git])" },
  { id: 3,  ts: "18:29:04", level: "INFO",  source: "pipeline.sequential", message: "Stage coder complete | score=0.81" },
  { id: 4,  ts: "18:29:05", level: "INFO",  source: "pipeline.sequential", message: "Stage designer complete | score=0.78" },
  { id: 5,  ts: "18:29:10", level: "INFO",  source: "pipeline.sequential", message: "Stage assessor complete | approved=True | score=0.85" },
  { id: 6,  ts: "18:29:13", level: "EVENT", source: "pipeline.sequential", message: "Pipeline[pipe-a3c2] COMPLETE | overall=0.83 | 4/4 stages" },
  { id: 7,  ts: "18:29:15", level: "WARN",  source: "monitor",             message: "CPU spike: 81% — approaching spawn threshold" },
  { id: 8,  ts: "18:29:16", level: "INFO",  source: "meta_loops.study",    message: "Study Cycle #3 complete | updates=6" },
  { id: 9,  ts: "18:29:18", level: "INFO",  source: "skills.registry",     message: "Skill count_vowels injected fleet-wide (6 agents)" },
  { id: 10, ts: "18:29:20", level: "SYS",   source: "terminal",            message: "Agent Spawn Console ready — describe an agent to spawn" },
];

const LIVE_POOL: Array<(n: number) => Omit<LogLine, "id" | "ts">> = [
  (n) => ({ level: "INFO",  source: "meta_loops.study",    message: `Study cycle #${n} | capability_updates=4` }),
  ()  => ({ level: "INFO",  source: "pipeline.sequential", message: `Stage ${["coder","designer","assessor","finaliser"][Math.floor(Math.random()*4)]} complete | score=0.${73+Math.floor(Math.random()*20)}` }),
  ()  => ({ level: "EVENT", source: "memory.exp_lib",      message: `Experience recorded ✓ | score=0.${75+Math.floor(Math.random()*20)}` }),
  ()  => ({ level: "WARN",  source: "utils.monitoring",    message: `CPU=${Math.floor(55+Math.random()*25)}% RAM=${Math.floor(28+Math.random()*20)}%` }),
  ()  => ({ level: "INFO",  source: "skills.registry",     message: "Fleet-wide skill inject: heuristic_score" }),
  ()  => ({ level: "INFO",  source: "meta_loops.improve",  message: "Improvement proposal approved: prompt_tuning" }),
];

const LEVEL_COLORS: Record<string, string> = {
  INFO:  "text-si-cyan",
  WARN:  "text-si-amber",
  ERROR: "text-si-rose",
  EVENT: "text-si-emerald",
  SPAWN: "text-si-violet",
  SYS:   "text-slate-500",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Suggestions to help the user ─────────────────────────────────────────────
const SUGGESTIONS = [
  "a web scraping researcher for live data",
  "a Python code engineer to build utilities",
  "a UI designer for dashboard components",
  "a QA assessor to audit pipeline outputs",
  "a meta-reflector for deep introspection",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Terminal() {
  // ── Log state ──────────────────────────────────────────────────────────────
  const [logs,       setLogs]       = useState<LogLine[]>(SEED_LOGS);
  const [liveCount,  setLiveCount]  = useState(3);
  const logBottomRef                = useRef<HTMLDivElement>(null);

  // ── Spawn console state ────────────────────────────────────────────────────
  const [input,       setInput]       = useState("");
  const [selfPrompt,  setSelfPrompt]  = useState(false);
  const [spawnStatus, setSpawnStatus] = useState<SpawnStatus>("idle");
  const [spawnResult, setSpawnResult] = useState<SpawnResult | null>(null);
  const [suggIdx,     setSuggIdx]     = useState(0);
  const inputRef                      = useRef<HTMLInputElement>(null);

  // ── Auto-scroll log ────────────────────────────────────────────────────────
  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── Live log ticker ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setLiveCount((c) => c + 1);
      const tmpl = LIVE_POOL[Math.floor(Math.random() * LIVE_POOL.length)];
      const entry = tmpl(liveCount);
      const now = new Date();
      const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((n) => String(n).padStart(2, "0"))
        .join(":");
      setLogs((l) => [...l.slice(-60), { id: Date.now(), ts, ...entry }]);
    }, 2400);
    return () => clearInterval(id);
  }, [liveCount]);

  // ── Suggestion rotation ────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setSuggIdx((i) => (i + 1) % SUGGESTIONS.length), 3500);
    return () => clearInterval(id);
  }, []);

  // ── Push a log entry ──────────────────────────────────────────────────────
  const pushLog = useCallback(
    (level: LogLine["level"], source: string, message: string) => {
      const now = new Date();
      const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((n) => String(n).padStart(2, "0"))
        .join(":");
      setLogs((l) => [...l.slice(-60), { id: Date.now(), ts, level, source, message }]);
    },
    []
  );

  // ── Spawn handler ──────────────────────────────────────────────────────────
  const handleSpawn = useCallback(async () => {
    const desc = input.trim();
    if (!desc || spawnStatus === "thinking") return;

    setSpawnStatus("thinking");
    setSpawnResult(null);
    pushLog("SPAWN", "terminal", `Analysing: "${desc}"`);

    try {
      const res = await fetch(`${API_BASE}/api/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc, self_prompt: selfPrompt }),
      });
      const data: SpawnResult = await res.json();

      setSpawnResult(data);

      if (data.status === "already_exists") {
        setSpawnStatus("duplicate");
        pushLog("WARN",  "agent-factory", `Duplicate detected — ${data.archetype} already in fleet: ${data.existing_ids?.join(", ")}`);
        pushLog("SYS",   "terminal",      data.message);
      } else if (data.status === "spawned") {
        setSpawnStatus("spawned");
        pushLog("SPAWN", "agent-factory", `Agent spawned | id=${data.agent_id} | type=${data.archetype} | role=${data.role}`);
        pushLog("INFO",  "skills.registry", `Skills ${JSON.stringify(data.skills_injected)} injected fleet-wide (${data.fleet_updated} agents updated)`);
        if (data.self_prompted) {
          pushLog("SPAWN", "meta-orchestrator", `Self-prompt queued for ${data.agent_id}: "${data.self_prompt_task?.slice(0, 70)}..."`);
        }
      } else {
        setSpawnStatus("error");
        pushLog("ERROR", "agent-factory", data.message);
      }
    } catch (err) {
      setSpawnStatus("error");
      setSpawnResult({ status: "error", message: "Network error — is the backend running on :8000?" });
      pushLog("ERROR", "terminal", "Spawn request failed — backend unreachable");
    }

    setInput("");
    setTimeout(() => {
      setSpawnStatus("idle");
      setSpawnResult(null);
      inputRef.current?.focus();
    }, 5000);
  }, [input, selfPrompt, spawnStatus, pushLog]);

  // ── Keyboard handler ───────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSpawn();
    if (e.key === "Tab") {
      e.preventDefault();
      setInput(SUGGESTIONS[suggIdx]);
    }
  };

  // ── Status UI helpers ──────────────────────────────────────────────────────
  const statusIcon = () => {
    if (spawnStatus === "thinking")  return <Loader2 className="w-4 h-4 text-si-cyan animate-spin" />;
    if (spawnStatus === "duplicate") return <AlertCircle className="w-4 h-4 text-si-amber" />;
    if (spawnStatus === "spawned")   return <CheckCircle2 className="w-4 h-4 text-si-emerald" />;
    if (spawnStatus === "error")     return <AlertCircle className="w-4 h-4 text-si-rose" />;
    return <Sparkles className="w-4 h-4 text-si-violet" />;
  };

  const resultBorderColor = () => {
    if (spawnStatus === "duplicate") return "border-si-amber/40 bg-si-amber/5";
    if (spawnStatus === "spawned")   return "border-si-emerald/40 bg-si-emerald/5";
    if (spawnStatus === "error")     return "border-si-rose/40 bg-si-rose/5";
    return "border-slate-800 bg-slate-950/40";
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="glass-panel rounded-xl overflow-hidden flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-slate-500" />
          System Log · Agent Console
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-slate-600">46/46 tests passing</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-si-emerald animate-pulse" />
            <span className="text-[10px] font-mono text-slate-600">LIVE</span>
          </div>
        </div>
      </div>

      {/* ── Log stream ──────────────────────────────────────────────────────── */}
      <div className="h-44 overflow-y-auto px-5 py-2 space-y-0.5 font-mono text-[11px] leading-relaxed">
        {logs.map((log) => (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex gap-3 hover:bg-white/[0.02] rounded px-1 -mx-1 transition-colors"
          >
            <span className="text-slate-600 flex-shrink-0 w-14">{log.ts}</span>
            <span className={`flex-shrink-0 w-12 font-bold ${LEVEL_COLORS[log.level] ?? "text-slate-400"}`}>
              {log.level}
            </span>
            <span className="text-slate-500 flex-shrink-0 w-28 truncate">{log.source}</span>
            <span className={`${log.level === "SPAWN" ? "text-si-violet" : log.level === "SYS" ? "text-slate-600 italic" : "text-slate-300"} terminal-text`}>
              {log.message}
            </span>
          </motion.div>
        ))}
        <div ref={logBottomRef} />
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-800/60 mx-5" />

      {/* ── Agent Spawn Console ─────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-si-violet" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-si-violet">
            Agent Spawn Console
          </span>
          <span className="text-[10px] font-mono text-slate-600 ml-auto">
            Tab to autocomplete · Enter to spawn
          </span>
        </div>

        {/* Input row */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <ChevronRight className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-si-violet/60" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={spawnStatus === "thinking"}
              placeholder={`e.g. "${SUGGESTIONS[suggIdx]}"`}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-4 py-2.5 text-[12px] font-mono text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-si-violet/50 transition-colors disabled:opacity-50"
            />
          </div>

          {/* Self-prompt toggle */}
          <button
            type="button"
            onClick={() => setSelfPrompt((s) => !s)}
            title="Self-prompt: agent introduces itself after spawn"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[10px] font-mono uppercase transition-colors ${
              selfPrompt
                ? "bg-si-violet/10 border-si-violet/40 text-si-violet"
                : "bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-700"
            }`}
          >
            {selfPrompt ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
            Self-prompt
          </button>

          {/* Spawn button */}
          <button
            type="button"
            onClick={handleSpawn}
            disabled={!input.trim() || spawnStatus === "thinking"}
            className="flex items-center gap-2 bg-si-violet/10 border border-si-violet/30 text-si-violet rounded-lg px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider hover:bg-si-violet/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {statusIcon()}
            {spawnStatus === "thinking" ? "Analysing…" : "Spawn"}
          </button>
        </div>

        {/* Result card */}
        <AnimatePresence>
          {spawnResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className={`rounded-lg border p-3 text-[11px] font-mono ${resultBorderColor()}`}
            >
              {/* Duplicate */}
              {spawnStatus === "duplicate" && (
                <div>
                  <div className="text-si-amber font-bold mb-1 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Agent Already Exists
                  </div>
                  <div className="text-slate-400">{spawnResult.message}</div>
                  <div className="mt-1.5 flex gap-2 flex-wrap">
                    {spawnResult.existing_ids?.map((id) => (
                      <span key={id} className="bg-si-amber/10 border border-si-amber/20 text-si-amber px-2 py-0.5 rounded text-[10px]">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Spawned */}
              {spawnStatus === "spawned" && (
                <div>
                  <div className="text-si-emerald font-bold mb-1.5 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Agent Spawned Successfully
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
                    <div><span className="text-slate-600">ID</span> <span className="text-slate-300">{spawnResult.agent_id}</span></div>
                    <div><span className="text-slate-600">Archetype</span> <span className="text-si-cyan">{spawnResult.archetype}</span></div>
                    <div><span className="text-slate-600">Role</span> <span className="text-slate-300">{spawnResult.role}</span></div>
                    <div><span className="text-slate-600">Confidence</span> <span className="text-slate-300">{((spawnResult.confidence ?? 0) * 100).toFixed(0)}%</span></div>
                    <div><span className="text-slate-600">Skills</span> <span className="text-si-violet">{spawnResult.skills_injected?.join(", ")}</span></div>
                    <div><span className="text-slate-600">Fleet updated</span> <span className="text-si-emerald">{spawnResult.fleet_updated} agents</span></div>
                  </div>
                  {spawnResult.self_prompted && (
                    <div className="mt-2 pt-2 border-t border-slate-800 text-si-violet text-[10px]">
                      <span className="opacity-60">self-prompt → </span>
                      {spawnResult.self_prompt_task?.slice(0, 100)}…
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {spawnStatus === "error" && (
                <div className="text-si-rose flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {spawnResult.message}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Known archetypes hint */}
        {spawnStatus === "idle" && !spawnResult && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {["worker","researcher","code","designer","assessor","finaliser","evaluator","reflection"].map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => { setInput(`a ${a} agent`); inputRef.current?.focus(); }}
                className="text-[9px] font-mono text-slate-600 hover:text-si-violet bg-slate-900/60 hover:bg-si-violet/10 border border-slate-800 hover:border-si-violet/30 rounded px-2 py-0.5 transition-colors"
              >
                {a}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
