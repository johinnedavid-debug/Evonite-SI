"use client";
import { motion } from "framer-motion";
import { Brain, Radio } from "lucide-react";
interface Props { connected: boolean; iteration: number; }
export default function NavBar({ connected, iteration }: Props) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 glass-panel border-b border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div animate={{ rotate: [0,360] }} transition={{ duration:20, repeat:Infinity, ease:"linear" }}>
            <Brain className="w-6 h-6 text-si-cyan" />
          </motion.div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-slate-100">SYNTHETIC<span className="text-si-cyan">INTELLIGENCE</span></h1>
            <p className="text-[10px] font-mono text-slate-500">Embodiment v3.0 • Iteration #{iteration}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${connected ? "text-si-emerald" : "text-si-rose"}`} />
            <span className={`text-[10px] font-mono uppercase ${connected ? "text-si-emerald" : "text-si-rose"}`}>
              {connected ? "Neural Link Active" : "Offline"}
            </span>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <div className="text-[10px] font-mono text-slate-600">
            Ollama • {process.env.NEXT_PUBLIC_API_URL || "localhost:8000"}
          </div>
        </div>
      </div>
    </nav>
  );
}
