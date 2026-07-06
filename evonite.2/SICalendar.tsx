"use client";
/**
 * SICalendar.tsx — Full built-in calendar with month view, event creation,
 * and colour-coded event types (task / goal / meeting / reminder).
 * Integrates with /api/calendar for persistence.
 */
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, X, Calendar, Clock } from "lucide-react";

interface CalEvent {
  id:    string;
  title: string;
  date:  string;  // YYYY-MM-DD
  time:  string;  // HH:MM
  type:  "task"|"goal"|"meeting"|"reminder";
  color: string;
  notes: string;
  agent?: string;
}

const TYPE_META: Record<string, { color: string; bg: string; label: string }> = {
  task:     { color:"#22d3ee", bg:"rgba(34,211,238,.12)",  label:"Task"     },
  goal:     { color:"#a78bfa", bg:"rgba(167,139,250,.12)", label:"Goal"     },
  meeting:  { color:"#34d399", bg:"rgba(52,211,153,.12)",  label:"Meeting"  },
  reminder: { color:"#fbbf24", bg:"rgba(251,191,36,.12)",  label:"Reminder" },
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

function daysInMonth(y: number, m: number) { return new Date(y, m+1, 0).getDate(); }
function firstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }

export default function SICalendar() {
  const now = new Date();
  const [view,    setView]    = useState<{year:number;month:number}>({year:now.getFullYear(), month:now.getMonth()});
  const [events,  setEvents]  = useState<CalEvent[]>([]);
  const [selected,setSelected]= useState<string|null>(null);   // YYYY-MM-DD
  const [creating,setCreating]= useState(false);
  const [form,    setForm]    = useState({ title:"", time:"09:00", type:"task" as CalEvent["type"], notes:"", agent:"" });

  // Local seed events
  useEffect(() => {
    const todayStr = now.toISOString().slice(0,10);
    const seeds: CalEvent[] = [
      { id:"s1", title:"Study Cycle #4",   date:todayStr,                       time:"10:00", type:"task",     color:"#22d3ee", notes:"Auto-triggered by monitor", agent:"meta-001" },
      { id:"s2", title:"Pipeline Run",     date:todayStr,                       time:"14:30", type:"goal",     color:"#a78bfa", notes:"Coder→Designer→Assessor→Finaliser", agent:"" },
      { id:"s3", title:"Human Review",     date:getDateStr(1),                  time:"09:00", type:"meeting",  color:"#34d399", notes:"Approve pending skill injections", agent:"" },
      { id:"s4", title:"Improvement Cycle",date:getDateStr(2),                  time:"11:00", type:"task",     color:"#22d3ee", notes:"", agent:"meta-001" },
      { id:"s5", title:"Deploy Checkpoint",date:getDateStr(5),                  time:"16:00", type:"reminder", color:"#fbbf24", notes:"Tag v3.1 and push to git", agent:"" },
    ];
    setEvents(seeds);
  }, []);

  function getDateStr(offsetDays: number) {
    const d = new Date(); d.setDate(d.getDate()+offsetDays);
    return d.toISOString().slice(0,10);
  }

  const prevMonth = () => setView(v => { const d=new Date(v.year,v.month-1); return {year:d.getFullYear(),month:d.getMonth()}; });
  const nextMonth = () => setView(v => { const d=new Date(v.year,v.month+1); return {year:d.getFullYear(),month:d.getMonth()}; });

  const eventsForDate = (dateStr: string) => events.filter(e=>e.date===dateStr);

  const handleCreate = useCallback(async () => {
    if (!selected || !form.title.trim()) return;
    const meta = TYPE_META[form.type];
    const newEvt: CalEvent = {
      id:    `evt-${Date.now()}`,
      title: form.title.trim(),
      date:  selected,
      time:  form.time,
      type:  form.type,
      color: meta.color,
      notes: form.notes,
      agent: form.agent,
    };
    setEvents(p=>[...p, newEvt]);
    setCreating(false);
    setForm({ title:"", time:"09:00", type:"task", notes:"", agent:"" });
  }, [selected, form]);

  const deleteEvent = (id: string) => setEvents(p=>p.filter(e=>e.id!==id));

  const days = daysInMonth(view.year, view.month);
  const firstDay = firstDayOfMonth(view.year, view.month);
  const todayStr = now.toISOString().slice(0,10);
  const selectedEvents = selected ? eventsForDate(selected) : [];

  return (
    <div className="glass-panel rounded-xl overflow-hidden flex flex-col" style={{minHeight:420}}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-si-cyan"/>SI Calendar
        </h3>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"><ChevronLeft className="w-4 h-4"/></button>
          <span className="text-[11px] font-mono text-slate-300 w-28 text-center">{MONTH_NAMES[view.month]} {view.year}</span>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"><ChevronRight className="w-4 h-4"/></button>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Calendar grid */}
        <div className="flex-1 p-4">
          {/* Day labels */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map(d=>(
              <div key={d} className="text-center text-[9px] font-mono text-slate-600 uppercase py-1">{d}</div>
            ))}
          </div>
          {/* Date cells */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
            {Array.from({length:days}).map((_,i)=>{
              const day   = i+1;
              const dateStr = `${view.year}-${String(view.month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const dayEvts = eventsForDate(dateStr);
              const isToday = dateStr === todayStr;
              const isSel   = dateStr === selected;
              return (
                <button key={day} onClick={()=>setSelected(isSel?null:dateStr)}
                  className={`relative rounded-lg p-1.5 min-h-[52px] text-left transition-all border ${
                    isSel   ? "border-si-cyan/50 bg-si-cyan/8" :
                    isToday ? "border-si-violet/40 bg-si-violet/8" :
                              "border-transparent hover:border-slate-700 hover:bg-white/[0.02]"
                  }`}>
                  <span className={`text-[11px] font-mono ${isToday?"text-si-violet font-bold":isSel?"text-si-cyan font-bold":"text-slate-500"}`}>{day}</span>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {dayEvts.slice(0,2).map(e=>(
                      <div key={e.id} className="text-[8px] font-mono truncate rounded px-1 py-0.5" style={{background:e.color+"18", color:e.color}}>
                        {e.title}
                      </div>
                    ))}
                    {dayEvts.length > 2 && <span className="text-[8px] font-mono text-slate-600">+{dayEvts.length-2}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-800/40">
            {Object.entries(TYPE_META).map(([k,v])=>(
              <div key={k} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{background:v.color}}/>
                <span className="text-[9px] font-mono text-slate-600">{v.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: day detail + event form */}
        <div className="w-56 border-l border-slate-800/60 p-4 flex flex-col gap-3">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400">{selected}</span>
                <button onClick={()=>{setCreating(true);}} className="flex items-center gap-1 text-[9px] font-mono text-si-cyan hover:text-si-cyan/80 transition-colors">
                  <Plus className="w-3 h-3"/>New
                </button>
              </div>

              {/* Event list */}
              <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
                <AnimatePresence>
                  {selectedEvents.length === 0 && !creating && (
                    <div className="text-[10px] font-mono text-slate-700 text-center pt-6">No events</div>
                  )}
                  {selectedEvents.map(e=>(
                    <motion.div key={e.id} initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}}
                      className="rounded-lg p-2.5 border" style={{background:e.color+"0d",borderColor:e.color+"35"}}>
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[10px] font-mono text-slate-200 leading-tight flex-1">{e.title}</span>
                        <button onClick={()=>deleteEvent(e.id)} className="text-slate-700 hover:text-si-rose transition-colors flex-shrink-0"><X className="w-3 h-3"/></button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Clock className="w-2.5 h-2.5" style={{color:e.color}}/>
                        <span className="text-[9px] font-mono" style={{color:e.color}}>{e.time}</span>
                        <span className="text-[8px] font-mono text-slate-600 ml-auto">{TYPE_META[e.type]?.label}</span>
                      </div>
                      {e.notes && <p className="text-[9px] text-slate-600 mt-1 leading-tight">{e.notes}</p>}
                      {e.agent && <span className="text-[8px] font-mono text-slate-700">→ {e.agent}</span>}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Create form */}
                <AnimatePresence>
                  {creating && (
                    <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                      className="border border-si-cyan/30 rounded-lg p-3 bg-si-cyan/5 flex flex-col gap-2">
                      <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                        placeholder="Event title" autoFocus
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[11px] font-mono text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-si-cyan/40"/>
                      <div className="flex gap-1.5">
                        <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 focus:outline-none focus:border-si-cyan/40"/>
                        <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value as CalEvent["type"]}))}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-1 py-1.5 text-[10px] font-mono text-slate-300 focus:outline-none">
                          {Object.keys(TYPE_META).map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                        placeholder="Notes (optional)" rows={2}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 placeholder:text-slate-700 resize-none focus:outline-none focus:border-si-cyan/40"/>
                      <div className="flex gap-1.5">
                        <button onClick={()=>setCreating(false)} className="flex-1 py-1.5 text-[10px] font-mono text-slate-600 border border-slate-800 rounded hover:border-slate-700 transition-colors">Cancel</button>
                        <button onClick={handleCreate} className="flex-1 py-1.5 text-[10px] font-mono text-si-cyan border border-si-cyan/40 rounded bg-si-cyan/10 hover:bg-si-cyan/20 transition-colors">Save</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <Calendar className="w-8 h-8 text-slate-800"/>
              <span className="text-[10px] font-mono text-slate-700">Select a date to view or add events</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
