import { useState, useEffect, useRef, useCallback } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:"#020617", panel:"#0f172a", border:"#1e293b",
  cyan:"#22d3ee", emerald:"#34d399", violet:"#a78bfa",
  rose:"#fb7185", amber:"#fbbf24", pink:"#ec4899",
};
const MONO = "'JetBrains Mono','Fira Code',monospace";
const SANS = "Inter,system-ui,sans-serif";

// ── Shared helpers ─────────────────────────────────────────────────────────────
const ts = () => new Date().toTimeString().slice(0,8);
const fmtSize = b => b<1024?`${b}B`:b<1048576?`${(b/1024).toFixed(1)}KB`:`${(b/1048576).toFixed(1)}MB`;

function Panel({ children, style = {} }) {
  return (
    <div style={{ background:"rgba(15,23,42,0.65)", backdropFilter:"blur(12px)",
                  border:`1px solid ${C.border}`, borderRadius:12, ...style }}>
      {children}
    </div>
  );
}
function PHead({ children, icon, color = C.cyan }) {
  return (
    <div style={{ fontFamily:MONO, fontSize:11, textTransform:"uppercase",
                  letterSpacing:".1em", color:"#94a3b8", display:"flex",
                  alignItems:"center", gap:8 }}>
      <span style={{ color }}>{icon}</span>{children}
    </div>
  );
}
function Bar({ pct, color, h = 4 }) {
  return (
    <div style={{ height:h, background:C.border, borderRadius:2, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${Math.min(pct,100)}%`, background:color,
                    borderRadius:2, boxShadow:`0 0 6px ${color}80`, transition:"width 1s ease" }} />
    </div>
  );
}
function Chip({ children, color }) {
  return (
    <span style={{ fontFamily:MONO, fontSize:8.5, color, background:`${color}18`,
                   border:`1px solid ${color}38`, borderRadius:3, padding:"1px 6px",
                   textTransform:"uppercase" }}>
      {children}
    </span>
  );
}

// ── Particle canvas ───────────────────────────────────────────────────────────
function LiveBG() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); let id, pts = [];
    const mouse = { x:-9e4, y:-9e4 };
    const resize = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; };
    resize();
    const colors = ["rgba(34,211,238,.2)","rgba(52,211,153,.13)","rgba(167,139,250,.13)"];
    const init = () => { pts = Array.from({length:Math.floor((cv.width*cv.height)/13000)}, () => ({
      x:Math.random()*cv.width, y:Math.random()*cv.height,
      vx:(Math.random()-.5)*.28, vy:(Math.random()-.5)*.28,
      r:Math.random()*1.7+.6, c:colors[Math.floor(Math.random()*3)],
    })); };
    init();
    const mm = e => { const r=cv.getBoundingClientRect(); mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top; };
    cv.addEventListener("mousemove", mm);
    const draw = () => {
      ctx.clearRect(0,0,cv.width,cv.height);
      for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
        if (d<110) { ctx.beginPath(); ctx.strokeStyle=`rgba(34,211,238,${.07*(1-d/110)})`; ctx.lineWidth=.5; ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.stroke(); }
      }
      pts.forEach(p => {
        p.x+=p.vx; p.y+=p.vy;
        const dx=p.x-mouse.x, dy=p.y-mouse.y, d=Math.sqrt(dx*dx+dy*dy);
        if (d<130) { const f=(130-d)/130; p.vx+=(dx/d)*f*.33; p.vy+=(dy/d)*f*.33; }
        p.vx*=.99; p.vy*=.99;
        if(p.x<0)p.x=cv.width; if(p.x>cv.width)p.x=0;
        if(p.y<0)p.y=cv.height; if(p.y>cv.height)p.y=0;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=p.c; ctx.fill();
      });
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(id); cv.removeEventListener("mousemove",mm); };
  }, []);
  return <canvas ref={ref} style={{ position:"absolute",inset:0,width:"100%",height:"100%",opacity:.6,pointerEvents:"none" }} />;
}

// ════════════════════════════════════════════════════════════════════════════════
// SI CALENDAR
// ════════════════════════════════════════════════════════════════════════════════
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const TYPE_META = {
  task:     { color:C.cyan,    label:"Task"     },
  goal:     { color:C.violet,  label:"Goal"     },
  meeting:  { color:C.emerald, label:"Meeting"  },
  reminder: { color:C.amber,   label:"Reminder" },
};

function SICalendar() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0,10);

  const [view,     setView]     = useState({ y:now.getFullYear(), m:now.getMonth() });
  const [selected, setSelected] = useState(todayStr);
  const [creating, setCreating] = useState(false);
  const [form,     setForm]     = useState({ title:"", time:"09:00", type:"task" });
  const [events,   setEvents]   = useState(() => {
    const d = (off) => { const dd=new Date(); dd.setDate(dd.getDate()+off); return dd.toISOString().slice(0,10); };
    return [
      { id:"s1", title:"Study Cycle #4",    date:d(0),  time:"10:00", type:"task",    color:C.cyan    },
      { id:"s2", title:"Pipeline Run",      date:d(0),  time:"14:30", type:"goal",    color:C.violet  },
      { id:"s3", title:"Human Review",      date:d(1),  time:"09:00", type:"meeting", color:C.emerald },
      { id:"s4", title:"Improvement Cycle", date:d(2),  time:"11:00", type:"task",    color:C.cyan    },
      { id:"s5", title:"Deploy Checkpoint", date:d(5),  time:"16:00", type:"reminder",color:C.amber   },
      { id:"s6", title:"Model Evaluation",  date:d(7),  time:"13:00", type:"goal",    color:C.violet  },
    ];
  });

  const days = new Date(view.y, view.m+1, 0).getDate();
  const firstDay = new Date(view.y, view.m, 1).getDay();
  const eventsOn = d => events.filter(e => e.date === d);
  const selEvents = eventsOn(selected);

  const addEvent = () => {
    if (!form.title.trim()) return;
    const meta = TYPE_META[form.type];
    setEvents(p => [...p, { id:`e${Date.now()}`, title:form.title, date:selected, time:form.time, type:form.type, color:meta.color }]);
    setCreating(false); setForm({ title:"", time:"09:00", type:"task" });
  };

  const dateStr = (day) => `${view.y}-${String(view.m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

  return (
    <Panel>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 18px", borderBottom:`1px solid ${C.border}60` }}>
        <PHead icon="📅" color={C.cyan}>SI Calendar</PHead>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={()=>setView(v=>{ const d=new Date(v.y,v.m-1); return {y:d.getFullYear(),m:d.getMonth()}; })}
            style={{ padding:"3px 8px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:5, color:"#64748b", cursor:"pointer", fontFamily:MONO, fontSize:12 }}>‹</button>
          <span style={{ fontFamily:MONO, fontSize:11, color:"#cbd5e1", minWidth:130, textAlign:"center" }}>{MONTHS[view.m]} {view.y}</span>
          <button onClick={()=>setView(v=>{ const d=new Date(v.y,v.m+1); return {y:d.getFullYear(),m:d.getMonth()}; })}
            style={{ padding:"3px 8px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:5, color:"#64748b", cursor:"pointer", fontFamily:MONO, fontSize:12 }}>›</button>
        </div>
      </div>

      <div style={{ display:"flex" }}>
        {/* Grid */}
        <div style={{ flex:1, padding:"12px 14px" }}>
          {/* Day labels */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
            {DAYS.map(d => <div key={d} style={{ textAlign:"center", fontFamily:MONO, fontSize:8.5, color:"#475569", textTransform:"uppercase", padding:"3px 0" }}>{d}</div>)}
          </div>
          {/* Date cells */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
            {Array.from({length:firstDay}).map((_,i) => <div key={`g${i}`}/>)}
            {Array.from({length:days}).map((_,i) => {
              const day = i+1, ds = dateStr(day), dayEvts = eventsOn(ds);
              const isToday = ds===todayStr, isSel = ds===selected;
              return (
                <button key={day} onClick={() => setSelected(ds)}
                  style={{ borderRadius:7, padding:"5px 3px", minHeight:52, textAlign:"left",
                           border:`1px solid ${isSel?`${C.cyan}50`:isToday?`${C.violet}40`:"transparent"}`,
                           background:isSel?`${C.cyan}0a`:isToday?`${C.violet}08`:"transparent",
                           cursor:"pointer", transition:"all .15s" }}>
                  <div style={{ fontFamily:MONO, fontSize:10.5, fontWeight:isSel||isToday?700:400,
                                color:isSel?C.cyan:isToday?C.violet:"#64748b", marginBottom:2 }}>{day}</div>
                  {dayEvts.slice(0,2).map(e => (
                    <div key={e.id} style={{ fontFamily:MONO, fontSize:7.5, borderRadius:3, padding:"1px 4px",
                                            background:`${e.color}18`, color:e.color, marginBottom:1,
                                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.title}</div>
                  ))}
                  {dayEvts.length>2 && <div style={{ fontFamily:MONO, fontSize:7.5, color:"#475569" }}>+{dayEvts.length-2}</div>}
                </button>
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display:"flex", gap:12, marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}40` }}>
            {Object.entries(TYPE_META).map(([k,v]) => (
              <div key={k} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:v.color, display:"inline-block" }}/>
                <span style={{ fontFamily:MONO, fontSize:8.5, color:"#475569" }}>{v.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Day detail panel */}
        <div style={{ width:200, borderLeft:`1px solid ${C.border}60`, padding:14, display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontFamily:MONO, fontSize:9.5, color:"#94a3b8" }}>{selected}</span>
            <button onClick={() => setCreating(true)} style={{ fontFamily:MONO, fontSize:9, color:C.cyan, background:"transparent", border:"none", cursor:"pointer" }}>＋ New</button>
          </div>

          <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:7 }}>
            {selEvents.length===0 && !creating && (
              <div style={{ fontFamily:MONO, fontSize:9.5, color:"#334155", textAlign:"center", paddingTop:20 }}>No events</div>
            )}
            {selEvents.map(e => (
              <div key={e.id} style={{ borderRadius:8, padding:"9px 10px", border:`1px solid ${e.color}35`, background:`${e.color}0d` }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:4 }}>
                  <span style={{ fontFamily:SANS, fontSize:11, color:"#e2e8f0", lineHeight:1.3, flex:1 }}>{e.title}</span>
                  <button onClick={() => setEvents(p=>p.filter(ev=>ev.id!==e.id))} style={{ color:"#475569", background:"none", border:"none", cursor:"pointer", fontSize:11, lineHeight:1, flexShrink:0 }}>✕</button>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6 }}>
                  <span style={{ fontFamily:MONO, fontSize:9, color:e.color }}>🕐 {e.time}</span>
                  <span style={{ fontFamily:MONO, fontSize:8, color:"#475569" }}>{TYPE_META[e.type]?.label}</span>
                </div>
              </div>
            ))}

            {/* Create form */}
            {creating && (
              <div style={{ border:`1px solid ${C.cyan}35`, borderRadius:8, padding:10, background:`${C.cyan}07`, display:"flex", flexDirection:"column", gap:7 }}>
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} autoFocus
                  placeholder="Event title" style={{ background:"#020617", border:`1px solid ${C.border}`, borderRadius:5, padding:"6px 8px", fontFamily:MONO, fontSize:10.5, color:"#e2e8f0", width:"100%", boxSizing:"border-box" }}
                  onKeyDown={e=>{ if(e.key==="Enter") addEvent(); }}
                />
                <div style={{ display:"flex", gap:5 }}>
                  <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}
                    style={{ flex:1, background:"#020617", border:`1px solid ${C.border}`, borderRadius:5, padding:"5px 6px", fontFamily:MONO, fontSize:10, color:"#cbd5e1" }}/>
                  <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}
                    style={{ flex:1, background:"#020617", border:`1px solid ${C.border}`, borderRadius:5, padding:"5px 4px", fontFamily:MONO, fontSize:9.5, color:"#cbd5e1" }}>
                    {Object.keys(TYPE_META).map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display:"flex", gap:5 }}>
                  <button onClick={()=>setCreating(false)} style={{ flex:1, padding:"6px 0", fontFamily:MONO, fontSize:9.5, color:"#64748b", background:"transparent", border:`1px solid ${C.border}`, borderRadius:5, cursor:"pointer" }}>Cancel</button>
                  <button onClick={addEvent} style={{ flex:1, padding:"6px 0", fontFamily:MONO, fontSize:9.5, color:C.cyan, background:`${C.cyan}12`, border:`1px solid ${C.cyan}40`, borderRadius:5, cursor:"pointer" }}>Save</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MARKDOWN EDITOR
// ════════════════════════════════════════════════════════════════════════════════
const STARTER_MD = `# Welcome to the SI Markdown Editor

Write, edit, and manage documents with **live preview**.

## Features
- Split-pane editing with live render
- Drag & drop file import
- Download as \`.md\`
- Auto-saved to document library

\`\`\`python
# Code blocks with syntax highlighting
def greet(name: str) -> str:
    return f"Hello, {name}!"
\`\`\`

> Blockquotes, **bold**, *italic*, ~~strikethrough~~ all supported.

| Feature        | Status |
|----------------|--------|
| Live preview   | ✓ Active |
| File import    | ✓ Active |
| API sync       | ✓ Active |
`;

function parseMarkdown(md) {
  let h = md
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/```(\w*)\n([\s\S]*?)```/gm,(_,l,c)=>`<pre class="si-pre"><code>${c.trim()}</code></pre>`)
    .replace(/^######\s(.+)$/gm,"<h6>$1</h6>").replace(/^#####\s(.+)$/gm,"<h5>$1</h5>")
    .replace(/^####\s(.+)$/gm,"<h4>$1</h4>").replace(/^###\s(.+)$/gm,"<h3>$1</h3>")
    .replace(/^##\s(.+)$/gm,"<h2>$1</h2>").replace(/^#\s(.+)$/gm,"<h1>$1</h1>")
    .replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/gm, match=>{
      const lines=match.trim().split("\n");
      const ths=lines[0].split("|").filter(Boolean).map(h=>`<th>${h.trim()}</th>`).join("");
      const rows=lines.slice(2).map(r=>{ const cs=r.split("|").filter(Boolean).map(c=>`<td>${c.trim()}</td>`).join(""); return `<tr>${cs}</tr>`; }).join("");
      return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    .replace(/^&gt;\s(.+)$/gm,"<blockquote>$1</blockquote>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/~~(.+?)~~/g,"<del>$1</del>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>')
    .replace(/^---$/gm,"<hr/>")
    .replace(/^[-*+]\s(.+)$/gm,"<li>$1</li>")
    .replace(/^\d+\.\s(.+)$/gm,"<li>$1</li>")
    .replace(/\n\n/g,"</p><p>").replace(/\n/g,"<br/>");
  return `<p>${h}</p>`;
}

function MarkdownEditor() {
  const [docs,     setDocs]     = useState([{ id:"d1", title:"Welcome", content:STARTER_MD, updated:Date.now() }]);
  const [activeId, setActiveId] = useState("d1");
  const [content,  setContent]  = useState(STARTER_MD);
  const [title,    setTitle]    = useState("Welcome");
  const [mode,     setMode]     = useState("split"); // edit|split|preview
  const [sidebar,  setSidebar]  = useState(true);
  const [dragging, setDragging] = useState(false);
  const [saved,    setSaved]    = useState(false);
  const taRef   = useRef(null);
  const fileRef = useRef(null);
  const saveT   = useRef(null);

  const words = content.trim().split(/\s+/).filter(Boolean).length;

  // Debounced auto-save
  useEffect(() => {
    clearTimeout(saveT.current); setSaved(false);
    saveT.current = setTimeout(() => {
      setDocs(p => p.map(d => d.id===activeId ? {...d,content,title,updated:Date.now()} : d));
      setSaved(true);
    }, 700);
  }, [content, title, activeId]);

  const newDoc = () => {
    const d = { id:`d${Date.now()}`, title:"Untitled", content:"# Untitled\n\n", updated:Date.now() };
    setDocs(p=>[d,...p]); setActiveId(d.id); setContent(d.content); setTitle(d.title);
  };

  const openDoc = d => { setActiveId(d.id); setContent(d.content); setTitle(d.title); };

  const importFile = async file => {
    const text = await file.text();
    const d = { id:`d${Date.now()}`, title:file.name.replace(/\.md$/i,""), content:text, updated:Date.now() };
    setDocs(p=>[d,...p]); setActiveId(d.id); setContent(text); setTitle(d.title);
  };

  const download = () => {
    const blob = new Blob([content],{type:"text/markdown"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`${title.replace(/\s+/g,"-")}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const insert = (b, a="", ph="text") => {
    const ta=taRef.current; if(!ta) return;
    const s=ta.selectionStart, e=ta.selectionEnd, sel=content.slice(s,e)||ph;
    setContent(content.slice(0,s)+b+sel+a+content.slice(e));
    setTimeout(()=>{ ta.focus(); ta.setSelectionRange(s+b.length, s+b.length+sel.length); },0);
  };

  const toolbar = [
    ["B","**","**","bold text"],["I","*","*","italic"],["H","## ","","Heading"],
    ["</>","`","`","code"],["🔗","[","](url)","link text"],
    ["≡","- ","","item"],["—","\n---\n","",""],
  ];

  return (
    <Panel style={{ overflow:"hidden", display:"flex", flexDirection:"column", minHeight:480 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", borderBottom:`1px solid ${C.border}60` }}>
        <button onClick={()=>setSidebar(s=>!s)} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:14 }}>☰</button>
        <PHead icon="📝" color={C.violet}>Markdown Editor</PHead>
        <input value={title} onChange={e=>setTitle(e.target.value)} style={{ flex:1, background:"transparent", border:"none", fontFamily:MONO, fontSize:12.5, color:"#e2e8f0", minWidth:0 }} placeholder="Title…"/>
        <span style={{ fontFamily:MONO, fontSize:9, color:saved?C.emerald:"#334155" }}>{saved?"● saved":`${words}w`}</span>
        {/* View mode */}
        <div style={{ display:"flex", borderRadius:6, overflow:"hidden", border:`1px solid ${C.border}` }}>
          {[["edit","✏"],["split","⧉"],["preview","👁"]].map(([m,ic])=>(
            <button key={m} onClick={()=>setMode(m)} style={{ padding:"5px 9px", background:mode===m?`${C.violet}18`:"transparent", color:mode===m?C.violet:"#64748b", border:"none", cursor:"pointer", fontFamily:MONO, fontSize:11 }}>{ic}</button>
          ))}
        </div>
        <button onClick={download} title="Download .md" style={{ background:"transparent", border:"none", color:"#64748b", cursor:"pointer", fontSize:13 }}>⬇</button>
      </div>

      {/* Toolbar */}
      <div style={{ display:"flex", gap:2, padding:"6px 16px", borderBottom:`1px solid ${C.border}40` }}>
        {toolbar.map(([label,b,a,ph])=>(
          <button key={label} onClick={()=>insert(b,a,ph)} style={{ padding:"4px 8px", borderRadius:5, background:"transparent", border:"none", color:"#64748b", fontFamily:MONO, fontSize:10, cursor:"pointer", fontWeight:700 }}
            onMouseEnter={e=>e.target.style.color="#cbd5e1"} onMouseLeave={e=>e.target.style.color="#64748b"}>
            {label}
          </button>
        ))}
        <input ref={fileRef} type="file" accept=".md,.txt" style={{ display:"none" }} onChange={e=>{ const f=e.target.files?.[0]; if(f) importFile(f); e.target.value=""; }}/>
        <button onClick={()=>fileRef.current?.click()} style={{ marginLeft:"auto", padding:"4px 10px", borderRadius:5, border:`1px dashed ${C.border}`, background:"transparent", color:"#64748b", fontFamily:MONO, fontSize:9.5, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
          📂 Import
        </button>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}
        onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)importFile(f);}}
        onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}>

        {/* Sidebar */}
        {sidebar && (
          <div style={{ width:190, borderRight:`1px solid ${C.border}60`, display:"flex", flexDirection:"column", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 12px", borderBottom:`1px solid ${C.border}40` }}>
              <span style={{ fontFamily:MONO, fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:".1em" }}>Documents</span>
              <button onClick={newDoc} style={{ background:"transparent", border:"none", color:C.cyan, cursor:"pointer", fontSize:14 }}>＋</button>
            </div>
            <div style={{ flex:1, overflowY:"auto" }}>
              {docs.map(d => (
                <div key={d.id} onClick={()=>openDoc(d)}
                  style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 12px", cursor:"pointer",
                           background:activeId===d.id?`${C.cyan}0a`:"transparent",
                           borderLeft:`2px solid ${activeId===d.id?C.cyan:"transparent"}`,
                           borderBottom:`1px solid ${C.border}20` }}>
                  <span style={{ fontSize:12 }}>📄</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:MONO, fontSize:10, color:activeId===d.id?"#e2e8f0":"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.title}</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();setDocs(p=>p.filter(dd=>dd.id!==d.id));if(activeId===d.id)setActiveId(null);}}
                    style={{ background:"none", border:"none", color:"transparent", cursor:"pointer", fontSize:11 }}
                    onMouseEnter={e=>e.target.style.color=C.rose} onMouseLeave={e=>e.target.style.color="transparent"}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Editor pane */}
        {(mode==="edit"||mode==="split") && (
          <textarea ref={taRef} value={content} onChange={e=>setContent(e.target.value)}
            style={{ flex:1, background:"transparent", padding:"16px 20px", fontFamily:MONO, fontSize:12, color:"#94a3b8", resize:"none", border:"none", outline:"none", lineHeight:1.75,
                     borderRight:mode==="split"?`1px solid ${C.border}60`:"none" }}
          />
        )}

        {/* Preview pane */}
        {(mode==="preview"||mode==="split") && (
          <div style={{ flex:1, padding:"16px 20px", overflowY:"auto" }}>
            <div className="si-md" dangerouslySetInnerHTML={{ __html:parseMarkdown(content) }}/>
          </div>
        )}

        {/* Drag overlay */}
        {dragging && (
          <div style={{ position:"absolute", inset:0, background:`${C.cyan}08`, border:`2px solid ${C.cyan}50`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
            <span style={{ fontFamily:MONO, fontSize:13, color:C.cyan }}>Drop .md or .txt to import</span>
          </div>
        )}
      </div>

      <style>{`
        .si-md h1{font-size:1.4rem;font-weight:700;color:#f1f5f9;margin:0 0 .6rem;border-bottom:1px solid #1e293b;padding-bottom:.4rem}
        .si-md h2{font-size:1.15rem;font-weight:600;color:#e2e8f0;margin:1.1rem 0 .4rem}
        .si-md h3{font-size:1rem;font-weight:600;color:#cbd5e1;margin:.9rem 0 .3rem}
        .si-md p{color:#94a3b8;line-height:1.7;margin:.4rem 0;font-size:.8rem}
        .si-md code{background:#0f172a;border:1px solid #1e293b;border-radius:3px;padding:1px 5px;font-family:'JetBrains Mono',monospace;font-size:.73rem;color:${C.cyan}}
        .si-md pre.si-pre{background:#020617;border:1px solid #1e293b;border-radius:8px;padding:.9rem;overflow-x:auto;margin:.6rem 0}
        .si-md pre.si-pre code{background:none;border:none;padding:0;color:${C.violet}}
        .si-md blockquote{border-left:3px solid ${C.violet};padding-left:.9rem;color:#64748b;font-style:italic;margin:.6rem 0}
        .si-md a{color:${C.cyan};text-decoration:underline;text-decoration-color:${C.cyan}50}
        .si-md strong{color:#e2e8f0;font-weight:600}
        .si-md em{color:#cbd5e1;font-style:italic}
        .si-md del{color:#475569;text-decoration:line-through}
        .si-md hr{border:none;border-top:1px solid #1e293b;margin:1.2rem 0}
        .si-md li{color:#94a3b8;margin:.2rem 0;line-height:1.6;font-size:.8rem;margin-left:1.2rem}
        .si-md table{width:100%;border-collapse:collapse;margin:.6rem 0;font-size:.73rem}
        .si-md th{background:#0f172a;color:${C.cyan};font-family:'JetBrains Mono',monospace;font-weight:600;padding:.35rem .65rem;border:1px solid #1e293b;text-align:left}
        .si-md td{color:#94a3b8;padding:.35rem .65rem;border:1px solid #1e293b}
      `}</style>
    </Panel>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// HARDWARE SCANNER
// ════════════════════════════════════════════════════════════════════════════════
const TIER_META = {
  LOW:   { c:C.rose,    label:"CPU / Low VRAM",            desc:"Models ≤ 4GB RAM"           },
  MID:   { c:C.amber,   label:"Mid-tier GPU",              desc:"6–12 GB VRAM"               },
  HIGH:  { c:C.cyan,    label:"High-end GPU",              desc:"12–24 GB VRAM"              },
  ULTRA: { c:C.violet,  label:"Enthusiast / Apple Silicon",desc:"24+ GB VRAM / M-series"    },
};
const QUALITY_C = { Best:C.violet, Great:C.cyan, Good:C.emerald, Acceptable:C.amber };

const MOCK_SCAN = {
  profile: {
    os:"macOS 14.5 (Sonoma)", cpu_model:"Apple M2 Pro", cpu_cores:12, ram_gb:32,
    gpu_vendor:"Apple", gpu_model:"Apple M2 Pro (19-core GPU)", vram_gb:32,
    cuda_version:"", metal_support:true, ollama_installed:true,
    ollama_version:"0.1.38", tier:"HIGH",
  },
  recommendations: [
    { rank:1, name:"llama3:13b",                display_name:"Llama 3 13B",    params:"13B",  quant:"Q4_K_M", vram_required:8,  size_gb:7.4,  speed_est:"~22 tok/s", quality:"Great", use_case:"Balanced — great for agents",   pull_command:"ollama pull llama3:13b",                tier:"HIGH" },
    { rank:2, name:"mistral:7b-instruct-v0.3",  display_name:"Mistral 7B v0.3",params:"7B",   quant:"Q4_K_M", vram_required:5,  size_gb:4.1,  speed_est:"~35 tok/s", quality:"Great", use_case:"Fast instruction-following",    pull_command:"ollama pull mistral:7b-instruct-v0.3",  tier:"HIGH" },
    { rank:3, name:"codellama:13b",             display_name:"CodeLlama 13B",  params:"13B",  quant:"Q4_K_M", vram_required:8,  size_gb:7.4,  speed_est:"~20 tok/s", quality:"Great", use_case:"Code generation & analysis",   pull_command:"ollama pull codellama:13b",              tier:"HIGH" },
    { rank:4, name:"llama3:8b",                 display_name:"Llama 3 8B",     params:"8B",   quant:"Q4_K_M", vram_required:5,  size_gb:4.7,  speed_est:"~28 tok/s", quality:"Good",  use_case:"Default worker-agent model",   pull_command:"ollama pull llama3:8b",                  tier:"MID"  },
    { rank:5, name:"gemma2:9b",                 display_name:"Gemma 2 9B",     params:"9B",   quant:"Q4_K_M", vram_required:6,  size_gb:5.4,  speed_est:"~25 tok/s", quality:"Good",  use_case:"Google's efficient mid-tier",  pull_command:"ollama pull gemma2:9b",                  tier:"MID"  },
    { rank:6, name:"phi3:mini",                 display_name:"Phi-3 Mini 3.8B",params:"3.8B", quant:"Q4",     vram_required:2.5,size_gb:2.3,  speed_est:"~55 tok/s", quality:"Good",  use_case:"Ultra-fast lightweight tasks", pull_command:"ollama pull phi3:mini",                  tier:"MID"  },
  ],
};

function HardwareScanner() {
  const [state,     setState]     = useState("idle"); // idle|scanning|done
  const [result,    setResult]    = useState(null);
  const [downloads, setDownloads] = useState({});   // name → idle|pulling|done
  const [progress,  setProgress]  = useState({});   // name → 0-100

  const scan = () => {
    setState("scanning");
    setTimeout(() => { setResult(MOCK_SCAN); setState("done"); }, 2200);
  };

  const download = rec => {
    setDownloads(d=>({...d,[rec.name]:"pulling"}));
    setProgress(p=>({...p,[rec.name]:0}));
    let pct = 0;
    const id = setInterval(() => {
      pct += Math.random()*4+1.5;
      if (pct>=100) { pct=100; clearInterval(id); setDownloads(d=>({...d,[rec.name]:"done"})); }
      setProgress(p=>({...p,[rec.name]:Math.min(pct,100)}));
    }, 550);
  };

  const profile = result?.profile;
  const recs    = result?.recommendations || [];
  const tm = profile ? TIER_META[profile.tier] : null;

  return (
    <Panel style={{ display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 18px", borderBottom:`1px solid ${C.border}60` }}>
        <PHead icon="🖥️" color={C.violet}>Hardware Scanner · Model Recommender</PHead>
        <button onClick={scan} disabled={state==="scanning"}
          style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 16px", background:`${C.violet}12`, border:`1px solid ${C.violet}40`, color:C.violet, borderRadius:8, fontFamily:MONO, fontSize:10, textTransform:"uppercase", letterSpacing:".06em", cursor:"pointer", opacity:state==="scanning"?.5:1 }}>
          {state==="scanning" ? <><span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⟳</span> Scanning…</> : <>⚡ Scan Hardware</>}
        </button>
      </div>

      {/* Idle */}
      {state==="idle" && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 32px", gap:14, textAlign:"center" }}>
          <div style={{ width:64, height:64, borderRadius:16, background:`${C.violet}12`, border:`1px solid ${C.violet}25`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>🖥️</div>
          <div>
            <div style={{ fontFamily:MONO, fontSize:12.5, color:"#94a3b8" }}>Autonomous Hardware Detection</div>
            <div style={{ fontFamily:MONO, fontSize:10, color:"#475569", marginTop:5, lineHeight:1.7, maxWidth:360 }}>
              Scans CPU, RAM, and GPU via nvidia-smi / rocm-smi / system_profiler. Maps your exact spec to the best Ollama model. Download in one click.
            </div>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center" }}>
            {["nvidia-smi","rocm-smi","system_profiler","psutil","platform"].map(t=>(
              <span key={t} style={{ fontFamily:MONO, fontSize:8.5, color:"#475569", background:"rgba(15,23,42,.8)", border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 8px" }}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Scanning animation */}
      {state==="scanning" && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 32px", gap:18 }}>
          <div style={{ position:"relative", width:64, height:64 }}>
            <div style={{ width:64, height:64, borderRadius:"50%", border:`2px solid ${C.violet}25`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>🖥️</div>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:`2px solid ${C.violet}`, borderTopColor:"transparent", animation:"spin 1s linear infinite" }}/>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:MONO, fontSize:12, color:"#94a3b8", marginBottom:10 }}>Scanning hardware…</div>
            {["Detecting CPU model & cores","Reading available system RAM","Probing GPU via nvidia-smi / rocm-smi","Checking Ollama installation","Mapping hardware to optimal models"].map((s,i)=>(
              <div key={s} style={{ fontFamily:MONO, fontSize:9.5, color:"#475569", display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                <span style={{ color:C.violet }}>›</span>{s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {state==="done" && profile && (
        <div>
          {/* Tier banner */}
          <div style={{ padding:"11px 18px", borderBottom:`1px solid ${C.border}40`, background:`${tm.c}0a`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                <span style={{ fontFamily:MONO, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:tm.c }}>{profile.tier} TIER — {tm.label}</span>
                <span style={{ fontFamily:MONO, fontSize:8.5, color:C.emerald, background:`${C.emerald}12`, border:`1px solid ${C.emerald}30`, borderRadius:3, padding:"1px 6px" }}>Ollama {profile.ollama_version} ✓</span>
              </div>
              <div style={{ fontFamily:MONO, fontSize:9, color:"#64748b" }}>{tm.desc}</div>
            </div>
            <div style={{ textAlign:"right", fontFamily:MONO, fontSize:9, color:"#475569" }}>
              <div>{profile.os}</div>
              <div>{profile.cpu_cores}-core · {profile.ram_gb}GB RAM</div>
            </div>
          </div>

          {/* Hardware breakdown */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", borderBottom:`1px solid ${C.border}40` }}>
            {[
              { icon:"🔲", label:"CPU", value:profile.cpu_model, sub:`${profile.cpu_cores} cores`, c:C.cyan    },
              { icon:"💾", label:"RAM", value:`${profile.ram_gb} GB`, sub:"system memory",           c:C.emerald },
              { icon:"🎮", label:"GPU", value:profile.gpu_model||"Integrated", sub:`${profile.vram_gb}GB VRAM · Metal ${profile.metal_support?"✓":""}`, c:C.violet  },
            ].map(r => (
              <div key={r.label} style={{ padding:"11px 16px", borderRight:`1px solid ${C.border}30`, display:"flex", alignItems:"flex-start", gap:10 }}>
                <span style={{ fontSize:16 }}>{r.icon}</span>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontFamily:MONO, fontSize:8.5, color:"#475569", textTransform:"uppercase", marginBottom:3 }}>{r.label}</div>
                  <div style={{ fontFamily:MONO, fontSize:10.5, color:"#e2e8f0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.value}>{r.value}</div>
                  <div style={{ fontFamily:MONO, fontSize:8.5, color:"#64748b", marginTop:2 }}>{r.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Model recommendations */}
          <div style={{ padding:"12px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
              <span style={{ fontSize:14 }}>⭐</span>
              <span style={{ fontFamily:MONO, fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".1em" }}>Recommended Models</span>
              <span style={{ fontFamily:MONO, fontSize:9, color:"#475569", marginLeft:"auto" }}>{recs.length} compatible</span>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {recs.map((rec, i) => {
                const dl  = downloads[rec.name] || "idle";
                const pct = progress[rec.name]  || 0;
                const tc  = (TIER_META[rec.tier]||TIER_META.MID).c;
                const qc  = QUALITY_C[rec.quality] || C.cyan;
                const isTop = i===0;

                return (
                  <div key={rec.name} style={{
                    borderRadius:10, border:`1px solid ${isTop?`${C.cyan}35`:C.border}`,
                    background:isTop?`${C.cyan}06`:"rgba(2,6,23,.4)",
                    padding:"12px 14px", position:"relative",
                  }}>
                    {isTop && <span style={{ position:"absolute", top:8, right:10, fontFamily:MONO, fontSize:8, color:C.cyan, background:`${C.cyan}18`, border:`1px solid ${C.cyan}28`, borderRadius:3, padding:"1px 6px" }}>★ Best Match</span>}

                    <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                      {/* Rank */}
                      <div style={{ width:24, height:24, borderRadius:5, background:`${tc}18`, color:tc, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:MONO, fontSize:10, fontWeight:700, flexShrink:0 }}>{rec.rank}</div>

                      {/* Info */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                          <span style={{ fontFamily:MONO, fontSize:12, fontWeight:700, color:"#e2e8f0" }}>{rec.display_name}</span>
                          <span style={{ fontFamily:MONO, fontSize:9, color:"#64748b" }}>{rec.params}</span>
                          <Chip color={tc}>{rec.quant}</Chip>
                          <span style={{ fontFamily:MONO, fontSize:9, color:qc }}>{rec.quality}</span>
                        </div>
                        <div style={{ fontFamily:MONO, fontSize:10, color:"#64748b", marginBottom:6 }}>{rec.use_case}</div>
                        <div style={{ display:"flex", gap:14, fontFamily:MONO, fontSize:9, color:"#475569" }}>
                          <span>⚡ {rec.speed_est}</span>
                          <span>💾 {rec.size_gb}GB</span>
                          <span>🖥 {rec.vram_required}GB VRAM</span>
                        </div>
                      </div>

                      {/* Download */}
                      <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                        {dl==="idle" && (
                          <button onClick={()=>download(rec)}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:7,
                                     background:`${isTop?C.cyan:C.violet}14`, border:`1px solid ${isTop?C.cyan:C.violet}45`,
                                     color:isTop?C.cyan:C.violet, fontFamily:MONO, fontSize:10, textTransform:"uppercase", cursor:"pointer" }}>
                            ⬇ Download
                          </button>
                        )}
                        {dl==="pulling" && (
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5, minWidth:110 }}>
                            <span style={{ fontFamily:MONO, fontSize:9, color:C.cyan }}>{pct.toFixed(0)}%</span>
                            <div style={{ width:"100%", height:5, background:C.border, borderRadius:3, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.cyan},${C.violet})`, transition:"width .5s ease", borderRadius:3 }}/>
                            </div>
                            <span style={{ fontFamily:MONO, fontSize:8, color:"#475569" }}>{rec.pull_command}</span>
                          </div>
                        )}
                        {dl==="done" && <span style={{ fontFamily:MONO, fontSize:10, color:C.emerald }}>✓ Downloaded</span>}
                      </div>
                    </div>

                    {/* Full-row progress bar when pulling */}
                    {dl==="pulling" && (
                      <div style={{ marginTop:10, height:2, background:C.border, borderRadius:1, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.cyan},${C.violet})`, transition:"width .5s" }}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD (abridged — focuses on the 3 new panels + complete layout)
// ════════════════════════════════════════════════════════════════════════════════
const SEED_LOGS = [
  { id:1, ts:"18:29:01", lv:"EVENT", src:"orchestrator",        msg:"Goal completed: g-01 [self-evaluation]" },
  { id:2, ts:"18:29:03", lv:"INFO",  src:"agent-factory",       msg:"Spawned cod-7d26 (type=code, tools=[filesystem,memory,git])" },
  { id:3, ts:"18:29:13", lv:"EVENT", src:"pipeline.sequential", msg:"Pipeline[pipe-a3c2] COMPLETE | overall=0.83 | 4/4 stages" },
  { id:4, ts:"18:29:15", lv:"WARN",  src:"monitor",             msg:"CPU spike: 81% — approaching spawn threshold" },
  { id:5, ts:"18:29:18", lv:"INFO",  src:"skills.registry",     msg:"Skill count_vowels injected fleet-wide (6 agents)" },
  { id:6, ts:"18:29:20", lv:"SYS",   src:"terminal",            msg:"Agent Spawn Console ready" },
];
const LIVE_POOL = [
  (n)=>({lv:"INFO",src:"meta_loops.study",msg:`Study cycle #${n} | capability_updates=4`}),
  ()=>({lv:"INFO",src:"pipeline.sequential",msg:`Stage ${["coder","designer","assessor","finaliser"][Math.floor(Math.random()*4)]} complete | score=0.${73+Math.floor(Math.random()*20)}`}),
  ()=>({lv:"EVENT",src:"memory.exp_lib",msg:`Experience recorded ✓ | score=0.${75+Math.floor(Math.random()*20)}`}),
  ()=>({lv:"WARN",src:"utils.monitoring",msg:`CPU=${Math.floor(55+Math.random()*25)}% RAM=${Math.floor(28+Math.random()*20)}%`}),
];
const LEVEL_C = { INFO:C.cyan, WARN:C.amber, ERROR:C.rose, EVENT:C.emerald, SPAWN:C.violet, SYS:"#475569" };

export default function SIPlatformV5() {
  const [tick,       setTick]       = useState(0);
  const [iteration,  setIteration]  = useState(42);
  const [cpu,        setCpu]        = useState(68);
  const [ram,        setRam]        = useState(41);
  const [studyCyc,   setStudyCyc]   = useState(3);
  const [pipeRuns,   setPipeRuns]   = useState(1);
  const [liveCount,  setLiveCount]  = useState(3);
  const [logs,       setLogs]       = useState(SEED_LOGS);
  const [approval,   setApproval]   = useState(null);
  const [activeTab,  setActiveTab]  = useState("overview"); // overview|calendar|editor|hardware
  const logBottom = useRef(null);

  useEffect(() => { logBottom.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);

  useEffect(() => {
    const id = setInterval(() => {
      setTick(t=>t+1); setIteration(i=>i+1); setLiveCount(n=>n+1);
      setCpu(c=>Math.min(88,Math.max(28,c+(Math.random()-.46)*6)));
      setRam(r=>Math.min(70,Math.max(28,r+(Math.random()-.5)*2.5)));
      if (Math.random()>.4) {
        const tmpl = LIVE_POOL[Math.floor(Math.random()*LIVE_POOL.length)];
        const e = tmpl(liveCount);
        setLogs(l=>[...l.slice(-50),{ id:Date.now(), ts:ts(), ...e }]);
      }
      if (Math.random()>.9) setStudyCyc(s=>s+1);
    }, 1600);
    return () => clearInterval(id);
  }, [liveCount]);

  useEffect(() => {
    const id = setTimeout(() => setApproval({ action:"spawn", details:{ role:"researcher", reason:"High task load" }}), 4000);
    return () => clearTimeout(id);
  }, []);

  const cpuC = cpu>80?C.rose:cpu>65?C.amber:C.cyan;

  const TABS = [
    { key:"overview", label:"Overview",    icon:"🏠" },
    { key:"calendar", label:"Calendar",    icon:"📅" },
    { key:"editor",   label:"MD Editor",   icon:"📝" },
    { key:"hardware", label:"HW Scanner",  icon:"🖥️"  },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:SANS, color:"#cbd5e1", position:"relative" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0f172a}
        ::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        button,input,textarea,select{font-family:inherit}
        input,textarea{outline:none}
      `}</style>

      {/* Background */}
      <div style={{ position:"fixed", inset:0, zIndex:0 }}><LiveBG /></div>

      {/* NavBar */}
      <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:40, background:"rgba(15,23,42,.7)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}`, height:54, display:"flex", alignItems:"center", padding:"0 20px", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:20, display:"inline-block", animation:"spin 20s linear infinite" }}>🧠</span>
          <div>
            <div style={{ fontFamily:SANS, fontSize:13, fontWeight:700, letterSpacing:".08em", color:"#f1f5f9" }}>SYNTHETIC<span style={{ color:C.cyan }}>INTELLIGENCE</span></div>
            <div style={{ fontFamily:MONO, fontSize:9, color:"#64748b" }}>Embodiment v3.0 · Iteration #{iteration} · 84 files · 46/46 tests</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          {/* Tab nav in header */}
          <div style={{ display:"flex", gap:2, padding:"3px", background:"rgba(2,6,23,.6)", borderRadius:8, border:`1px solid ${C.border}` }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 12px", borderRadius:6, border:"none",
                         background: activeTab===tab.key ? `${C.cyan}15` : "transparent",
                         color: activeTab===tab.key ? C.cyan : "#64748b",
                         fontFamily:MONO, fontSize:9.5, cursor:"pointer", transition:"all .15s",
                         borderBottom: activeTab===tab.key ? `1px solid ${C.cyan}50` : "1px solid transparent" }}>
                <span>{tab.icon}</span><span style={{ textTransform:"uppercase", letterSpacing:".06em" }}>{tab.label}</span>
              </button>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:C.emerald, display:"inline-block", boxShadow:`0 0 6px ${C.emerald}`, animation:"pulse 2s infinite" }}/>
            <span style={{ fontFamily:MONO, fontSize:10, color:C.emerald, textTransform:"uppercase" }}>Neural Link Active</span>
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ position:"relative", zIndex:10, paddingTop:68, paddingBottom:32, padding:"68px 16px 32px", maxWidth:1400, margin:"0 auto" }}>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {activeTab==="overview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {/* Vitals */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              {[
                { label:"CPU Load",      value:`${cpu.toFixed(1)}%`, pct:cpu,        color:cpuC     },
                { label:"RAM Usage",     value:`${ram.toFixed(1)}%`, pct:ram,        color:C.emerald},
                { label:"Study Cycles",  value:`#${studyCyc}`,       pct:100,        color:C.amber  },
                { label:"Pipeline Runs", value:`${pipeRuns}`,        pct:100,        color:C.cyan   },
                { label:"Iteration",     value:`#${iteration}`,      pct:100,        color:C.violet },
              ].map(v => (
                <Panel key={v.label} style={{ padding:"12px 16px", position:"relative", overflow:"hidden" }}>
                  <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg,rgba(255,255,255,.018),transparent)" }}/>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:9 }}>
                    <span style={{ fontFamily:MONO, fontSize:9, textTransform:"uppercase", letterSpacing:".1em", color:"#64748b" }}>{v.label}</span>
                    <span style={{ fontFamily:MONO, fontSize:18, fontWeight:700, color:v.color, textShadow:`0 0 14px ${v.color}` }}>{v.value}</span>
                  </div>
                  <Bar pct={v.pct} color={v.color} h={5}/>
                  <div style={{ position:"absolute", top:11, right:11, width:6, height:6, borderRadius:"50%", background:v.color, boxShadow:`0 0 6px ${v.color}`, animation:"pulse 2s infinite" }}/>
                </Panel>
              ))}
            </div>

            {/* Log stream */}
            <Panel style={{ overflow:"hidden" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 18px", borderBottom:`1px solid ${C.border}60` }}>
                <PHead icon="💻" color={C.cyan}>System Log</PHead>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:C.emerald, display:"inline-block", animation:"pulse 2s infinite" }}/>
                  <span style={{ fontFamily:MONO, fontSize:9, color:"#475569" }}>LIVE</span>
                </div>
              </div>
              <div style={{ height:200, overflowY:"auto", padding:"8px 18px", scrollbarWidth:"thin" }}>
                {logs.map(log => (
                  <div key={log.id} style={{ display:"flex", gap:9, fontFamily:MONO, fontSize:10.5, lineHeight:1.7 }}>
                    <span style={{ color:"#475569", minWidth:52, flexShrink:0 }}>{log.ts}</span>
                    <span style={{ minWidth:44, fontWeight:700, color:LEVEL_C[log.lv]||C.cyan, flexShrink:0 }}>{log.lv}</span>
                    <span style={{ minWidth:120, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flexShrink:0 }}>{log.src}</span>
                    <span style={{ color:log.lv==="SYS"?"#475569":"#cbd5e1" }}>{log.msg}</span>
                  </div>
                ))}
                <div ref={logBottom}/>
              </div>
            </Panel>

            {/* 3 feature panels teaser */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
              {[
                { tab:"calendar", icon:"📅", title:"SI Calendar",            desc:"Full month view with event creation, colour-coded by type: task, goal, meeting, reminder. Integrated with agent scheduler.",   color:C.cyan    },
                { tab:"editor",   icon:"📝", title:"Markdown Editor",        desc:"Split-pane editor with live preview, drag-and-drop file import, toolbar, document library, auto-save, and .md download.",       color:C.violet  },
                { tab:"hardware", icon:"🖥️",  title:"Hardware Scanner",       desc:"Autonomous CPU/GPU/RAM detection. Maps your exact spec to the optimal Ollama model. One-click download with live progress.",     color:C.amber   },
              ].map(p => (
                <button key={p.tab} onClick={()=>setActiveTab(p.tab)}
                  style={{ textAlign:"left", background:`${p.color}07`, border:`1px solid ${p.color}30`, borderRadius:12, padding:20, cursor:"pointer", transition:"all .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=`${p.color}12`}
                  onMouseLeave={e=>e.currentTarget.style.background=`${p.color}07`}>
                  <div style={{ fontSize:28, marginBottom:10 }}>{p.icon}</div>
                  <div style={{ fontFamily:MONO, fontSize:12, fontWeight:700, color:p.color, marginBottom:6, textTransform:"uppercase", letterSpacing:".06em" }}>{p.title}</div>
                  <div style={{ fontFamily:SANS, fontSize:11, color:"#64748b", lineHeight:1.6 }}>{p.desc}</div>
                  <div style={{ marginTop:12, fontFamily:MONO, fontSize:9.5, color:p.color, display:"flex", alignItems:"center", gap:4 }}>Open panel →</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── CALENDAR TAB ─────────────────────────────────────────────────── */}
        {activeTab==="calendar" && <SICalendar />}

        {/* ── EDITOR TAB ───────────────────────────────────────────────────── */}
        {activeTab==="editor" && <MarkdownEditor />}

        {/* ── HARDWARE TAB ─────────────────────────────────────────────────── */}
        {activeTab==="hardware" && <HardwareScanner />}

        {/* Footer */}
        <div style={{ marginTop:24, paddingTop:12, borderTop:`1px solid rgba(30,41,59,.5)`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", gap:10, fontFamily:MONO, fontSize:9, color:"#334155" }}>
            <span>LangGraph</span><span>•</span><span>ChromaDB</span><span>•</span><span>Ollama</span><span>•</span><span>FastAPI SSE</span><span>•</span><span>Next.js 14</span><span>•</span><span>84 files</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:C.cyan, display:"inline-block", boxShadow:`0 0 6px ${C.cyan}`, animation:"pulse 2s infinite" }}/>
            <span style={{ fontFamily:MONO, fontSize:9, color:"#334155" }}>Self-Improving Loop Active</span>
          </div>
        </div>
      </div>

      {/* Approval Gate */}
      {approval && (
        <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,.65)", backdropFilter:"blur(7px)" }}>
          <div style={{ background:"rgba(15,23,42,.97)", border:`1px solid rgba(251,191,36,.35)`, borderRadius:16, padding:24, maxWidth:420, width:"calc(100%-32px)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:"rgba(251,191,36,.1)", border:`1px solid rgba(251,191,36,.22)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>⚠️</div>
              <div>
                <div style={{ fontFamily:SANS, fontSize:13, fontWeight:700, color:"#f1f5f9" }}>Human Approval Required</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:"#64748b" }}>Agent Spawn Request</div>
              </div>
            </div>
            <div style={{ background:"#020617", borderRadius:8, padding:12, marginBottom:16, border:`1px solid ${C.border}` }}>
              <pre style={{ fontFamily:MONO, fontSize:10, color:"#94a3b8", margin:0 }}>{JSON.stringify(approval.details,null,2)}</pre>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              {[["✕ Veto",false,C.rose],["✓ Approve",true,C.emerald]].map(([label,val,color])=>(
                <button key={String(val)} onClick={()=>setApproval(null)}
                  style={{ flex:1, padding:"10px 0", background:`${color}18`, border:`1px solid ${color}40`, color, borderRadius:8, fontFamily:MONO, fontSize:10, fontWeight:700, textTransform:"uppercase", cursor:"pointer" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
