"use client";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Brain, Code, Search, Shield, Palette, ClipboardCheck, Star } from "lucide-react";
import { DashboardData } from "../types";
const roleIcons: Record<string, React.ElementType> = {
  "meta-reflector":Brain, researcher:Search, worker:Bot, code:Code,
  evaluator:Shield, designer:Palette, assessor:ClipboardCheck, finaliser:Star,
};
const statusColors = {
  idle:"bg-slate-500", working:"bg-si-cyan animate-pulse",
  reflecting:"bg-si-violet animate-pulse", error:"bg-si-rose animate-pulse",
};
const mockAgents = [
  { id:"meta-001", role:"meta-reflector", status:"working",    model:"llama3",    tasks_completed:42 },
  { id:"cod-7d26", role:"code",           status:"working",    model:"codellama", tasks_completed:89 },
  { id:"dsg-c20c", role:"designer",       status:"working",    model:"llama3",    tasks_completed:34 },
  { id:"asr-065f", role:"assessor",       status:"reflecting", model:"llama3",    tasks_completed:28 },
  { id:"fnl-3b9a", role:"finaliser",      status:"idle",       model:"llama3",    tasks_completed:17 },
  { id:"rsc-f12a", role:"researcher",     status:"idle",       model:"llama3",    tasks_completed:55 },
];
export default function FleetNetwork({ data }: { data: DashboardData | null }) {
  const agents = (data?.fleet?.agents ?? []).length > 0 ? data!.fleet!.agents! : mockAgents;
  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Bot className="w-4 h-4 text-si-cyan" />Agent Fleet · 8 Archetypes
        </h3>
        <span className="text-xs font-mono text-slate-600">{agents.length} nodes active</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <AnimatePresence>
          {agents.map((agent, i) => {
            const Icon = roleIcons[agent.role] ?? Bot;
            return (
              <motion.div key={agent.id} initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }}
                exit={{ opacity:0, scale:0.9 }} transition={{ delay:i*0.05 }}
                className="relative group bg-slate-950/50 border border-slate-800 rounded-lg p-3 hover:border-si-cyan/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Icon className="w-5 h-5 text-slate-400 group-hover:text-si-cyan transition-colors" />
                      <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${statusColors[agent.status as keyof typeof statusColors] || statusColors.idle}`} />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-slate-200">{agent.id}</div>
                      <div className="text-[10px] font-mono text-slate-500 uppercase">{agent.role}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-slate-600">{agent.model}</div>
                    <div className="text-[10px] font-mono text-si-emerald">{agent.tasks_completed} tasks</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <div className="h-16 relative border border-slate-800/50 rounded-lg bg-slate-950/30 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="conn" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(34,211,238,0)" />
              <stop offset="50%" stopColor="rgba(34,211,238,0.3)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0)" />
            </linearGradient>
          </defs>
          {Array.from({ length:6 }).map((_,i) => (
            <motion.line key={i} x1={`${15+i*14}%`} y1="50%" x2={`${29+i*14}%`} y2="50%"
              stroke="url(#conn)" strokeWidth="1"
              animate={{ pathLength:[0,1,0], opacity:[0,0.6,0] }}
              transition={{ duration:2, repeat:Infinity, delay:i*0.35, ease:"easeInOut" }} />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
            Message Bus · Pipeline Channel · ONLINE
          </span>
        </div>
      </div>
    </div>
  );
}
