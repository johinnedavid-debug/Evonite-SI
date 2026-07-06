import { useState, useEffect, useRef } from "react";

// ── Palette ───────────────────────────────────────────────────────────────────
// Deep void black, phosphor green, electric violet, warm amber, slate grids
// Signature element: live "neural pulse" lines connecting agents to orchestrator

const C = {
  void:    "#06070a",
  surface: "#0d0f14",
  panel:   "#12151c",
  border:  "#1e2230",
  green:   "#00e5a0",
  violet:  "#7c6aff",
  amber:   "#f5a623",
  red:     "#ff4d6a",
  dim:     "#3a3f52",
  muted:   "#6b7491",
  text:    "#c8d0e8",
  bright:  "#eef0f8",
};

// ── Fake live data ────────────────────────────────────────────────────────────
const AGENT_ROLES = [
  { id: "meta-001", role: "Meta-Orchestrator", type: "meta",       model: "llama3",   status: "running" },
  { id: "wkr-7d26", role: "Research Worker",   type: "researcher", model: "llama3",   status: "running" },
  { id: "wkr-c20c", role: "Evaluator",         type: "evaluator",  model: "llama3",   status: "reflecting" },
  { id: "cod-065f", role: "Code Agent",        type: "code",       model: "llama3",   status: "idle" },
  { id: "ref-3b9a", role: "Meta-Reflector",    type: "reflection", model: "llama3",   status: "idle" },
];

const SKILL_LIST = [
  "summarise_text","heuristic_score","build_reflection_prompt",
  "detect_errors","generate_self_tasks","count_tokens","pretty_json",
  "utc_now","fingerprint","json_get","extract_bullets","wrap_text","measure_time",
];

const GOAL_QUEUE = [
  { id:"g-001", desc:"Run self-evaluation & report platform health", pri:1, status:"active" },
  { id:"g-002", desc:"Identify top 3 capability gaps, propose new skills", pri:2, status:"queued" },
  { id:"g-003", desc:"Spawn researcher agent for novel task domains", pri:3, status:"queued" },
  { id:"g-004", desc:"Analyse recent failures, extract root causes", pri:7, status:"queued" },
];

const LOG_LINES = [
  { ts:"20:53:31", level:"INFO",  src:"meta_orchestrator", msg:"Goal added [pri=1]: Run self-evaluation: review experience library" },
  { ts:"20:53:32", level:"INFO",  src:"agent_factory",     msg:"Agent spawned | id=wkr-7d26 | type=researcher | role=Research Worker" },
  { ts:"20:53:33", level:"INFO",  src:"agent.wkr-7d26",    msg:"Starting task [iter=1]: Describe platform health" },
  { ts:"20:53:34", level:"INFO",  src:"skills.registry",   msg:"Loaded 13 skill(s) from 'skills.base_skills'" },
  { ts:"20:53:35", level:"INFO",  src:"agent.wkr-c20c",    msg:"Reflecting | task=Describe platform health | score=0.82 | success=True" },
  { ts:"20:53:36", level:"WARN",  src:"utils.monitoring",  msg:"CPU threshold approaching (72.3%)" },
  { ts:"20:53:37", level:"INFO",  src:"memory.exp_lib",    msg:"Experience recorded ✓ | agent=wkr-7d26 | score=0.82" },
  { ts:"20:53:38", level:"INFO",  src:"meta_orchestrator", msg:"Goal completed [g-001] → platform health nominal" },
  { ts:"20:53:39", level:"INFO",  src:"agent_factory",     msg:"Agent spawned | id=cod-065f | type=code | role=Code Agent" },
  { ts:"20:53:40", level:"INFO",  src:"graph.main_graph",  msg:"Graph[plan] goal=Identify top 3 capability gaps..." },
];

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function Badge({ color, children }) {
  const colors = {
    green:  { bg:"#00e5a015", border:"#00e5a040", text: C.green },
    violet: { bg:"#7c6aff15", border:"#7c6aff40", text: C.violet },
    amber:  { bg:"#f5a62315", border:"#f5a62340", text: C.amber },
    red:    { bg:"#ff4d6a15", border:"#ff4d6a40", text: C.red },
    dim:    { bg:"#1e223080", border:"#2a2f40",   text: C.muted },
  };
  const s = colors[color] || colors.dim;
  return (
    <span style={{
      fontSize:10, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.08em",
      background: s.bg, border:`1px solid ${s.border}`, color: s.text,
      borderRadius:3, padding:"2px 6px", textTransform:"uppercase",
    }}>
      {children}
    </span>
  );
}

function Stat({ label, value, color = C.green, sub }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      <div style={{ fontSize:11, color: C.muted, textTransform:"uppercase", letterSpacing:"0.1em" }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, color, fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color: C.dim }}>{sub}</div>}
    </div>
  );
}

// ── Neural Pulse Canvas ───────────────────────────────────────────────────────
function NeuralPulse({ agents, width = 320, height = 200 }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const t         = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const cx = width / 2, cy = 48;
    const nodeR = 7;
    const workerNodes = agents.slice(1).map((a, i) => {
      const angle = (Math.PI / (agents.length)) * (i + 0.5);
      const rx = (width - 60) / 2, ry = height - 80;
      return { x: cx + rx * Math.cos(Math.PI - angle), y: cy + ry * Math.sin(angle), agent: a };
    });

    const pulses = [];
    workerNodes.forEach((n, i) => {
      pulses.push({ from: { x: cx, y: cy }, to: n, prog: (i * 0.33) % 1, speed: 0.006 + i * 0.002, active: n.agent.status !== "idle" });
    });

    function draw() {
      ctx.clearRect(0, 0, width, height);
      t.current += 0.016;

      // Draw grid dots
      ctx.fillStyle = "#1e2230";
      for (let gx = 0; gx < width; gx += 20)
        for (let gy = 0; gy < height; gy += 20)
          ctx.fillRect(gx, gy, 1, 1);

      // Draw pulse lines
      pulses.forEach(p => {
        if (!p.active) return;
        p.prog = (p.prog + p.speed) % 1;
        const x0 = p.from.x, y0 = p.from.y, x1 = p.to.x, y1 = p.to.y;

        // Static dim line
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.strokeStyle = "#1e2230"; ctx.lineWidth = 1;
        ctx.stroke();

        // Moving glow dot
        const px = x0 + (x1 - x0) * p.prog, py = y0 + (y1 - y0) * p.prog;
        const grd = ctx.createRadialGradient(px, py, 0, px, py, 8);
        grd.addColorStop(0, "#00e5a0cc");
        grd.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      });

      // Draw worker nodes
      workerNodes.forEach(n => {
        const isActive = n.agent.status !== "idle";
        const pulse = isActive ? 0.3 * Math.sin(t.current * 3 + n.x) : 0;

        if (isActive) {
          const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 14 + pulse * 4);
          grd.addColorStop(0, "#7c6aff30");
          grd.addColorStop(1, "transparent");
          ctx.beginPath();
          ctx.arc(n.x, n.y, 14 + pulse * 4, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, nodeR, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? C.violet : C.dim;
        ctx.fill();
        ctx.strokeStyle = isActive ? "#7c6aff80" : "#1e2230";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = C.muted;
        ctx.font = "9px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(n.agent.id, n.x, n.y + nodeR + 12);
      });

      // Draw meta node
      const mPulse = 0.4 * Math.sin(t.current * 2);
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20 + mPulse * 4);
      grd.addColorStop(0, "#00e5a025");
      grd.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, 20 + mPulse * 4, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, nodeR + 2, 0, Math.PI * 2);
      ctx.fillStyle = C.green;
      ctx.fill();

      ctx.fillStyle = C.green;
      ctx.font = "bold 9px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("META", cx, cy - nodeR - 7);

      animRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return <canvas ref={canvasRef} width={width} height={height} style={{ display:"block" }} />;
}

// ── Score sparkline ───────────────────────────────────────────────────────────
function Sparkline({ data, color = C.green, width = 100, height = 28 }) {
  if (!data.length) return null;
  const max = Math.max(...data), min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ overflow:"visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={data.length > 1 ? width : 0} cy={height - ((data[data.length-1] - min) / range) * height} r={2.5} fill={color} />
    </svg>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function AIPlatformDashboard() {
  const [tick, setTick] = useState(0);
  const [logs, setLogs]  = useState(LOG_LINES);
  const [scores, setScores] = useState([0.4, 0.55, 0.62, 0.7, 0.75, 0.8, 0.78, 0.82, 0.85, 0.84]);
  const [agents, setAgents] = useState(AGENT_ROLES);
  const [goals, setGoals] = useState(GOAL_QUEUE);
  const [cpu, setCpu] = useState(72);
  const [ram, setRam] = useState(41);
  const [expCount, setExpCount] = useState(7);
  const logsRef = useRef(null);

  const LIVE_MSGS = [
    (a) => ({ level:"INFO",  src:"agent." + a, msg:`Task complete | success=True | score=0.${70+Math.floor(Math.random()*25)}` }),
    (_)  => ({ level:"INFO",  src:"memory.exp_lib", msg:`Experience recorded ✓ | score=0.${70+Math.floor(Math.random()*25)}` }),
    (_)  => ({ level:"INFO",  src:"graph.main_graph", msg:`Graph[reflect] score=0.${75+Math.floor(Math.random()*20)} success=True` }),
    (_)  => ({ level:"WARN",  src:"utils.monitoring", msg:`CPU at ${Math.floor(65+Math.random()*20)}% — monitoring` }),
    (a)  => ({ level:"INFO",  src:"skills.registry", msg:`Skill call: heuristic_score by ${a}` }),
  ];

  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t + 1);
      setCpu(c => Math.min(88, Math.max(30, c + (Math.random() - 0.48) * 6)));
      setRam(r => Math.min(75, Math.max(30, r + (Math.random() - 0.5) * 3)));

      if (Math.random() > 0.4) {
        const agentIds = agents.slice(1).map(a => a.id);
        const aid = agentIds[Math.floor(Math.random() * agentIds.length)];
        const template = LIVE_MSGS[Math.floor(Math.random() * LIVE_MSGS.length)];
        const entry = template(aid);
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
        setLogs(l => [...l.slice(-24), { ts, ...entry }]);
        if (Math.random() > 0.6) setExpCount(e => e + 1);
      }

      if (Math.random() > 0.6) {
        setScores(s => [...s.slice(-19), Math.min(1, Math.max(0.3, s[s.length-1] + (Math.random()-0.4)*0.05))]);
      }

      // Randomly toggle agent status
      if (Math.random() > 0.75) {
        const statuses = ["running","reflecting","idle","idle"];
        setAgents(prev => prev.map((a, i) => i === 0 ? a : {
          ...a,
          status: Math.random() > 0.5 ? statuses[Math.floor(Math.random()*statuses.length)] : a.status
        }));
      }
    }, 1400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const statusColor = s => s === "running" ? C.green : s === "reflecting" ? C.violet : s === "idle" ? C.dim : C.amber;
  const statusBadge = s => s === "running" ? "green" : s === "reflecting" ? "violet" : "dim";
  const avgScore = (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(2);
  const activeAgents = agents.filter(a => a.status !== "idle").length;
  const cpuColor = cpu > 80 ? C.red : cpu > 65 ? C.amber : C.green;

  return (
    <div style={{
      minHeight: "100vh",
      background: C.void,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      color: C.text,
      padding: "0 0 32px",
      boxSizing: "border-box",
    }}>

      {/* ── Header ── */}
      <div style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 52,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{
            width:8, height:8, borderRadius:"50%", background: C.green,
            boxShadow: `0 0 10px ${C.green}`,
            animation: "none",
          }} />
          <span style={{ fontSize:13, fontWeight:700, color: C.bright, letterSpacing:"0.05em" }}>
            AI PLATFORM
          </span>
          <span style={{ fontSize:11, color: C.muted }}>/ Self-Improving Multi-Agent System</span>
        </div>
        <div style={{ display:"flex", gap:16, alignItems:"center" }}>
          <span style={{ fontSize:10, color: C.muted }}>LangGraph · Ollama · ChromaDB</span>
          <Badge color="green">LIVE</Badge>
        </div>
      </div>

      {/* ── Top stats row ── */}
      <div style={{
        display:"grid", gridTemplateColumns:"repeat(5, 1fr)",
        gap:1, background: C.border,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {[
          { label:"Active Agents", value: activeAgents, total:`/${agents.length}`, color: C.green },
          { label:"Avg Score",     value: avgScore,      total:"/ 1.00",           color: C.violet },
          { label:"Experiences",   value: expCount,      total:"stored",            color: C.amber },
          { label:"CPU",           value:`${Math.round(cpu)}%`,  total:"usage",     color: cpuColor },
          { label:"RAM",           value:`${Math.round(ram)}%`,  total:"usage",     color: C.green },
        ].map(item => (
          <div key={item.label} style={{ background: C.surface, padding:"16px 20px" }}>
            <div style={{ fontSize:10, color: C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>{item.label}</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
              <span style={{ fontSize:26, fontWeight:700, color: item.color, lineHeight:1 }}>{item.value}</span>
              <span style={{ fontSize:10, color: C.muted }}>{item.total}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div style={{ display:"grid", gridTemplateColumns:"320px 1fr 280px", gap:1, background: C.border, margin:"1px 0" }}>

        {/* Left: Neural graph */}
        <div style={{ background: C.panel, padding:16 }}>
          <div style={{ fontSize:10, color: C.muted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:12 }}>
            Fleet Topology
          </div>
          <NeuralPulse agents={agents} width={288} height={200} />
          <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:6 }}>
            {agents.map(a => (
              <div key={a.id} style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"5px 8px", background: C.surface, borderRadius:3,
                border:`1px solid ${a.status !== "idle" ? C.border+"80" : C.border+"30"}`,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{
                    width:5, height:5, borderRadius:"50%",
                    background: statusColor(a.status),
                    boxShadow: a.status !== "idle" ? `0 0 6px ${statusColor(a.status)}` : "none",
                  }} />
                  <span style={{ fontSize:10, color: a.status !== "idle" ? C.text : C.muted }}>{a.role}</span>
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <Badge color={statusBadge(a.status)}>{a.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Goals + Score chart */}
        <div style={{ background: C.panel, display:"flex", flexDirection:"column", gap:1 }}>

          {/* Score history */}
          <div style={{ padding:"14px 18px", background: C.surface, borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <span style={{ fontSize:10, color: C.muted, textTransform:"uppercase", letterSpacing:"0.12em" }}>Task Score History</span>
              <span style={{ fontSize:11, color: C.violet }}>{avgScore} avg</span>
            </div>
            <div style={{
              height:52, background: C.panel, borderRadius:3,
              display:"flex", alignItems:"flex-end", gap:3, padding:"6px 8px",
            }}>
              {scores.slice(-24).map((s, i, arr) => {
                const color = s >= 0.75 ? C.green : s >= 0.55 ? C.violet : C.amber;
                return (
                  <div key={i} style={{
                    flex:1, background: color,
                    height:`${Math.max(4, s * 40)}px`,
                    opacity: 0.5 + (i / arr.length) * 0.5,
                    borderRadius:"1px 1px 0 0",
                    transition:"height 0.4s ease",
                    minWidth:4,
                  }} />
                );
              })}
            </div>
          </div>

          {/* Goal queue */}
          <div style={{ padding:"14px 18px", flex:1 }}>
            <div style={{ fontSize:10, color: C.muted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:12 }}>
              Goal Queue
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {goals.map((g, i) => (
                <div key={g.id} style={{
                  padding:"10px 12px",
                  background: g.status === "active" ? "#00e5a008" : C.surface,
                  border: `1px solid ${g.status === "active" ? C.green+"40" : C.border}`,
                  borderRadius:3,
                  display:"flex", alignItems:"center", gap:10,
                }}>
                  <div style={{
                    fontSize:10, color: g.status === "active" ? C.green : C.dim,
                    fontWeight:700, minWidth:28,
                  }}>
                    {String(g.pri).padStart(2,"0")}
                  </div>
                  <div style={{ flex:1, fontSize:11, color: g.status === "active" ? C.text : C.muted, lineHeight:1.4 }}>
                    {g.desc}
                  </div>
                  <Badge color={g.status === "active" ? "green" : "dim"}>{g.status}</Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Skills grid */}
          <div style={{ padding:"14px 18px", borderTop:`1px solid ${C.border}` }}>
            <div style={{ fontSize:10, color: C.muted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:10 }}>
              Loaded Skills ({SKILL_LIST.length})
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {SKILL_LIST.map(s => (
                <span key={s} style={{
                  fontSize:9, color: C.violet, background:"#7c6aff12",
                  border:`1px solid #7c6aff25`, borderRadius:2, padding:"2px 7px",
                }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Experience stats */}
        <div style={{ background: C.panel, display:"flex", flexDirection:"column", gap:1 }}>
          <div style={{ padding:"14px 16px", background: C.surface, borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:10, color: C.muted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:14 }}>
              Experience Library
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {[
                { label:"Total",        value: expCount,               color: C.bright },
                { label:"Success rate", value: "85.7%",                color: C.green  },
                { label:"Avg score",    value: avgScore,               color: C.violet },
                { label:"Lessons",      value: `${expCount * 2}`,      color: C.amber  },
              ].map(r => (
                <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:10, color: C.muted }}>{r.label}</span>
                  <span style={{ fontSize:13, fontWeight:700, color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>
            {/* Mini score trend */}
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:9, color: C.dim, marginBottom:4 }}>score trend</div>
              <Sparkline data={scores.slice(-14)} width={248} height={28} />
            </div>
          </div>

          {/* Resource meters */}
          <div style={{ padding:"14px 16px" }}>
            <div style={{ fontSize:10, color: C.muted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:12 }}>
              Resources
            </div>
            {[
              { label:"CPU", value: cpu, color: cpuColor, threshold: 80 },
              { label:"RAM", value: ram, color: C.green,  threshold: 85 },
            ].map(r => (
              <div key={r.label} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:10, color: C.muted }}>{r.label}</span>
                  <span style={{ fontSize:10, color: r.color }}>{Math.round(r.value)}%</span>
                </div>
                <div style={{ height:4, background: C.border, borderRadius:2, overflow:"hidden" }}>
                  <div style={{
                    height:"100%", width:`${r.value}%`, background: r.color,
                    borderRadius:2, transition:"width 0.6s ease",
                    boxShadow: `0 0 6px ${r.color}80`,
                  }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop:8, padding:"8px 10px", background: C.surface, borderRadius:3, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:9, color: C.muted, marginBottom:4 }}>spawn gate</div>
              <div style={{ fontSize:10, color: cpu < 80 && ram < 85 ? C.green : C.red }}>
                {cpu < 80 && ram < 85 ? "✓ Ready to spawn" : "⚠ Threshold exceeded"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Log stream ── */}
      <div style={{ background: C.panel, margin:"1px 0 0", borderTop:`1px solid ${C.border}` }}>
        <div style={{ padding:"8px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ fontSize:10, color: C.muted, textTransform:"uppercase", letterSpacing:"0.12em" }}>
            Platform Log
          </span>
          <div style={{ width:5, height:5, borderRadius:"50%", background: C.green, boxShadow:`0 0 6px ${C.green}` }} />
          <span style={{ fontSize:9, color: C.dim }}>live · JSONL → logs/platform.jsonl</span>
        </div>
        <div
          ref={logsRef}
          style={{
            height:160, overflowY:"auto", padding:"8px 20px",
            display:"flex", flexDirection:"column", gap:2,
            scrollbarWidth:"none",
          }}
        >
          {logs.map((line, i) => (
            <div key={i} style={{ display:"flex", gap:10, fontSize:10, lineHeight:1.6, opacity: 0.5 + (i / logs.length) * 0.5 }}>
              <span style={{ color: C.dim, minWidth:56 }}>{line.ts}</span>
              <span style={{
                minWidth:40,
                color: line.level === "WARN" ? C.amber : line.level === "ERROR" ? C.red : C.green,
              }}>{line.level}</span>
              <span style={{ color: C.violet, minWidth:120 }}>{line.src}</span>
              <span style={{ color: C.muted, flex:1 }}>{line.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding:"10px 24px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        borderTop:`1px solid ${C.border}`, background: C.surface,
      }}>
        <span style={{ fontSize:9, color: C.dim }}>
          15 tests passed · LangGraph + Ollama + ChromaDB · Python 3.12
        </span>
        <span style={{ fontSize:9, color: C.dim }}>
          Approval gates: spawn=ON  skill_inject=ON  code_change=ON
        </span>
      </div>
    </div>
  );
}
