"use client";
import { useSSE } from "./hooks/useSSE";
import NavBar           from "./components/NavBar";
import LiveBackground   from "./components/LiveBackground";
import SystemVitals     from "./components/SystemVitals";
import FleetNetwork     from "./components/FleetNetwork";
import GoalPipeline     from "./components/GoalPipeline";
import ExperienceStream from "./components/ExperienceStream";
import Terminal         from "./components/Terminal";
import TaskDispatch     from "./components/TaskDispatch";
import SICalendar       from "./components/SICalendar";
import MarkdownEditor   from "./components/MarkdownEditor";
import HardwareScanner  from "./components/HardwareScanner";
import ApprovalGate     from "./components/ApprovalGate";

export default function Home() {
  const { data, connected, sendApproval, addGoal } = useSSE();
  const pendingApproval = data?._pulse && data._pulse % 50 === 0 ? {
    action: "spawn" as const,
    details: { role: "researcher", reason: "High task load detected" },
    timestamp: Date.now(),
  } : null;

  return (
    <main className="min-h-screen relative">
      <LiveBackground />
      <NavBar connected={connected} iteration={data?.iteration ?? 0} />

      <div className="relative z-10 pt-20 pb-12 px-4 max-w-[1440px] mx-auto space-y-6">

        {/* Row 1 — System Vitals */}
        <SystemVitals data={data} />

        {/* Row 2 — Fleet + Terminal (2/3) | Goals + Experience (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <FleetNetwork data={data} />
            <Terminal />
          </div>
          <div className="space-y-6">
            <GoalPipeline data={data} onAddGoal={addGoal} />
            <ExperienceStream data={data} />
          </div>
        </div>

        {/* Row 3 — Task Dispatch (full width) */}
        <TaskDispatch />

        {/* Row 4 — Calendar (1/2) | Hardware Scanner (1/2) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SICalendar />
          <HardwareScanner />
        </div>

        {/* Row 5 — Markdown Editor (full width) */}
        <MarkdownEditor />

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-700 border-t border-slate-800/50 pt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span>LangGraph Runtime</span><span>•</span>
            <span>ChromaDB · VectorStore · SelfModel</span><span>•</span>
            <span>Ollama Local Models</span><span>•</span>
            <span>FastAPI SSE Bridge</span><span>•</span>
            <span>Next.js 14 · Tailwind</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-si-cyan animate-pulse" />
            <span>Self-Improving Loop Active</span>
          </div>
        </div>
      </div>

      <ApprovalGate pending={pendingApproval} onDecide={sendApproval} />
    </main>
  );
}
