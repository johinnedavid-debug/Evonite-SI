"use client";
import { motion } from "framer-motion";
import { Cpu, Activity, Zap, GitBranch } from "lucide-react";
import { DashboardData } from "../types";
export default function SystemVitals({ data }: { data: DashboardData | null }) {
  if (!data) return null;
  const cpu = data.fleet?.resources?.cpu_pct ?? 0;
  const ram = data.fleet?.resources?.ram_pct ?? 0;
  const agents = data.fleet?.active_agents ?? 0;
  const vitals = [
    { label:"CPU Load", value:`${cpu.toFixed(1)}%`, percent:cpu, icon:Cpu, color:"text-si-cyan", bar:"bg-si-cyan" },
    { label:"RAM Usage", value:`${ram.toFixed(1)}%`, percent:ram, icon:Activity, color:"text-si-emerald", bar:"bg-si-emerald" },
    { label:"Active Agents", value:`${agents}`, percent:Math.min((agents/100)*100,100), icon:Activity, color:"text-si-violet", bar:"bg-si-violet" },
    { label:"Study Cycles", value:`#${data.study_cycles ?? 0}`, percent:100, icon:Zap, color:"text-si-amber", bar:"bg-si-amber" },
    { label:"Pipeline Runs", value:`${data.pipeline_runs ?? 0}`, percent:100, icon:GitBranch, color:"text-si-cyan", bar:"bg-si-cyan" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {vitals.map((v, i) => (
        <motion.div key={v.label} initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:i*0.1 }} className="glass-panel rounded-xl p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
          <div className="relative flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <v.icon className={`w-4 h-4 ${v.color}`} />
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500">{v.label}</span>
            </div>
            <span className={`text-lg font-mono font-bold ${v.color} text-glow`}>{v.value}</span>
          </div>
          <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div className={`absolute inset-y-0 left-0 rounded-full ${v.bar}`}
              initial={{ width:0 }} animate={{ width:`${v.percent}%` }} transition={{ duration:1, ease:"easeOut" }} />
          </div>
          <div className={`absolute top-3 right-3 w-1.5 h-1.5 rounded-full ${v.bar} animate-pulse`} />
        </motion.div>
      ))}
    </div>
  );
}
