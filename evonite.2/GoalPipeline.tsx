"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Plus, ChevronRight, GitBranch } from "lucide-react";
import { DashboardData, Goal } from "../types";
const stages = [
  { key:"planning",   label:"Plan",    color:"text-si-amber",   bg:"bg-si-amber/10",   border:"border-si-amber/20"   },
  { key:"executing",  label:"Execute", color:"text-si-cyan",    bg:"bg-si-cyan/10",    border:"border-si-cyan/20"    },
  { key:"reflecting", label:"Reflect", color:"text-si-violet",  bg:"bg-si-violet/10",  border:"border-si-violet/20"  },
  { key:"done",       label:"Done",    color:"text-si-emerald", bg:"bg-si-emerald/10", border:"border-si-emerald/20" },
  { key:"error",      label:"Error",   color:"text-si-rose",    bg:"bg-si-rose/10",    border:"border-si-rose/20"    },
];
const mockGoals: Goal[] = [
  { goal_id:"g-01", description:"Run self-evaluation on experience library", priority:1, completed:false, status:"executing" },
  { goal_id:"g-02", description:"Build markdown task-tracker CLI", priority:2, completed:false, status:"executing", use_pipeline:true },
  { goal_id:"g-03", description:"Identify top 3 capability gaps", priority:3, completed:false, status:"planning" },
  { goal_id:"g-04", description:"Optimize memory retrieval latency", priority:5, completed:true, status:"done" },
];
export default function GoalPipeline({ data, onAddGoal }: { data: DashboardData | null; onAddGoal: (d:string,p:number) => void }) {
  const [newGoal, setNewGoal] = useState("");
  const [priority, setPriority] = useState(5);
  const goals: Goal[] = (data as any)?.goals ?? mockGoals;
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if (!newGoal.trim()) return;
    onAddGoal(newGoal, priority); setNewGoal("");
  };
  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Target className="w-4 h-4 text-si-rose" />Goal Pipeline
        </h3>
        <span className="text-xs font-mono text-slate-600">{data?.pending_goals ?? 0} pending</span>
      </div>
      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <input type="text" value={newGoal} onChange={e=>setNewGoal(e.target.value)}
          placeholder="Inject new directive..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-si-cyan/50 transition-colors" />
        <select value={priority} onChange={e=>setPriority(Number(e.target.value))}
          className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs font-mono text-slate-400 focus:outline-none focus:border-si-cyan/50">
          {[1,2,3,4,5,6,7,8,9,10].map(p => <option key={p} value={p}>P{p}</option>)}
        </select>
        <button type="submit" className="bg-si-cyan/10 border border-si-cyan/30 text-si-cyan rounded-lg px-3 py-2 hover:bg-si-cyan/20 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </form>
      <div className="grid grid-cols-5 gap-2">
        {stages.map(stage => {
          const stageGoals = goals.filter((g:Goal) => g.status === stage.key);
          return (
            <div key={stage.key} className={`rounded-lg border ${stage.border} ${stage.bg} p-2 flex flex-col gap-2 min-h-[120px]`}>
              <div className={`text-[9px] font-mono font-bold uppercase ${stage.color} text-center`}>{stage.label}</div>
              <AnimatePresence>
                {stageGoals.map((goal:Goal) => (
                  <motion.div key={goal.goal_id} layout initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,scale:0.9 }}
                    className="bg-slate-950/60 border border-slate-800 rounded p-2 cursor-pointer hover:border-slate-600 transition-colors">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[9px] font-mono text-slate-500">{goal.goal_id}</span>
                      {goal.use_pipeline && <GitBranch className="w-2.5 h-2.5 text-si-violet flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] text-slate-300 leading-tight mt-1">{goal.description}</p>
                    <div className="mt-1.5">
                      <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${goal.priority<=3?"bg-si-rose/10 text-si-rose":"bg-slate-800 text-slate-500"}`}>
                        P{goal.priority}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
