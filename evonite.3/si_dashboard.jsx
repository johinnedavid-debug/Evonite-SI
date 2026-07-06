import { useState, useEffect, useRef, useCallback } from "react";

// ── Design System ─────────────────────────────────────────────────────────────
// Deep-space phosphor: near-black void + cyan-teal signal + amber warning + violet accent
// Signature element: the live "synaptic graph" in the topology panel — 
//   connections animate as pulses that show real data flow direction, not decoration
// Type: JetBrains Mono for ALL text (this is a terminal intelligence, not a product page)

const T = {
  void:     "#050608",
  ink:      "#0b0d12",
  surface:  "#10131a",
  raised:   "#161b24",
  border:   "#1d2433",
  rim:      "#242d3f",
  cyan:     "#00d9c0",
  cyanDim:  "#00d9c015",
  cyanMid:  "#00d9c040",
  violet:   "#8b5cf6",
  violetDim:"#8b5cf615",
  amber:    "#f59e0b",
  amberDim: "#f59e0b15",
  red:      "#ef4444",
  redDim:   "#ef444415",
  slate:    "#4a5568",
  muted:    "#6b7694",
  body:     "#a8b4cc",
  bright:   "#dce4f0",
  white:    "#f0f4ff",
  mono:     "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
};

// ── Platform Data Model ───────────────────────────────────────────────────────
const ARCHETYPES = {
  meta:       { color: T.cyan,   label: "Meta-Orchestrator", icon: "◈" },
  code:       { color: T.violet, label: "Code Agent",        icon: "⌥" },
  designer:   { color: "#ec4899",label: "Designer",          icon: "◇" },
  assessor:   { color: T.amber,  label: "Assessor",          icon: "⊞" },
  finaliser:  { color: "#22d3ee",label: "Finaliser",         icon: "⊡" },
  researcher: { color: "#a3e635",label: "Researcher",        icon: "⊕" },
  reflection: { color: "#c084fc",label: "Reflector",         icon: "↻" },
  worker:     { color: T.muted,  label: "Worker",            icon: "○" },
};

const PIPELINE_STAGES = ["coder","designer","assessor","finaliser"];

const BASE_AGENTS = [
  { id:"meta-001", type:"meta",       status:"running",   score:0.94, tasks:23 },
  { id:"cod-7d26",  type:"code",       status:"running",   score:0.81, tasks:14 },
  { id:"dsg-c20c",  type:"designer",   status:"running",   score:0.78, tasks:9  },
  { id:"asr-065f",  type:"assessor",   status:"reflecting",score:0.85, tasks:11 },
  { id:"fnl-3b9a",  type:"finaliser",  status:"idle",      score:0.89, tasks:8  },
  { id:"rsc-f12a",  type:"researcher", status:"idle",      score:0.76, tasks:6  },
  { id:"ref-9e2b",  type:"reflection", status:"running",   score:0.71, tasks:5  },
];

const SKILLS = [
  "summarise_text","heuristic_score","detect_errors","build_reflection_prompt",
  "generate_self_tasks","count_tokens","pretty_json","json_get","extract_bullets",
  "wrap_text","measure_time","fingerprint","utc_now",
];

const TOOLS = [
  { name:"filesystem", icon:"📁", active:true  },
  { name:"memory",     icon:"🧠", active:true  },
  { name:"git",        icon:"⌥",  active:true  },
  { name:"web_search", icon:"🌐", active:false },
  { name:"shell",      icon:"$",  active:false },
  { name:"rest_api",   icon:"⇄",  active:false },
];

const STUDY_CAPS = [
  { name:"researcher",    strength:0.88 },
  { name:"code-gen",      strength:0.81 },
  { name:"skill-inject",  strength:0.79 },
  { name:"reflection",    strength:0.71 },
  { name:"evaluation",    strength:0.68 },
  { name:"web-access",    strength:0.12 },
  { name:"multimodal",    strength:0.00 },
];

const INITIAL_LOG = [
  { ts:"11:16:22", lvl:"INFO",  src:"meta_orchestrator",    msg:"Goal queued [pri=1 src=bootstrap pipeline=False]" },
  { ts:"11:16:23", lvl:"INFO",  src:"meta_loops.study",     msg:"Study Cycle #1 started | scanning 46 experiences" },
  { ts:"11:16:24", lvl:"INFO",  src:"agent_factory",        msg:"Agent spawned | id=cod-7d26 | type=code | tools=['filesystem','memory','git']" },
  { ts:"11:16:25", lvl:"INFO",  src:"pipeline.sequential",  msg:"Pipeline[pipe-a3c2] → stage 'coder' (agent_type=code)" },
  { ts:"11:16:26", lvl:"INFO",  src:"memory.experience_lib",msg:"Experience recorded ✓ | agent=cod-7d26 | score=0.82" },
  { ts:"11:16:27", lvl:"INFO",  src:"memory.self_model",    msg:"Capability upserted: [role] researcher strength=0.88" },
  { ts:"11:16:28", lvl:"INFO",  src:"pipeline.sequential",  msg:"Stage 'coder' complete | score=0.81 | attempt=1" },
  { ts:"11:16:29", lvl:"INFO",  src:"pipeline.sequential",  msg:"Pipeline[pipe-a3c2] → stage 'designer' (agent_type=designer)" },
  { ts:"11:16:30", lvl:"WARN",  src:"utils.monitoring",     msg:"CPU at 71.3% — approaching spawn threshold" },
  { ts:"11:16:31", lvl:"INFO",  src:"meta_loops.improve",   msg:"Improvement Cycle #1: 2 proposals generated" },
  { ts:"11:16:32", lvl:"INFO",  src:"skills.registry",      msg:"Skill 'count_vowels' injected fleet-wide (7 agents)" },
  { ts:"11:16:33", lvl:"INFO",  src:"pipeline.sequential",  msg:"Stage 'assessor' complete | score=0.85 | approved=True" },
  { ts:"11:16:34", lvl:"INFO",  src:"pipeline.sequential",  msg:"Pipeline[pipe-a3c2] complete | score=0.83 | all 4 stages passed" },
  { ts:"11:16:35", lvl:"INFO",  src:"meta_orchestrator",    msg:"Goal completed [g-001] | pipeline_runs=1" },
];

const LIVE_MSGS = [
  (id) => ({ lvl:"INFO",  src:"agent."+id,           msg:`Task complete | success=True | score=0.${73+Math.floor(Math.random()*20)}` }),
  ()   => ({ lvl:"INFO",  src:"memory.experience_lib",msg:`Experience recorded ✓ | score=0.${70+Math.floor(Math.random()*25)}` }),
  ()   => ({ lvl:"INFO",  src:"meta_loops.study",     msg:`Self-model updated | capability_updates=${2+Math.floor(Math.random()*4)}` }),
  ()   => ({ lvl:"WARN",  src:"utils.monitoring",     msg:`CPU=${Math.floor(55+Math.random()*25)}% RAM=${Math.floor(30+Math.random()*20)}%` }),
  (id) => ({ lvl:"INFO",  src:"skills.registry",      msg:`Skill call: heuristic_score by ${id}` }),
  ()   => ({ lvl:"INFO",  src:"pipeline.sequential",  msg:`Stage '${PIPELINE_STAGES[Math.floor(Math.random()*4)]}' complete | score=0.${75+Math.floor(Math.random()*20)}` }),
  ()   => ({ lvl:"INFO",  src:"meta_loops.improve",   msg:`Improvement proposal approved: prompt_tuning` }),
];

// ── Micro-components ──────────────────────────────────────────────────────────

function Mono({ children, color, size = 11, bold = false, style = {} }) {
  return (
    <span style={{ fontFamily: T.mono, fontSize: size, color: color || T.body,
                   fontWeight: bold ? 700 : 400, letterSpacing: "0.03em", ...style }}>
      {children}
    </span>
  );
}

function Label({ children, color = T.muted }) {
  return (
    <Mono color={color} size={9} style={{ textTransform:"uppercase", letterSpacing:"0.12em" }}>
      {children}
    </Mono>
  );
}

function Pill({ children, color = T.muted }) {
  const bg  = color + "18";
  const rim = color + "45";
  return (
    <span style={{ fontFamily:T.mono, fontSize:9, color, background:bg,
                   border:`1px solid ${rim}`, borderRadius:2,
                   padding:"1px 6px", letterSpacing:"0.08em", textTransform:"uppercase" }}>
      {children}
    </span>
  );
}

function StatusDot({ status }) {
  const map = { running:"#00d9c0", reflecting:"#8b5cf6", idle:T.slate, error:"#ef4444" };
  const c   = map[status] || T.slate;
  return (
    <span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%",
                   background:c, boxShadow: status !== "idle" ? `0 0 6px ${c}` : "none",
                   flexShrink:0 }} />
  );
}

function Bar({ value, max = 1, color = T.cyan, height = 3 }) {
  return (
    <div style={{ height, background:T.border, borderRadius:2, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${Math.min(1, value/max)*100}%`,
                    background:color, borderRadius:2,
                    boxShadow:`0 0 6px ${color}60`,
                    transition:"width 0.8s ease" }} />
    </div>
  );
}

// ── Synaptic Graph (signature element) ───────────────────────────────────────
// Real data-flow direction: pulses travel FROM the source TO the target
// Meta → all agents, agents → experience lib, coder → designer → assessor → finaliser

function SynapticGraph({ agents, pipelineActive, tick }) {
  const canvasRef = useRef(null);
  const frameRef  = useRef(null);
  const t         = useRef(0);
  const pulsePool = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    const META_POS  = { x: W/2, y: 36 };
    const AGENT_COUNT = agents.length - 1;
    const agentNodes = agents.slice(1).map((a, i) => {
      const angle = (Math.PI / (AGENT_COUNT + 1)) * (i + 1);
      return {
        x: W/2 + (W*0.42) * Math.cos(Math.PI - angle),
        y: 70  + (H - 100) * Math.sin(angle),
        agent: a,
      };
    });

    // Pipeline chain: coder→designer→assessor→finaliser
    const pipelineIds = ["cod-7d26","dsg-c20c","asr-065f","fnl-3b9a"];
    const pipelineNodes = pipelineIds.map(id => agentNodes.find(n => n.agent.id === id)).filter(Boolean);

    // Seed initial pulses
    if (pulsePool.current.length === 0) {
      agentNodes.forEach((n, i) => {
        if (n.agent.status !== "idle") {
          pulsePool.current.push({
            from: META_POS, to: n,
            prog: Math.random(), speed: 0.007 + i * 0.002,
            color: ARCHETYPES[n.agent.type]?.color || T.muted,
            type: "meta-to-agent",
          });
        }
      });
      if (pipelineActive) {
        for (let i = 0; i < pipelineNodes.length - 1; i++) {
          pulsePool.current.push({
            from: pipelineNodes[i], to: pipelineNodes[i+1],
            prog: i * 0.25, speed: 0.009,
            color: T.amber,
            type: "pipeline",
          });
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      t.current += 0.018;

      // Background grid
      ctx.fillStyle = T.border + "60";
      for (let gx = 0; gx < W; gx += 24)
        for (let gy = 0; gy < H; gy += 24)
          ctx.fillRect(gx, gy, 1, 1);

      // Pipeline channel (amber glow strip)
      if (pipelineActive && pipelineNodes.length >= 2) {
        for (let i = 0; i < pipelineNodes.length - 1; i++) {
          const a = pipelineNodes[i], b = pipelineNodes[i+1];
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = T.amber + "20"; ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Spoke lines: meta → agents
      agentNodes.forEach(n => {
        ctx.beginPath();
        ctx.moveTo(META_POS.x, META_POS.y);
        ctx.lineTo(n.x, n.y);
        const active = n.agent.status !== "idle";
        ctx.strokeStyle = active ? T.border + "80" : T.border + "40";
        ctx.lineWidth = active ? 1 : 0.5;
        ctx.stroke();
      });

      // Pulses
      pulsePool.current.forEach(p => {
        p.prog = (p.prog + p.speed) % 1;
        const fx = p.from.x, fy = p.from.y;
        const tx = p.to.x,   ty = p.to.y;
        const px = fx + (tx - fx) * p.prog;
        const py = fy + (ty - fy) * p.prog;
        const grd = ctx.createRadialGradient(px, py, 0, px, py, p.type === "pipeline" ? 10 : 7);
        grd.addColorStop(0, p.color + "ee");
        grd.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(px, py, p.type === "pipeline" ? 10 : 7, 0, Math.PI*2);
        ctx.fillStyle = grd; ctx.fill();
        // Trail
        const trail = 0.07;
        const t1x = fx + (tx-fx)*(Math.max(0, p.prog-trail));
        const t1y = fy + (ty-fy)*(Math.max(0, p.prog-trail));
        ctx.beginPath();
        ctx.moveTo(t1x, t1y); ctx.lineTo(px, py);
        ctx.strokeStyle = p.color + "50"; ctx.lineWidth = 1.5; ctx.stroke();
      });

      // Agent nodes
      agentNodes.forEach((n, i) => {
        const active = n.agent.status !== "idle";
        const arc = ARCHETYPES[n.agent.type] || {};
        const c   = arc.color || T.muted;
        const pulse = active ? Math.sin(t.current * 2.5 + i) * 0.3 : 0;

        if (active) {
          const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 16 + pulse*4);
          grd.addColorStop(0, c + "30"); grd.addColorStop(1, "transparent");
          ctx.beginPath(); ctx.arc(n.x, n.y, 16 + pulse*4, 0, Math.PI*2);
          ctx.fillStyle = grd; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, active ? 7 : 5, 0, Math.PI*2);
        ctx.fillStyle = active ? c : T.slate; ctx.fill();
        ctx.strokeStyle = active ? c+"80" : T.border; ctx.lineWidth = 1.5; ctx.stroke();

        ctx.fillStyle = T.muted; ctx.font = `9px ${T.mono}`;
        ctx.textAlign = "center";
        ctx.fillText(n.agent.id, n.x, n.y + 18);
      });

      // Meta node
      const mPulse = Math.sin(t.current * 1.8) * 0.35;
      const mg = ctx.createRadialGradient(META_POS.x, META_POS.y, 0, META_POS.x, META_POS.y, 22+mPulse*5);
      mg.addColorStop(0, T.cyan+"25"); mg.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(META_POS.x, META_POS.y, 22+mPulse*5, 0, Math.PI*2);
      ctx.fillStyle = mg; ctx.fill();
      ctx.beginPath(); ctx.arc(META_POS.x, META_POS.y, 9, 0, Math.PI*2);
      ctx.fillStyle = T.cyan; ctx.fill();
      ctx.fillStyle = T.void; ctx.font = `bold 8px ${T.mono}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("SI", META_POS.x, META_POS.y);
      ctx.textBaseline = "alphabetic";

      frameRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [agents.map(a=>a.status).join(","), pipelineActive]);

  return <canvas ref={canvasRef} width={296} height={220} style={{ display:"block" }} />;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color = T.cyan, w = 120, h = 28 }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data, 0);
  const rng = max - min || 1;
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1))*w;
    const y = h - ((v-min)/rng)*(h-2) - 1;
    return `${x},${y}`;
  }).join(" ");
  const lastX = w, lastY = h - ((data[data.length-1]-min)/rng)*(h-2) - 1;
  return (
    <svg width={w} height={h} style={{ overflow:"visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}

// ── Self-Model capability bars ────────────────────────────────────────────────
function CapabilityRow({ name, strength, animate }) {
  const color = strength >= 0.7 ? T.cyan : strength >= 0.4 ? T.amber : T.red;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
      <Mono color={T.body} size={9} style={{ minWidth:90, letterSpacing:"0.04em" }}>{name}</Mono>
      <div style={{ flex:1 }}>
        <Bar value={strength} color={color} height={4} />
      </div>
      <Mono color={color} size={9} style={{ minWidth:30, textAlign:"right" }}>
        {(strength*100).toFixed(0)}%
      </Mono>
    </div>
  );
}

// ── Pipeline stage tracker ────────────────────────────────────────────────────
function PipelineTracker({ activeStage, scores }) {
  return (
    <div style={{ display:"flex", gap:0, position:"relative" }}>
      {PIPELINE_STAGES.map((stage, i) => {
        const done    = i < activeStage;
        const running = i === activeStage;
        const score   = scores[stage];
        const color   = done ? T.cyan : running ? T.amber : T.slate;
        return (
          <div key={stage} style={{ flex:1, display:"flex", flexDirection:"column",
                                    alignItems:"center", position:"relative" }}>
            {/* Connector line */}
            {i < PIPELINE_STAGES.length - 1 && (
              <div style={{ position:"absolute", top:9, left:"50%", right:"-50%", height:1,
                            background: done ? T.cyan+"60" : T.border, zIndex:0 }} />
            )}
            {/* Stage node */}
            <div style={{ width:18, height:18, borderRadius:3,
                          background: running ? T.amber+"20" : done ? T.cyan+"15" : T.surface,
                          border:`1px solid ${color}`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          zIndex:1, boxShadow: running ? `0 0 8px ${T.amber}60` : "none" }}>
              <Mono color={color} size={8}>{done ? "✓" : running ? "▸" : "○"}</Mono>
            </div>
            <Mono color={color} size={8} style={{ marginTop:4, letterSpacing:"0.05em" }}>{stage}</Mono>
            {score !== undefined && (
              <Mono color={T.muted} size={8}>{score.toFixed(2)}</Mono>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Log stream ────────────────────────────────────────────────────────────────
function LogStream({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  const levelColor = l => l === "WARN" ? T.amber : l === "ERROR" ? T.red : T.cyan;
  return (
    <div ref={ref} style={{ height:138, overflowY:"auto",
                             padding:"6px 16px", scrollbarWidth:"none" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display:"flex", gap:8, fontSize:9,
                               fontFamily:T.mono, lineHeight:1.7,
                               opacity:0.4 + (i/lines.length)*0.6 }}>
          <span style={{ color:T.slate, minWidth:50 }}>{l.ts}</span>
          <span style={{ color:levelColor(l.lvl), minWidth:34 }}>{l.lvl}</span>
          <span style={{ color:T.violet, minWidth:130, flexShrink:0 }}>{l.src}</span>
          <span style={{ color:T.muted, flex:1 }}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function SIDashboard() {
  const [tick,       setTick]       = useState(0);
  const [agents,     setAgents]     = useState(BASE_AGENTS);
  const [logs,       setLogs]       = useState(INITIAL_LOG);
  const [scores,     setScores]     = useState([0.42,0.51,0.60,0.68,0.74,0.79,0.81,0.83,0.84,0.86]);
  const [cpu,        setCpu]        = useState(68);
  const [ram,        setRam]        = useState(41);
  const [expCount,   setExpCount]   = useState(46);
  const [studyCycle, setStudyCycle] = useState(3);
  const [impCycle,   setImpCycle]   = useState(1);
  const [pipeRuns,   setPipeRuns]   = useState(1);
  const [pipeStage,  setPipeStage]  = useState(3); // 0-3, 4 = complete
  const [pipeScores, setPipeScores] = useState({ coder:0.81, designer:0.78, assessor:0.85, finaliser:0.89 });
  const [goals,      setGoals]      = useState([
    { desc:"Build a markdown task-tracker CLI", pri:1, status:"complete", pipeline:true },
    { desc:"Identify top 3 capability gaps → new skills", pri:2, status:"active",   pipeline:false },
    { desc:"Tune researcher agent system prompt", pri:6, status:"queued",  pipeline:false },
    { desc:"Spawn web-search researcher for live data", pri:7, status:"queued",  pipeline:false },
  ]);
  const [caps, setCaps] = useState(STUDY_CAPS);

  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t+1);
      setCpu(c  => Math.min(90, Math.max(28, c + (Math.random()-0.46)*7)));
      setRam(r  => Math.min(72, Math.max(28, r + (Math.random()-0.5)*3)));

      if (Math.random() > 0.35) {
        const activeAgents = agents.filter(a => a.status !== "idle");
        const a = activeAgents[Math.floor(Math.random()*activeAgents.length)] || agents[1];
        const template = LIVE_MSGS[Math.floor(Math.random()*LIVE_MSGS.length)];
        const entry = template(a.id);
        const now = new Date();
        const ts = [now.getHours(),now.getMinutes(),now.getSeconds()].map(n=>String(n).padStart(2,"0")).join(":");
        setLogs(l => [...l.slice(-30), { ts, ...entry }]);
      }
      if (Math.random() > 0.55) {
        setScores(s => {
          const last = s[s.length-1];
          const next = Math.min(0.97, Math.max(0.35, last + (Math.random()-0.38)*0.03));
          return [...s.slice(-23), next];
        });
        setExpCount(e => e + 1);
      }
      if (Math.random() > 0.82) {
        setAgents(prev => prev.map((a, i) => {
          if (i === 0) return a;
          const statuses = ["running","running","reflecting","idle"];
          return { ...a, status: statuses[Math.floor(Math.random()*statuses.length)],
                         score: Math.min(0.97, Math.max(0.5, a.score+(Math.random()-0.45)*0.03)) };
        }));
      }
      if (Math.random() > 0.92) {
        setStudyCycle(c => c+1);
        setCaps(prev => prev.map(c => ({
          ...c,
          strength: c.name === "web-access" || c.name === "multimodal"
            ? c.strength
            : Math.min(0.97, Math.max(0.05, c.strength + (Math.random()-0.35)*0.03))
        })));
      }
    }, 1500);
    return () => clearInterval(id);
  }, [agents]);

  const activeCount = agents.filter(a => a.status !== "idle").length;
  const avgScore = (scores.slice(-8).reduce((a,b)=>a+b,0)/8).toFixed(3);
  const cpuColor = cpu > 80 ? T.red : cpu > 65 ? T.amber : T.cyan;
  const lastScore = scores[scores.length-1];

  // Panel style helper
  const panel = (extra = {}) => ({
    background: T.surface, border: `1px solid ${T.border}`,
    ...extra,
  });

  return (
    <div style={{ minHeight:"100vh", background:T.void, fontFamily:T.mono,
                  color:T.body, display:"flex", flexDirection:"column" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background:T.ink, borderBottom:`1px solid ${T.border}`,
                    padding:"0 20px", height:48, display:"flex",
                    alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:8, height:8, borderRadius:1,
                          background:T.cyan, boxShadow:`0 0 12px ${T.cyan}` }} />
            <Mono color={T.white} size={12} bold>SYNTHETIC INTELLIGENCE</Mono>
          </div>
          <Mono color={T.slate} size={10}>SI Platform v3 · LangGraph + Ollama + ChromaDB</Mono>
        </div>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <Mono color={T.muted} size={9}>46/46 tests passing</Mono>
          <div style={{ width:1, height:16, background:T.border }} />
          <Mono color={T.muted} size={9}>12 subsystems</Mono>
          <div style={{ width:1, height:16, background:T.border }} />
          <Pill color={T.cyan}>LIVE</Pill>
        </div>
      </div>

      {/* ── Top KPI row ─────────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)",
                    borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        {[
          { label:"Active Agents",   value: `${activeCount}/${agents.length}`, color: T.cyan,   sub:"fleet" },
          { label:"Avg Score",       value: avgScore,               color: T.violet, sub:"last 8 tasks" },
          { label:"Experiences",     value: expCount,               color: T.amber,  sub:"in memory" },
          { label:"Study Cycles",    value: studyCycle,             color: T.cyan,   sub:"completed" },
          { label:"Improve Cycles",  value: impCycle,               color: "#c084fc",sub:"applied" },
          { label:"Pipeline Runs",   value: pipeRuns,               color: T.amber,  sub:"4-stage" },
          { label:"CPU",             value: `${Math.round(cpu)}%`,  color: cpuColor, sub:`RAM ${Math.round(ram)}%` },
        ].map(k => (
          <div key={k.label} style={{ padding:"12px 16px",
                                       borderRight:`1px solid ${T.border}`,
                                       background: T.ink }}>
            <Label>{k.label}</Label>
            <div style={{ marginTop:5, display:"flex", alignItems:"baseline", gap:6 }}>
              <Mono color={k.color} size={24} bold>{k.value}</Mono>
            </div>
            <Mono color={T.slate} size={9}>{k.sub}</Mono>
          </div>
        ))}
      </div>

      {/* ── Main body ───────────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"308px 1fr 280px",
                    flex:1, overflow:"hidden", borderBottom:`1px solid ${T.border}` }}>

        {/* Left: Synaptic graph + agent list */}
        <div style={{ ...panel(), borderRight:`1px solid ${T.border}`,
                      display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Graph */}
          <div style={{ padding:"10px 6px 4px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ padding:"0 6px 6px", display:"flex", justifyContent:"space-between" }}>
              <Label>Fleet Topology</Label>
              <Label color={T.violet}>Synaptic Graph</Label>
            </div>
            <SynapticGraph agents={agents} pipelineActive={pipeStage < 4} tick={tick} />
          </div>

          {/* Agent list */}
          <div style={{ flex:1, overflowY:"auto", padding:"8px 10px", scrollbarWidth:"none" }}>
            {agents.map(a => {
              const arc = ARCHETYPES[a.type] || {};
              return (
                <div key={a.id} style={{
                  display:"flex", alignItems:"center", gap:8,
                  padding:"6px 8px", marginBottom:3,
                  background: a.status !== "idle" ? arc.color+"0a" : "transparent",
                  border:`1px solid ${a.status !== "idle" ? arc.color+"30" : T.border}`,
                  borderRadius:3,
                }}>
                  <StatusDot status={a.status} />
                  <Mono color={arc.color||T.muted} size={11} style={{ minWidth:12 }}>{arc.icon}</Mono>
                  <div style={{ flex:1, minWidth:0 }}>
                    <Mono color={a.status!=="idle" ? T.bright : T.body} size={10}>{arc.label}</Mono>
                    <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:1 }}>
                      <Mono color={T.slate} size={8}>{a.id}</Mono>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
                    <Pill color={a.status==="running"?T.cyan:a.status==="reflecting"?T.violet:T.slate}>
                      {a.status}
                    </Pill>
                    <Mono color={T.muted} size={8}>{a.score.toFixed(2)} avg</Mono>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: score history + pipeline + goals + tools/skills */}
        <div style={{ display:"flex", flexDirection:"column",
                      borderRight:`1px solid ${T.border}`, overflow:"hidden" }}>

          {/* Score history chart */}
          <div style={{ padding:"10px 16px 12px",
                        borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between",
                          alignItems:"center", marginBottom:8 }}>
              <Label>Task Score History</Label>
              <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                <Sparkline data={scores.slice(-16)} w={80} h={18} color={T.violet} />
                <Mono color={lastScore > 0.75 ? T.cyan : T.amber} size={11} bold>
                  {lastScore.toFixed(3)}
                </Mono>
              </div>
            </div>
            <div style={{ height:56, display:"flex", alignItems:"flex-end", gap:2 }}>
              {scores.slice(-32).map((s, i, arr) => {
                const c = s >= 0.78 ? T.cyan : s >= 0.58 ? T.violet : T.amber;
                return (
                  <div key={i} style={{
                    flex:1, borderRadius:"1px 1px 0 0",
                    background:c, minWidth:3,
                    height:`${Math.max(4, s*52)}px`,
                    opacity: 0.35 + (i/arr.length)*0.65,
                    transition:"height 0.5s ease",
                    boxShadow: i === arr.length-1 ? `0 0 6px ${c}` : "none",
                  }} />
                );
              })}
            </div>
          </div>

          {/* Pipeline tracker */}
          <div style={{ padding:"10px 16px 14px",
                        borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between",
                          alignItems:"center", marginBottom:10 }}>
              <Label>Sequential Pipeline · Coder→Designer→Assessor→Finaliser</Label>
              <Pill color={pipeStage >= 4 ? T.cyan : T.amber}>
                {pipeStage >= 4 ? "complete" : "running"}
              </Pill>
            </div>
            <PipelineTracker activeStage={pipeStage} scores={pipeScores} />
          </div>

          {/* Goal queue */}
          <div style={{ padding:"10px 16px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <Label style={{ marginBottom:8 }}>Goal Queue</Label>
            <div style={{ display:"flex", flexDirection:"column", gap:4, marginTop:8 }}>
              {goals.map((g, i) => {
                const sc = g.status==="complete" ? T.cyan : g.status==="active" ? T.amber : T.slate;
                return (
                  <div key={i} style={{
                    display:"flex", alignItems:"center", gap:8, padding:"6px 10px",
                    background: g.status==="active" ? T.amber+"08" : T.ink,
                    border:`1px solid ${g.status!=="queued" ? sc+"40" : T.border}`,
                    borderRadius:2,
                  }}>
                    <Mono color={sc} size={9} style={{ minWidth:20 }}>
                      {String(g.pri).padStart(2,"0")}
                    </Mono>
                    <Mono color={g.status==="queued" ? T.muted : T.body} size={10} style={{ flex:1 }}>
                      {g.desc}
                    </Mono>
                    <div style={{ display:"flex", gap:4 }}>
                      {g.pipeline && <Pill color={T.violet}>pipeline</Pill>}
                      <Pill color={sc}>{g.status}</Pill>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tools + Skills */}
          <div style={{ padding:"10px 16px", flex:1, overflowY:"auto", scrollbarWidth:"none" }}>
            <div style={{ display:"flex", gap:24 }}>
              <div style={{ flex:1 }}>
                <Label>External Connectors</Label>
                <div style={{ marginTop:7, display:"flex", flexDirection:"column", gap:3 }}>
                  {TOOLS.map(t => (
                    <div key={t.name} style={{
                      display:"flex", alignItems:"center", gap:7, padding:"4px 0"
                    }}>
                      <span style={{ fontSize:10 }}>{t.icon}</span>
                      <Mono color={t.active ? T.body : T.slate} size={10}>{t.name}</Mono>
                      <div style={{ flex:1 }} />
                      <Pill color={t.active ? T.cyan : T.slate}>
                        {t.active ? "on" : "off"}
                      </Pill>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ flex:2 }}>
                <Label>Loaded Skills ({SKILLS.length})</Label>
                <div style={{ marginTop:7, display:"flex", flexWrap:"wrap", gap:4 }}>
                  {SKILLS.map(s => (
                    <span key={s} style={{
                      fontFamily:T.mono, fontSize:8.5, color:T.violet,
                      background:T.violetDim, border:`1px solid ${T.violet}28`,
                      borderRadius:2, padding:"2px 7px",
                    }}>{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Self-model + experience + resources */}
        <div style={{ ...panel(), display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Self-model */}
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between",
                          alignItems:"center", marginBottom:8 }}>
              <Label>Self-Model</Label>
              <Mono color={T.muted} size={9}>{caps.length} capability nodes</Mono>
            </div>
            {caps.map(c => <CapabilityRow key={c.name} {...c} />)}
          </div>

          {/* Experience library */}
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}` }}>
            <Label>Experience Library</Label>
            <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:5 }}>
              {[
                { label:"Total experiences", value: expCount,   color: T.bright  },
                { label:"Success rate",       value: "87.0%",    color: T.cyan    },
                { label:"Avg score",          value: avgScore,   color: T.violet  },
                { label:"Extracted lessons",  value: expCount*2, color: T.amber   },
                { label:"Study cycles",       value: studyCycle, color: T.cyan    },
                { label:"Improvements applied",value: impCycle,  color: "#c084fc" },
              ].map(r => (
                <div key={r.label} style={{ display:"flex",
                                             justifyContent:"space-between", alignItems:"center" }}>
                  <Mono color={T.muted} size={9}>{r.label}</Mono>
                  <Mono color={r.color} size={11} bold>{r.value}</Mono>
                </div>
              ))}
            </div>
            <div style={{ marginTop:10 }}>
              <Mono color={T.slate} size={9}>score trend</Mono>
              <div style={{ marginTop:4 }}>
                <Sparkline data={scores.slice(-14)} w={250} h={26} />
              </div>
            </div>
          </div>

          {/* Resource meters */}
          <div style={{ padding:"10px 14px", flex:1 }}>
            <Label>Resources</Label>
            <div style={{ marginTop:10 }}>
              {[
                { label:"CPU", value:cpu, color:cpuColor, warn:80 },
                { label:"RAM", value:ram, color:T.cyan,   warn:85 },
              ].map(r => (
                <div key={r.label} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <Mono color={T.muted} size={9}>{r.label}</Mono>
                    <Mono color={r.color} size={9} bold>{Math.round(r.value)}%</Mono>
                  </div>
                  <Bar value={r.value} max={100} color={r.color} height={5} />
                </div>
              ))}
            </div>

            {/* Spawn gate */}
            <div style={{ padding:"7px 9px", background:T.ink,
                          border:`1px solid ${cpu<80&&ram<85?T.cyan+"40":T.red+"40"}`,
                          borderRadius:3, marginTop:4 }}>
              <Label>spawn gate</Label>
              <div style={{ marginTop:3 }}>
                <Mono color={cpu<80&&ram<85 ? T.cyan : T.red} size={10}>
                  {cpu<80&&ram<85 ? "✓  Ready to spawn new agents" : "⚠  Threshold exceeded"}
                </Mono>
              </div>
            </div>

            {/* Approval gates */}
            <div style={{ marginTop:10 }}>
              <Label>Approval Gates</Label>
              <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:4 }}>
                {["spawn","skill_inject","code_change"].map(gate => (
                  <div key={gate} style={{ display:"flex", justifyContent:"space-between" }}>
                    <Mono color={T.muted} size={9}>{gate}</Mono>
                    <Pill color={T.amber}>HUMAN</Pill>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Log stream ──────────────────────────────────────────────────────── */}
      <div style={{ background:T.ink, borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ padding:"6px 16px 5px", borderBottom:`1px solid ${T.border}`,
                      display:"flex", gap:10, alignItems:"center" }}>
          <Label>Platform Log</Label>
          <div style={{ width:5, height:5, borderRadius:"50%",
                        background:T.cyan, boxShadow:`0 0 6px ${T.cyan}` }} />
          <Mono color={T.slate} size={9}>live · JSONL → logs/platform.jsonl</Mono>
          <div style={{ flex:1 }} />
          <Mono color={T.muted} size={9}>
            study#{studyCycle} · improve#{impCycle} · pipeline#{pipeRuns} · exp#{expCount}
          </Mono>
        </div>
        <LogStream lines={logs} />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div style={{ padding:"6px 20px", background:T.void,
                    borderTop:`1px solid ${T.border}`,
                    display:"flex", justifyContent:"space-between", flexShrink:0 }}>
        <Mono color={T.slate} size={9}>
          Python 3.12 · 14 modules · {agents.length} archetypes · {SKILLS.length} skills · 6 connectors
        </Mono>
        <Mono color={T.slate} size={9}>
          Study→Improve→Pipeline loops · SelfModel · ExperienceLibrary · ToolBelt
        </Mono>
      </div>
    </div>
  );
}
