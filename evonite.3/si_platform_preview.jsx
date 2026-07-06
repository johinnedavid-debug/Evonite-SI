import { useState, useEffect, useRef, useCallback } from "react";

// ── Design tokens — exact from tailwind.config.ts ────────────────────────────
const SI = {
  bg:      "#020617",
  panel:   "#0f172a",
  border:  "#1e293b",
  cyan:    "#22d3ee",
  emerald: "#34d399",
  violet:  "#a78bfa",
  rose:    "#fb7185",
  amber:   "#fbbf24",
};
const MONO = "'JetBrains Mono','Fira Code',monospace";
const SANS = "Inter,system-ui,sans-serif";

// ── Static data (mirrors mock data in each component) ────────────────────────
const MOCK_AGENTS = [
  { id:"meta-001", role:"meta-reflector", status:"working",    model:"llama3",    tasks_completed:42 },
  { id:"cod-7d26", role:"code",           status:"working",    model:"codellama", tasks_completed:89 },
  { id:"dsg-c20c", role:"designer",       status:"working",    model:"llama3",    tasks_completed:34 },
  { id:"asr-065f", role:"assessor",       status:"reflecting", model:"llama3",    tasks_completed:28 },
  { id:"fnl-3b9a", role:"finaliser",      status:"idle",       model:"llama3",    tasks_completed:17 },
  { id:"rsc-f12a", role:"researcher",     status:"idle",       model:"llama3",    tasks_completed:55 },
];

const MOCK_GOALS = [
  { goal_id:"g-01", description:"Run self-evaluation on experience library", priority:1, status:"executing",  use_pipeline:false },
  { goal_id:"g-02", description:"Build markdown task-tracker CLI",            priority:2, status:"executing",  use_pipeline:true  },
  { goal_id:"g-03", description:"Identify top 3 capability gaps",             priority:3, status:"planning",   use_pipeline:false },
  { goal_id:"g-04", description:"Optimize memory retrieval latency",          priority:5, status:"done",       use_pipeline:false },
];

const MOCK_EXPS = [
  { id:"e1", task:"Run self-evaluation cycle",     score:0.89, success:true,  ts:"18:29:01" },
  { id:"e2", task:"Build markdown task-tracker",   score:0.83, success:true,  ts:"18:29:06" },
  { id:"e3", task:"Explore novel task domains",    score:0.44, success:false, ts:"18:29:11" },
  { id:"e4", task:"Optimize memory retrieval",     score:0.77, success:true,  ts:"18:29:18" },
  { id:"e5", task:"Generate count_vowels skill",   score:0.91, success:true,  ts:"18:29:23" },
];

const MOCK_LOGS = [
  { id:1,  ts:"18:29:01", level:"EVENT", source:"orchestrator",        msg:"Goal completed: g-01 [self-evaluation]" },
  { id:2,  ts:"18:29:03", level:"INFO",  source:"agent-factory",       msg:"Spawned cod-7d26 (type=code, tools=[filesystem,memory,git])" },
  { id:3,  ts:"18:29:04", level:"INFO",  source:"pipeline.sequential", msg:"Stage coder complete | score=0.81" },
  { id:4,  ts:"18:29:05", level:"INFO",  source:"pipeline.sequential", msg:"Stage designer complete | score=0.78" },
  { id:5,  ts:"18:29:10", level:"INFO",  source:"pipeline.sequential", msg:"Stage assessor complete | approved=True | score=0.85" },
  { id:6,  ts:"18:29:12", level:"INFO",  source:"pipeline.sequential", msg:"Stage finaliser complete | score=0.89" },
  { id:7,  ts:"18:29:13", level:"EVENT", source:"pipeline.sequential", msg:"Pipeline[pipe-a3c2] COMPLETE | overall=0.83 | 4/4 stages" },
  { id:8,  ts:"18:29:15", level:"WARN",  source:"monitor",             msg:"CPU spike: 81% — approaching spawn threshold" },
  { id:9,  ts:"18:29:16", level:"INFO",  source:"meta_loops.study",    msg:"Study Cycle #3 | updates=6 | goals=['Tune worker prompt']" },
  { id:10, ts:"18:29:18", level:"INFO",  source:"skills.registry",     msg:"Skill count_vowels injected fleet-wide (6 agents)" },
];

const STAGES = [
  { key:"planning",   label:"Plan",    color:SI.amber,   bg:"rgba(251,191,36,0.06)",   border:"rgba(251,191,36,0.2)"   },
  { key:"executing",  label:"Execute", color:SI.cyan,    bg:"rgba(34,211,238,0.06)",   border:"rgba(34,211,238,0.2)"   },
  { key:"reflecting", label:"Reflect", color:SI.violet,  bg:"rgba(167,139,250,0.06)",  border:"rgba(167,139,250,0.2)"  },
  { key:"done",       label:"Done",    color:SI.emerald, bg:"rgba(52,211,153,0.06)",   border:"rgba(52,211,153,0.2)"   },
  { key:"error",      label:"Error",   color:SI.rose,    bg:"rgba(251,113,133,0.06)",  border:"rgba(251,113,133,0.2)"  },
];

const LIVE_LOG_POOL = [
  (n) => ({ level:"INFO",  source:"meta_loops.study",    msg:`Study cycle #${n} complete | capability_updates=4` }),
  ()  => ({ level:"INFO",  source:"pipeline.sequential", msg:`Stage ${["coder","designer","assessor","finaliser"][Math.floor(Math.random()*4)]} complete | score=0.${73+Math.floor(Math.random()*20)}` }),
  ()  => ({ level:"EVENT", source:"memory.exp_lib",      msg:`Experience recorded ✓ | score=0.${75+Math.floor(Math.random()*20)}` }),
  ()  => ({ level:"WARN",  source:"utils.monitoring",    msg:`CPU=${Math.floor(55+Math.random()*25)}% RAM=${Math.floor(28+Math.random()*20)}%` }),
  ()  => ({ level:"INFO",  source:"skills.registry",     msg:"Fleet-wide skill inject: heuristic_score" }),
  ()  => ({ level:"INFO",  source:"meta_loops.improve",  msg:"Improvement proposal approved: prompt_tuning" }),
];

const STATUS_COLOR = { working:SI.cyan, reflecting:SI.violet, idle:"#475569", error:SI.rose };
const LEVEL_COLOR  = { INFO:SI.cyan, WARN:SI.amber, ERROR:SI.rose, EVENT:SI.emerald };

// ── Particle canvas (LiveBackground) ─────────────────────────────────────────
function LiveBackground() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let id, particles = [];
    const mouse = { x:-9999, y:-9999 };
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const colors = ["rgba(34,211,238,0.25)","rgba(52,211,153,0.15)","rgba(167,139,250,0.15)"];
    const init = () => {
      particles = [];
      const n = Math.floor((canvas.width*canvas.height)/14000);
      for (let i=0; i<n; i++) particles.push({
        x:Math.random()*canvas.width, y:Math.random()*canvas.height,
        vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3,
        r:Math.random()*2+0.8, color:colors[Math.floor(Math.random()*3)],
      });
    };
    init();
    const mm = e => { const r = canvas.getBoundingClientRect(); mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top; };
    canvas.addEventListener("mousemove", mm);
    const draw = () => {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for (let i=0; i<particles.length; i++) {
        for (let j=i+1; j<particles.length; j++) {
          const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
          const d=Math.sqrt(dx*dx+dy*dy);
          if (d<110) { ctx.beginPath(); ctx.strokeStyle=`rgba(34,211,238,${0.08*(1-d/110)})`; ctx.lineWidth=0.5; ctx.moveTo(particles[i].x,particles[i].y); ctx.lineTo(particles[j].x,particles[j].y); ctx.stroke(); }
        }
      }
      particles.forEach(p => {
        p.x+=p.vx; p.y+=p.vy;
        const mdx=p.x-mouse.x, mdy=p.y-mouse.y, md=Math.sqrt(mdx*mdx+mdy*mdy);
        if (md<140) { const f=(140-md)/140; p.vx+=(mdx/md)*f*0.4; p.vy+=(mdy/md)*f*0.4; }
        p.vx*=0.99; p.vy*=0.99;
        if (p.x<0) p.x=canvas.width; if (p.x>canvas.width) p.x=0;
        if (p.y<0) p.y=canvas.height; if (p.y>canvas.height) p.y=0;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=p.color; ctx.fill();
      });
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(id); canvas.removeEventListener("mousemove",mm); };
  }, []);
  return <canvas ref={ref} style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.65, pointerEvents:"none" }} />;
}

// ── NavBar ────────────────────────────────────────────────────────────────────
function NavBar({ connected, iteration }) {
  const [rot, setRot] = useState(0);
  useEffect(() => { const id = setInterval(() => setRot(r => r+1), 55); return () => clearInterval(id); }, []);
  return (
    <div style={{
      position:"fixed", top:0, left:0, right:0, zIndex:40,
      background:"rgba(15,23,42,0.65)", backdropFilter:"blur(12px)",
      borderBottom:`1px solid ${SI.border}`,
      height:56, display:"flex", alignItems:"center",
      padding:"0 20px", justifyContent:"space-between",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ display:"inline-block", transform:`rotate(${rot}deg)`, fontSize:20 }}>🧠</span>
        <div>
          <div style={{ fontFamily:SANS, fontSize:13, fontWeight:700, letterSpacing:"0.08em", color:"#f1f5f9" }}>
            SYNTHETIC<span style={{ color:SI.cyan }}>INTELLIGENCE</span>
          </div>
          <div style={{ fontFamily:MONO, fontSize:10, color:"#64748b" }}>
            Embodiment v3.0 · Iteration #{iteration}
          </div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:14 }}>📡</span>
          <span style={{ fontFamily:MONO, fontSize:10, textTransform:"uppercase", color: connected ? SI.emerald : SI.rose }}>
            {connected ? "Neural Link Active" : "Offline"}
          </span>
        </div>
        <div style={{ width:1, height:16, background:SI.border }} />
        <div style={{ fontFamily:MONO, fontSize:10, color:"#475569" }}>
          Ollama · localhost:8000
        </div>
      </div>
    </div>
  );
}

// ── SystemVitals ──────────────────────────────────────────────────────────────
function SystemVitals({ cpu, ram, agents, studyCycles, pipelineRuns }) {
  const vitals = [
    { label:"CPU Load",      value:`${cpu.toFixed(1)}%`,   pct:cpu,                         color:cpu>80?SI.rose:cpu>65?SI.amber:SI.cyan    },
    { label:"RAM Usage",     value:`${ram.toFixed(1)}%`,   pct:ram,                         color:SI.emerald },
    { label:"Active Agents", value:`${agents}`,            pct:Math.min(agents,100),        color:SI.violet  },
    { label:"Study Cycles",  value:`#${studyCycles}`,      pct:100,                         color:SI.amber   },
    { label:"Pipeline Runs", value:`${pipelineRuns}`,      pct:100,                         color:SI.cyan    },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
      {vitals.map((v,i) => (
        <div key={v.label} style={{
          background:"rgba(15,23,42,0.6)", backdropFilter:"blur(8px)",
          border:`1px solid ${SI.border}`, borderRadius:12,
          padding:"14px 16px", position:"relative", overflow:"hidden",
        }}>
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg,rgba(255,255,255,0.02),transparent)" }} />
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontFamily:MONO, fontSize:9, textTransform:"uppercase", letterSpacing:"0.1em", color:"#64748b" }}>{v.label}</span>
            <span style={{ fontFamily:MONO, fontSize:17, fontWeight:700, color:v.color, textShadow:`0 0 12px ${v.color}` }}>{v.value}</span>
          </div>
          <div style={{ height:5, background:"#1e293b", borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${v.pct}%`, background:v.color, borderRadius:3, boxShadow:`0 0 8px ${v.color}80`, transition:"width 1s ease" }} />
          </div>
          <div style={{ position:"absolute", top:12, right:12, width:6, height:6, borderRadius:"50%", background:v.color, boxShadow:`0 0 6px ${v.color}`, animation:"pulse 2s infinite" }} />
        </div>
      ))}
    </div>
  );
}

// ── FleetNetwork ──────────────────────────────────────────────────────────────
function FleetNetwork({ agents, tick }) {
  const roleEmoji = { "meta-reflector":"🧠", researcher:"🔍", worker:"🤖", code:"⌨️", evaluator:"🛡️", designer:"🎨", assessor:"✅", finaliser:"⭐" };
  return (
    <div style={{ background:"rgba(15,23,42,0.6)", backdropFilter:"blur(8px)", border:`1px solid ${SI.border}`, borderRadius:12, padding:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontFamily:MONO, fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:"#94a3b8", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ color:SI.cyan }}>🤖</span> Agent Fleet · 8 Archetypes
        </div>
        <span style={{ fontFamily:MONO, fontSize:10, color:"#475569" }}>{agents.length} nodes active</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
        {agents.map(a => {
          const sc = STATUS_COLOR[a.status] || "#475569";
          const active = a.status !== "idle";
          return (
            <div key={a.id} style={{
              background:"rgba(2,6,23,0.5)", border:`1px solid ${active ? sc+"40" : SI.border}`,
              borderRadius:8, padding:"10px 12px",
              transition:"border-color 0.3s",
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ position:"relative" }}>
                    <span style={{ fontSize:16 }}>{roleEmoji[a.role] || "🤖"}</span>
                    <span style={{ position:"absolute", top:-2, right:-2, width:7, height:7, borderRadius:"50%", background:sc, boxShadow:active?`0 0 5px ${sc}`:"none" }} />
                  </div>
                  <div>
                    <div style={{ fontFamily:MONO, fontSize:10, fontWeight:700, color:"#e2e8f0" }}>{a.id}</div>
                    <div style={{ fontFamily:MONO, fontSize:9, color:"#64748b", textTransform:"uppercase" }}>{a.role}</div>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:MONO, fontSize:9, color:"#475569" }}>{a.model}</div>
                  <div style={{ fontFamily:MONO, fontSize:9, color:SI.emerald }}>{a.tasks_completed} tasks</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Message bus */}
      <div style={{ height:52, border:`1px solid ${SI.border}40`, borderRadius:8, background:"rgba(2,6,23,0.3)", position:"relative", overflow:"hidden" }}>
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="bus" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(34,211,238,0)" />
              <stop offset="50%" stopColor="rgba(34,211,238,0.35)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0)" />
            </linearGradient>
          </defs>
          {[0,1,2,3,4,5].map(i => {
            const phase = (tick * 0.04 + i * 0.18) % 1;
            const x = phase * 120;
            return <line key={i} x1={`${15+i*13}%`} y1="50%" x2={`${15+i*13+x}%`} y2="50%"
              stroke="url(#bus)" strokeWidth="1" opacity={0.4 + 0.4*Math.sin(tick*0.1+i)} />;
          })}
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:"#334155", textTransform:"uppercase", letterSpacing:"0.15em" }}>
            Message Bus · Pipeline Channel · ONLINE
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Terminal ──────────────────────────────────────────────────────────────────
function Terminal({ logs }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);
  return (
    <div style={{ background:"rgba(15,23,42,0.6)", backdropFilter:"blur(8px)", border:`1px solid ${SI.border}`, borderRadius:12, padding:20, height:256, display:"flex", flexDirection:"column" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ fontFamily:MONO, fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:"#94a3b8", display:"flex", alignItems:"center", gap:8 }}>
          <span>💻</span> System Log
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:SI.emerald, display:"inline-block", boxShadow:`0 0 6px ${SI.emerald}` }} />
          <span style={{ fontFamily:MONO, fontSize:9, color:"#475569" }}>LIVE</span>
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", scrollbarWidth:"none" }}>
        {logs.map(log => (
          <div key={log.id} style={{ display:"flex", gap:10, fontFamily:MONO, fontSize:10, lineHeight:1.7, padding:"0 2px" }}>
            <span style={{ color:"#475569", minWidth:52 }}>{log.ts}</span>
            <span style={{ minWidth:42, fontWeight:700, color:LEVEL_COLOR[log.level]||SI.cyan }}>{log.level}</span>
            <span style={{ minWidth:110, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{log.source}</span>
            <span style={{ color:"#cbd5e1", textShadow:`0 0 2px ${SI.cyan}40` }}>{log.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── GoalPipeline ──────────────────────────────────────────────────────────────
function GoalPipeline({ goals, pendingGoals }) {
  const [newGoal, setNewGoal] = useState("");
  const [priority, setPriority] = useState(5);
  const [localGoals, setLocalGoals] = useState(goals);

  const handleAdd = e => {
    e.preventDefault();
    if (!newGoal.trim()) return;
    setLocalGoals(g => [...g, {
      goal_id:`g-${String(Date.now()).slice(-3)}`,
      description: newGoal, priority, status:"planning", use_pipeline: false,
    }]);
    setNewGoal("");
  };

  return (
    <div style={{ background:"rgba(15,23,42,0.6)", backdropFilter:"blur(8px)", border:`1px solid ${SI.border}`, borderRadius:12, padding:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontFamily:MONO, fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:"#94a3b8", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ color:SI.rose }}>🎯</span> Goal Pipeline
        </div>
        <span style={{ fontFamily:MONO, fontSize:10, color:"#475569" }}>{pendingGoals} pending</span>
      </div>
      {/* Input row */}
      <form onSubmit={handleAdd} style={{ display:"flex", gap:8, marginBottom:14 }}>
        <input value={newGoal} onChange={e=>setNewGoal(e.target.value)}
          placeholder="Inject new directive..."
          style={{ flex:1, background:"#020617", border:`1px solid ${SI.border}`, borderRadius:8,
                   padding:"7px 12px", fontFamily:MONO, fontSize:11, color:"#e2e8f0",
                   outline:"none" }}
        />
        <select value={priority} onChange={e=>setPriority(Number(e.target.value))}
          style={{ background:"#020617", border:`1px solid ${SI.border}`, borderRadius:8,
                   padding:"7px 8px", fontFamily:MONO, fontSize:11, color:"#94a3b8", outline:"none" }}>
          {[1,2,3,4,5,6,7,8,9,10].map(p=><option key={p} value={p}>P{p}</option>)}
        </select>
        <button type="submit" style={{ background:"rgba(34,211,238,0.1)", border:`1px solid rgba(34,211,238,0.3)`,
          color:SI.cyan, borderRadius:8, padding:"7px 12px", cursor:"pointer", fontSize:14 }}>＋</button>
      </form>
      {/* Kanban columns */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
        {STAGES.map(stage => {
          const stageGoals = localGoals.filter(g => g.status === stage.key);
          return (
            <div key={stage.key} style={{ background:stage.bg, border:`1px solid ${stage.border}`, borderRadius:8, padding:8, minHeight:120 }}>
              <div style={{ fontFamily:MONO, fontSize:9, fontWeight:700, textTransform:"uppercase", color:stage.color, textAlign:"center", marginBottom:6 }}>{stage.label}</div>
              {stageGoals.map(goal => (
                <div key={goal.goal_id} style={{ background:"rgba(2,6,23,0.6)", border:`1px solid ${SI.border}`, borderRadius:5, padding:7, marginBottom:5, cursor:"pointer" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:3 }}>
                    <span style={{ fontFamily:MONO, fontSize:8, color:"#64748b" }}>{goal.goal_id}</span>
                    {goal.use_pipeline && <span style={{ fontSize:9, color:SI.violet }}>⑂</span>}
                  </div>
                  <p style={{ fontFamily:SANS, fontSize:10, color:"#cbd5e1", lineHeight:1.4, margin:0 }}>{goal.description}</p>
                  <div style={{ marginTop:5 }}>
                    <span style={{ fontFamily:MONO, fontSize:8, padding:"1px 5px", borderRadius:3,
                      background: goal.priority<=3 ? "rgba(251,113,133,0.12)" : "rgba(30,41,59,0.8)",
                      color: goal.priority<=3 ? SI.rose : "#64748b" }}>P{goal.priority}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ExperienceStream ──────────────────────────────────────────────────────────
function ExperienceStream({ experiences, stats }) {
  const icon = score => score>=0.8 ? "📈" : score>=0.5 ? "➖" : "📉";
  return (
    <div style={{ background:"rgba(15,23,42,0.6)", backdropFilter:"blur(8px)", border:`1px solid ${SI.border}`, borderRadius:12, padding:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontFamily:MONO, fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:"#94a3b8", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ color:SI.violet }}>📖</span> Experience Library
        </div>
        <div style={{ display:"flex", gap:12 }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:"#64748b" }}>Avg: {stats.avg.toFixed(2)}</span>
          <span style={{ fontFamily:MONO, fontSize:9, color:SI.rose }}>Fail: {stats.failures}</span>
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {experiences.map((e,i) => (
          <div key={e.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8,
            border:`1px solid ${e.success ? SI.border : "rgba(251,113,133,0.2)"}`,
            background: e.success ? "rgba(2,6,23,0.4)" : "rgba(251,113,133,0.04)" }}>
            <span style={{ flexShrink:0 }}>{icon(e.score)}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:SANS, fontSize:11, color:"#cbd5e1", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.task}</div>
              <div style={{ fontFamily:MONO, fontSize:9, color:"#475569", marginTop:1 }}>{e.ts}</div>
            </div>
            <span style={{ fontFamily:MONO, fontSize:10, fontWeight:700, color:"#94a3b8", flexShrink:0 }}>{(e.score*100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${SI.border}50`, display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:11 }}>🧠</span>
        <span style={{ fontFamily:MONO, fontSize:9, color:"#475569" }}>Self-model: 9 capability nodes · 3 improvements logged</span>
      </div>
    </div>
  );
}

// ── ApprovalGate ──────────────────────────────────────────────────────────────
function ApprovalGate({ pending, onDecide }) {
  const [timeLeft, setTimeLeft] = useState(30);
  useEffect(() => {
    if (!pending) return;
    setTimeLeft(30);
    const id = setInterval(() => setTimeLeft(t => { if (t<=1) { onDecide("spawn", true); return 0; } return t-1; }), 1000);
    return () => clearInterval(id);
  }, [pending]);
  if (!pending) return null;
  const labels = { spawn:"Agent Spawn Request", skill_inject:"Skill Injection", code_change:"Code Modification" };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center",
                  background:"rgba(0,0,0,0.65)", backdropFilter:"blur(6px)" }}>
      <div style={{ background:"rgba(15,23,42,0.95)", backdropFilter:"blur(20px)",
                    border:`1px solid rgba(251,191,36,0.3)`, borderRadius:16,
                    padding:24, maxWidth:420, width:"100%", margin:"0 16px",
                    boxShadow:"0 0 60px rgba(251,191,36,0.1)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <div style={{ width:40, height:40, borderRadius:"50%", background:"rgba(251,191,36,0.1)",
                        border:`1px solid rgba(251,191,36,0.2)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>⚠️</div>
          <div>
            <div style={{ fontFamily:SANS, fontSize:13, fontWeight:700, color:"#f1f5f9" }}>Human Approval Required</div>
            <div style={{ fontFamily:MONO, fontSize:10, color:"#64748b" }}>{labels[pending.action] ?? pending.action}</div>
          </div>
        </div>
        <div style={{ background:"#020617", borderRadius:8, padding:12, marginBottom:16, border:`1px solid ${SI.border}` }}>
          <pre style={{ fontFamily:MONO, fontSize:10, color:"#94a3b8", margin:0, overflow:"auto" }}>
            {JSON.stringify(pending.details, null, 2)}
          </pre>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, fontFamily:MONO, fontSize:10, color:"#64748b" }}>
            🛡️ Auto-approve in {timeLeft}s
          </div>
          <div style={{ height:4, width:96, background:"#1e293b", borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(timeLeft/30)*100}%`, background:SI.amber, transition:"width 1s linear", borderRadius:2 }} />
          </div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={() => onDecide(pending.action, false)}
            style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                     background:"rgba(251,113,133,0.1)", border:`1px solid rgba(251,113,133,0.3)`,
                     color:SI.rose, borderRadius:8, padding:"10px 0", fontFamily:MONO, fontSize:10,
                     fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", cursor:"pointer" }}>
            ✕ Veto
          </button>
          <button onClick={() => onDecide(pending.action, true)}
            style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                     background:"rgba(52,211,153,0.1)", border:`1px solid rgba(52,211,153,0.3)`,
                     color:SI.emerald, borderRadius:8, padding:"10px 0", fontFamily:MONO, fontSize:10,
                     fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", cursor:"pointer" }}>
            ✓ Approve
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function SIPlatformPreview() {
  const [tick,        setTick]        = useState(0);
  const [iteration,   setIteration]   = useState(42);
  const [cpu,         setCpu]         = useState(68);
  const [ram,         setRam]         = useState(41);
  const [agents,      setAgents]      = useState(MOCK_AGENTS);
  const [logs,        setLogs]        = useState(MOCK_LOGS);
  const [experiences, setExperiences] = useState(MOCK_EXPS);
  const [studyCycles, setStudyCycles] = useState(3);
  const [pipeRuns,    setPipeRuns]    = useState(1);
  const [logCounter,  setLogCounter]  = useState(3);
  const [pending,     setPending]     = useState(null);
  const [showApproval,setShowApproval]= useState(false);
  const [expStats,    setExpStats]    = useState({ avg:0.77, failures:1 });

  // Trigger approval gate demo once
  useEffect(() => {
    const id = setTimeout(() => {
      setPending({ action:"spawn", details:{ role:"researcher", reason:"High task load detected" }, timestamp:Date.now() });
      setShowApproval(true);
    }, 4000);
    return () => clearTimeout(id);
  }, []);

  // Live ticker
  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t+1);
      setIteration(i => i+1);
      setCpu(c => Math.min(88, Math.max(28, c+(Math.random()-0.46)*6)));
      setRam(r => Math.min(70, Math.max(28, r+(Math.random()-0.5)*2.5)));

      if (Math.random() > 0.38) {
        const n = logCounter;
        const template = LIVE_LOG_POOL[Math.floor(Math.random()*LIVE_LOG_POOL.length)];
        const entry = template(studyCycles);
        const now = new Date();
        const ts = [now.getHours(),now.getMinutes(),now.getSeconds()].map(x=>String(x).padStart(2,"0")).join(":");
        setLogs(l => [...l.slice(-38), { id:Date.now(), ts, level:entry.level, source:entry.source, msg:entry.msg }]);
        setLogCounter(n+1);
      }

      if (Math.random() > 0.78) {
        const statuses = ["working","working","reflecting","idle"];
        setAgents(prev => prev.map((a,i) => i===0 ? a : {
          ...a,
          status: statuses[Math.floor(Math.random()*statuses.length)],
          tasks_completed: a.tasks_completed + (Math.random()>0.7?1:0),
        }));
      }

      if (Math.random() > 0.88) {
        setStudyCycles(s => s+1);
        setExpStats(e => ({ avg: Math.min(0.97, e.avg+(Math.random()-0.3)*0.02), failures: e.failures }));
      }
    }, 1500);
    return () => clearInterval(id);
  }, [logCounter, studyCycles]);

  const handleDecide = useCallback((action, approved) => {
    setPending(null);
    setShowApproval(false);
    const now = new Date();
    const ts = [now.getHours(),now.getMinutes(),now.getSeconds()].map(x=>String(x).padStart(2,"0")).join(":");
    setLogs(l => [...l, {
      id:Date.now(), ts,
      level: approved ? "EVENT" : "WARN",
      source:"human-gate",
      msg: approved ? `✓ Approved: ${action}` : `✗ Vetoed: ${action}`,
    }]);
  }, []);

  const activeAgents = agents.filter(a => a.status !== "idle").length;

  return (
    <div style={{ minHeight:"100vh", background:SI.bg, fontFamily:SANS, color:"#cbd5e1", position:"relative" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        ::-webkit-scrollbar { width:5px }
        ::-webkit-scrollbar-track { background:#0f172a }
        ::-webkit-scrollbar-thumb { background:#334155; border-radius:3px }
        button:hover { opacity:0.85 }
        input:focus { border-color:rgba(34,211,238,0.5) !important; outline:none }
        select:focus { border-color:rgba(34,211,238,0.5) !important; outline:none }
      `}</style>

      {/* Particle background */}
      <div style={{ position:"fixed", inset:0, zIndex:0 }}>
        <LiveBackground />
      </div>

      {/* NavBar */}
      <NavBar connected={true} iteration={iteration} />

      {/* Main content */}
      <div style={{ position:"relative", zIndex:10, paddingTop:72, paddingBottom:32, paddingLeft:16, paddingRight:16, maxWidth:1280, margin:"0 auto" }}>

        {/* System Vitals */}
        <SystemVitals cpu={cpu} ram={ram} agents={activeAgents} studyCycles={studyCycles} pipelineRuns={pipeRuns} />

        {/* Main grid: 2/3 left, 1/3 right */}
        <div style={{ marginTop:20, display:"grid", gridTemplateColumns:"2fr 1fr", gap:20 }}>

          {/* Left column */}
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <FleetNetwork agents={agents} tick={tick} />
            <Terminal logs={logs} />
          </div>

          {/* Right column */}
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <GoalPipeline goals={MOCK_GOALS} pendingGoals={2} />
            <ExperienceStream experiences={experiences} stats={expStats} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop:28, paddingTop:14, borderTop:`1px solid rgba(30,41,59,0.5)`,
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", gap:14, fontFamily:MONO, fontSize:9, color:"#334155" }}>
            <span>LangGraph Runtime</span><span>•</span>
            <span>ChromaDB Vector Store</span><span>•</span>
            <span>Ollama Local Models</span><span>•</span>
            <span>FastAPI SSE Bridge</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:SI.cyan, display:"inline-block", boxShadow:`0 0 6px ${SI.cyan}`, animation:"pulse 2s infinite" }} />
            <span style={{ fontFamily:MONO, fontSize:9, color:"#334155" }}>Self-Improving Loop Active</span>
          </div>
        </div>
      </div>

      {/* Approval Gate modal */}
      {showApproval && (
        <ApprovalGate pending={pending} onDecide={handleDecide} />
      )}
    </div>
  );
}
