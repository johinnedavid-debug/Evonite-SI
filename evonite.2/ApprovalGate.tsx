"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Check, X, AlertTriangle } from "lucide-react";
import { ApprovalRequest } from "../types";
interface Props { pending: ApprovalRequest | null; onDecide: (action:string, approved:boolean) => void; }
export default function ApprovalGate({ pending, onDecide }: Props) {
  const [timeLeft, setTimeLeft] = useState(30);
  useEffect(() => {
    if (!pending) return;
    setTimeLeft(30);
    const timer = setInterval(() => {
      setTimeLeft(t => { if (t <= 1) { onDecide(pending.action, true); return 0; } return t-1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [pending, onDecide]);
  if (!pending) return null;
  const labels: Record<string,string> = { spawn:"Agent Spawn Request", skill_inject:"Skill Injection", code_change:"Code Modification" };
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} exit={{ scale:0.9, y:20 }}
          className="glass-panel rounded-2xl p-6 max-w-md w-full mx-4 border border-si-amber/30 shadow-[0_0_60px_rgba(251,191,36,0.1)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-si-amber/10 flex items-center justify-center border border-si-amber/20">
              <AlertTriangle className="w-5 h-5 text-si-amber" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Human Approval Required</h3>
              <p className="text-xs font-mono text-slate-500">{labels[pending.action] ?? pending.action}</p>
            </div>
          </div>
          <div className="bg-slate-950 rounded-lg p-3 mb-4 border border-slate-800">
            <pre className="text-[11px] font-mono text-slate-400 overflow-x-auto">{JSON.stringify(pending.details, null, 2)}</pre>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <Shield className="w-3 h-3" />Auto-approve in {timeLeft}s
            </div>
            <div className="h-1 w-24 bg-slate-800 rounded-full overflow-hidden">
              <motion.div className="h-full bg-si-amber" initial={{ width:"100%" }}
                animate={{ width:`${(timeLeft/30)*100}%` }} transition={{ duration:1, ease:"linear" }} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => onDecide(pending.action, false)}
              className="flex-1 flex items-center justify-center gap-2 bg-si-rose/10 border border-si-rose/30 text-si-rose rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-si-rose/20 transition-colors">
              <X className="w-4 h-4" />Veto
            </button>
            <button onClick={() => onDecide(pending.action, true)}
              className="flex-1 flex items-center justify-center gap-2 bg-si-emerald/10 border border-si-emerald/30 text-si-emerald rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-si-emerald/20 transition-colors">
              <Check className="w-4 h-4" />Approve
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
