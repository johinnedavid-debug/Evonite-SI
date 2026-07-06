import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// NEURAL OS — SYNTHETIC INTELLIGENCE DASHBOARD 2150
// Void black · luminous white consciousness ring · crimson computation
// Every widget emerges from the neural network organically
// Volumetric glow · glassmorphism · quantum particles · living branches
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  void:    "#000000",
  deep:    "#030303",
  white:   "#ffffff",
  whiteA:  (a) => `rgba(255,255,255,${a})`,
  red:     "#cc1818",
  redA:    (a) => `rgba(200,24,24,${a})`,
  redGlow: "rgba(200,24,24,0.55)",
  mono:    "'JetBrains Mono','Fira Code',monospace",
  sans:    "Inter,system-ui,sans-serif",
};

// ── Platform data ─────────────────────────────────────────────────────────────
const ARCHETYPES = [
  { id:"meta-001", label:"META",     role:"Meta-Orchestrator", hubR:20, leaves:28, alert:false, score:0.94, tasks:42,  skills:["heuristic_score","build_reflection_prompt","generate_self_tasks"] },
  { id:"cod-7d26", label:"CODE",     role:"Code Agent",        hubR:15, leaves:22, alert:false, score:0.81, tasks:89,  skills:["detect_errors","fingerprint","count_tokens"] },
  { id:"dsg-c20c", label:"DESIGN",   role:"Designer",          hubR:14, leaves:18, alert:false, score:0.78, tasks:34,  skills:["summarise_text","extract_bullets"] },
  { id:"asr-065f", label:"ASSESS",   role:"Assessor",          hubR:16, leaves:24, alert:true,  score:0.55, tasks:28,  skills:["heuristic_score","detect_errors"] },
  { id:"fnl-3b9a", label:"FINAL",    role:"Finaliser",         hubR:13, leaves:16, alert:false, score:0.89, tasks:17,  skills:["summarise_text","build_reflection_prompt"] },
  { id:"rsc-f12a", label:"RESEARCH", role:"Researcher",        hubR:15, leaves:26, alert:true,  score:0.62, tasks:55,  skills:["summarise_text","extract_bullets","json_get"] },
  { id:"ref-9e2b", label:"REFLECT",  role:"Reflector",         hubR:12, leaves:14, alert:false, score:0.71, tasks:5,   skills:["build_reflection_prompt"] },
  { id:"wkr-0011", label:"WORKER",   role:"Worker",            hubR:11, leaves:12, alert:false, score:0.76, tasks:21,  skills:["heuristic_score"] },
];

const CAPABILITIES = [
  { name:"researcher",   strength:0.88 }, { name:"code-gen",     strength:0.81 },
  { name:"skill-inject", strength:0.79 }, { name:"reflection",   strength:0.71 },
  { name:"evaluation",   strength:0.68 }, { name:"web-access",   strength:0.12 },
  { name:"multimodal",   strength:0.00 },
];

const GOALS = [
  { id:"g-01", desc:"Run self-evaluation on experience library",  pri:1, status:"executing",  pipe:false },
  { id:"g-02", desc:"Build markdown task-tracker CLI",            pri:2, status:"executing",  pipe:true  },
  { id:"g-03", desc:"Identify top 3 capability gaps",            pri:3, status:"planning",   pipe:false },
  { id:"g-04", desc:"Optimize memory retrieval latency",         pri:5, status:"done",       pipe:false },
];

const PIPELINE_STAGES = ["coder","designer","assessor","finaliser"];

const SEED_LOGS = [
  { id:1, ts:"18:29:01", lv:"EVENT", src:"orchestrator",        msg:"Goal completed: g-01 [self-evaluation]" },
  { id:2, ts:"18:29:03", lv:"INFO",  src:"agent-factory",       msg:"Spawned cod-7d26 | type=code | tools=[filesystem,memory,git]" },
  { id:3, ts:"18:29:13", lv:"EVENT", src:"pipeline.sequential", msg:"Pipeline COMPLETE | overall=0.83 | 4/4 stages" },
  { id:4, ts:"18:29:15", lv:"WARN",  src:"monitor",             msg:"CPU spike: 81% — approaching spawn threshold" },
  { id:5, ts:"18:29:18", lv:"INFO",  src:"skills.registry",     msg:"Skill count_vowels injected fleet-wide (6 agents)" },
  { id:6, ts:"18:29:20", lv:"SYS",   src:"terminal",            msg:"Self-Improving loop active — Study Cycle #3 complete" },
];

const LIVE_POOL = [
  n => ({ lv:"INFO",  src:"meta_loops.study",    msg:`Study cycle #${n} | updates=4` }),
  () => ({ lv:"INFO",  src:"pipeline.sequential", msg:`Stage ${["coder","designer","assessor","finaliser"][~~(Math.random()*4)]} | score=0.${73+~~(Math.random()*20)}` }),
  () => ({ lv:"EVENT", src:"memory.exp_lib",      msg:`Experience ✓ | score=0.${75+~~(Math.random()*20)}` }),
  () => ({ lv:"WARN",  src:"utils.monitoring",    msg:`CPU=${~~(55+Math.random()*25)}% RAM=${~~(28+Math.random()*20)}%` }),
  () => ({ lv:"INFO",  src:"skills.registry",     msg:"Fleet-wide inject: heuristic_score" }),
  () => ({ lv:"INFO",  src:"meta_loops.improve",  msg:"Improvement proposal approved: prompt_tuning" }),
];

const ts = () => new Date().toTimeString().slice(0,8);

// ═══════════════════════════════════════════════════════════════════════════════
// LIVING NEURAL CANVAS
// Full-screen canvas: orbital ring, radial branch trees, quantum particles,
// pulse animations, volumetric bloom — the "consciousness" of the SI
// ═══════════════════════════════════════════════════════════════════════════════
function NeuralCanvas({ hoveredNode, activeAgents, tick }) {
  const cvRef   = useRef(null);
  const frameRef= useRef(null);
  const tRef    = useRef(0);
  const scene   = useRef(null);
  const pulses  = useRef([]);
  const particles = useRef([]);

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");

    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; buildScene(); };
    window.addEventListener("resize", resize);

    // ── Build static scene geometry ────────────────────────────────────────────
    function buildScene() {
      const W = cv.width, H = cv.height;
      // Ring: huge arc anchored off left edge — exactly like reference
      const ring = { cx: W * 0.10, cy: H * 0.50, r: H * 0.60 };

      const arcStart = -Math.PI * 0.70;
      const arcEnd   =  Math.PI * 0.70;

      const nodes = ARCHETYPES.map((arc, i) => {
        const t     = i / (ARCHETYPES.length - 1);
        const angle = arcStart + (arcEnd - arcStart) * t;
        const hx    = ring.cx + Math.cos(angle) * ring.r;
        const hy    = ring.cy + Math.sin(angle) * ring.r;

        // Branch fans outward from hub
        const fanW   = 0.52 + Math.random() * 0.28;
        const depth1 = 70  + Math.random() * 55;
        const depth2 = 45  + Math.random() * 40;

        const leaves = Array.from({ length: arc.leaves }, (_, l) => {
          const lt   = l / (arc.leaves - 1);
          const lang = angle - fanW/2 + fanW * lt + (Math.random()-.5)*0.10;
          const lx   = hx + Math.cos(lang) * (depth1 + Math.random()*30);
          const ly   = hy + Math.sin(lang) * (depth1 + Math.random()*30);
          const cx1  = (hx + lx)/2 + (Math.random()-.5)*25;
          const cy1  = (hy + ly)/2 + (Math.random()-.5)*25;

          const subs = Math.random() > 0.45 ? Array.from({ length: ~~(Math.random()*4)+2 }, () => {
            const sa = lang + (Math.random()-.5)*0.38;
            return {
              x: lx + Math.cos(sa)*(depth2 + Math.random()*20),
              y: ly + Math.sin(sa)*(depth2 + Math.random()*20),
              r: 2 + Math.random()*2,
              alert: arc.alert && Math.random() > 0.6,
            };
          }) : [];

          return { x:lx, y:ly, r:3+Math.random()*3, alert:arc.alert && Math.random()>.5, cx1, cy1, subs };
        });

        return { arc, angle, hx, hy, leaves, ring };
      });

      // Seed pulses
      pulses.current = [];
      nodes.forEach((n, ni) => {
        n.leaves.forEach((_, li) => {
          if (Math.random() > 0.55) {
            pulses.current.push({
              ni, li,
              prog:  Math.random(),
              speed: 0.003 + Math.random() * 0.007,
              alert: n.arc.alert && Math.random() > 0.5,
              rev:   Math.random() > 0.72,
              life:  1,
            });
          }
        });
      });

      // Quantum particles
      particles.current = Array.from({ length: 180 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random()-.5)*0.22, vy: (Math.random()-.5)*0.22,
        r:  Math.random()*1.4+0.3,
        a:  Math.random()*0.18+0.03,
        alert: Math.random() > 0.88,
      }));

      scene.current = { ring, nodes, W, H };
    }

    buildScene();

    // ── Draw loop ──────────────────────────────────────────────────────────────
    function draw() {
      tRef.current += 0.009;
      const T = tRef.current;
      if (!scene.current) { frameRef.current = requestAnimationFrame(draw); return; }
      const { ring, nodes, W, H } = scene.current;

      // Absolute void
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);

      // ── Volumetric ambient nebula glow ─────────────────────────────────────
      const neb = ctx.createRadialGradient(ring.cx, ring.cy, ring.r*0.3, ring.cx, ring.cy, ring.r*1.6);
      neb.addColorStop(0,   "rgba(255,255,255,0.022)");
      neb.addColorStop(0.4, "rgba(200,20,20,0.008)");
      neb.addColorStop(1,   "transparent");
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, W, H);

      // ── Quantum particles ─────────────────────────────────────────────────
      particles.current.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = p.alert ? `rgba(200,30,30,${p.a})` : `rgba(255,255,255,${p.a})`;
        ctx.fill();
      });

      // ── Concentric ripple arcs ────────────────────────────────────────────
      for (let i = 0; i < 8; i++) {
        const rr   = ring.r + i * 42 + Math.sin(T*0.4 + i*0.6)*4;
        const alph = Math.max(0, 0.055 - i*0.006) * (0.7 + 0.3*Math.sin(T*0.3+i));
        ctx.beginPath();
        ctx.arc(ring.cx, ring.cy, rr, -Math.PI*0.78, Math.PI*0.78);
        ctx.strokeStyle = `rgba(255,255,255,${alph})`;
        ctx.lineWidth   = 0.5;
        ctx.stroke();
      }

      // ── Main orbital ring — luminous white arc ────────────────────────────
      const rot = T * 0.008;

      // Outer bloom layers
      for (let g = 6; g >= 0; g--) {
        ctx.beginPath();
        ctx.arc(ring.cx, ring.cy, ring.r, -Math.PI*0.72+rot, Math.PI*0.72+rot);
        const alpha = (0.028 - g*0.003) * (0.85 + 0.15*Math.sin(T*0.5));
        ctx.strokeStyle = `rgba(255,255,255,${Math.max(0,alpha)})`;
        ctx.lineWidth   = 2 + g*7;
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur  = 0;
        ctx.stroke();
      }
      // Core ring
      ctx.beginPath();
      ctx.arc(ring.cx, ring.cy, ring.r, -Math.PI*0.72+rot, Math.PI*0.72+rot);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth   = 2.8;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur  = 28;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      // ── Nodes + branches ─────────────────────────────────────────────────
      nodes.forEach((node, ni) => {
        const breath  = 0.55 + 0.45 * Math.sin(T*1.6 + ni*1.3);
        const isAlert = node.arc.alert;
        const isHov   = hoveredNode === node.arc.id;

        // Branch curves + sub-lines
        node.leaves.forEach((leaf, li) => {
          const hot       = isAlert && leaf.alert;
          const lineAlpha = (isHov ? 0.45 : 0.18) + 0.10 * Math.sin(T*0.7+li*0.4);

          // Main branch quadratic curve
          ctx.beginPath();
          ctx.moveTo(node.hx, node.hy);
          ctx.quadraticCurveTo(leaf.cx1, leaf.cy1, leaf.x, leaf.y);
          ctx.strokeStyle = hot ? `rgba(200,30,30,${lineAlpha*1.8})` : `rgba(160,160,160,${lineAlpha})`;
          ctx.lineWidth   = hot ? 0.9 : 0.55;
          ctx.stroke();

          // Sub-branches
          leaf.subs.forEach(sub => {
            ctx.beginPath();
            ctx.moveTo(leaf.x, leaf.y);
            ctx.lineTo(sub.x, sub.y);
            ctx.strokeStyle = sub.alert ? `rgba(180,30,30,${lineAlpha*1.4})` : `rgba(120,120,120,${lineAlpha*0.65})`;
            ctx.lineWidth   = 0.35;
            ctx.stroke();
          });
        });

        // Pulse dots along curves
        pulses.current
          .filter(p => p.ni === ni)
          .forEach(p => {
            p.prog += p.speed * (p.rev ? -1 : 1);
            if (p.prog > 1) p.prog = 0;
            if (p.prog < 0) p.prog = 1;

            const leaf = node.leaves[p.li]; if (!leaf) return;
            const tp = p.prog, nt = 1-tp;
            const px = nt*nt*node.hx + 2*nt*tp*leaf.cx1 + tp*tp*leaf.x;
            const py = nt*nt*node.hy + 2*nt*tp*leaf.cy1 + tp*tp*leaf.y;

            const pc  = p.alert ? "#cc1818" : "#ffffff";
            const pr  = p.alert ? 3.2 : 2.6;
            const aur = pr * 4;

            const grd = ctx.createRadialGradient(px,py,0,px,py,aur);
            grd.addColorStop(0, p.alert ? "rgba(200,30,30,0.7)" : "rgba(255,255,255,0.6)");
            grd.addColorStop(1, "transparent");
            ctx.beginPath(); ctx.arc(px, py, aur, 0, Math.PI*2);
            ctx.fillStyle = grd; ctx.fill();
            ctx.beginPath(); ctx.arc(px, py, pr*0.6, 0, Math.PI*2);
            ctx.fillStyle = pc; ctx.fill();
          });

        // Leaf nodes — hollow circles (signature image look)
        node.leaves.forEach(leaf => {
          leaf.subs.forEach(sub => {
            ctx.beginPath(); ctx.arc(sub.x, sub.y, sub.r, 0, Math.PI*2);
            if (sub.alert) {
              ctx.fillStyle = C.red;
              ctx.shadowColor = C.redGlow; ctx.shadowBlur = 10;
              ctx.fill(); ctx.shadowBlur = 0;
            } else {
              ctx.strokeStyle = `rgba(255,255,255,${0.45 + 0.25*breath})`;
              ctx.lineWidth = 0.7; ctx.stroke();
            }
          });

          ctx.beginPath(); ctx.arc(leaf.x, leaf.y, leaf.r, 0, Math.PI*2);
          if (leaf.alert) {
            const g = ctx.createRadialGradient(leaf.x,leaf.y,0,leaf.x,leaf.y,leaf.r*3.5);
            g.addColorStop(0,"rgba(200,20,20,0.5)"); g.addColorStop(1,"transparent");
            ctx.fillStyle=g; ctx.arc(leaf.x,leaf.y,leaf.r*3.5,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(leaf.x,leaf.y,leaf.r,0,Math.PI*2);
            ctx.fillStyle=C.red; ctx.shadowColor=C.redGlow; ctx.shadowBlur=14;
            ctx.fill(); ctx.shadowBlur=0;
          } else {
            ctx.fillStyle   = "transparent";
            ctx.strokeStyle = `rgba(255,255,255,${(isHov?0.9:0.55)+0.25*breath})`;
            ctx.lineWidth   = 0.85;
            ctx.stroke();
          }
        });

        // Mid cluster hub
        const mR = node.arc.hubR * 0.6;
        ctx.beginPath(); ctx.arc(
          node.hx + Math.cos(node.angle)*node.arc.hubR*1.8,
          node.hy + Math.sin(node.angle)*node.arc.hubR*1.8,
          mR, 0, Math.PI*2
        );
        ctx.strokeStyle = `rgba(255,255,255,${0.38+0.22*breath})`;
        ctx.lineWidth   = 1.0; ctx.stroke();

        // Main hub ON the ring
        const hR = node.arc.hubR;
        const hc = isAlert ? C.red : "#ffffff";

        // Bloom aura
        const bloom = ctx.createRadialGradient(node.hx,node.hy,0,node.hx,node.hy,hR*5);
        bloom.addColorStop(0, isAlert ? "rgba(200,20,20,0.35)" : `rgba(255,255,255,${0.18*breath})`);
        bloom.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(node.hx,node.hy,hR*5,0,Math.PI*2);
        ctx.fillStyle=bloom; ctx.fill();

        // Hover ring
        if (isHov) {
          ctx.beginPath(); ctx.arc(node.hx,node.hy,hR*1.9,0,Math.PI*2);
          ctx.strokeStyle = isAlert ? "rgba(200,30,30,0.5)" : "rgba(255,255,255,0.35)";
          ctx.lineWidth = 1; ctx.stroke();
        }

        // Hub fill
        ctx.beginPath(); ctx.arc(node.hx,node.hy,hR,0,Math.PI*2);
        ctx.fillStyle   = hc;
        ctx.shadowColor = isAlert ? C.redGlow : "rgba(255,255,255,0.7)";
        ctx.shadowBlur  = isHov ? 32 : 18;
        ctx.fill(); ctx.shadowBlur = 0;

        // Label
        const lAngle = node.angle;
        const lDist  = hR + 18;
        const lx = node.hx + Math.cos(lAngle) * lDist;
        const ly = node.hy + Math.sin(lAngle) * lDist;
        ctx.fillStyle = isAlert ? "rgba(200,60,60,0.85)" : `rgba(255,255,255,${isHov?0.7:0.3})`;
        ctx.font      = `${isHov?10:8.5}px ${C.mono}`;
        ctx.textAlign = "center";
        ctx.fillText(node.arc.label, lx, ly+3);
      });

      frameRef.current = requestAnimationFrame(draw);
    }

    cv.width = window.innerWidth; cv.height = window.innerHeight;
    buildScene();
    draw();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas ref={cvRef} style={{ position:"fixed", inset:0, width:"100%", height:"100%", zIndex:0, cursor:"default" }} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GLASS WIDGET — glassmorphism panel emerging from neural network
// ═══════════════════════════════════════════════════════════════════════════════
function Glass({ children, style = {}, alert = false, glow = false, hover = false }) {
  const base = {
    background:    alert ? "rgba(20,0,0,0.78)" : "rgba(4,4,4,0.78)",
    backdropFilter:"blur(22px) saturate(1.4)",
    WebkitBackdropFilter: "blur(22px) saturate(1.4)",
    border:        `1px solid ${alert ? "rgba(200,24,24,0.25)" : hover ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.09)"}`,
    borderRadius:  2,
    boxShadow:     alert
      ? "0 0 30px rgba(200,24,24,0.08), inset 0 1px 0 rgba(200,24,24,0.08)"
      : glow
        ? "0 0 40px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)"
        : "inset 0 1px 0 rgba(255,255,255,0.04)",
    transition:    "all 0.35s cubic-bezier(0.16,1,0.3,1)",
    ...style,
  };
  return <div style={base}>{children}</div>;
}

// Thin label
function Label({ children, alert=false, dim=false, size=8 }) {
  return (
    <div style={{ fontFamily:C.mono, fontSize:size, textTransform:"uppercase", letterSpacing:".18em",
                  color: alert ? "rgba(200,60,60,0.75)" : dim ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.38)" }}>
      {children}
    </div>
  );
}

// Divider
const Div = ({ v=false }) => (
  <div style={{ [v?"width":"height"]:1, background:"rgba(255,255,255,0.055)", flexShrink:0, alignSelf:v?"stretch":"auto" }}/>
);

// Status hollow circle
function StatusOrb({ alert, idle, size=7 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", flexShrink:0,
                  border:`1px solid ${alert?"rgba(200,40,40,0.8)":idle?"rgba(80,80,80,0.5)":"rgba(255,255,255,0.65)"}`,
                  background:"transparent",
                  boxShadow: alert ? "0 0 8px rgba(200,30,30,0.5)" : idle ? "none" : "0 0 5px rgba(255,255,255,0.25)" }} />
  );
}

// Crimson filled dot
function AlertDot({ size=5, pulse=true }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:C.red,
                  boxShadow:`0 0 8px ${C.redGlow}`, flexShrink:0,
                  animation: pulse ? "siPulse 1.4s infinite" : "none" }} />
  );
}

// Score bar — ultra thin
function ScoreBar({ value, alert=false }) {
  const w = `${Math.round(value*100)}%`;
  const c = alert ? C.red : value > 0.75 ? "rgba(255,255,255,0.7)" : "rgba(200,200,200,0.4)";
  return (
    <div style={{ height:2, background:"rgba(255,255,255,0.06)", borderRadius:1, overflow:"hidden" }}>
      <div style={{ height:"100%", width:w, background:c, boxShadow:`0 0 6px ${c}`, transition:"width 1.2s ease", borderRadius:1 }}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIDGET COMPONENTS — each emerges organically from a cluster node
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. System Vitals — top-of-ring ring cluster ────────────────────────────
function VitalsCluster({ cpu, ram, agents, studyCyc, pipeRuns, iteration }) {
  const items = [
    { l:"CPU",       v:`${cpu.toFixed(0)}%`,      alert:cpu>78 },
    { l:"RAM",       v:`${ram.toFixed(0)}%`,      alert:ram>82 },
    { l:"AGENTS",    v:`${agents}`,               alert:false  },
    { l:"STUDY",     v:`#${studyCyc}`,            alert:false  },
    { l:"PIPELINE",  v:`${pipeRuns}`,             alert:false  },
    { l:"ITER",      v:`${iteration}`,            alert:false  },
  ];
  return (
    <div style={{ display:"flex", gap:1 }}>
      {items.map((item,i) => (
        <Glass key={item.l} alert={item.alert} style={{ flex:1, padding:"11px 12px", textAlign:"center", position:"relative", overflow:"hidden" }}>
          {item.alert && (
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,rgba(200,20,20,0.06),transparent)", pointerEvents:"none" }}/>
          )}
          <Label size={7.5} alert={item.alert} dim={!item.alert}>{item.l}</Label>
          <div style={{ fontFamily:C.mono, fontSize:21, fontWeight:700, lineHeight:1, marginTop:6,
                        color: item.alert ? C.red : "rgba(255,255,255,0.88)",
                        textShadow: item.alert ? `0 0 16px ${C.redGlow}` : "0 0 12px rgba(255,255,255,0.18)" }}>
            {item.v}
          </div>
          {item.alert && <div style={{ position:"absolute", top:7, right:7 }}><AlertDot size={4}/></div>}
        </Glass>
      ))}
    </div>
  );
}

// ── 2. Fleet Network — agent nodes emerging as cards ──────────────────────
function FleetCluster({ agents, hoveredNode, setHoveredNode }) {
  return (
    <Glass style={{ padding:"14px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <Label>Fleet Network · {agents.length} Archetypes</Label>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <AlertDot size={4} pulse/>
          <Label dim size={7.5}>LIVE</Label>
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {agents.map(a => {
          const isHov = hoveredNode === a.id;
          return (
            <div key={a.id}
              onMouseEnter={() => setHoveredNode(a.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 9px",
                       background: isHov ? (a.alert?"rgba(200,20,20,0.08)":"rgba(255,255,255,0.04)") : "transparent",
                       border: `1px solid ${isHov?(a.alert?"rgba(200,30,30,0.25)":"rgba(255,255,255,0.12)"):"transparent"}`,
                       borderRadius:2, cursor:"default", transition:"all .25s" }}>
              <StatusOrb alert={a.alert} idle={a.status==="idle"} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:2 }}>
                  <div style={{ fontFamily:C.mono, fontSize:10.5,
                                color: a.alert ? "rgba(200,60,60,0.9)" : "rgba(255,255,255,0.72)",
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {a.id}
                  </div>
                  <Label dim size={7.5}>{a.label}</Label>
                </div>
                <ScoreBar value={a.score} alert={a.alert} />
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontFamily:C.mono, fontSize:10, color: a.score<0.65 ? "rgba(200,60,60,0.7)" : "rgba(255,255,255,0.45)" }}>{a.score.toFixed(2)}</div>
                <Label dim size={7}>{a.tasks}t</Label>
              </div>
              {a.alert && <AlertDot size={4}/>}
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

// ── 3. Self-Model Capability Graph ────────────────────────────────────────
function SelfModelCluster({ caps }) {
  return (
    <Glass style={{ padding:"14px 16px" }}>
      <Label style={{ marginBottom:12 }}>Self-Model · {caps.length} Capability Nodes</Label>
      <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>
        {caps.map(c => {
          const isGap = c.strength < 0.4;
          const bar   = `${Math.round(c.strength*100)}%`;
          return (
            <div key={c.name} style={{ display:"flex", alignItems:"center", gap:9 }}>
              <div style={{ minWidth:90 }}>
                <Label alert={isGap} dim={!isGap} size={8}>{c.name}</Label>
              </div>
              <div style={{ flex:1, height:2, background:"rgba(255,255,255,0.07)", borderRadius:1, overflow:"hidden" }}>
                <div style={{
                  height:"100%", width:bar, borderRadius:1, transition:"width 1.5s ease",
                  background: c.strength>=0.7 ? "rgba(255,255,255,0.65)" : c.strength>=0.4 ? "rgba(200,200,200,0.38)" : C.red,
                  boxShadow:  c.strength>=0.7 ? "0 0 5px rgba(255,255,255,0.3)" : isGap ? `0 0 5px ${C.redGlow}` : "none",
                }} />
              </div>
              <div style={{ minWidth:30, textAlign:"right", fontFamily:C.mono, fontSize:9,
                            color: isGap ? "rgba(200,60,60,0.7)" : "rgba(255,255,255,0.3)" }}>
                {Math.round(c.strength*100)}%
              </div>
              {isGap && <AlertDot size={4} pulse={false}/>}
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

// ── 4. Goal Pipeline — kanban emerging from neural clusters ───────────────
function GoalCluster({ goals, setGoals }) {
  const [newG, setNewG] = useState("");
  const [pri,  setPri]  = useState(3);

  const add = e => {
    e.preventDefault();
    if (!newG.trim()) return;
    setGoals(g => [...g, { id:`g-${Date.now().toString(36)}`, desc:newG, pri, status:"planning", pipe:false }]);
    setNewG("");
  };

  const statusC = { planning:"rgba(200,160,30,0.75)", executing:"rgba(200,200,200,0.8)", done:"rgba(80,80,80,0.5)", error:"rgba(200,30,30,0.8)" };

  return (
    <Glass style={{ padding:"14px 16px" }}>
      <Label style={{ marginBottom:12 }}>Goal Pipeline</Label>
      <form onSubmit={add} style={{ display:"flex", gap:5, marginTop:10, marginBottom:11 }}>
        <input value={newG} onChange={e=>setNewG(e.target.value)} placeholder="Inject directive…"
          style={{ flex:1, background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:2,
                   padding:"7px 10px", fontFamily:C.mono, fontSize:11, color:"rgba(255,255,255,0.72)", outline:"none" }}
          onFocus={e=>e.target.style.borderColor="rgba(255,255,255,0.22)"}
          onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.09)"} />
        <select value={pri} onChange={e=>setPri(Number(e.target.value))}
          style={{ background:"#050505", border:"1px solid rgba(255,255,255,0.09)", borderRadius:2,
                   padding:"7px 6px", fontFamily:C.mono, fontSize:9.5, color:"rgba(255,255,255,0.45)" }}>
          {[1,2,3,5,7,10].map(p=><option key={p} value={p}>P{p}</option>)}
        </select>
        <button type="submit" style={{ padding:"7px 12px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:2, color:"rgba(255,255,255,0.6)", cursor:"pointer", fontFamily:C.mono, fontSize:14 }}>＋</button>
      </form>
      <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:220, overflowY:"auto", scrollbarWidth:"none" }}>
        {goals.map(g => (
          <div key={g.id} style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ width:4, height:4, borderRadius:"50%", background:statusC[g.status]||"rgba(200,200,200,0.5)", flexShrink:0, marginTop:5 }}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:C.mono, fontSize:10.5, color:"rgba(255,255,255,0.62)", lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.desc}</div>
              <div style={{ display:"flex", gap:8, marginTop:3 }}>
                <Label dim size={7.5}>{g.status}</Label>
                {g.pipe && <Label size={7.5} dim>⑂ pipeline</Label>}
                <Label alert={g.pri<=2} dim={g.pri>2} size={7.5}>P{g.pri}</Label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Glass>
  );
}

// ── 5. Sequential Pipeline Tracker ────────────────────────────────────────
function PipelineCluster({ pipeStage, pipeScores }) {
  return (
    <Glass style={{ padding:"14px 16px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <Label>Sequential Pipeline · Coder→Designer→Assessor→Finaliser</Label>
        <Label dim size={7.5}>{pipeStage>=4?"complete":"running"}</Label>
      </div>
      <div style={{ display:"flex", alignItems:"center", position:"relative", marginTop:8 }}>
        {PIPELINE_STAGES.map((stage, i) => {
          const done    = i < pipeStage;
          const running = i === pipeStage;
          const score   = pipeScores[stage];
          const c       = done ? "rgba(255,255,255,0.75)" : running ? "rgba(200,160,30,0.85)" : "rgba(60,60,60,0.6)";
          return (
            <div key={stage} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", position:"relative" }}>
              {i < PIPELINE_STAGES.length-1 && (
                <div style={{ position:"absolute", top:9, left:"50%", right:"-50%", height:1,
                              background: done ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.06)", zIndex:0 }}/>
              )}
              <div style={{ width:18, height:18, borderRadius:2, border:`1px solid ${c}`,
                            background: running ? "rgba(200,160,30,0.08)" : done ? "rgba(255,255,255,0.04)" : "transparent",
                            display:"flex", alignItems:"center", justifyContent:"center", zIndex:1,
                            boxShadow: running ? "0 0 10px rgba(200,160,30,0.3)" : done ? "0 0 6px rgba(255,255,255,0.12)" : "none" }}>
                <span style={{ fontFamily:C.mono, fontSize:9, color:c }}>{done?"✓":running?"▸":"○"}</span>
              </div>
              <div style={{ fontFamily:C.mono, fontSize:8.5, color:c, marginTop:5, textTransform:"uppercase", letterSpacing:".1em" }}>{stage}</div>
              {score !== undefined && <div style={{ fontFamily:C.mono, fontSize:8, color:"rgba(255,255,255,0.28)", marginTop:1 }}>{score.toFixed(2)}</div>}
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

// ── 6. Experience Library ────────────────────────────────────────────────
function ExperienceCluster({ expCount, avgScore, studyCyc, impCyc }) {
  const metrics = [
    { l:"Total",      v:expCount,              c:"rgba(255,255,255,0.75)" },
    { l:"Avg Score",  v:avgScore.toFixed(3),   c: avgScore>0.7?"rgba(255,255,255,0.65)":"rgba(200,60,60,0.7)" },
    { l:"Lessons",    v:`${expCount*2}`,        c:"rgba(255,255,255,0.5)" },
    { l:"Studies",    v:studyCyc,              c:"rgba(255,255,255,0.5)" },
    { l:"Improved",   v:impCyc,               c:"rgba(255,255,255,0.5)" },
    { l:"Success",    v:"87.0%",              c:"rgba(255,255,255,0.65)" },
  ];
  return (
    <Glass style={{ padding:"14px 16px" }}>
      <Label style={{ marginBottom:12 }}>Experience Library · ChromaDB</Label>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px", marginTop:8 }}>
        {metrics.map(m => (
          <div key={m.l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
            <Label dim size={8}>{m.l}</Label>
            <div style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:m.c }}>{m.v}</div>
          </div>
        ))}
      </div>
    </Glass>
  );
}

// ── 7. Agent Spawn Console ────────────────────────────────────────────────
function SpawnCluster({ agents, onSpawn, onLog }) {
  const [input,  setInput]  = useState("");
  const [sp,     setSp]     = useState(false);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [si,     setSi]     = useState(0);
  const ref = useRef(null);

  const SUGG = ["a web scraping researcher","a Python code engineer","a QA assessor","a UI/UX designer","a meta-reflector"];
  useEffect(() => { const id=setInterval(()=>setSi(i=>(i+1)%SUGG.length),3500); return()=>clearInterval(id); },[]);

  const spawn = useCallback(() => {
    const desc = input.trim(); if (!desc || status==="thinking") return;
    setStatus("thinking"); setResult(null);
    onLog("SPAWN","terminal",`Analysing: "${desc.slice(0,50)}"`);
    setTimeout(() => {
      const d = desc.toLowerCase();
      let matched="worker", conf=0.1;
      const kws = {
        researcher:["research","web","search","explore","scout"],
        code:      ["code","python","script","engineer","software"],
        designer:  ["design","ui","ux","visual","wireframe"],
        assessor:  ["assess","qa","quality","audit","test"],
        finaliser: ["final","deliver","ship","complete"],
        reflection:["reflect","meta","introspect","lesson"],
      };
      for (const [t,ws] of Object.entries(kws)) {
        const h=ws.filter(w=>d.includes(w)).length/ws.length;
        if (h>conf) { matched=t; conf=h; }
      }
      const exists = agents.find(a => a.label.toLowerCase()===matched||a.id.startsWith(matched.slice(0,3)));
      if (exists) {
        setStatus("duplicate");
        setResult({ type:"duplicate", archetype:matched, id:exists.id });
        onLog("WARN","agent-factory",`Duplicate — ${matched} exists: ${exists.id}`);
      } else {
        const newId=`${matched.slice(0,3)}-${Math.random().toString(36).slice(2,6)}`;
        setStatus("spawned");
        setResult({ type:"spawned", id:newId, archetype:matched, conf, sp });
        onSpawn(newId, matched);
        onLog("SPAWN","agent-factory",`Agent spawned | id=${newId} | type=${matched}`);
        if (sp) onLog("SPAWN","meta-orchestrator",`Self-prompt queued for ${newId}`);
      }
      setInput("");
      setTimeout(()=>{setStatus("idle");setResult(null);},5000);
    },1600);
  },[input,status,agents,sp,onSpawn,onLog]);

  const RC = { duplicate:"rgba(200,160,30,0.8)", spawned:"rgba(200,200,200,0.75)", error:"rgba(200,30,30,0.8)" };

  return (
    <Glass style={{ padding:"14px 16px" }}>
      <Label style={{ marginBottom:12 }}>Agent Spawn Console</Label>
      <div style={{ marginTop:10, display:"flex", gap:6 }}>
        <div style={{ flex:1, position:"relative" }}>
          <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontFamily:C.mono, fontSize:11, color:"rgba(255,255,255,0.18)" }}>›</span>
          <input ref={ref} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter")spawn(); if(e.key==="Tab"){e.preventDefault();setInput(`a ${SUGG[si]}`);}}}
            disabled={status==="thinking"}
            placeholder={`"a ${SUGG[si]}"`}
            style={{ width:"100%", background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:2,
                     padding:"8px 10px 8px 22px", fontFamily:C.mono, fontSize:11, color:"rgba(255,255,255,0.75)", outline:"none", boxSizing:"border-box" }}
            onFocus={e=>e.target.style.borderColor="rgba(255,255,255,0.22)"}
            onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.09)"}
          />
        </div>
        <button onClick={()=>setSp(s=>!s)}
          style={{ padding:"0 10px", background:sp?"rgba(255,255,255,0.06)":"transparent",
                   border:`1px solid rgba(255,255,255,${sp?".18":".08"})`, borderRadius:2,
                   color:"rgba(255,255,255,0.38)", fontFamily:C.mono, fontSize:8.5, textTransform:"uppercase", cursor:"pointer" }}>SP</button>
        <button onClick={spawn} disabled={!input.trim()||status==="thinking"}
          style={{ padding:"0 14px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:2,
                   color:status==="thinking"?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.65)",
                   fontFamily:C.mono, fontSize:9, textTransform:"uppercase", letterSpacing:".12em", cursor:"pointer" }}>
          {status==="thinking"?"···":"Spawn"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop:9, padding:"9px 11px", border:"1px solid rgba(255,255,255,0.08)", borderRadius:2,
                      background:"rgba(255,255,255,0.018)", fontFamily:C.mono, fontSize:9.5 }}>
          <div style={{ color:RC[result.type]||"rgba(200,200,200,0.7)", fontWeight:700, marginBottom:4 }}>
            {result.type==="duplicate"?"⚠ Already Exists":result.type==="spawned"?"○ Spawned":"✕ Error"}
          </div>
          {result.type==="spawned" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"2px 14px", color:"rgba(255,255,255,0.32)", fontSize:9 }}>
              {[["id",result.id],["type",result.archetype],["conf",`${(result.conf*100).toFixed(0)}%`],["self-prompt",result.sp?"queued":"off"]].map(([k,v])=>(
                <div key={k}><span style={{ color:"rgba(255,255,255,0.16)" }}>{k} </span>{v}</div>
              ))}
            </div>
          )}
          {result.type==="duplicate" && <div style={{ color:"rgba(255,255,255,0.3)" }}>{result.archetype} already in fleet: {result.id}</div>}
        </div>
      )}

      <div style={{ marginTop:9, display:"flex", flexWrap:"wrap", gap:4 }}>
        {["worker","researcher","code","designer","assessor","finaliser","reflection"].map(k=>(
          <button key={k} onClick={()=>{setInput(`a ${k} agent`);ref.current?.focus();}}
            style={{ fontFamily:C.mono, fontSize:8, color:"rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.02)",
                     border:"1px solid rgba(255,255,255,0.07)", borderRadius:2, padding:"2px 8px", cursor:"pointer" }}
            onMouseEnter={e=>e.target.style.color="rgba(255,255,255,0.55)"}
            onMouseLeave={e=>e.target.style.color="rgba(255,255,255,0.2)"}>
            {k}
          </button>
        ))}
      </div>
    </Glass>
  );
}

// ── 8. Task Dispatch ─────────────────────────────────────────────────────
function TaskCluster({ agents, onLog }) {
  const [mode,   setMode]   = useState("text");
  const [task,   setTask]   = useState("");
  const [url,    setUrl]    = useState("");
  const [agent,  setAgent]  = useState("auto");
  const [files,  setFiles]  = useState([]);
  const [drag,   setDrag]   = useState(false);
  const [status, setStatus] = useState("idle");
  const [hist,   setHist]   = useState([]);
  const [agOpen, setAgOpen] = useState(false);
  const fileRef = useRef(null);
  const ddRef   = useRef(null);

  useEffect(()=>{ const h=e=>{if(ddRef.current&&!ddRef.current.contains(e.target))setAgOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[]);

  const dispatch = () => {
    if (!task.trim()&&!url.trim()&&!files.length) return;
    setStatus("sending");
    setTimeout(()=>{
      const tid=`task-${Math.random().toString(36).slice(2,8)}`;
      const routed=agent==="auto"?`orch→g-${Math.random().toString(36).slice(2,5)}`:agent;
      setHist(h=>[{id:tid,ts:ts(),task:task||url||files[0]?.name||"files",routed},...h].slice(0,6));
      onLog("EVENT","task-dispatch",`Task dispatched → ${routed}: "${(task||url||"files").slice(0,45)}"`);
      setTask(""); setUrl(""); setFiles([]); setMode("text"); setStatus("done");
      setTimeout(()=>setStatus("idle"),2800);
    },1100);
  };

  const AGENTS_LIST=[{id:"auto",label:"Auto-route · Orchestrator"},...agents.map(a=>({id:a.id,label:`${a.id} · ${a.label}`}))];
  const selA=AGENTS_LIST.find(a=>a.id===agent)||AGENTS_LIST[0];

  return (
    <Glass style={{ padding:"14px 16px" }}>
      <Label style={{ marginBottom:12 }}>Task Dispatch</Label>

      {/* Agent selector */}
      <div style={{ position:"relative", marginBottom:9 }} ref={ddRef}>
        <button onClick={()=>setAgOpen(o=>!o)}
          style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center",
                   background:"rgba(255,255,255,0.022)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:2,
                   padding:"7px 10px", fontFamily:C.mono, fontSize:10.5, color:"rgba(255,255,255,0.55)", cursor:"pointer", textAlign:"left" }}>
          <span>○ {selA.label}</span><span style={{color:"rgba(255,255,255,0.2)"}}>▾</span>
        </button>
        {agOpen&&(
          <div style={{ position:"absolute", zIndex:60, width:"100%", top:"calc(100% + 2px)", background:"#030303",
                        border:"1px solid rgba(255,255,255,0.1)", borderRadius:2, overflow:"hidden", maxHeight:200, overflowY:"auto" }}>
            {AGENTS_LIST.map(a=>(
              <button key={a.id} onClick={()=>{setAgent(a.id);setAgOpen(false);}}
                style={{ width:"100%", textAlign:"left", padding:"8px 10px", fontFamily:C.mono, fontSize:10.5,
                         color:agent===a.id?"rgba(255,255,255,0.82)":"rgba(255,255,255,0.38)",
                         background:agent===a.id?"rgba(255,255,255,0.05)":"transparent", border:"none",
                         borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
                onMouseLeave={e=>e.currentTarget.style.background=agent===a.id?"rgba(255,255,255,0.05)":"transparent"}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mode tabs */}
      <div style={{ display:"flex", gap:1, background:"rgba(255,255,255,0.025)", padding:2.5, borderRadius:2, marginBottom:9 }}>
        {[["text","📝 Text"],["url","🔗 URL"],["file","📂 Files"]].map(([k,l])=>(
          <button key={k} onClick={()=>setMode(k)}
            style={{ flex:1, padding:"5px 0", fontFamily:C.mono, fontSize:8.5, textTransform:"uppercase", letterSpacing:".1em",
                     background:mode===k?"rgba(255,255,255,0.07)":"transparent", border:"none", borderRadius:1,
                     color:mode===k?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.22)", cursor:"pointer" }}>
            {l}
          </button>
        ))}
      </div>

      {mode==="text"&&(
        <textarea value={task} onChange={e=>setTask(e.target.value)}
          onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter")dispatch();}}
          placeholder={"Describe task…\n• Summarise capability gaps\n• Write a CSV parser\n• Review pipeline output"}
          rows={5} style={{ width:"100%", background:"rgba(255,255,255,0.018)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:2,
                            padding:"9px 11px", fontFamily:C.mono, fontSize:11, color:"rgba(255,255,255,0.65)", resize:"none", outline:"none", boxSizing:"border-box", lineHeight:1.65 }} />
      )}
      {mode==="url"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:12 }}>🔗</span>
            <input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"
              style={{ width:"100%", background:"rgba(255,255,255,0.018)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:2,
                       padding:"9px 10px 9px 28px", fontFamily:C.mono, fontSize:11, color:"rgba(255,255,255,0.65)", outline:"none", boxSizing:"border-box" }}/>
          </div>
          <textarea value={task} onChange={e=>setTask(e.target.value)} placeholder="What to do with this URL…" rows={2}
            style={{ width:"100%", background:"rgba(255,255,255,0.018)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:2,
                     padding:"9px 11px", fontFamily:C.mono, fontSize:11, color:"rgba(255,255,255,0.65)", resize:"none", outline:"none", boxSizing:"border-box" }}/>
        </div>
      )}
      {mode==="file"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          <div onDrop={e=>{e.preventDefault();setDrag(false);setFiles(p=>[...p,...Array.from(e.dataTransfer.files)]);}}
            onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
            onClick={()=>fileRef.current?.click()}
            style={{ border:`1.5px dashed rgba(255,255,255,${drag?.2:.08})`, borderRadius:2, padding:"24px 0", textAlign:"center",
                     background:drag?"rgba(255,255,255,0.03)":"transparent", cursor:"pointer", transition:"all .2s" }}>
            <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={e=>setFiles(p=>[...p,...Array.from(e.target.files||[])])}/>
            <div style={{ fontFamily:C.mono, fontSize:11, color:"rgba(255,255,255,0.28)" }}>Drop files or click to browse</div>
            <div style={{ fontFamily:C.mono, fontSize:8.5, color:"rgba(255,255,255,0.14)", marginTop:4 }}>.md .txt .py .json .csv .pdf · 10MB</div>
          </div>
          {files.length>0&&(
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {files.map((f,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:2, padding:"3px 8px" }}>
                  <span style={{ fontFamily:C.mono, fontSize:9, color:"rgba(255,255,255,0.45)" }}>{f.name}</span>
                  <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.25)", cursor:"pointer", fontSize:10 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:9, marginTop:9 }}>
        <Label dim size={8}>⌘↵</Label>
        <button onClick={dispatch}
          style={{ marginLeft:"auto", padding:"8px 18px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:2,
                   color:status==="sending"?"rgba(255,255,255,0.28)":status==="done"?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.68)",
                   fontFamily:C.mono, fontSize:9.5, textTransform:"uppercase", letterSpacing:".14em", cursor:"pointer" }}>
          {status==="sending"?"···":status==="done"?"○ Dispatched":"▸ Dispatch"}
        </button>
      </div>

      {hist.length>0&&(
        <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
          {hist.map(h=>(
            <div key={h.id} style={{ display:"flex", gap:8, fontFamily:C.mono, fontSize:9, color:"rgba(255,255,255,0.24)", marginBottom:4, overflow:"hidden" }}>
              <span style={{ flexShrink:0 }}>{h.ts}</span>
              <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.task.slice(0,38)}</span>
              <span style={{ color:"rgba(255,255,255,0.38)", flexShrink:0 }}>→{h.routed.slice(0,14)}</span>
            </div>
          ))}
        </div>
      )}
    </Glass>
  );
}

// ── 9. System Log ─────────────────────────────────────────────────────────
function LogCluster({ logs, logRef }) {
  const LC = { INFO:"rgba(180,180,180,0.55)", WARN:"rgba(200,60,60,0.85)", ERROR:"rgba(200,30,30,1)", EVENT:"rgba(220,220,220,0.85)", SPAWN:"rgba(150,150,150,0.75)", SYS:"rgba(80,80,80,0.6)" };
  return (
    <Glass style={{ overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.055)" }}>
        <Label>System Log · JSONL</Label>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <AlertDot size={4} pulse/>
          <Label dim size={7}>LIVE</Label>
        </div>
      </div>
      <div style={{ height:190, overflowY:"auto", padding:"8px 14px", scrollbarWidth:"none" }}>
        {logs.map(log=>(
          <div key={log.id} style={{ display:"flex", gap:8, fontFamily:C.mono, fontSize:9.5, lineHeight:1.8 }}>
            <span style={{ color:"rgba(255,255,255,0.18)", minWidth:50, flexShrink:0 }}>{log.ts}</span>
            <span style={{ minWidth:42, fontWeight:700, color:LC[log.lv]||"rgba(180,180,180,0.6)", flexShrink:0 }}>{log.lv}</span>
            <span style={{ minWidth:114, color:"rgba(255,255,255,0.18)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flexShrink:0 }}>{log.src}</span>
            <span style={{ color:"rgba(255,255,255,0.48)" }}>{log.msg}</span>
          </div>
        ))}
        <div ref={logRef}/>
      </div>
    </Glass>
  );
}

// ── 10. Hardware Scanner widget ───────────────────────────────────────────
function HardwareCluster() {
  const [state,  setState]  = useState("idle");
  const [result, setResult] = useState(null);
  const [dlProg, setDlProg] = useState({});
  const [dlState,setDlState]= useState({});

  const scan = () => {
    setState("scanning");
    setTimeout(()=>{
      setResult({
        tier:"HIGH", os:"macOS 14.5 · Apple M2 Pro", cpu:"Apple M2 Pro 12-core",
        ram:32, gpu:"Apple M2 Pro (19-core GPU)", vram:32, metal:true,
        ollama:"0.1.38",
        recs:[
          { rank:1, name:"llama3:13b",               label:"Llama 3 13B",    params:"13B", q:"Q4_K_M", speed:"~22 tok/s", size:7.4,  best:true  },
          { rank:2, name:"mistral:7b-instruct-v0.3", label:"Mistral 7B v0.3",params:"7B",  q:"Q4_K_M", speed:"~35 tok/s", size:4.1,  best:false },
          { rank:3, name:"codellama:13b",             label:"CodeLlama 13B", params:"13B", q:"Q4_K_M", speed:"~20 tok/s", size:7.4,  best:false },
          { rank:4, name:"llama3:8b",                 label:"Llama 3 8B",    params:"8B",  q:"Q4_K_M", speed:"~28 tok/s", size:4.7,  best:false },
        ],
      });
      setState("done");
    },2000);
  };

  const download = name => {
    setDlState(d=>({...d,[name]:"pulling"})); setDlProg(p=>({...p,[name]:0}));
    let pct=0;
    const id=setInterval(()=>{
      pct+=Math.random()*4+1.5;
      if(pct>=100){pct=100;clearInterval(id);setDlState(d=>({...d,[name]:"done"}));}
      setDlProg(p=>({...p,[name]:Math.min(pct,100)}));
    },550);
  };

  return (
    <Glass style={{ padding:"14px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <Label>Hardware Scanner · Model Recommender</Label>
        <button onClick={scan} disabled={state==="scanning"}
          style={{ padding:"5px 14px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:2,
                   color:state==="scanning"?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.62)",
                   fontFamily:C.mono, fontSize:8.5, textTransform:"uppercase", letterSpacing:".1em", cursor:"pointer" }}>
          {state==="scanning"?<span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span>:"⚡"} {state==="scanning"?"Scanning…":"Scan"}
        </button>
      </div>

      {state==="idle"&&(
        <div style={{ textAlign:"center", padding:"20px 0" }}>
          <div style={{ fontFamily:C.mono, fontSize:10, color:"rgba(255,255,255,0.22)", lineHeight:1.7 }}>
            Autonomous CPU · RAM · GPU detection<br/>
            <span style={{ color:"rgba(255,255,255,0.14)" }}>nvidia-smi · rocm-smi · system_profiler · psutil</span>
          </div>
        </div>
      )}

      {state==="scanning"&&(
        <div style={{ textAlign:"center", padding:"20px 0" }}>
          {["Detecting CPU & cores","Reading RAM","Probing GPU","Checking Ollama","Mapping models"].map((s,i)=>(
            <div key={s} style={{ fontFamily:C.mono, fontSize:9, color:"rgba(255,255,255,0.3)", marginBottom:5, display:"flex", alignItems:"center", gap:7, justifyContent:"center" }}>
              <span style={{ color:"rgba(200,200,200,0.5)" }}>›</span>{s}
            </div>
          ))}
        </div>
      )}

      {state==="done"&&result&&(
        <div>
          <div style={{ padding:"8px 10px", background:"rgba(255,255,255,0.025)", borderRadius:2, marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontFamily:C.mono, fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.7)", textTransform:"uppercase", letterSpacing:".1em" }}>{result.tier} TIER</div>
              <div style={{ fontFamily:C.mono, fontSize:9, color:"rgba(255,255,255,0.3)", marginTop:2 }}>{result.os} · {result.vram}GB VRAM · Ollama {result.ollama}</div>
            </div>
            <div style={{ fontFamily:C.mono, fontSize:8.5, color:"rgba(255,255,255,0.25)", textAlign:"right" }}>
              <div>{result.cpu}</div><div>{result.ram}GB RAM</div>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {result.recs.map(rec=>{
              const dl  = dlState[rec.name]||"idle";
              const pct = dlProg[rec.name]||0;
              return (
                <div key={rec.name} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px",
                                             background:rec.best?"rgba(255,255,255,0.03)":"transparent",
                                             border:`1px solid rgba(255,255,255,${rec.best?.1:.05})`, borderRadius:2 }}>
                  <div style={{ width:20, height:20, borderRadius:2, border:"1px solid rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontFamily:C.mono, fontSize:8.5, color:"rgba(255,255,255,0.5)" }}>{rec.rank}</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:2 }}>
                      <span style={{ fontFamily:C.mono, fontSize:11, color:"rgba(255,255,255,0.72)" }}>{rec.label}</span>
                      {rec.best&&<span style={{ fontFamily:C.mono, fontSize:7.5, color:"rgba(200,200,200,0.5)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:2, padding:"0 4px" }}>★ BEST</span>}
                    </div>
                    <div style={{ fontFamily:C.mono, fontSize:8.5, color:"rgba(255,255,255,0.25)" }}>{rec.params} · {rec.q} · {rec.speed} · {rec.size}GB</div>
                    {dl==="pulling"&&(
                      <div style={{ marginTop:5, height:1.5, background:"rgba(255,255,255,0.06)", borderRadius:1, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:"rgba(255,255,255,0.45)", transition:"width .5s" }}/>
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink:0 }}>
                    {dl==="idle"&&<button onClick={()=>download(rec.name)} style={{ padding:"5px 12px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:2, color:"rgba(255,255,255,0.55)", fontFamily:C.mono, fontSize:8.5, textTransform:"uppercase", cursor:"pointer" }}>⬇</button>}
                    {dl==="pulling"&&<span style={{ fontFamily:C.mono, fontSize:9, color:"rgba(180,180,180,0.5)" }}>{pct.toFixed(0)}%</span>}
                    {dl==="done"&&<span style={{ fontFamily:C.mono, fontSize:9, color:"rgba(180,180,180,0.55)" }}>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Glass>
  );
}

// ── 11. Approval Gate Modal ───────────────────────────────────────────────
function ApprovalModal({ pending, onDecide }) {
  const [t, setT] = useState(30);
  useEffect(()=>{
    if(!pending) return; setT(30);
    const id=setInterval(()=>setT(v=>{if(v<=1){onDecide(true);return 0;}return v-1;}),1000);
    return()=>clearInterval(id);
  },[pending]);
  if (!pending) return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.88)", backdropFilter:"blur(6px)" }}>
      <Glass alert style={{ maxWidth:380, width:"calc(100% - 32px)", padding:24 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <AlertDot size={8}/>
          <div style={{ fontFamily:C.mono, fontSize:10, textTransform:"uppercase", letterSpacing:".16em", color:"rgba(200,60,60,0.8)" }}>Human Approval Required</div>
        </div>
        <Label dim style={{ marginBottom:12 }}>{pending.action==="spawn"?"Agent Spawn Request":pending.action}</Label>
        <div style={{ background:"rgba(255,255,255,0.018)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:2, padding:10, marginBottom:16 }}>
          <pre style={{ fontFamily:C.mono, fontSize:9.5, color:"rgba(255,255,255,0.38)", margin:0 }}>{JSON.stringify(pending.details,null,2)}</pre>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <Label dim size={8.5}>Auto-approve in {t}s</Label>
          <div style={{ height:1.5, width:80, background:"rgba(255,255,255,0.07)", borderRadius:1, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(t/30)*100}%`, background:"rgba(200,150,30,0.55)", transition:"width 1s linear" }}/>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {[["✕ Veto",false,"rgba(200,30,30,0.6)"],["○ Approve",true,"rgba(180,180,180,0.45)"]].map(([label,val,c])=>(
            <button key={label} onClick={()=>onDecide(val)}
              style={{ flex:1, padding:"9px 0", background:"transparent", border:`1px solid ${c}`, borderRadius:2,
                       color:c, fontFamily:C.mono, fontSize:9, textTransform:"uppercase", letterSpacing:".14em", cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>
      </Glass>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export default function SINeuralOS() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [tick,       setTick]       = useState(0);
  const [iteration,  setIteration]  = useState(42);
  const [cpu,        setCpu]        = useState(68);
  const [ram,        setRam]        = useState(41);
  const [studyCyc,   setStudyCyc]   = useState(3);
  const [impCyc,     setImpCyc]     = useState(1);
  const [pipeRuns,   setPipeRuns]   = useState(1);
  const [pipeStage,  setPipeStage]  = useState(3);
  const [pipeScores] = useState({ coder:0.81, designer:0.78, assessor:0.85, finaliser:0.89 });
  const [liveCount,  setLiveCount]  = useState(3);
  const [agents,     setAgents]     = useState(ARCHETYPES.map(a=>({...a,status:a.alert?"alert":Math.random()>.3?"running":"idle"})));
  const [goals,      setGoals]      = useState(GOALS);
  const [logs,       setLogs]       = useState(SEED_LOGS);
  const [caps,       setCaps]       = useState(CAPABILITIES);
  const [expCount,   setExpCount]   = useState(46);
  const [avgScore,   setAvgScore]   = useState(0.77);
  const [approval,   setApproval]   = useState(null);
  const [hoveredNode,setHoveredNode]= useState(null);
  const logBottomRef = useRef(null);

  // ── Auto-scroll log ────────────────────────────────────────────────────────
  useEffect(() => { logBottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);

  // ── Live ticker ────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setTick(t=>t+1); setIteration(i=>i+1); setLiveCount(n=>n+1);
      setCpu(c=>Math.min(90,Math.max(28,c+(Math.random()-.46)*7)));
      setRam(r=>Math.min(75,Math.max(28,r+(Math.random()-.5)*3)));
      if (Math.random()>.35) {
        const tmpl=LIVE_POOL[Math.floor(Math.random()*LIVE_POOL.length)];
        const e=tmpl(liveCount);
        setLogs(l=>[...l.slice(-60),{id:Date.now(),ts:ts(),...e}]);
      }
      if (Math.random()>.55) { setExpCount(e=>e+1); setAvgScore(s=>Math.min(.97,Math.max(.5,s+(Math.random()-.4)*.015))); }
      if (Math.random()>.9)  { setStudyCyc(s=>s+1); }
      if (Math.random()>.75) {
        setAgents(prev=>prev.map((a,i)=>i===0?a:{
          ...a, score:Math.min(.97,Math.max(.4,a.score+(Math.random()-.42)*.025)),
          alert:Math.random()>.78,
          status:["running","running","running","idle","alert"][Math.floor(Math.random()*5)],
        }));
      }
    }, 1500);
    return () => clearInterval(id);
  }, [liveCount]);

  useEffect(() => {
    const id=setTimeout(()=>setApproval({action:"spawn",details:{role:"researcher",reason:"High task load detected — CPU 82%"}}),5500);
    return()=>clearTimeout(id);
  },[]);

  const pushLog = useCallback((lv,src,msg) => setLogs(l=>[...l.slice(-60),{id:Date.now(),ts:ts(),lv,src,msg}]),[]);

  const handleSpawn = (newId, archetype) => {
    setAgents(prev=>[...prev,{ id:newId, label:archetype.toUpperCase().slice(0,6), role:archetype, hubR:11, leaves:10, alert:false, score:0.5, tasks:0, skills:[], status:"running" }]);
    setPipeRuns(p=>p+1);
  };

  const handleApproval = (approved) => {
    setApproval(null);
    pushLog(approved?"EVENT":"WARN","human-gate",approved?"✓ Approved: spawn":"✕ Vetoed: spawn");
  };

  const activeAgents = agents.filter(a=>a.status!=="idle").length;

  return (
    <div style={{ minHeight:"100vh", background:"#000000", color:"rgba(255,255,255,0.7)", position:"relative", overflow:"hidden", fontFamily:C.sans }}>
      <style>{`
        @keyframes siPulse { 0%,100%{opacity:1}50%{opacity:.15} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width:3px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:2px }
        * { box-sizing:border-box }
        button { transition:opacity .18s, border-color .18s, background .18s }
        button:hover { opacity:.82 }
        input,textarea,select { font-family:'JetBrains Mono','Fira Code',monospace }
      `}</style>

      {/* ── Full-screen living neural canvas ─────────────────────────────── */}
      <NeuralCanvas hoveredNode={hoveredNode} activeAgents={activeAgents} tick={tick} />

      {/* ── Top navigation bar ───────────────────────────────────────────── */}
      <div style={{
        position:"fixed", top:0, left:0, right:0, zIndex:50,
        height:46, display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 20px",
        background:"rgba(0,0,0,0.75)", backdropFilter:"blur(24px)",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          {/* Consciousness indicator */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:"#ffffff", boxShadow:"0 0 16px rgba(255,255,255,0.9), 0 0 32px rgba(255,255,255,0.4)", animation:"siPulse 3s infinite" }}/>
            <div>
              <div style={{ fontFamily:C.mono, fontSize:11, fontWeight:700, letterSpacing:".22em", textTransform:"uppercase", color:"rgba(255,255,255,0.88)" }}>
                Synthetic Intelligence
              </div>
              <div style={{ fontFamily:C.mono, fontSize:7.5, color:"rgba(255,255,255,0.2)", letterSpacing:".16em" }}>
                EMBODIMENT v3.0 · NEURAL OS · 84 FILES · 46/46 TESTS
              </div>
            </div>
          </div>
        </div>

        {/* Real-time status indicators */}
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          {[
            { l:"LOOP",    v:"ACTIVE",              a:false },
            { l:"CPU",     v:`${cpu.toFixed(0)}%`,  a:cpu>78 },
            { l:"RAM",     v:`${ram.toFixed(0)}%`,  a:ram>82 },
            { l:"AGENTS",  v:`${activeAgents}/${agents.length}`, a:false },
            { l:"ITER",    v:`${iteration}`,        a:false },
          ].map(s=>(
            <div key={s.l} style={{ textAlign:"center" }}>
              <div style={{ fontFamily:C.mono, fontSize:7, color:"rgba(255,255,255,0.18)", letterSpacing:".14em", textTransform:"uppercase" }}>{s.l}</div>
              <div style={{ fontFamily:C.mono, fontSize:11, letterSpacing:".08em",
                            color:s.a?"rgba(200,50,50,0.9)":"rgba(255,255,255,0.55)",
                            textShadow:s.a?`0 0 10px ${C.redGlow}`:"none" }}>{s.v}</div>
            </div>
          ))}
          <Div v />
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:"#fff", boxShadow:"0 0 10px rgba(255,255,255,0.6)", animation:"siPulse 2s infinite" }}/>
            <span style={{ fontFamily:C.mono, fontSize:8, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:".14em" }}>Neural Link</span>
          </div>
        </div>
      </div>

      {/* ── Widget layer — right panel column ────────────────────────────── */}
      <div style={{
        position:"relative", zIndex:10,
        paddingTop:54, paddingBottom:20,
        paddingLeft:"50%",   // left 50% = orbital canvas visible
        paddingRight:14,
        minHeight:"100vh",
        display:"flex", flexDirection:"column", gap:1,
      }}>

        {/* Vitals strip */}
        <VitalsCluster cpu={cpu} ram={ram} agents={activeAgents} studyCyc={studyCyc} pipeRuns={pipeRuns} iteration={iteration} />

        {/* Pipeline tracker */}
        <PipelineCluster pipeStage={pipeStage} pipeScores={pipeScores} />

        {/* Main 2-col widget grid */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:1, flex:1 }}>

          {/* Left widgets */}
          <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
            <FleetCluster agents={agents} hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} />
            <SelfModelCluster caps={caps} />
            <ExperienceCluster expCount={expCount} avgScore={avgScore} studyCyc={studyCyc} impCyc={impCyc} />
          </div>

          {/* Right widgets */}
          <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
            <GoalCluster goals={goals} setGoals={setGoals} />
            <SpawnCluster agents={agents} onSpawn={handleSpawn} onLog={pushLog} />
            <TaskCluster agents={agents} onLog={pushLog} />
          </div>
        </div>

        {/* Hardware Scanner + Log — full width at bottom */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:1 }}>
          <HardwareCluster />
          <LogCluster logs={logs} logRef={logBottomRef} />
        </div>

        {/* Footer */}
        <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0 0", borderTop:"1px solid rgba(255,255,255,0.04)", marginTop:2 }}>
          <div style={{ fontFamily:C.mono, fontSize:7.5, color:"rgba(255,255,255,0.12)", letterSpacing:".12em", textTransform:"uppercase" }}>
            LangGraph · ChromaDB · Ollama · FastAPI SSE · Next.js 14 · Study Cycle #{studyCyc} · Improve #{impCyc}
          </div>
          <div style={{ fontFamily:C.mono, fontSize:7.5, color:"rgba(255,255,255,0.12)", letterSpacing:".12em", textTransform:"uppercase" }}>
            Self-Improving Loop Active
          </div>
        </div>
      </div>

      {/* ── Human Approval Gate ─────────────────────────────────────────── */}
      <ApprovalModal pending={approval} onDecide={handleApproval} />
    </div>
  );
}
