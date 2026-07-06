import { useState, useEffect, useRef, useCallback } from "react";

// ── Design tokens (from tailwind.config.ts) ───────────────────────────────────
const SI = {
  bg:"#020617", panel:"#0f172a", border:"#1e293b",
  cyan:"#22d3ee", emerald:"#34d399", violet:"#a78bfa",
  rose:"#fb7185", amber:"#fbbf24",
};
const MONO = "'JetBrains Mono','Fira Code',monospace";
const SANS = "Inter,system-ui,sans-serif";

// ── Platform archetypes (mirrors agent_factory._TYPE_MAP) ─────────────────────
const ARCHETYPES = {
  worker:     { emoji:"🤖", color:SI.emerald,  desc:"General-purpose task executor",             skills:["heuristic_score","detect_errors"]       },
  researcher: { emoji:"🔍", color:"#a3e635",   desc:"Research + synthesis, web-search enabled",  skills:["summarise_text","extract_bullets"]       },
  code:       { emoji:"⌨️",  color:SI.violet,   desc:"Python code generation + sandbox exec",     skills:["detect_errors","fingerprint"]            },
  designer:   { emoji:"🎨", color:"#ec4899",   desc:"UI/UX specs, wireframes, design artefacts", skills:["summarise_text","extract_bullets"]       },
  assessor:   { emoji:"✅", color:SI.amber,    desc:"Holistic QA — go/no-go gate for pipeline",  skills:["heuristic_score","detect_errors"]        },
  finaliser:  { emoji:"⭐", color:"#22d3ee",   desc:"Synthesises all pipeline work → deliverable",skills:["summarise_text","build_reflection_prompt"]},
  evaluator:  { emoji:"🛡️",  color:"#f472b6",   desc:"Scores and critiques agent outputs",        skills:["heuristic_score","detect_errors"]        },
  reflection: { emoji:"↻",  color:"#c084fc",   desc:"Meta-reflection and lesson extraction",     skills:["build_reflection_prompt","heuristic_score"]},
};

// ── Static/mock data ──────────────────────────────────────────────────────────
const SEED_AGENTS = [
  { id:"meta-001", role:"meta-reflector", status:"working",    model:"llama3",    tasks:42,  type:"reflection" },
  { id:"cod-7d26", role:"code",           status:"working",    model:"codellama", tasks:89,  type:"code"       },
  { id:"dsg-c20c", role:"designer",       status:"working",    model:"llama3",    tasks:34,  type:"designer"   },
  { id:"asr-065f", role:"assessor",       status:"reflecting", model:"llama3",    tasks:28,  type:"assessor"   },
  { id:"fnl-3b9a", role:"finaliser",      status:"idle",       model:"llama3",    tasks:17,  type:"finaliser"  },
  { id:"rsc-f12a", role:"researcher",     status:"idle",       model:"llama3",    tasks:55,  type:"researcher" },
];

const SEED_GOALS = [
  { id:"g-01", desc:"Run self-evaluation on experience library",  pri:1, status:"executing",  pipe:false },
  { id:"g-02", desc:"Build markdown task-tracker CLI",            pri:2, status:"executing",  pipe:true  },
  { id:"g-03", desc:"Identify top 3 capability gaps",            pri:3, status:"planning",   pipe:false },
  { id:"g-04", desc:"Optimize memory retrieval latency",         pri:5, status:"done",       pipe:false },
];

const SEED_EXPS = [
  { id:"e1", task:"Run self-evaluation cycle",    score:0.89, ok:true,  ts:"18:29:01" },
  { id:"e2", task:"Build markdown task-tracker",  score:0.83, ok:true,  ts:"18:29:06" },
  { id:"e3", task:"Explore novel task domains",   score:0.44, ok:false, ts:"18:29:11" },
  { id:"e4", task:"Optimize memory retrieval",    score:0.77, ok:true,  ts:"18:29:18" },
  { id:"e5", task:"Generate count_vowels skill",  score:0.91, ok:true,  ts:"18:29:23" },
];

const SEED_LOGS = [
  { id:1,  ts:"18:29:01", lv:"EVENT", src:"orchestrator",        msg:"Goal completed: g-01 [self-evaluation]" },
  { id:2,  ts:"18:29:03", lv:"INFO",  src:"agent-factory",       msg:"Spawned cod-7d26 (type=code, tools=[filesystem,memory,git])" },
  { id:3,  ts:"18:29:05", lv:"INFO",  src:"pipeline.sequential", msg:"Stage designer complete | score=0.78" },
  { id:4,  ts:"18:29:10", lv:"INFO",  src:"pipeline.sequential", msg:"Stage assessor complete | approved=True | score=0.85" },
  { id:5,  ts:"18:29:13", lv:"EVENT", src:"pipeline.sequential", msg:"Pipeline[pipe-a3c2] COMPLETE | overall=0.83 | 4/4 stages" },
  { id:6,  ts:"18:29:15", lv:"WARN",  src:"monitor",             msg:"CPU spike: 81% — approaching spawn threshold" },
  { id:7,  ts:"18:29:16", lv:"INFO",  src:"meta_loops.study",    msg:"Study Cycle #3 complete | updates=6 | goals=['Tune worker']" },
  { id:8,  ts:"18:29:18", lv:"INFO",  src:"skills.registry",     msg:"Skill count_vowels injected fleet-wide (6 agents updated)" },
  { id:9,  ts:"18:29:20", lv:"SYS",   src:"terminal",            msg:"Agent Spawn Console ready — describe an agent below" },
];

const LIVE_POOL = [
  (n) => ({ lv:"INFO",  src:"meta_loops.study",    msg:`Study cycle #${n} | capability_updates=4` }),
  ()  => ({ lv:"INFO",  src:"pipeline.sequential", msg:`Stage ${["coder","designer","assessor","finaliser"][Math.floor(Math.random()*4)]} complete | score=0.${73+Math.floor(Math.random()*20)}` }),
  ()  => ({ lv:"EVENT", src:"memory.exp_lib",      msg:`Experience recorded ✓ | score=0.${75+Math.floor(Math.random()*20)}` }),
  ()  => ({ lv:"WARN",  src:"utils.monitoring",    msg:`CPU=${Math.floor(55+Math.random()*25)}% RAM=${Math.floor(28+Math.random()*20)}%` }),
  ()  => ({ lv:"INFO",  src:"skills.registry",     msg:"Fleet-wide skill inject: heuristic_score" }),
  ()  => ({ lv:"INFO",  src:"meta_loops.improve",  msg:"Improvement proposal approved: prompt_tuning" }),
];

const LEVEL_COLOR = { INFO:SI.cyan, WARN:SI.amber, ERROR:SI.rose, EVENT:SI.emerald, SPAWN:SI.violet, SYS:"#475569" };

const SUGGESTIONS = [
  "a web scraping researcher for live data",
  "a Python code engineer to build utilities",
  "a UI designer for dashboard components",
  "a QA assessor to audit pipeline outputs",
  "a meta-reflector for deep introspection",
];

const GOAL_STAGES = [
  { key:"planning",   label:"Plan",    c:SI.amber   },
  { key:"executing",  label:"Execute", c:SI.cyan    },
  { key:"reflecting", label:"Reflect", c:SI.violet  },
  { key:"done",       label:"Done",    c:SI.emerald },
  { key:"error",      label:"Error",   c:SI.rose    },
];

// ── Particle canvas (LiveBackground) ─────────────────────────────────────────
function LiveBackground() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let id, pts = [];
    const mouse = { x:-9e4, y:-9e4 };
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const colors = ["rgba(34,211,238,0.22)","rgba(52,211,153,0.14)","rgba(167,139,250,0.14)"];
    const init = () => {
      const n = Math.floor((canvas.width * canvas.height) / 13000);
      pts = Array.from({length:n}, () => ({
        x:Math.random()*canvas.width, y:Math.random()*canvas.height,
        vx:(Math.random()-.5)*.28, vy:(Math.random()-.5)*.28,
        r:Math.random()*1.8+.6, color:colors[Math.floor(Math.random()*3)],
      }));
    };
    init();
    const mm = e => { const r=canvas.getBoundingClientRect(); mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top; };
    canvas.addEventListener("mousemove", mm);
    const draw = () => {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
        if (d<115) { ctx.beginPath(); ctx.strokeStyle=`rgba(34,211,238,${.07*(1-d/115)})`; ctx.lineWidth=.5; ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.stroke(); }
      }
      pts.forEach(p => {
        p.x+=p.vx; p.y+=p.vy;
        const dx=p.x-mouse.x,dy=p.y-mouse.y,d=Math.sqrt(dx*dx+dy*dy);
        if (d<130){const f=(130-d)/130; p.vx+=(dx/d)*f*.35; p.vy+=(dy/d)*f*.35;}
        p.vx*=.99; p.vy*=.99;
        if (p.x<0)p.x=canvas.width; if(p.x>canvas.width)p.x=0;
        if (p.y<0)p.y=canvas.height; if(p.y>canvas.height)p.y=0;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=p.color; ctx.fill();
      });
      id=requestAnimationFrame(draw);
    };
    draw();
    return ()=>{cancelAnimationFrame(id); canvas.removeEventListener("mousemove",mm);};
  },[]);
  return <canvas ref={ref} style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.6,pointerEvents:"none"}}/>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ts() {
  return new Date().toTimeString().slice(0,8);
}
function Panel({children, style={}}) {
  return <div style={{background:"rgba(15,23,42,0.65)",backdropFilter:"blur(12px)",border:`1px solid ${SI.border}`,borderRadius:12,...style}}>{children}</div>;
}
function PanelHead({children}) {
  return <div style={{fontFamily:MONO,fontSize:10,textTransform:"uppercase",letterSpacing:".1em",color:"#94a3b8",display:"flex",alignItems:"center",gap:8}}>{children}</div>;
}
function Pill({children,color,bg}) {
  return <span style={{fontFamily:MONO,fontSize:8.5,color,background:bg||color+"18",border:`1px solid ${color}38`,borderRadius:3,padding:"1px 6px",textTransform:"uppercase"}}>{children}</span>;
}
function Bar({pct,color,h=4}) {
  return <div style={{height:h,background:SI.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:color,borderRadius:2,boxShadow:`0 0 6px ${color}80`,transition:"width 1s ease"}}/></div>;
}

// ── Approval Gate ─────────────────────────────────────────────────────────────
function ApprovalGate({pending, onDecide}) {
  const [t,setT]=useState(30);
  useEffect(()=>{
    if(!pending) return;
    setT(30);
    const id=setInterval(()=>setT(v=>{if(v<=1){onDecide(true);return 0;}return v-1;}),1000);
    return()=>clearInterval(id);
  },[pending]);
  if(!pending) return null;
  const labels={spawn:"Agent Spawn Request",skill_inject:"Skill Injection",code_change:"Code Modification"};
  return (
    <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.65)",backdropFilter:"blur(7px)"}}>
      <div style={{background:"rgba(15,23,42,.97)",border:`1px solid rgba(251,191,36,.35)`,borderRadius:16,padding:24,maxWidth:420,width:"calc(100% - 32px)",boxShadow:"0 0 60px rgba(251,191,36,.1)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{width:40,height:40,borderRadius:"50%",background:"rgba(251,191,36,.1)",border:`1px solid rgba(251,191,36,.22)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>⚠️</div>
          <div>
            <div style={{fontFamily:SANS,fontSize:13,fontWeight:700,color:"#f1f5f9"}}>Human Approval Required</div>
            <div style={{fontFamily:MONO,fontSize:10,color:"#64748b"}}>{labels[pending.action]??pending.action}</div>
          </div>
        </div>
        <div style={{background:"#020617",borderRadius:8,padding:12,marginBottom:16,border:`1px solid ${SI.border}`}}>
          <pre style={{fontFamily:MONO,fontSize:10,color:"#94a3b8",margin:0,overflow:"auto"}}>{JSON.stringify(pending.details,null,2)}</pre>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontFamily:MONO,fontSize:10,color:"#64748b"}}>🛡️ Auto-approve in {t}s</div>
          <div style={{height:4,width:88,background:SI.border,borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${(t/30)*100}%`,background:SI.amber,transition:"width 1s linear",borderRadius:2}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:10}}>
          {[["✕ Veto",false,SI.rose],["✓ Approve",true,SI.emerald]].map(([label,val,color])=>(
            <button key={label} onClick={()=>onDecide(val)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:`${color}18`,border:`1px solid ${color}40`,color,borderRadius:8,padding:"10px 0",fontFamily:MONO,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",cursor:"pointer"}}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function SIDashboard() {
  // ── Live state ──────────────────────────────────────────────────────────────
  const [tick,         setTick]         = useState(0);
  const [iteration,    setIteration]    = useState(42);
  const [cpu,          setCpu]          = useState(68);
  const [ram,          setRam]          = useState(41);
  const [agents,       setAgents]       = useState(SEED_AGENTS);
  const [goals,        setGoals]        = useState(SEED_GOALS);
  const [exps,         setExps]         = useState(SEED_EXPS);
  const [studyCycles,  setStudyCycles]  = useState(3);
  const [pipeRuns,     setPipeRuns]     = useState(1);
  const [logs,         setLogs]         = useState(SEED_LOGS);
  const [liveCount,    setLiveCount]    = useState(3);
  const [approval,     setApproval]     = useState(null);
  const [newGoal,      setNewGoal]      = useState("");
  const [goalPri,      setGoalPri]      = useState(5);

  // ── Spawn console state ─────────────────────────────────────────────────────
  const [spawnInput,   setSpawnInput]   = useState("");
  const [selfPrompt,   setSelfPrompt]   = useState(false);
  const [spawnStatus,  setSpawnStatus]  = useState("idle"); // idle|thinking|duplicate|spawned|error
  const [spawnResult,  setSpawnResult]  = useState(null);
  const [suggIdx,      setSuggIdx]      = useState(0);
  const spawnInputRef                   = useRef(null);
  const logBottomRef                    = useRef(null);

  // ── Scroll log to bottom ────────────────────────────────────────────────────
  useEffect(() => { logBottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);

  // ── Suggestion rotation ─────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setSuggIdx(i => (i+1) % SUGGESTIONS.length), 3500);
    return () => clearInterval(id);
  }, []);

  // ── Live ticker ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t+1);
      setIteration(i => i+1);
      setCpu(c => Math.min(88, Math.max(28, c+(Math.random()-.46)*6)));
      setRam(r => Math.min(70, Math.max(28, r+(Math.random()-.5)*2.5)));
      setLiveCount(n => n+1);

      if (Math.random()>.38) {
        const tmpl = LIVE_POOL[Math.floor(Math.random()*LIVE_POOL.length)];
        const e = tmpl(liveCount);
        setLogs(l => [...l.slice(-60), { id:Date.now(), ts:ts(), ...e }]);
      }
      if (Math.random()>.8) {
        const statuses = ["working","working","reflecting","idle"];
        setAgents(prev => prev.map((a,i) => i===0 ? a : {...a, status:statuses[Math.floor(Math.random()*statuses.length)]}));
      }
      if (Math.random()>.92) setStudyCycles(s => s+1);
    }, 1500);
    return () => clearInterval(id);
  }, [liveCount]);

  // ── Approval gate: show once after 4 seconds ────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => setApproval({ action:"spawn", details:{ role:"researcher", reason:"High task load detected" } }), 4000);
    return () => clearTimeout(id);
  }, []);

  // ── Push log ─────────────────────────────────────────────────────────────────
  const pushLog = useCallback((lv, src, msg) => {
    setLogs(l => [...l.slice(-60), { id:Date.now(), ts:ts(), lv, src, msg }]);
  }, []);

  // ── Spawn handler (simulates /api/spawn) ────────────────────────────────────
  const handleSpawn = useCallback(() => {
    const desc = spawnInput.trim();
    if (!desc || spawnStatus === "thinking") return;
    setSpawnStatus("thinking");
    setSpawnResult(null);
    pushLog("SPAWN","terminal",`Analysing: "${desc}"`);

    setTimeout(() => {
      // Match archetype
      const d = desc.toLowerCase();
      let matched = "worker", confidence = 0.1;
      const kws = {
        researcher:["research","search","explore","web","browse","scout","investigate"],
        code:      ["code","coder","python","program","script","develop","engineer","software"],
        designer:  ["design","ui","ux","visual","wireframe","layout","figma","css","frontend"],
        assessor:  ["assess","qa","quality","gate","audit","test","inspect"],
        finaliser: ["finalise","finalize","final","deliver","synthesise","ship","complete"],
        evaluator: ["evaluat","score","judge","critic","rate","review"],
        reflection:["reflect","introspect","lesson","meta","retrospect"],
      };
      for (const [type, words] of Object.entries(kws)) {
        const hits = words.filter(w => d.includes(w)).length;
        const score = hits / words.length;
        if (score > confidence) { matched = type; confidence = score; }
      }

      // Check if already exists
      const exists = agents.find(a => a.type === matched);
      if (exists) {
        setSpawnStatus("duplicate");
        setSpawnResult({
          status:"duplicate", archetype:matched,
          existing_ids:[exists.id],
          message:`A ${matched} agent already exists in the fleet (${exists.id}). No new agent spawned.`,
        });
        pushLog("WARN","agent-factory",`Duplicate detected — ${matched} already in fleet: ${exists.id}`);
        pushLog("SYS","terminal",`No spawn needed. Existing agent: ${exists.id} (${exists.role})`);
      } else {
        const arc = ARCHETYPES[matched] || ARCHETYPES.worker;
        const newId = `${matched.slice(0,3)}-${Math.random().toString(36).slice(2,6)}`;
        const newAgent = { id:newId, role:matched, status:"working", model:"llama3", tasks:0, type:matched };
        setAgents(prev => [...prev, newAgent]);
        const spTask = selfPrompt
          ? `You are newly spawned ${matched} agent ${newId}. Introduce yourself: describe your capabilities and propose your first self-directed task.`
          : null;
        const result = {
          status:"spawned", agent_id:newId, archetype:matched, role:`${matched}-agent`,
          confidence, skills_injected:arc.skills, fleet_updated:agents.length+1,
          self_prompted:selfPrompt, self_prompt_task:spTask,
        };
        setSpawnStatus("spawned");
        setSpawnResult(result);
        pushLog("SPAWN","agent-factory",`Agent spawned | id=${newId} | type=${matched} | tools=[filesystem,memory,git]`);
        pushLog("INFO","skills.registry",`Skills [${arc.skills.join(",")}] injected fleet-wide (${agents.length+1} agents updated)`);
        if (selfPrompt && spTask) {
          pushLog("SPAWN","meta-orchestrator",`Self-prompt queued for ${newId}: "${spTask.slice(0,70)}…"`);
          setTimeout(() => pushLog("EVENT","meta-orchestrator",`${newId} self-prompted → task queued in goal pipeline`), 800);
        }
        setPipeRuns(p => p+1);
      }

      setSpawnInput("");
      setTimeout(() => { setSpawnStatus("idle"); setSpawnResult(null); }, 5500);
    }, 1600); // simulate network + analysis time
  }, [spawnInput, selfPrompt, spawnStatus, agents, pushLog]);

  const handleSpawnKey = e => { if (e.key==="Enter") handleSpawn(); if (e.key==="Tab") { e.preventDefault(); setSpawnInput(SUGGESTIONS[suggIdx]); } };

  const handleAddGoal = e => {
    e.preventDefault();
    if (!newGoal.trim()) return;
    setGoals(g => [...g, { id:`g-${String(Date.now()).slice(-3)}`, desc:newGoal, pri:goalPri, status:"planning", pipe:false }]);
    setNewGoal("");
    pushLog("INFO","meta-orchestrator",`Goal injected [pri=${goalPri}]: "${newGoal.slice(0,50)}"`);
  };

  const handleApprovalDecide = approved => {
    const action = approval?.action;
    setApproval(null);
    pushLog(approved?"EVENT":"WARN","human-gate", approved ? `✓ Approved: ${action}` : `✗ Vetoed: ${action}`);
  };

  const activeCount = agents.filter(a => a.status!=="idle").length;
  const cpuColor = cpu>80 ? SI.rose : cpu>65 ? SI.amber : SI.cyan;

  const statusC = { working:SI.cyan, reflecting:SI.violet, idle:"#475569", error:SI.rose };

  const spawnResultBorder = spawnStatus==="duplicate" ? `rgba(251,191,36,.35)` : spawnStatus==="spawned" ? `rgba(52,211,153,.35)` : spawnStatus==="error" ? `rgba(251,113,133,.35)` : SI.border;
  const spawnResultBg = spawnStatus==="duplicate" ? "rgba(251,191,36,.05)" : spawnStatus==="spawned" ? "rgba(52,211,153,.05)" : spawnStatus==="error" ? "rgba(251,113,133,.05)" : "transparent";

  return (
    <div style={{minHeight:"100vh",background:SI.bg,fontFamily:SANS,color:"#cbd5e1",position:"relative",overflow:"hidden"}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0f172a}
        ::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        button{cursor:pointer}
        input,select{outline:none}
      `}</style>

      {/* ── Live particle background ─────────────────────────────────────── */}
      <div style={{position:"fixed",inset:0,zIndex:0}}>
        <LiveBackground />
      </div>

      {/* ── NavBar ─────────────────────────────────────────────────────────── */}
      <div style={{position:"fixed",top:0,left:0,right:0,zIndex:40,background:"rgba(15,23,42,.7)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${SI.border}`,height:54,display:"flex",alignItems:"center",padding:"0 20px",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20,display:"inline-block",animation:"spin 20s linear infinite"}}>🧠</span>
          <div>
            <div style={{fontFamily:SANS,fontSize:13,fontWeight:700,letterSpacing:".08em",color:"#f1f5f9"}}>
              SYNTHETIC<span style={{color:SI.cyan}}>INTELLIGENCE</span>
            </div>
            <div style={{fontFamily:MONO,fontSize:9,color:"#64748b"}}>Embodiment v3.0 · Iteration #{iteration} · 46/46 tests</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:SI.emerald,display:"inline-block",boxShadow:`0 0 6px ${SI.emerald}`,animation:"pulse 2s infinite"}}/>
            <span style={{fontFamily:MONO,fontSize:10,color:SI.emerald,textTransform:"uppercase"}}>Neural Link Active</span>
          </div>
          <div style={{width:1,height:16,background:SI.border}}/>
          <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>Ollama · localhost:8000</span>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div style={{position:"relative",zIndex:10,paddingTop:70,paddingBottom:28,padding:"70px 16px 28px",maxWidth:1300,margin:"0 auto"}}>

        {/* ── System Vitals ──────────────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
          {[
            { label:"CPU Load",      value:`${cpu.toFixed(1)}%`,  pct:cpu,              color:cpuColor  },
            { label:"RAM Usage",     value:`${ram.toFixed(1)}%`,  pct:ram,              color:SI.emerald},
            { label:"Active Agents", value:`${activeCount}`,      pct:activeCount,      color:SI.violet },
            { label:"Study Cycles",  value:`#${studyCycles}`,     pct:100,              color:SI.amber  },
            { label:"Pipeline Runs", value:`${pipeRuns}`,         pct:100,              color:SI.cyan   },
          ].map(v => (
            <Panel key={v.label} style={{padding:"13px 16px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,.02),transparent)"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontFamily:MONO,fontSize:9,textTransform:"uppercase",letterSpacing:".1em",color:"#64748b"}}>{v.label}</span>
                <span style={{fontFamily:MONO,fontSize:18,fontWeight:700,color:v.color,textShadow:`0 0 14px ${v.color}`}}>{v.value}</span>
              </div>
              <Bar pct={v.pct} color={v.color} h={5}/>
              <div style={{position:"absolute",top:12,right:12,width:6,height:6,borderRadius:"50%",background:v.color,boxShadow:`0 0 6px ${v.color}`,animation:"pulse 2s infinite"}}/>
            </Panel>
          ))}
        </div>

        {/* ── Main 2-col grid ──────────────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:20}}>

          {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
          <div style={{display:"flex",flexDirection:"column",gap:20}}>

            {/* Fleet Network */}
            <Panel style={{padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <PanelHead><span style={{color:SI.cyan}}>🤖</span> Agent Fleet · {agents.length} Archetypes</PanelHead>
                <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>{activeCount} active</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
                {agents.map(a => {
                  const arc = ARCHETYPES[a.type] || ARCHETYPES.worker;
                  const sc = statusC[a.status]||"#475569";
                  return (
                    <div key={a.id} style={{background:"rgba(2,6,23,.5)",border:`1px solid ${a.status!=="idle"?sc+"40":SI.border}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{position:"relative"}}>
                            <span style={{fontSize:16}}>{arc.emoji}</span>
                            <span style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:"50%",background:sc,boxShadow:a.status!=="idle"?`0 0 5px ${sc}`:"none"}}/>
                          </div>
                          <div>
                            <div style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:"#e2e8f0"}}>{a.id}</div>
                            <div style={{fontFamily:MONO,fontSize:8.5,color:"#64748b",textTransform:"uppercase"}}>{a.role}</div>
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontFamily:MONO,fontSize:8.5,color:"#475569"}}>{a.model}</div>
                          <div style={{fontFamily:MONO,fontSize:8.5,color:SI.emerald}}>{a.tasks} tasks</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Message bus */}
              <div style={{height:46,border:`1px solid ${SI.border}40`,borderRadius:8,background:"rgba(2,6,23,.3)",position:"relative",overflow:"hidden"}}>
                <svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="bus" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(34,211,238,0)"/>
                      <stop offset="50%" stopColor="rgba(34,211,238,.3)"/>
                      <stop offset="100%" stopColor="rgba(34,211,238,0)"/>
                    </linearGradient>
                  </defs>
                  {[0,1,2,3,4,5].map(i => (
                    <line key={i} x1={`${12+i*14}%`} y1="50%" x2={`${26+i*14}%`} y2="50%"
                      stroke="url(#bus)" strokeWidth="1" opacity={.3+.4*Math.sin(tick*.15+i)}/>
                  ))}
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontFamily:MONO,fontSize:9,color:"#334155",textTransform:"uppercase",letterSpacing:".14em"}}>Message Bus · Pipeline Channel · ONLINE</span>
                </div>
              </div>
            </Panel>

            {/* ── Terminal + Spawn Console ─────────────────────────────────── */}
            <Panel style={{overflow:"hidden"}}>

              {/* Header */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",borderBottom:`1px solid ${SI.border}60`}}>
                <PanelHead>💻 System Log · Agent Console</PanelHead>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>46/46 passing</span>
                  <span style={{width:6,height:6,borderRadius:"50%",background:SI.emerald,display:"inline-block",boxShadow:`0 0 5px ${SI.emerald}`,animation:"pulse 2s infinite"}}/>
                  <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>LIVE</span>
                </div>
              </div>

              {/* Log stream */}
              <div style={{height:168,overflowY:"auto",padding:"8px 20px",scrollbarWidth:"thin"}}>
                {logs.map(log => (
                  <div key={log.id} style={{display:"flex",gap:10,fontFamily:MONO,fontSize:10.5,lineHeight:1.7}}>
                    <span style={{color:"#475569",minWidth:52,flexShrink:0}}>{log.ts}</span>
                    <span style={{minWidth:44,fontWeight:700,color:LEVEL_COLOR[log.lv]||SI.cyan,flexShrink:0}}>{log.lv}</span>
                    <span style={{minWidth:116,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{log.src}</span>
                    <span style={{color:log.lv==="SPAWN"?SI.violet:log.lv==="SYS"?"#475569":"#cbd5e1",fontStyle:log.lv==="SYS"?"italic":"normal"}}>{log.msg}</span>
                  </div>
                ))}
                <div ref={logBottomRef}/>
              </div>

              {/* Divider */}
              <div style={{height:1,background:`${SI.border}80`,margin:"0 20px"}}/>

              {/* ── Agent Spawn Console ───────────────────────────────────── */}
              <div style={{padding:"14px 20px 18px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <span style={{fontSize:13}}>⚡</span>
                  <span style={{fontFamily:MONO,fontSize:10,textTransform:"uppercase",letterSpacing:".1em",color:SI.violet}}>Agent Spawn Console</span>
                  <span style={{fontFamily:MONO,fontSize:9,color:"#334155",marginLeft:"auto"}}>Tab = autocomplete · Enter = spawn</span>
                </div>

                {/* Input row */}
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <div style={{flex:1,position:"relative"}}>
                    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:`${SI.violet}80`,fontSize:12,fontFamily:MONO}}>›</span>
                    <input
                      ref={spawnInputRef}
                      value={spawnInput}
                      onChange={e=>setSpawnInput(e.target.value)}
                      onKeyDown={handleSpawnKey}
                      disabled={spawnStatus==="thinking"}
                      placeholder={`e.g. "${SUGGESTIONS[suggIdx]}"`}
                      style={{width:"100%",background:"#020617",border:`1px solid ${SI.border}`,borderRadius:8,paddingLeft:24,paddingRight:12,paddingTop:9,paddingBottom:9,fontFamily:MONO,fontSize:11.5,color:"#e2e8f0",boxSizing:"border-box",transition:"border-color .2s",opacity:spawnStatus==="thinking"?.6:1}}
                      onFocus={e=>e.target.style.borderColor=`${SI.violet}70`}
                      onBlur={e=>e.target.style.borderColor=SI.border}
                    />
                  </div>

                  {/* Self-prompt toggle */}
                  <button
                    onClick={()=>setSelfPrompt(s=>!s)}
                    title="Self-prompt: agent introduces itself and proposes first task"
                    style={{display:"flex",alignItems:"center",gap:5,padding:"0 12px",borderRadius:8,border:`1px solid ${selfPrompt?SI.violet+"60":SI.border}`,background:selfPrompt?`${SI.violet}12`:"transparent",color:selfPrompt?SI.violet:"#64748b",fontFamily:MONO,fontSize:10,textTransform:"uppercase",transition:"all .2s",whiteSpace:"nowrap"}}
                  >
                    {selfPrompt?"⊡":"⊠"} Self-prompt
                  </button>

                  {/* Spawn button */}
                  <button
                    onClick={handleSpawn}
                    disabled={!spawnInput.trim()||spawnStatus==="thinking"}
                    style={{display:"flex",alignItems:"center",gap:7,padding:"0 16px",borderRadius:8,border:`1px solid ${SI.violet}50`,background:`${SI.violet}12`,color:SI.violet,fontFamily:MONO,fontSize:10,textTransform:"uppercase",letterSpacing:".06em",transition:"all .2s",opacity:(!spawnInput.trim()||spawnStatus==="thinking")?.4:1}}
                  >
                    {spawnStatus==="thinking" ? <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span> : "⚡"}
                    {spawnStatus==="thinking" ? "Analysing…" : "Spawn"}
                  </button>
                </div>

                {/* Result card */}
                {spawnResult && (
                  <div style={{borderRadius:8,border:`1px solid ${spawnResultBorder}`,background:spawnResultBg,padding:"10px 12px",marginBottom:10,fontFamily:MONO,fontSize:10.5}}>
                    {spawnStatus==="duplicate" && (
                      <div>
                        <div style={{color:SI.amber,fontWeight:700,marginBottom:5,display:"flex",alignItems:"center",gap:6}}>⚠ Agent Already Exists</div>
                        <div style={{color:"#94a3b8"}}>{spawnResult.message}</div>
                        <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
                          {spawnResult.existing_ids?.map(id=>(
                            <span key={id} style={{background:`${SI.amber}15`,border:`1px solid ${SI.amber}30`,color:SI.amber,borderRadius:3,padding:"1px 7px",fontSize:9.5}}>{id}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {spawnStatus==="spawned" && (
                      <div>
                        <div style={{color:SI.emerald,fontWeight:700,marginBottom:7,display:"flex",alignItems:"center",gap:6}}>✓ Agent Spawned Successfully</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 20px",fontSize:10}}>
                          {[
                            ["ID",            spawnResult.agent_id,  "#e2e8f0"],
                            ["Archetype",     spawnResult.archetype, SI.cyan  ],
                            ["Role",          spawnResult.role,      "#e2e8f0"],
                            ["Confidence",    `${((spawnResult.confidence||0)*100).toFixed(0)}%`, "#e2e8f0"],
                            ["Skills",        spawnResult.skills_injected?.join(", "), SI.violet],
                            ["Fleet updated", `${spawnResult.fleet_updated} agents`, SI.emerald],
                          ].map(([k,v,c])=>(
                            <div key={k}><span style={{color:"#64748b"}}>{k} </span><span style={{color:c}}>{v}</span></div>
                          ))}
                        </div>
                        {spawnResult.self_prompted && (
                          <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${SI.border}`,color:SI.violet,fontSize:9.5}}>
                            <span style={{opacity:.6}}>self-prompt → </span>
                            {spawnResult.self_prompt_task?.slice(0,110)}…
                          </div>
                        )}
                      </div>
                    )}
                    {spawnStatus==="error" && (
                      <div style={{color:SI.rose,display:"flex",alignItems:"flex-start",gap:6}}>⊗ {spawnResult.message}</div>
                    )}
                  </div>
                )}

                {/* Archetype quick-pick */}
                {spawnStatus==="idle" && !spawnResult && (
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {Object.entries(ARCHETYPES).map(([k,v])=>(
                      <button key={k} onClick={()=>{setSpawnInput(`a ${k} agent`);spawnInputRef.current?.focus();}}
                        style={{fontFamily:MONO,fontSize:8.5,color:"#64748b",background:"rgba(15,23,42,.8)",border:`1px solid ${SI.border}`,borderRadius:4,padding:"2px 8px",transition:"all .15s"}}
                        onMouseEnter={e=>{e.target.style.color=SI.violet;e.target.style.borderColor=`${SI.violet}40`;}}
                        onMouseLeave={e=>{e.target.style.color="#64748b";e.target.style.borderColor=SI.border;}}
                      >
                        {v.emoji} {k}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </div>

          {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
          <div style={{display:"flex",flexDirection:"column",gap:20}}>

            {/* Goal Pipeline */}
            <Panel style={{padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <PanelHead><span style={{color:SI.rose}}>🎯</span> Goal Pipeline</PanelHead>
                <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>2 pending</span>
              </div>
              <form onSubmit={handleAddGoal} style={{display:"flex",gap:6,marginBottom:14}}>
                <input value={newGoal} onChange={e=>setNewGoal(e.target.value)} placeholder="Inject new directive..."
                  style={{flex:1,background:"#020617",border:`1px solid ${SI.border}`,borderRadius:8,padding:"7px 10px",fontFamily:MONO,fontSize:10.5,color:"#e2e8f0"}}
                  onFocus={e=>e.target.style.borderColor=`${SI.cyan}50`}
                  onBlur={e=>e.target.style.borderColor=SI.border}
                />
                <select value={goalPri} onChange={e=>setGoalPri(Number(e.target.value))}
                  style={{background:"#020617",border:`1px solid ${SI.border}`,borderRadius:8,padding:"7px 6px",fontFamily:MONO,fontSize:10,color:"#94a3b8"}}>
                  {[1,2,3,4,5,6,7,8,9,10].map(p=><option key={p} value={p}>P{p}</option>)}
                </select>
                <button type="submit" style={{background:`${SI.cyan}18`,border:`1px solid ${SI.cyan}40`,color:SI.cyan,borderRadius:8,padding:"7px 12px",fontSize:14}}>＋</button>
              </form>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5}}>
                {GOAL_STAGES.map(stage => {
                  const sg = goals.filter(g=>g.status===stage.key);
                  return (
                    <div key={stage.key} style={{background:`${stage.c}08`,border:`1px solid ${stage.c}30`,borderRadius:7,padding:6,minHeight:110}}>
                      <div style={{fontFamily:MONO,fontSize:8.5,fontWeight:700,textTransform:"uppercase",color:stage.c,textAlign:"center",marginBottom:5}}>{stage.label}</div>
                      {sg.map(g=>(
                        <div key={g.id} style={{background:"rgba(2,6,23,.7)",border:`1px solid ${SI.border}`,borderRadius:4,padding:"6px 7px",marginBottom:4}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{fontFamily:MONO,fontSize:8,color:"#64748b"}}>{g.id}</span>
                            {g.pipe&&<span style={{fontSize:9,color:SI.violet}}>⑂</span>}
                          </div>
                          <p style={{fontFamily:SANS,fontSize:9.5,color:"#cbd5e1",lineHeight:1.4,margin:0}}>{g.desc}</p>
                          <div style={{marginTop:4}}>
                            <span style={{fontFamily:MONO,fontSize:8,padding:"1px 5px",borderRadius:3,background:g.pri<=3?`${SI.rose}15`:"#1e293b",color:g.pri<=3?SI.rose:"#64748b"}}>P{g.pri}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Experience Stream */}
            <Panel style={{padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <PanelHead><span style={{color:SI.violet}}>📖</span> Experience Library</PanelHead>
                <div style={{display:"flex",gap:10}}>
                  <span style={{fontFamily:MONO,fontSize:9,color:"#64748b"}}>Avg: 0.77</span>
                  <span style={{fontFamily:MONO,fontSize:9,color:SI.rose}}>Fail: 1</span>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {exps.map(e=>(
                  <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,border:`1px solid ${e.ok?SI.border:"rgba(251,113,133,.25)"}`,background:e.ok?"rgba(2,6,23,.4)":"rgba(251,113,133,.04)"}}>
                    <span>{e.score>=.8?"📈":e.score>=.5?"➖":"📉"}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:SANS,fontSize:10.5,color:"#cbd5e1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.task}</div>
                      <div style={{fontFamily:MONO,fontSize:8.5,color:"#475569",marginTop:1}}>{e.ts}</div>
                    </div>
                    <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:"#94a3b8",flexShrink:0}}>{(e.score*100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${SI.border}50`,display:"flex",alignItems:"center",gap:6}}>
                <span>🧠</span>
                <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>Self-model: 9 capability nodes · 3 improvements logged</span>
              </div>
            </Panel>
          </div>
        </div>

        {/* Footer */}
        <div style={{marginTop:22,paddingTop:12,borderTop:`1px solid rgba(30,41,59,.5)`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",gap:12,fontFamily:MONO,fontSize:9,color:"#334155"}}>
            <span>LangGraph Runtime</span><span>•</span>
            <span>ChromaDB Vector Store</span><span>•</span>
            <span>Ollama Local Models</span><span>•</span>
            <span>FastAPI SSE Bridge</span><span>•</span>
            <span>Next.js 14</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:SI.cyan,display:"inline-block",boxShadow:`0 0 6px ${SI.cyan}`,animation:"pulse 2s infinite"}}/>
            <span style={{fontFamily:MONO,fontSize:9,color:"#334155"}}>Self-Improving Loop Active</span>
          </div>
        </div>
      </div>

      {/* ── Approval Gate ───────────────────────────────────────────────────── */}
      {approval && <ApprovalGate pending={approval} onDecide={handleApprovalDecide}/>}
    </div>
  );
}
