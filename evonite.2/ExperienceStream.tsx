"use client";
import { motion } from "framer-motion";
import { BookOpen, TrendingUp, TrendingDown, Minus, Brain } from "lucide-react";
import { DashboardData } from "../types";
const mockExps = [
  { id:"e1", task:"Run self-evaluation cycle", score:0.89, success:true,  timestamp:new Date(Date.now()-60000).toISOString() },
  { id:"e2", task:"Build markdown task-tracker", score:0.83, success:true,  timestamp:new Date(Date.now()-45000).toISOString() },
  { id:"e3", task:"Explore novel task domains", score:0.44, success:false, timestamp:new Date(Date.now()-30000).toISOString() },
  { id:"e4", task:"Optimize memory retrieval",  score:0.77, success:true,  timestamp:new Date(Date.now()-15000).toISOString() },
  { id:"e5", task:"Generate count_vowels skill", score:0.91, success:true,  timestamp:new Date(Date.now()-5000).toISOString() },
];
export default function ExperienceStream({ data }: { data: DashboardData | null }) {
  const stats = data?.experience_stats;
  const experiences = stats?.recent?.length ? stats.recent : mockExps;
  const getIcon = (score:number) => score>=0.8
    ? <TrendingUp className="w-3 h-3 text-si-emerald" />
    : score>=0.5 ? <Minus className="w-3 h-3 text-si-amber" />
    : <TrendingDown className="w-3 h-3 text-si-rose" />;
  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-si-violet" />Experience Library
        </h3>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-slate-500">Avg: {(stats?.avg_score ?? 0.77).toFixed(2)}</span>
          <span className="text-si-rose">Fail: {stats?.failures ?? 1}</span>
        </div>
      </div>
      <div className="space-y-2">
        {experiences.map((exp, i) => (
          <motion.div key={exp.id ?? i} initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
            transition={{ delay:i*0.05 }}
            className={`flex items-center gap-3 p-2.5 rounded-lg border ${exp.success?"border-slate-800 bg-slate-950/40":"border-si-rose/20 bg-si-rose/5"}`}>
            <div className="flex-shrink-0">{getIcon(exp.score)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-slate-300 truncate">{exp.task}</div>
              <div className="text-[10px] font-mono text-slate-600 mt-0.5">{new Date(exp.timestamp).toLocaleTimeString()}</div>
            </div>
            <div className="flex-shrink-0 text-[10px] font-mono font-bold text-slate-400">{(exp.score*100).toFixed(0)}%</div>
          </motion.div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-slate-800/50 flex items-center gap-2">
        <Brain className="w-3 h-3 text-si-violet" />
        <span className="text-[10px] font-mono text-slate-600">Self-model: {data?.self_model?.total_nodes ?? 9} capability nodes</span>
      </div>
    </div>
  );
}
