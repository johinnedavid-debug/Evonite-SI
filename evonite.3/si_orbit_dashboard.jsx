import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM — derived from reference image
// Pure void black · luminous white orbital ring · crimson alert nodes
// Grey flowing branch lines · hollow white leaf circles · radial tree hierarchy
// ═══════════════════════════════════════════════════════════════════════════════
const D = {
  void:      "#000000",
  deepVoid:  "#050505",
  ring:      "#ffffff",
  ringGlow:  "rgba(255,255,255,0.15)",
  branch:    "rgba(180,180,180,0.35)",
  branchHot: "rgba(220,40,40,0.7)",
  nodeHollow:"rgba(255,255,255,0.9)",
  nodeFill:  "#ffffff",
  nodeAlert: "#cc2020",
  nodeAlertG:"rgba(220,30,30,0.8)",
  nodeHubG:  "rgba(255,255,255,0.95)",
  ripple:    "rgba(255,255,255,0.04)",
  label:     "rgba(255,255,255,0.35)",
  labelHot:  "rgba(255,255,255,0.7)",
  red:       "#cc2020",
  redGlow:   "rgba(200,30,30,0.6)",
  mono:      "'JetBrains Mono','Fira Code',monospace",
  sans:      "Inter,system-ui,sans-serif",
};

// ═══════════════════════════════════════════════════════════════════════════════
// ORBITAL NEURAL CANVAS — the signature full-screen background
// Matches the image exactly: large arc ring, radial branch trees, flowing curves
// Animated: pulses travel along branches, nodes breathe, ring rotates slowly
// ═══════════════════════════════════════════════════════════════════════════════
function OrbitalCanvas({ agents, tick }) {
  const ref = useRef(null);
  const frameRef = useRef(null);
  const t = useRef(0);
  const pulses = useRef([]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");

    const resize = () => {
      cv.width  = window.innerWidth;
      cv.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Scene geometry ────────────────────────────────────────────────────────
    // The big orbital ring sits off-centre-left, just like the image
    // Its arc occupies ~60% of the left half of the screen
    const getRing = () => ({
      cx: cv.width  * 0.12,   // ring centre far left (ring is mostly off-screen)
      cy: cv.height * 0.50,
      r:  cv.height * 0.58,   // large radius so only the right arc shows
    });

    // Agent archetype configs for radial placement along the arc
    const ARCHETYPE_META = [
      { id:"meta-001",   type:"meta",       label:"META",      alert:false, hubSize:18, leafCount:22 },
      { id:"cod-7d26",   type:"code",       label:"CODE",      alert:false, hubSize:13, leafCount:18 },
      { id:"dsg-c20c",   type:"designer",   label:"DESIGN",    alert:false, hubSize:13, leafCount:16 },
      { id:"asr-065f",   type:"assessor",   label:"ASSESS",    alert:true,  hubSize:15, leafCount:20 },
      { id:"fnl-3b9a",   type:"finaliser",  label:"FINAL",     alert:false, hubSize:12, leafCount:14 },
      { id:"rsc-f12a",   type:"researcher", label:"RESEARCH",  alert:true,  hubSize:14, leafCount:24 },
      { id:"ref-9e2b",   type:"reflection", label:"REFLECT",   alert:false, hubSize:11, leafCount:12 },
      { id:"wkr-0011",   type:"worker",     label:"WORKER",    alert:false, hubSize:10, leafCount:10 },
    ];

    // Seed initial pulses along branches
    const seedPulses = (nodes) => {
      pulses.current = [];
      nodes.forEach((node, ni) => {
        if (Math.random() > 0.3) {
          node.leaves.forEach((leaf, li) => {
            if (Math.random() > 0.6) {
              pulses.current.push({
                nodeIdx: ni, leafIdx: li,
                prog: Math.random(),
                speed: 0.004 + Math.random() * 0.006,
                isAlert: node.meta.alert && Math.random() > 0.5,
                reverse: Math.random() > 0.7,
              });
            }
          });
        }
      });
    };

    let nodes = [];

    const buildScene = () => {
      const ring = getRing();
      nodes = [];

      // Place each archetype along the visible arc
      // Arc spans roughly from 330° to 150° (the right side), matching image
      const arcStart = -Math.PI * 0.72;
      const arcEnd   =  Math.PI * 0.72;

      ARCHETYPE_META.forEach((meta, i) => {
        const arcT = i / (ARCHETYPE_META.length - 1);
        const angle = arcStart + (arcEnd - arcStart) * arcT;

        // Hub position ON the ring
        const hubX = ring.cx + Math.cos(angle) * ring.r;
        const hubY = ring.cy + Math.sin(angle) * ring.r;

        // Branch fans outward away from ring centre
        const outAngle = angle; // radially outward
        const branchLen = 80 + Math.random() * 60;

        // Mid cluster point
        const midX = hubX + Math.cos(outAngle) * branchLen;
        const midY = hubY + Math.sin(outAngle) * branchLen;

        // Generate leaves in a fan around mid point
        const leaves = [];
        const fanSpread = 0.55 + Math.random() * 0.3;
        for (let l = 0; l < meta.leafCount; l++) {
          const leafT   = l / (meta.leafCount - 1);
          const leafAng = outAngle - fanSpread / 2 + fanSpread * leafT + (Math.random() - 0.5) * 0.12;
          const leafDist = 50 + Math.random() * 80;
          const subDist  = 20 + Math.random() * 40;
          const lx = midX + Math.cos(leafAng) * leafDist;
          const ly = midY + Math.sin(leafAng) * leafDist;

          // Some leaves have sub-leaves (2nd generation)
          const subs = [];
          if (Math.random() > 0.55) {
            const subCount = Math.floor(Math.random() * 4) + 2;
            for (let s = 0; s < subCount; s++) {
              const sa = leafAng + (Math.random() - 0.5) * 0.4;
              subs.push({
                x: lx + Math.cos(sa) * subDist,
                y: ly + Math.sin(sa) * subDist,
                r: 2.5 + Math.random() * 2,
                alert: meta.alert && Math.random() > 0.65,
              });
            }
          }

          leaves.push({
            x: lx, y: ly,
            r: 3.5 + Math.random() * 3,
            alert: meta.alert && Math.random() > 0.55,
            subs,
            ctrlX: (hubX + lx) / 2 + (Math.random() - 0.5) * 30,
            ctrlY: (hubY + ly) / 2 + (Math.random() - 0.5) * 30,
          });
        }

        nodes.push({ meta, angle, hubX, hubY, midX, midY, leaves, ring });
      });

      seedPulses(nodes);
    };

    buildScene();

    // ── Draw loop ─────────────────────────────────────────────────────────────
    const draw = () => {
      t.current += 0.008;
      ctx.clearRect(0, 0, cv.width, cv.height);

      // Absolute void background
      ctx.fillStyle = D.void;
      ctx.fillRect(0, 0, cv.width, cv.height);

      const ring = getRing();

      // ── Concentric ripple rings (like the image's concentric arcs) ──────────
      for (let r = 0; r < 6; r++) {
        const rippleR = ring.r + r * 45 + 20;
        ctx.beginPath();
        ctx.arc(ring.cx, ring.cy, rippleR, -Math.PI * 0.8, Math.PI * 0.8);
        ctx.strokeStyle = `rgba(255,255,255,${0.03 - r * 0.004})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // ── Main orbital ring — the luminous white arc ──────────────────────────
      const ringRotOffset = t.current * 0.012; // very slow rotation

      // Outer glow layers
      for (let g = 0; g < 5; g++) {
        ctx.beginPath();
        ctx.arc(ring.cx, ring.cy, ring.r, -Math.PI * 0.73 + ringRotOffset, Math.PI * 0.73 + ringRotOffset);
        ctx.strokeStyle = `rgba(255,255,255,${0.04 - g * 0.006})`;
        ctx.lineWidth = 2 + g * 6;
        ctx.stroke();
      }
      // Core white ring
      ctx.beginPath();
      ctx.arc(ring.cx, ring.cy, ring.r, -Math.PI * 0.73 + ringRotOffset, Math.PI * 0.73 + ringRotOffset);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ── Draw nodes and branches ─────────────────────────────────────────────
      nodes.forEach((node, ni) => {
        const breathe = 0.6 + 0.4 * Math.sin(t.current * 1.5 + ni * 1.1);
        const isAlert = node.meta.alert;
        const hubColor = isAlert ? D.nodeAlert : D.nodeFill;
        const hubGlow  = isAlert ? D.redGlow   : "rgba(255,255,255,0.6)";

        // ── Branch lines from hub to each leaf (flowing grey curves) ───────────
        node.leaves.forEach((leaf, li) => {
          const isHot = isAlert && leaf.alert;
          const lineAlpha = 0.2 + 0.15 * Math.sin(t.current * 0.8 + li * 0.5);

          ctx.beginPath();
          ctx.moveTo(node.hubX, node.hubY);
          ctx.quadraticCurveTo(leaf.ctrlX, leaf.ctrlY, leaf.x, leaf.y);
          ctx.strokeStyle = isHot ? D.branchHot : `rgba(160,160,160,${lineAlpha})`;
          ctx.lineWidth = isHot ? 0.9 : 0.6;
          ctx.stroke();

          // Sub-leaf lines
          leaf.subs.forEach(sub => {
            ctx.beginPath();
            ctx.moveTo(leaf.x, leaf.y);
            ctx.lineTo(sub.x, sub.y);
            ctx.strokeStyle = sub.alert ? D.branchHot : `rgba(120,120,120,${lineAlpha * 0.7})`;
            ctx.lineWidth = 0.4;
            ctx.stroke();
          });
        });

        // ── Pulse animations along branches ────────────────────────────────────
        pulses.current
          .filter(p => p.nodeIdx === ni)
          .forEach(pulse => {
            pulse.prog += pulse.speed * (pulse.reverse ? -1 : 1);
            if (pulse.prog > 1) pulse.prog = 0;
            if (pulse.prog < 0) pulse.prog = 1;

            const leaf = node.leaves[pulse.leafIdx];
            if (!leaf) return;

            // Interpolate along the quadratic curve
            const tp  = pulse.prog;
            const tp2 = tp * tp;
            const nt  = 1 - tp;
            const px  = nt*nt*node.hubX + 2*nt*tp*leaf.ctrlX + tp2*leaf.x;
            const py  = nt*nt*node.hubY + 2*nt*tp*leaf.ctrlY + tp2*leaf.y;

            const pc = pulse.isAlert ? D.nodeAlert : "#ffffff";
            const pr = pulse.isAlert ? 3 : 2.5;

            const grd = ctx.createRadialGradient(px, py, 0, px, py, pr * 3);
            grd.addColorStop(0, pc);
            grd.addColorStop(1, "transparent");
            ctx.beginPath();
            ctx.arc(px, py, pr * 3, 0, Math.PI * 2);
            ctx.fillStyle = grd;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fillStyle = pc;
            ctx.fill();
          });

        // ── Leaf nodes (hollow circles) ─────────────────────────────────────────
        node.leaves.forEach(leaf => {
          // Sub-nodes first
          leaf.subs.forEach(sub => {
            ctx.beginPath();
            ctx.arc(sub.x, sub.y, sub.r, 0, Math.PI * 2);
            if (sub.alert) {
              ctx.fillStyle = D.nodeAlert;
              ctx.fill();
              ctx.shadowColor = D.redGlow;
              ctx.shadowBlur = 8;
              ctx.fill();
              ctx.shadowBlur = 0;
            } else {
              ctx.fillStyle = "transparent";
              ctx.strokeStyle = "rgba(255,255,255,0.55)";
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }
          });

          ctx.beginPath();
          ctx.arc(leaf.x, leaf.y, leaf.r, 0, Math.PI * 2);
          if (leaf.alert) {
            // Crimson filled node
            const grd = ctx.createRadialGradient(leaf.x, leaf.y, 0, leaf.x, leaf.y, leaf.r * 3);
            grd.addColorStop(0, "rgba(220,30,30,0.5)");
            grd.addColorStop(1, "transparent");
            ctx.fillStyle = grd;
            ctx.arc(leaf.x, leaf.y, leaf.r * 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(leaf.x, leaf.y, leaf.r, 0, Math.PI * 2);
            ctx.fillStyle = D.nodeAlert;
            ctx.shadowColor = D.redGlow;
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;
          } else {
            // White hollow circle — signature look from image
            ctx.fillStyle   = "transparent";
            ctx.strokeStyle = `rgba(255,255,255,${0.7 + 0.3 * breathe})`;
            ctx.lineWidth   = 0.9;
            ctx.stroke();
          }
        });

        // ── Mid cluster hub circle ─────────────────────────────────────────────
        const midR = node.meta.hubSize * 0.65;
        ctx.beginPath();
        ctx.arc(node.midX, node.midY, midR, 0, Math.PI * 2);
        ctx.fillStyle   = "transparent";
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * breathe})`;
        ctx.lineWidth   = 1.2;
        ctx.stroke();

        // ── Main hub node ON the ring ──────────────────────────────────────────
        const hubR = node.meta.hubSize;

        // Glow aura
        const grd = ctx.createRadialGradient(node.hubX, node.hubY, 0, node.hubX, node.hubY, hubR * 4);
        grd.addColorStop(0, isAlert ? "rgba(200,20,20,0.4)" : "rgba(255,255,255,0.25)");
        grd.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(node.hubX, node.hubY, hubR * 4, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Filled hub
        ctx.beginPath();
        ctx.arc(node.hubX, node.hubY, hubR, 0, Math.PI * 2);
        ctx.fillStyle = isAlert ? D.nodeAlert : D.nodeFill;
        ctx.shadowColor = isAlert ? D.redGlow : "rgba(255,255,255,0.8)";
        ctx.shadowBlur  = 18;
        ctx.fill();
        ctx.shadowBlur  = 0;

        // Label
        ctx.fillStyle = isAlert ? "rgba(200,60,60,0.9)" : "rgba(255,255,255,0.4)";
        ctx.font = `9px ${D.mono}`;
        ctx.textAlign = "center";
        const lx = node.hubX + Math.cos(node.angle) * (hubR + 14);
        const ly = node.hubY + Math.sin(node.angle) * (hubR + 14);
        ctx.fillText(node.meta.label, lx, ly + 3);
      });

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas ref={ref} style={{
      position: "fixed", inset: 0, width: "100%", height: "100%",
      zIndex: 0, pointerEvents: "none",
    }} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════════
const SEED_AGENTS = [
  { id:"meta-001", role:"Meta-Orchestrator", status:"running",   score:0.94, tasks:42, alert:false },
  { id:"cod-7d26", role:"Code Agent",        status:"running",   score:0.81, tasks:89, alert:false },
  { id:"dsg-c20c", role:"Designer",          status:"running",   score:0.78, tasks:34, alert:false },
  { id:"asr-065f", role:"Assessor",          status:"alert",     score:0.55, tasks:28, alert:true  },
  { id:"fnl-3b9a", role:"Finaliser",         status:"idle",      score:0.89, tasks:17, alert:false },
  { id:"rsc-f12a", role:"Researcher",        status:"alert",     score:0.62, tasks:55, alert:true  },
  { id:"ref-9e2b", role:"Reflector",         status:"running",   score:0.71, tasks:5,  alert:false },
];

const SEED_LOGS = [
  { id:1, ts:"18:29:01", lv:"EVENT", src:"orchestrator",        msg:"Goal completed: g-01 [self-evaluation]" },
  { id:2, ts:"18:29:03", lv:"INFO",  src:"agent-factory",       msg:"Spawned cod-7d26 | type=code | tools=[filesystem,memory,git]" },
  { id:3, ts:"18:29:13", lv:"EVENT", src:"pipeline.sequential", msg:"Pipeline COMPLETE | overall=0.83 | 4/4 stages" },
  { id:4, ts:"18:29:15", lv:"WARN",  src:"monitor",             msg:"CPU spike: 81% — approaching spawn threshold" },
  { id:5, ts:"18:29:18", lv:"INFO",  src:"skills.registry",     msg:"Skill count_vowels injected fleet-wide (6 agents)" },
  { id:6, ts:"18:29:20", lv:"SYS",   src:"terminal",            msg:"Agent Spawn Console ready" },
];

const LIVE_POOL = [
  (n)=>({ lv:"INFO",  src:"meta_loops.study",    msg:`Study cycle #${n} | capability_updates=4` }),
  ()=>  ({ lv:"INFO",  src:"pipeline.sequential", msg:`Stage ${["coder","designer","assessor","finaliser"][Math.floor(Math.random()*4)]} | score=0.${73+Math.floor(Math.random()*20)}` }),
  ()=>  ({ lv:"EVENT", src:"memory.exp_lib",      msg:`Experience recorded ✓ | score=0.${75+Math.floor(Math.random()*20)}` }),
  ()=>  ({ lv:"WARN",  src:"utils.monitoring",    msg:`CPU=${Math.floor(55+Math.random()*25)}% RAM=${Math.floor(28+Math.random()*20)}%` }),
  ()=>  ({ lv:"INFO",  src:"skills.registry",     msg:"Fleet-wide skill inject: heuristic_score" }),
];

const SEED_GOALS = [
  { id:"g-01", desc:"Run self-evaluation on experience library",  pri:1, status:"executing",  pipe:false },
  { id:"g-02", desc:"Build markdown task-tracker CLI",            pri:2, status:"executing",  pipe:true  },
  { id:"g-03", desc:"Identify top 3 capability gaps",            pri:3, status:"planning",   pipe:false },
  { id:"g-04", desc:"Optimize memory retrieval latency",         pri:5, status:"done",       pipe:false },
];

const STAGE_META = [
  { key:"planning",  c:"rgba(200,160,30,0.9)"  },
  { key:"executing", c:"rgba(180,180,180,0.9)" },
  { key:"done",      c:"rgba(200,200,200,0.6)" },
  { key:"error",     c:"rgba(180,30,30,0.9)"   },
];

// ═══════════════════════════════════════════════════════════════════════════════
// UI HELPERS — all in pure void+white+red palette
// ═══════════════════════════════════════════════════════════════════════════════
const ts = () => new Date().toTimeString().slice(0,8);

// Glass panel: near-transparent black, white 0.08 border
function Panel({ children, style = {}, glow = false }) {
  return (
    <div style={{
      background: "rgba(0,0,0,0.72)",
      backdropFilter: "blur(18px)",
      border: `1px solid rgba(255,255,255,${glow ? "0.18" : "0.08"})`,
      borderRadius: 4,
      boxShadow: glow ? "0 0 24px rgba(255,255,255,0.05), inset 0 0 20px rgba(0,0,0,0.5)" : "none",
      ...style,
    }}>
      {children}
    </div>
  );
}

function PHead({ children, alert = false }) {
  return (
    <div style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase",
                  letterSpacing: ".18em", color: alert ? "rgba(200,60,60,0.8)" : "rgba(255,255,255,0.3)",
                  display: "flex", alignItems: "center", gap: 8 }}>
      {children}
    </div>
  );
}

// Thin horizontal rule
const HR = () => <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0" }} />;

function Dot({ alert = false, pulse = false }) {
  return (
    <span style={{
      width: 5, height: 5, borderRadius: "50%", display: "inline-block", flexShrink: 0,
      background: alert ? D.red : D.nodeFill,
      boxShadow: alert ? `0 0 8px ${D.redGlow}` : "0 0 6px rgba(255,255,255,0.5)",
      animation: pulse ? "siPulse 2s infinite" : "none",
    }} />
  );
}

function StatusRing({ alert, idle }) {
  const c = alert ? D.red : idle ? "rgba(100,100,100,0.4)" : "rgba(255,255,255,0.7)";
  return (
    <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0,
                   border: `1px solid ${c}`, background: "transparent",
                   boxShadow: alert ? `0 0 6px ${D.redGlow}` : "none" }} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANELS
// ═══════════════════════════════════════════════════════════════════════════════

function VitalsStrip({ cpu, ram, agents, studyCycles, pipeRuns, iteration }) {
  const items = [
    { l:"CPU",      v:`${cpu.toFixed(0)}%`,   alert: cpu > 78 },
    { l:"RAM",      v:`${ram.toFixed(0)}%`,   alert: ram > 82 },
    { l:"Agents",   v:`${agents}`,            alert: false    },
    { l:"Studies",  v:`#${studyCycles}`,      alert: false    },
    { l:"Pipelines",v:`${pipeRuns}`,          alert: false    },
    { l:"Iteration",v:`${iteration}`,         alert: false    },
  ];
  return (
    <div style={{ display: "flex", gap: 1 }}>
      {items.map(item => (
        <Panel key={item.l} style={{ flex: 1, padding: "10px 14px", textAlign: "center" }}>
          <div style={{ fontFamily: D.mono, fontSize: 8.5, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 5 }}>{item.l}</div>
          <div style={{ fontFamily: D.mono, fontSize: 20, fontWeight: 700,
                        color: item.alert ? D.red : "rgba(255,255,255,0.88)",
                        textShadow: item.alert ? `0 0 12px ${D.redGlow}` : "0 0 10px rgba(255,255,255,0.2)" }}>
            {item.v}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function FleetPanel({ agents }) {
  return (
    <Panel style={{ padding: "14px 16px" }}>
      <PHead>Agent Fleet</PHead>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {agents.map(a => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10,
                                   padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <StatusRing alert={a.alert} idle={a.status === "idle"} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10.5,
                            color: a.alert ? "rgba(200,60,60,0.9)" : "rgba(255,255,255,0.75)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.id}
              </div>
              <div style={{ fontFamily: D.mono, fontSize: 8.5, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: ".1em" }}>{a.role}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, color: a.score < 0.65 ? "rgba(200,60,60,0.8)" : "rgba(255,255,255,0.55)" }}>{a.score.toFixed(2)}</div>
              <div style={{ fontFamily: D.mono, fontSize: 8.5, color: "rgba(255,255,255,0.2)" }}>{a.tasks}t</div>
            </div>
            {a.alert && <Dot alert pulse />}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function LogPanel({ logs, logRef }) {
  const LEVEL_C = {
    INFO:"rgba(200,200,200,0.6)", WARN:"rgba(200,60,60,0.85)",
    ERROR:"rgba(200,30,30,1)", EVENT:"rgba(255,255,255,0.85)", SPAWN:"rgba(180,180,180,0.8)", SYS:"rgba(100,100,100,0.6)",
  };
  return (
    <Panel style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <PHead>System Log</PHead>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Dot pulse /><span style={{ fontFamily: D.mono, fontSize: 8, color: "rgba(255,255,255,0.25)" }}>LIVE</span>
        </div>
      </div>
      <div style={{ height: 180, overflowY: "auto", padding: "8px 14px", scrollbarWidth: "none" }}>
        {logs.map(log => (
          <div key={log.id} style={{ display: "flex", gap: 8, fontFamily: D.mono, fontSize: 10, lineHeight: 1.75 }}>
            <span style={{ color: "rgba(255,255,255,0.2)", minWidth: 50, flexShrink: 0 }}>{log.ts}</span>
            <span style={{ minWidth: 42, fontWeight: 700, color: LEVEL_C[log.lv] || "rgba(200,200,200,0.7)", flexShrink: 0 }}>{log.lv}</span>
            <span style={{ minWidth: 110, color: "rgba(255,255,255,0.2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{log.src}</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{log.msg}</span>
          </div>
        ))}
        <div ref={logRef} />
      </div>
    </Panel>
  );
}

function SpawnConsole({ agents, onSpawn }) {
  const [input,      setInput]      = useState("");
  const [selfPrompt, setSelfPrompt] = useState(false);
  const [status,     setStatus]     = useState("idle");
  const [result,     setResult]     = useState(null);
  const [suggIdx,    setSuggIdx]    = useState(0);
  const inputRef = useRef(null);

  const SUGG = ["a web scraping researcher","a Python code engineer","a QA assessor","a UI designer","a meta-reflector"];
  useEffect(() => { const id = setInterval(() => setSuggIdx(i => (i+1) % SUGG.length), 3500); return () => clearInterval(id); }, []);

  const spawn = useCallback(() => {
    const desc = input.trim(); if (!desc || status === "thinking") return;
    setStatus("thinking"); setResult(null);
    setTimeout(() => {
      const d = desc.toLowerCase();
      let matched = "worker", conf = 0.1;
      const kws = {
        researcher:["research","web","search","explore"],code:["code","python","script","engineer"],
        designer:["design","ui","ux","visual"],assessor:["assess","qa","quality","audit"],
        finaliser:["final","deliver","ship"],reflection:["reflect","meta","introspect"],
      };
      for (const [t,ws] of Object.entries(kws)) {
        const h = ws.filter(w => d.includes(w)).length / ws.length;
        if (h > conf) { matched = t; conf = h; }
      }
      const exists = agents.find(a => a.id.startsWith(matched.slice(0,3)));
      if (exists) {
        setStatus("duplicate");
        setResult({ type:"duplicate", id:exists.id, archetype:matched });
      } else {
        const newId = `${matched.slice(0,3)}-${Math.random().toString(36).slice(2,6)}`;
        setStatus("spawned");
        setResult({ type:"spawned", id:newId, archetype:matched, conf, selfPrompt });
        onSpawn && onSpawn(newId, matched);
      }
      setInput("");
      setTimeout(() => { setStatus("idle"); setResult(null); }, 5000);
    }, 1600);
  }, [input, status, agents, selfPrompt, onSpawn]);

  const RC = {
    duplicate: "rgba(200,160,30,0.9)",
    spawned:   "rgba(200,200,200,0.85)",
    error:     "rgba(200,30,30,0.9)",
  };

  return (
    <Panel style={{ padding: "14px 16px" }}>
      <PHead>Agent Spawn Console</PHead>
      <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.2)", fontFamily: D.mono, fontSize: 11 }}>›</span>
          <input value={input} ref={inputRef} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") spawn(); if (e.key === "Tab") { e.preventDefault(); setInput(`a ${SUGG[suggIdx]}`); } }}
            disabled={status === "thinking"}
            placeholder={`"a ${SUGG[suggIdx]}"`}
            style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3,
                     padding: "8px 10px 8px 22px", fontFamily: D.mono, fontSize: 11, color: "rgba(255,255,255,0.8)",
                     boxSizing: "border-box", outline: "none" }}
            onFocus={e => e.target.style.borderColor = "rgba(255,255,255,0.25)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
          />
        </div>
        <button onClick={() => setSelfPrompt(s => !s)}
          style={{ padding: "0 10px", background: selfPrompt ? "rgba(255,255,255,0.08)" : "transparent",
                   border: `1px solid rgba(255,255,255,${selfPrompt ? ".2" : ".08"})`, borderRadius: 3,
                   color: "rgba(255,255,255,0.4)", fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", cursor: "pointer" }}>
          SP
        </button>
        <button onClick={spawn} disabled={!input.trim() || status === "thinking"}
          style={{ padding: "0 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                   borderRadius: 3, color: status === "thinking" ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)",
                   fontFamily: D.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".1em", cursor: "pointer" }}>
          {status === "thinking" ? "···" : "Spawn"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 10, padding: "9px 11px", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 3,
                      background: "rgba(255,255,255,0.02)", fontFamily: D.mono, fontSize: 10 }}>
          <div style={{ color: RC[result.type] || "rgba(200,200,200,0.8)", fontWeight: 700, marginBottom: 4 }}>
            {result.type === "duplicate" ? "⚠ Already exists" : result.type === "spawned" ? "○ Spawned" : "✕ Error"}
          </div>
          {result.type === "duplicate" && <div style={{ color: "rgba(255,255,255,0.35)" }}>{result.archetype} already in fleet: {result.id}</div>}
          {result.type === "spawned" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px", color: "rgba(255,255,255,0.35)", fontSize: 9.5 }}>
              <div><span style={{ color: "rgba(255,255,255,0.2)" }}>id </span>{result.id}</div>
              <div><span style={{ color: "rgba(255,255,255,0.2)" }}>type </span>{result.archetype}</div>
              <div><span style={{ color: "rgba(255,255,255,0.2)" }}>conf </span>{(result.conf * 100).toFixed(0)}%</div>
              {result.selfPrompt && <div style={{ color: "rgba(200,200,200,0.5)" }}>self-prompt queued</div>}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {["worker","researcher","code","designer","assessor","finaliser","reflection"].map(k => (
          <button key={k} onClick={() => { setInput(`a ${k} agent`); inputRef.current?.focus(); }}
            style={{ fontFamily: D.mono, fontSize: 8.5, color: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.03)",
                     border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, padding: "2px 8px", cursor: "pointer" }}
            onMouseEnter={e => e.target.style.color = "rgba(255,255,255,0.6)"}
            onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.22)"}>
            {k}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function GoalPanel({ goals, setGoals }) {
  const [newGoal, setNewGoal] = useState("");
  const [pri, setPri] = useState(3);

  const addGoal = e => {
    e.preventDefault();
    if (!newGoal.trim()) return;
    setGoals(g => [...g, { id:`g-${Date.now().toString(36)}`, desc:newGoal, pri, status:"planning", pipe:false }]);
    setNewGoal("");
  };

  const stageC = { planning:"rgba(200,160,30,0.7)", executing:"rgba(200,200,200,0.8)", done:"rgba(100,100,100,0.5)", error:"rgba(200,30,30,0.8)" };

  return (
    <Panel style={{ padding: "14px 16px" }}>
      <PHead>Goal Pipeline</PHead>
      <form onSubmit={addGoal} style={{ display: "flex", gap: 5, marginTop: 12, marginBottom: 10 }}>
        <input value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="Inject directive…"
          style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3,
                   padding: "7px 10px", fontFamily: D.mono, fontSize: 11, color: "rgba(255,255,255,0.75)", outline: "none" }} />
        <select value={pri} onChange={e => setPri(Number(e.target.value))}
          style={{ background: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3,
                   padding: "7px 6px", fontFamily: D.mono, fontSize: 9.5, color: "rgba(255,255,255,0.5)" }}>
          {[1,2,3,5,7,10].map(p => <option key={p} value={p}>P{p}</option>)}
        </select>
        <button type="submit" style={{ padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontFamily: D.mono, fontSize: 14 }}>＋</button>
      </form>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 220, overflowY: "auto", scrollbarWidth: "none" }}>
        {goals.map(g => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: stageC[g.status] || "rgba(200,200,200,0.5)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10.5, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.desc}</div>
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {g.pipe && <span style={{ fontFamily: D.mono, fontSize: 8, color: "rgba(180,180,180,0.4)" }}>⑂</span>}
              <span style={{ fontFamily: D.mono, fontSize: 8.5, color: stageC[g.status] || "rgba(150,150,150,0.5)", textTransform: "uppercase" }}>{g.status}</span>
              <span style={{ fontFamily: D.mono, fontSize: 8.5, color: "rgba(255,255,255,0.18)" }}>P{g.pri}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TaskPanel({ agents }) {
  const [mode,       setMode]       = useState("text");
  const [task,       setTask]       = useState("");
  const [url,        setUrl]        = useState("");
  const [agentId,    setAgentId]    = useState("auto");
  const [dragging,   setDragging]   = useState(false);
  const [files,      setFiles]      = useState([]);
  const [status,     setStatus]     = useState("idle");
  const [history,    setHistory]    = useState([]);
  const [agentOpen,  setAgentOpen]  = useState(false);
  const fileRef = useRef(null);
  const agentDDRef = useRef(null);

  useEffect(() => {
    const h = e => { if (agentDDRef.current && !agentDDRef.current.contains(e.target)) setAgentOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const fmtSz = b => b < 1024 ? `${b}B` : `${(b/1024).toFixed(1)}KB`;

  const dispatch = () => {
    if (!task.trim() && !url.trim() && !files.length) return;
    setStatus("sending");
    setTimeout(() => {
      const tid = `task-${Math.random().toString(36).slice(2,8)}`;
      const routed = agentId === "auto" ? `orch→g-${Math.random().toString(36).slice(2,5)}` : agentId;
      setHistory(h => [{ id:tid, ts:ts(), task:task||url||files[0]?.name||"files", routed }, ...h].slice(0,8));
      setTask(""); setUrl(""); setFiles([]); setMode("text"); setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    }, 1200);
  };

  const AGENTS_LIST = [
    { id:"auto", label:"Auto-route via Orchestrator" },
    ...agents.map(a => ({ id:a.id, label:`${a.id} · ${a.role}` })),
  ];
  const selAgent = AGENTS_LIST.find(a => a.id === agentId) || AGENTS_LIST[0];

  return (
    <Panel style={{ padding: "14px 16px" }}>
      <PHead>Task Dispatch</PHead>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Agent selector */}
        <div style={{ position: "relative" }} ref={agentDDRef}>
          <button onClick={() => setAgentOpen(o => !o)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                     background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3,
                     padding: "8px 10px", fontFamily: D.mono, fontSize: 10.5, color: "rgba(255,255,255,0.6)", cursor: "pointer", textAlign: "left" }}>
            <span>○ {selAgent.label}</span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>▾</span>
          </button>
          {agentOpen && (
            <div style={{ position: "absolute", zIndex: 50, width: "100%", top: "calc(100% + 3px)", background: "#050505",
                          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, overflow: "hidden" }}>
              {AGENTS_LIST.map(a => (
                <button key={a.id} onClick={() => { setAgentId(a.id); setAgentOpen(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "8px 10px", fontFamily: D.mono, fontSize: 10.5,
                           color: agentId === a.id ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)",
                           background: agentId === a.id ? "rgba(255,255,255,0.06)" : "transparent",
                           border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                  onMouseLeave={e => e.currentTarget.style.background = agentId === a.id ? "rgba(255,255,255,0.06)" : "transparent"}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 1, background: "rgba(255,255,255,0.03)", padding: 3, borderRadius: 3 }}>
          {[["text","📝","Text"],["url","🔗","URL"],["file","📂","Files"]].map(([k,ic,lb]) => (
            <button key={k} onClick={() => setMode(k)}
              style={{ flex: 1, padding: "6px 0", fontFamily: D.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".1em",
                       background: mode===k ? "rgba(255,255,255,0.08)" : "transparent", border: "none",
                       color: mode===k ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)", borderRadius: 2, cursor: "pointer" }}>
              {ic} {lb}
            </button>
          ))}
        </div>

        {/* Text */}
        {mode === "text" && (
          <textarea value={task} onChange={e => setTask(e.target.value)}
            onKeyDown={e => { if ((e.metaKey||e.ctrlKey) && e.key==="Enter") dispatch(); }}
            placeholder={"Describe the task…\n• Summarise capability gaps\n• Write a CSV parser\n• Review pipeline output"}
            rows={5} style={{ width: "100%", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3,
                              padding: "9px 11px", fontFamily: D.mono, fontSize: 11, color: "rgba(255,255,255,0.7)", resize: "none", outline: "none", boxSizing: "border-box", lineHeight: 1.65 }} />
        )}

        {/* URL */}
        {mode === "url" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12 }}>🔗</span>
              <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://docs.example.com/api"
                style={{ width: "100%", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3,
                         padding: "9px 10px 9px 28px", fontFamily: D.mono, fontSize: 11, color: "rgba(255,255,255,0.7)", outline: "none", boxSizing: "border-box" }} />
            </div>
            <textarea value={task} onChange={e => setTask(e.target.value)} placeholder="What to do with this URL…" rows={2}
              style={{ width: "100%", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3,
                       padding: "9px 11px", fontFamily: D.mono, fontSize: 11, color: "rgba(255,255,255,0.7)", resize: "none", outline: "none", boxSizing: "border-box" }} />
          </div>
        )}

        {/* Files */}
        {mode === "file" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div onDrop={e => { e.preventDefault(); setDragging(false); setFiles(p => [...p, ...Array.from(e.dataTransfer.files)]); }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed rgba(255,255,255,${dragging?".3":".1"})`, borderRadius: 3, padding: "28px 16px", textAlign: "center",
                       background: dragging ? "rgba(255,255,255,0.04)" : "transparent", cursor: "pointer", transition: "all .2s" }}>
              <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => setFiles(p => [...p, ...Array.from(e.target.files || [])])} />
              <div style={{ fontSize: 24, marginBottom: 7 }}>📂</div>
              <div style={{ fontFamily: D.mono, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Drag & drop or click to browse</div>
              <div style={{ fontFamily: D.mono, fontSize: 9.5, color: "rgba(255,255,255,0.15)", marginTop: 4 }}>.md .txt .py .json .csv .pdf · max 10MB</div>
            </div>
            {files.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {files.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3, padding: "4px 8px" }}>
                    <span style={{ fontFamily: D.mono, fontSize: 9.5, color: "rgba(255,255,255,0.5)" }}>{f.name}</span>
                    <span style={{ fontFamily: D.mono, fontSize: 8.5, color: "rgba(255,255,255,0.2)" }}>{fmtSz(f.size)}</span>
                    <button onClick={() => setFiles(p => p.filter((_,j) => j !== i))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dispatch row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: D.mono, fontSize: 9, color: "rgba(255,255,255,0.2)" }}>⌘↵</span>
          <button onClick={dispatch}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, padding: "8px 18px",
                     background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                     borderRadius: 3, color: status === "sending" ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.75)",
                     fontFamily: D.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", cursor: "pointer" }}>
            {status === "sending" ? "···" : status === "done" ? "○ Dispatched" : "▸ Dispatch"}
          </button>
        </div>

        {/* History */}
        {history.length > 0 && (
          <>
            <HR />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {history.slice(0, 5).map(h => (
                <div key={h.id} style={{ display: "flex", gap: 8, fontFamily: D.mono, fontSize: 9.5, color: "rgba(255,255,255,0.28)" }}>
                  <span style={{ minWidth: 50, flexShrink: 0 }}>{h.ts}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.task.slice(0,40)}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>→ {h.routed.slice(0,16)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function ApprovalModal({ pending, onDecide }) {
  const [t, setT] = useState(30);
  useEffect(() => {
    if (!pending) return;
    setT(30);
    const id = setInterval(() => setT(v => { if (v<=1) { onDecide(true); return 0; } return v-1; }), 1000);
    return () => clearInterval(id);
  }, [pending]);
  if (!pending) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#050505", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: 24, maxWidth: 380, width: "calc(100% - 32px)", boxShadow: "0 0 60px rgba(200,30,30,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: D.red, boxShadow: `0 0 10px ${D.redGlow}`, animation: "siPulse 1s infinite" }} />
          <div style={{ fontFamily: D.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: ".15em", color: "rgba(200,60,60,0.8)" }}>Human Approval Required</div>
        </div>
        <div style={{ fontFamily: D.mono, fontSize: 9.5, color: "rgba(255,255,255,0.3)", marginBottom: 12, textTransform: "uppercase", letterSpacing: ".12em" }}>
          {pending.action === "spawn" ? "Agent Spawn Request" : pending.action}
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, padding: 10, marginBottom: 16 }}>
          <pre style={{ fontFamily: D.mono, fontSize: 9.5, color: "rgba(255,255,255,0.4)", margin: 0 }}>{JSON.stringify(pending.details, null, 2)}</pre>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontFamily: D.mono, fontSize: 9, color: "rgba(255,255,255,0.2)" }}>auto in {t}s</span>
          <div style={{ height: 2, width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 1, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(t/30)*100}%`, background: "rgba(200,160,30,0.6)", transition: "width 1s linear" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["✕ Veto", false, "rgba(200,30,30,0.6)"], ["○ Approve", true, "rgba(180,180,180,0.5)"]].map(([label, val, c]) => (
            <button key={label} onClick={() => onDecide(val)}
              style={{ flex: 1, padding: "9px 0", background: "transparent", border: `1px solid ${c}`,
                       borderRadius: 3, color: c, fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export default function SIOrbitDashboard() {
  const [tick,       setTick]       = useState(0);
  const [iteration,  setIteration]  = useState(42);
  const [cpu,        setCpu]        = useState(68);
  const [ram,        setRam]        = useState(41);
  const [studyCyc,   setStudyCyc]   = useState(3);
  const [pipeRuns,   setPipeRuns]   = useState(1);
  const [liveCount,  setLiveCount]  = useState(3);
  const [logs,       setLogs]       = useState(SEED_LOGS);
  const [agents,     setAgents]     = useState(SEED_AGENTS);
  const [goals,      setGoals]      = useState(SEED_GOALS);
  const [approval,   setApproval]   = useState(null);
  const [activeTab,  setActiveTab]  = useState("fleet");
  const logBottom = useRef(null);

  useEffect(() => { logBottom.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);

  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t+1); setIteration(i => i+1); setLiveCount(n => n+1);
      setCpu(c => Math.min(90, Math.max(28, c + (Math.random()-.46)*7)));
      setRam(r => Math.min(75, Math.max(28, r + (Math.random()-.5)*3)));
      if (Math.random() > .38) {
        const tmpl = LIVE_POOL[Math.floor(Math.random()*LIVE_POOL.length)];
        const e = tmpl(liveCount);
        setLogs(l => [...l.slice(-50), { id:Date.now(), ts:ts(), ...e }]);
      }
      if (Math.random() > .85) setStudyCyc(s => s+1);
      if (Math.random() > .8) {
        const stats = ["running","running","running","idle","alert"];
        setAgents(prev => prev.map((a,i) => i===0?a:{ ...a, status:stats[Math.floor(Math.random()*stats.length)], alert:Math.random()>.75 }));
      }
    }, 1600);
    return () => clearInterval(id);
  }, [liveCount]);

  useEffect(() => {
    const id = setTimeout(() => setApproval({ action:"spawn", details:{ role:"researcher", reason:"High task load detected" }}), 5000);
    return () => clearTimeout(id);
  }, []);

  const handleSpawn = (newId, archetype) => {
    const newAgent = { id:newId, role:archetype, status:"running", score:0.5, tasks:0, alert:false };
    setAgents(p => [...p, newAgent]);
    setLogs(l => [...l, { id:Date.now(), ts:ts(), lv:"SPAWN", src:"agent-factory", msg:`Agent spawned | id=${newId} | type=${archetype}` }]);
    setPipeRuns(p => p+1);
  };

  const TABS = [
    { key:"fleet",   label:"Fleet"    },
    { key:"tasks",   label:"Tasks"    },
    { key:"goals",   label:"Goals"    },
    { key:"log",     label:"Log"      },
  ];

  const activeAgents = agents.filter(a => a.status !== "idle").length;

  return (
    <div style={{ minHeight: "100vh", background: D.void, color: "rgba(255,255,255,0.7)", position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes siPulse { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width:3px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px }
        button,input,textarea,select { font-family:inherit }
        input,textarea,select { outline:none }
        button { transition: opacity .15s }
        button:hover { opacity:.8 }
      `}</style>

      {/* ── The orbital neural canvas — full screen background ─────────────── */}
      <OrbitalCanvas agents={agents} tick={tick} />

      {/* ── Fixed top bar ─────────────────────────────────────────────────── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 30,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 48,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        {/* Identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", boxShadow: "0 0 14px rgba(255,255,255,0.8)", animation: "siPulse 3s infinite" }} />
          <div>
            <div style={{ fontFamily: D.mono, fontSize: 11, fontWeight: 700, letterSpacing: ".2em", color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>
              Synthetic Intelligence
            </div>
            <div style={{ fontFamily: D.mono, fontSize: 8, color: "rgba(255,255,255,0.22)", letterSpacing: ".14em" }}>
              EMBODIMENT v3.0 · ITER #{iteration} · 84 FILES · 46/46 TESTS
            </div>
          </div>
        </div>

        {/* Status indicators */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {[
            { l:"LOOP", v:"ACTIVE",           c:"rgba(255,255,255,0.55)" },
            { l:"CPU",  v:`${cpu.toFixed(0)}%`, c:cpu>78?"rgba(200,40,40,0.8)":"rgba(255,255,255,0.4)" },
            { l:"AGENTS",v:`${activeAgents}/${agents.length}`, c:"rgba(255,255,255,0.4)" },
          ].map(s => (
            <div key={s.l} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: D.mono, fontSize: 7.5, color: "rgba(255,255,255,0.18)", letterSpacing: ".14em", textTransform: "uppercase" }}>{s.l}</div>
              <div style={{ fontFamily: D.mono, fontSize: 10.5, color: s.c, letterSpacing: ".1em" }}>{s.v}</div>
            </div>
          ))}
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.07)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "siPulse 2s infinite" }} />
            <span style={{ fontFamily: D.mono, fontSize: 8.5, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: ".14em" }}>Neural Link</span>
          </div>
        </div>
      </div>

      {/* ── Content overlay — right side panels ───────────────────────────── */}
      <div style={{
        position: "relative", zIndex: 10,
        paddingTop: 56, paddingBottom: 20,
        display: "flex", flexDirection: "column",
        minHeight: "100vh",
        paddingLeft: "55%",  // leave left 55% for the orbital canvas
        paddingRight: 16,
      }}>

        {/* Vitals strip */}
        <div style={{ marginBottom: 1 }}>
          <VitalsStrip cpu={cpu} ram={ram} agents={activeAgents} studyCycles={studyCyc} pipeRuns={pipeRuns} iteration={iteration} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 1, marginBottom: 1 }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: "9px 0", fontFamily: D.mono, fontSize: 9,
                textTransform: "uppercase", letterSpacing: ".15em", border: "none", cursor: "pointer",
                background: activeTab===tab.key ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.65)",
                backdropFilter: "blur(18px)",
                borderBottom: `1px solid rgba(255,255,255,${activeTab===tab.key ? ".18" : ".05"})`,
                color: activeTab===tab.key ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.22)",
                transition: "all .2s",
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
          {activeTab === "fleet" && (
            <>
              <FleetPanel agents={agents} />
              <SpawnConsole agents={agents} onSpawn={handleSpawn} />
            </>
          )}
          {activeTab === "tasks"  && <TaskPanel agents={agents} />}
          {activeTab === "goals"  && <GoalPanel goals={goals} setGoals={setGoals} />}
          {activeTab === "log"    && <LogPanel logs={logs} logRef={logBottom} />}
        </div>

        {/* Footer */}
        <div style={{ paddingTop: 12, marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontFamily: D.mono, fontSize: 7.5, color: "rgba(255,255,255,0.14)", letterSpacing: ".12em", textTransform: "uppercase" }}>
            LangGraph · ChromaDB · Ollama · FastAPI · Next.js 14
          </div>
          <div style={{ fontFamily: D.mono, fontSize: 7.5, color: "rgba(255,255,255,0.14)", letterSpacing: ".12em", textTransform: "uppercase" }}>
            Study#{studyCyc} · Pipeline#{pipeRuns}
          </div>
        </div>
      </div>

      {/* ── Approval gate ──────────────────────────────────────────────────── */}
      <ApprovalModal pending={approval} onDecide={approved => {
        setApproval(null);
        setLogs(l => [...l, { id:Date.now(), ts:ts(), lv:approved?"EVENT":"WARN", src:"human-gate", msg:approved?"✓ Approved: spawn":" ✕ Vetoed: spawn" }]);
      }} />
    </div>
  );
}
