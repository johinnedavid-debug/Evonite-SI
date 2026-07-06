import { useState, useEffect, useRef, useCallback } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const SI = {
  bg:"#020617", panel:"#0f172a", border:"#1e293b",
  cyan:"#22d3ee", emerald:"#34d399", violet:"#a78bfa",
  rose:"#fb7185", amber:"#fbbf24",
};
const MONO = "'JetBrains Mono','Fira Code',monospace";
const SANS = "Inter,system-ui,sans-serif";

// ── Data ──────────────────────────────────────────────────────────────────────
const AGENTS = [
  { id:"meta-001", role:"meta-reflector", status:"working",    model:"llama3",    tasks:42, type:"reflection" },
  { id:"cod-7d26", role:"code",           status:"working",    model:"codellama", tasks:89, type:"code"       },
  { id:"dsg-c20c", role:"designer",       status:"working",    model:"llama3",    tasks:34, type:"designer"   },
  { id:"asr-065f", role:"assessor",       status:"reflecting", model:"llama3",    tasks:28, type:"assessor"   },
  { id:"fnl-3b9a", role:"finaliser",      status:"idle",       model:"llama3",    tasks:17, type:"finaliser"  },
  { id:"rsc-f12a", role:"researcher",     status:"idle",       model:"llama3",    tasks:55, type:"researcher" },
];
const ARCHETYPES = {
  reflection:{ emoji:"↻", color:"#c084fc" }, code:{ emoji:"⌨️", color:"#a78bfa" },
  designer:  { emoji:"🎨", color:"#ec4899" }, assessor:{ emoji:"✅", color:"#fbbf24" },
  finaliser: { emoji:"⭐", color:"#22d3ee" }, researcher:{ emoji:"🔍", color:"#a3e635" },
  worker:    { emoji:"🤖", color:"#34d399" }, evaluator:{ emoji:"🛡️", color:"#f472b6" },
};
const SEED_LOGS = [
  { id:1, ts:"18:29:01", lv:"EVENT", src:"orchestrator",        msg:"Goal completed: g-01 [self-evaluation]" },
  { id:2, ts:"18:29:03", lv:"INFO",  src:"agent-factory",       msg:"Spawned cod-7d26 (type=code, tools=[filesystem,memory,git])" },
  { id:3, ts:"18:29:05", lv:"INFO",  src:"pipeline.sequential", msg:"Stage designer complete | score=0.78" },
  { id:4, ts:"18:29:13", lv:"EVENT", src:"pipeline.sequential", msg:"Pipeline[pipe-a3c2] COMPLETE | overall=0.83 | 4/4 stages" },
  { id:5, ts:"18:29:15", lv:"WARN",  src:"monitor",             msg:"CPU spike: 81% — approaching spawn threshold" },
  { id:6, ts:"18:29:18", lv:"INFO",  src:"skills.registry",     msg:"Skill count_vowels injected fleet-wide (6 agents)" },
  { id:7, ts:"18:29:20", lv:"SYS",   src:"terminal",            msg:"Agent Spawn Console ready — describe an agent below" },
];
const LIVE_POOL = [
  (n)=>({lv:"INFO", src:"meta_loops.study",    msg:`Study cycle #${n} | capability_updates=4`}),
  ()=> ({lv:"INFO", src:"pipeline.sequential", msg:`Stage ${["coder","designer","assessor","finaliser"][Math.floor(Math.random()*4)]} complete | score=0.${73+Math.floor(Math.random()*20)}`}),
  ()=> ({lv:"EVENT",src:"memory.exp_lib",      msg:`Experience recorded ✓ | score=0.${75+Math.floor(Math.random()*20)}`}),
  ()=> ({lv:"WARN", src:"utils.monitoring",    msg:`CPU=${Math.floor(55+Math.random()*25)}% RAM=${Math.floor(28+Math.random()*20)}%`}),
  ()=> ({lv:"INFO", src:"skills.registry",     msg:"Fleet-wide skill inject: heuristic_score"}),
];
const LEVEL_COLOR = { INFO:SI.cyan, WARN:SI.amber, ERROR:SI.rose, EVENT:SI.emerald, SPAWN:SI.violet, SYS:"#475569" };
const SPAWN_SUGG = ["a web scraping researcher for live data","a Python code engineer","a UI/UX designer","a QA assessor","a meta-reflector"];
const GOAL_STAGES = [
  {key:"planning",c:SI.amber},{key:"executing",c:SI.cyan},
  {key:"reflecting",c:SI.violet},{key:"done",c:SI.emerald},{key:"error",c:SI.rose},
];
const SEED_GOALS = [
  {id:"g-01",desc:"Run self-evaluation on experience library",pri:1,status:"executing",pipe:false},
  {id:"g-02",desc:"Build markdown task-tracker CLI",          pri:2,status:"executing",pipe:true},
  {id:"g-03",desc:"Identify top 3 capability gaps",          pri:3,status:"planning",  pipe:false},
  {id:"g-04",desc:"Optimize memory retrieval latency",       pri:5,status:"done",      pipe:false},
];
const SEED_EXPS = [
  {id:"e1",task:"Run self-evaluation cycle",   score:0.89,ok:true, ts:"18:29:01"},
  {id:"e2",task:"Build markdown task-tracker", score:0.83,ok:true, ts:"18:29:06"},
  {id:"e3",task:"Explore novel task domains",  score:0.44,ok:false,ts:"18:29:11"},
  {id:"e4",task:"Optimize memory retrieval",   score:0.77,ok:true, ts:"18:29:18"},
  {id:"e5",task:"Generate count_vowels skill", score:0.91,ok:true, ts:"18:29:23"},
];
const DISPATCH_AGENTS = [
  {id:"auto",    label:"🧠 Auto-route via Orchestrator"},
  {id:"meta-001",label:"↻ meta-001 · meta-reflector"},
  {id:"cod-7d26",label:"⌨️ cod-7d26 · code"},
  {id:"dsg-c20c",label:"🎨 dsg-c20c · designer"},
  {id:"asr-065f",label:"✅ asr-065f · assessor"},
  {id:"fnl-3b9a",label:"⭐ fnl-3b9a · finaliser"},
  {id:"rsc-f12a",label:"🔍 rsc-f12a · researcher"},
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const ts = () => new Date().toTimeString().slice(0,8);
const fmtSize = b => b<1024?`${b}B`:b<1048576?`${(b/1024).toFixed(1)}KB`:`${(b/1048576).toFixed(1)}MB`;

function Panel({children,style={}}) {
  return <div style={{background:"rgba(15,23,42,0.65)",backdropFilter:"blur(12px)",border:`1px solid ${SI.border}`,borderRadius:12,...style}}>{children}</div>;
}
function Bar({pct,color,h=4}) {
  return <div style={{height:h,background:SI.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:color,borderRadius:2,boxShadow:`0 0 6px ${color}80`,transition:"width 1s ease"}}/></div>;
}
function Pill({children,color}) {
  return <span style={{fontFamily:MONO,fontSize:8.5,color,background:`${color}18`,border:`1px solid ${color}35`,borderRadius:3,padding:"1px 6px",textTransform:"uppercase"}}>{children}</span>;
}

// ── Particle background ───────────────────────────────────────────────────────
function LiveBG() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); let id, pts=[];
    const mouse={x:-9e4,y:-9e4};
    const resize=()=>{c.width=c.offsetWidth;c.height=c.offsetHeight;};
    resize();
    const colors=["rgba(34,211,238,.2)","rgba(52,211,153,.13)","rgba(167,139,250,.13)"];
    const init=()=>{const n=Math.floor((c.width*c.height)/13000);pts=Array.from({length:n},()=>({x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-.5)*.27,vy:(Math.random()-.5)*.27,r:Math.random()*1.7+.6,color:colors[Math.floor(Math.random()*3)]}));};
    init();
    const mm=e=>{const r=c.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;};
    c.addEventListener("mousemove",mm);
    const draw=()=>{
      ctx.clearRect(0,0,c.width,c.height);
      for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);if(d<110){ctx.beginPath();ctx.strokeStyle=`rgba(34,211,238,${.07*(1-d/110)})`;ctx.lineWidth=.5;ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.stroke();}}
      pts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;const dx=p.x-mouse.x,dy=p.y-mouse.y,d=Math.sqrt(dx*dx+dy*dy);if(d<130){const f=(130-d)/130;p.vx+=(dx/d)*f*.33;p.vy+=(dy/d)*f*.33;}p.vx*=.99;p.vy*=.99;if(p.x<0)p.x=c.width;if(p.x>c.width)p.x=0;if(p.y<0)p.y=c.height;if(p.y>c.height)p.y=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();});
      id=requestAnimationFrame(draw);
    };
    draw();
    return()=>{cancelAnimationFrame(id);c.removeEventListener("mousemove",mm);};
  },[]);
  return <canvas ref={ref} style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.6,pointerEvents:"none"}}/>;
}

// ── ApprovalGate ──────────────────────────────────────────────────────────────
function ApprovalGate({pending,onDecide}) {
  const [t,setT]=useState(30);
  useEffect(()=>{if(!pending)return;setT(30);const id=setInterval(()=>setT(v=>{if(v<=1){onDecide(true);return 0;}return v-1;}),1000);return()=>clearInterval(id);},[pending]);
  if(!pending) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.65)",backdropFilter:"blur(7px)"}}>
      <div style={{background:"rgba(15,23,42,.97)",border:`1px solid rgba(251,191,36,.35)`,borderRadius:16,padding:24,maxWidth:420,width:"calc(100% - 32px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{width:40,height:40,borderRadius:"50%",background:"rgba(251,191,36,.1)",border:`1px solid rgba(251,191,36,.22)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>⚠️</div>
          <div>
            <div style={{fontFamily:SANS,fontSize:13,fontWeight:700,color:"#f1f5f9"}}>Human Approval Required</div>
            <div style={{fontFamily:MONO,fontSize:10,color:"#64748b"}}>Agent Spawn Request</div>
          </div>
        </div>
        <div style={{background:"#020617",borderRadius:8,padding:12,marginBottom:16,border:`1px solid ${SI.border}`}}>
          <pre style={{fontFamily:MONO,fontSize:10,color:"#94a3b8",margin:0}}>{JSON.stringify(pending.details,null,2)}</pre>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontFamily:MONO,fontSize:10,color:"#64748b"}}>🛡️ Auto-approve in {t}s</span>
          <div style={{height:4,width:88,background:SI.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${(t/30)*100}%`,background:SI.amber,transition:"width 1s linear",borderRadius:2}}/></div>
        </div>
        <div style={{display:"flex",gap:10}}>
          {[["✕ Veto",false,SI.rose],["✓ Approve",true,SI.emerald]].map(([label,val,color])=>(
            <button key={label} onClick={()=>onDecide(val)} style={{flex:1,padding:"10px 0",background:`${color}18`,border:`1px solid ${color}40`,color,borderRadius:8,fontFamily:MONO,fontSize:10,fontWeight:700,textTransform:"uppercase",cursor:"pointer"}}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Task Dispatch Panel ───────────────────────────────────────────────────────
function TaskDispatch({agents, onDispatch}) {
  const [mode,        setMode]        = useState("text");
  const [taskText,    setTaskText]    = useState("");
  const [contextUrl,  setContextUrl]  = useState("");
  const [attachments, setAttachments] = useState([]);
  const [agentId,     setAgentId]     = useState("auto");
  const [priority,    setPriority]    = useState(5);
  const [usePipeline, setUsePipeline] = useState(false);
  const [isDragging,  setIsDragging]  = useState(false);
  const [agentOpen,   setAgentOpen]   = useState(false);
  const [status,      setStatus]      = useState("idle"); // idle|sending|success|error
  const [result,      setResult]      = useState(null);
  const [history,     setHistory]     = useState([]);
  const [urlErr,      setUrlErr]      = useState("");

  const fileRef    = useRef(null);
  const dropRef    = useRef(null);
  const textRef    = useRef(null);
  const agentDDRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => { if (agentDDRef.current && !agentDDRef.current.contains(e.target)) setAgentOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const readFile = f => new Promise((res, rej) => {
    if (f.size > 10*1024*1024) { rej(new Error(`${f.name} exceeds 10MB`)); return; }
    const r = new FileReader();
    r.onload = () => {
      const b64 = r.result.split(",")[1] ?? "";
      const isText = f.type.startsWith("text/") || ["application/json","application/xml"].includes(f.type);
      const preview = isText ? atob(b64).slice(0,200) : undefined;
      res({ id:`a-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, name:f.name, type:f.type||"application/octet-stream", size:f.size, data:b64, preview });
    };
    r.onerror = () => rej(new Error(`Failed to read ${f.name}`));
    r.readAsDataURL(f);
  });

  const addFiles = useCallback(async files => {
    const list = Array.from(files).slice(0, 5 - attachments.length);
    const results = await Promise.allSettled(list.map(readFile));
    const ok = results.filter(r => r.status==="fulfilled").map(r => r.value);
    setAttachments(prev => [...prev, ...ok]);
    if (ok.length) setMode("file");
  }, [attachments.length]);

  const handleDrop = useCallback(e => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDispatch = useCallback(() => {
    const hasText = taskText.trim().length > 0;
    const hasUrl  = contextUrl.trim().length > 0;
    const hasFile = attachments.length > 0;
    if (!hasText && !hasUrl && !hasFile) return;

    if (hasUrl) {
      try { new URL(contextUrl); setUrlErr(""); }
      catch { setUrlErr("Enter a valid URL"); return; }
    }

    setStatus("sending");
    setResult(null);

    // Simulate API call
    setTimeout(() => {
      const selectedAgent = DISPATCH_AGENTS.find(a => a.id === agentId) || DISPATCH_AGENTS[0];
      const taskId = `task-${Math.random().toString(36).slice(2,9)}`;
      const routedTo = agentId === "auto"
        ? `orchestrator→g-${Math.random().toString(36).slice(2,5)}`
        : agentId;

      const res = {
        status:"dispatched", task_id:taskId, routed_to:routedTo,
        priority, use_pipeline:usePipeline,
        attachments: attachments.map(a=>a.name),
        context_url: contextUrl||null,
        message:`Task dispatched as ${taskId} → ${routedTo}`,
      };
      setResult(res);
      setStatus("success");

      const histEntry = {
        id:taskId, ts:ts(),
        task: taskText||contextUrl||attachments[0]?.name||"(files only)",
        routed_to: routedTo, files: attachments.length,
      };
      setHistory(h => [histEntry, ...h].slice(0,10));
      onDispatch && onDispatch(histEntry);

      // Reset
      setTaskText(""); setContextUrl(""); setAttachments([]); setMode("text");
      setTimeout(() => { setStatus("idle"); setResult(null); }, 6000);
    }, 1400);
  }, [taskText, contextUrl, attachments, agentId, priority, usePipeline]);

  const selectedAgent = DISPATCH_AGENTS.find(a => a.id === agentId) || DISPATCH_AGENTS[0];
  const canDispatch = (taskText.trim()||contextUrl.trim()||attachments.length>0) && status!=="sending";

  const modeBtn = (key, icon, label, badge=null) => (
    <button onClick={()=>setMode(key)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"7px 0",borderRadius:8,border:`1px solid ${mode===key?`${SI.cyan}45`:SI.border}`,background:mode===key?`${SI.cyan}10`:"transparent",color:mode===key?SI.cyan:"#64748b",fontFamily:MONO,fontSize:10,textTransform:"uppercase",letterSpacing:".07em",cursor:"pointer",transition:"all .15s"}}>
      <span style={{fontSize:12}}>{icon}</span>{label}
      {badge!==null&&badge>0&&<span style={{background:`${SI.violet}25`,color:SI.violet,borderRadius:99,fontSize:8,padding:"0 5px",fontWeight:700}}>{badge}</span>}
    </button>
  );

  return (
    <Panel>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 20px",borderBottom:`1px solid ${SI.border}60`}}>
        <div style={{fontFamily:MONO,fontSize:11,textTransform:"uppercase",letterSpacing:".1em",color:"#94a3b8",display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:SI.cyan}}>📤</span> Task Dispatch
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,fontFamily:MONO,fontSize:9,color:"#475569"}}>
          <span>{history.length} dispatched</span>
          <span>·</span>
          <span>⌘↵ to send</span>
        </div>
      </div>

      <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>

        {/* Agent selector */}
        <div style={{position:"relative"}} ref={agentDDRef}>
          <button onClick={()=>setAgentOpen(o=>!o)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#020617",border:`1px solid ${SI.border}`,borderRadius:8,padding:"9px 12px",fontFamily:MONO,fontSize:11,color:"#cbd5e1",cursor:"pointer",transition:"border-color .2s"}}
            onMouseEnter={e=>e.target.style.borderColor="#334155"} onMouseLeave={e=>e.target.style.borderColor=SI.border}>
            <span>{selectedAgent.label}</span>
            <span style={{color:"#475569",fontSize:10,transform:`rotate(${agentOpen?180:0}deg)`,transition:"transform .2s",display:"inline-block"}}>▾</span>
          </button>
          {agentOpen && (
            <div style={{position:"absolute",zIndex:30,width:"100%",top:"calc(100% + 4px)",background:"#020617",border:`1px solid ${SI.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
              {DISPATCH_AGENTS.map(a => (
                <button key={a.id} onClick={()=>{setAgentId(a.id);setAgentOpen(false);}}
                  style={{width:"100%",textAlign:"left",padding:"9px 12px",fontFamily:MONO,fontSize:11,color:agentId===a.id?SI.cyan:"#94a3b8",background:agentId===a.id?`${SI.cyan}08`:"transparent",cursor:"pointer",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${SI.border}40`}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.03)"}
                  onMouseLeave={e=>e.currentTarget.style.background=agentId===a.id?`${SI.cyan}08`:"transparent"}>
                  {a.label}
                  {a.id==="auto"&&<span style={{fontFamily:MONO,fontSize:9,color:"#475569",marginLeft:"auto"}}>orchestrator picks</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode tabs */}
        <div style={{display:"flex",gap:6,padding:5,background:"#020617",borderRadius:10,border:`1px solid ${SI.border}`}}>
          {modeBtn("text","📝","Text")}
          {modeBtn("url","🔗","URL")}
          {modeBtn("file","📁","Files",attachments.length)}
        </div>

        {/* Text mode */}
        {mode==="text" && (
          <textarea value={taskText} onChange={e=>setTaskText(e.target.value)}
            onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter")handleDispatch();}}
            ref={textRef}
            placeholder={"Describe the task in plain English…\n\nExamples:\n• Summarise the project's capability gaps and suggest 3 new skills\n• Write a Python CSV parser that handles malformed rows\n• Review the latest pipeline output and flag quality issues\n• Research recent advances in multi-agent coordination"}
            rows={6} style={{width:"100%",background:"#020617",border:`1px solid ${SI.border}`,borderRadius:8,padding:"10px 13px",fontFamily:MONO,fontSize:11.5,color:"#e2e8f0",resize:"none",boxSizing:"border-box",lineHeight:1.6,transition:"border-color .2s"}}
            onFocus={e=>e.target.style.borderColor=`${SI.cyan}45`}
            onBlur={e=>e.target.style.borderColor=SI.border}
          />
        )}

        {/* URL mode */}
        {mode==="url" && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:13}}>🔗</span>
              <input type="url" value={contextUrl} onChange={e=>{setContextUrl(e.target.value);setUrlErr("");}}
                placeholder="https://docs.example.com/api-reference"
                style={{width:"100%",background:"#020617",border:`1px solid ${urlErr?SI.rose:SI.border}`,borderRadius:8,padding:"9px 12px 9px 34px",fontFamily:MONO,fontSize:11.5,color:"#e2e8f0",boxSizing:"border-box",transition:"border-color .2s"}}
                onFocus={e=>e.target.style.borderColor=urlErr?SI.rose:`${SI.cyan}45`}
                onBlur={e=>e.target.style.borderColor=urlErr?SI.rose:SI.border}
              />
            </div>
            {urlErr && <div style={{fontFamily:MONO,fontSize:9.5,color:SI.rose}}>{urlErr}</div>}
            <textarea value={taskText} onChange={e=>setTaskText(e.target.value)}
              placeholder="What should the agent do with this URL's content?" rows={3}
              style={{width:"100%",background:"#020617",border:`1px solid ${SI.border}`,borderRadius:8,padding:"9px 12px",fontFamily:MONO,fontSize:11.5,color:"#e2e8f0",resize:"none",boxSizing:"border-box"}}
              onFocus={e=>e.target.style.borderColor=`${SI.cyan}45`}
              onBlur={e=>e.target.style.borderColor=SI.border}
            />
          </div>
        )}

        {/* File mode */}
        {mode==="file" && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* Drop zone */}
            <div ref={dropRef}
              onDrop={handleDrop}
              onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
              onDragLeave={()=>setIsDragging(false)}
              onClick={()=>fileRef.current?.click()}
              style={{border:`2px dashed ${isDragging?SI.cyan:"#1e293b"}`,borderRadius:12,padding:"28px 16px",textAlign:"center",cursor:"pointer",background:isDragging?`${SI.cyan}07`:"transparent",transition:"all .2s",transform:isDragging?"scale(1.01)":"none"}}>
              <input ref={fileRef} type="file" multiple accept=".txt,.md,.py,.js,.ts,.json,.csv,.pdf,.png,.jpg,.jpeg,.svg,.html,.xml" onChange={e=>{if(e.target.files)addFiles(e.target.files);e.target.value="";}} style={{display:"none"}}/>
              <div style={{fontSize:28,marginBottom:8}}>📂</div>
              <div style={{fontFamily:MONO,fontSize:12,color:isDragging?SI.cyan:"#64748b"}}>
                {isDragging?"Drop files here":"Drag & drop files or click to browse"}
              </div>
              <div style={{fontFamily:MONO,fontSize:9.5,color:"#334155",marginTop:5}}>
                .txt .md .py .js .json .csv .pdf .png .jpg · max 10MB · up to 5 files
              </div>
            </div>
            <textarea value={taskText} onChange={e=>setTaskText(e.target.value)}
              placeholder="What should the agent do with these files?" rows={2}
              style={{width:"100%",background:"#020617",border:`1px solid ${SI.border}`,borderRadius:8,padding:"9px 12px",fontFamily:MONO,fontSize:11.5,color:"#e2e8f0",resize:"none",boxSizing:"border-box"}}
              onFocus={e=>e.target.style.borderColor=`${SI.cyan}45`}
              onBlur={e=>e.target.style.borderColor=SI.border}
            />
          </div>
        )}

        {/* Attachment chips */}
        {attachments.length>0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
            {attachments.map(att=>(
              <div key={att.id} style={{display:"flex",alignItems:"center",gap:6,background:"#0f172a",border:`1px solid ${SI.border}`,borderRadius:8,padding:"5px 10px",fontFamily:MONO,fontSize:10,color:"#94a3b8",maxWidth:200}}>
                <span style={{color:SI.violet,flexShrink:0}}>📄</span>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{att.name}</span>
                <span style={{color:"#334155",flexShrink:0}}>{fmtSize(att.size)}</span>
                <button onClick={()=>setAttachments(p=>p.filter(a=>a.id!==att.id))} style={{color:"#475569",background:"none",border:"none",cursor:"pointer",padding:0,lineHeight:1,flexShrink:0,fontSize:11}}
                  onMouseEnter={e=>e.target.style.color=SI.rose}
                  onMouseLeave={e=>e.target.style.color="#475569"}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Options row */}
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          {/* Priority */}
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontFamily:MONO,fontSize:10,color:"#64748b"}}>Priority</span>
            <div style={{display:"flex",gap:4}}>
              {[1,2,3,5,7,10].map(p=>(
                <button key={p} onClick={()=>setPriority(p)} style={{width:28,height:25,background:priority===p?`${SI.cyan}18`:"#020617",border:`1px solid ${priority===p?`${SI.cyan}50`:SI.border}`,borderRadius:5,color:priority===p?SI.cyan:"#64748b",fontFamily:MONO,fontSize:10,cursor:"pointer",transition:"all .15s"}}>{p}</button>
              ))}
            </div>
          </div>

          <div style={{width:1,height:20,background:SI.border}}/>

          {/* Pipeline toggle */}
          <button onClick={()=>setUsePipeline(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 11px",borderRadius:8,border:`1px solid ${usePipeline?`${SI.violet}50`:SI.border}`,background:usePipeline?`${SI.violet}12`:"transparent",color:usePipeline?SI.violet:"#64748b",fontFamily:MONO,fontSize:10,textTransform:"uppercase",letterSpacing:".06em",cursor:"pointer",transition:"all .2s"}}>
            ⑂ Pipeline
          </button>

          {/* Dispatch button */}
          <button onClick={handleDispatch} disabled={!canDispatch} style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,background:canDispatch?`${SI.cyan}14`:"transparent",border:`1px solid ${canDispatch?`${SI.cyan}50`:SI.border}`,color:canDispatch?SI.cyan:"#334155",borderRadius:8,padding:"8px 18px",fontFamily:MONO,fontSize:11,textTransform:"uppercase",letterSpacing:".07em",cursor:canDispatch?"pointer":"not-allowed",transition:"all .2s"}}>
            {status==="sending"
              ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span> Sending…</>
              : <>📤 Dispatch</>
            }
          </button>
        </div>

        {/* Result card */}
        {result && (
          <div style={{borderRadius:8,border:`1px solid ${status==="success"?`${SI.emerald}35`:`${SI.rose}35`}`,background:status==="success"?`${SI.emerald}06`:`${SI.rose}06`,padding:"11px 13px",fontFamily:MONO,fontSize:10.5}}>
            {status==="success"?(
              <div>
                <div style={{color:SI.emerald,fontWeight:700,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>✓ Task Dispatched</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 20px",fontSize:10}}>
                  {[
                    ["Task ID",    result.task_id,   "#e2e8f0"],
                    ["Routed to",  result.routed_to, SI.cyan  ],
                    ["Priority",   `P${result.priority}`,   "#e2e8f0"],
                    ["Pipeline",   result.use_pipeline?"Yes":"No", SI.violet],
                    ...(result.context_url?[["URL",result.context_url.slice(0,36)+"…",SI.amber]]:[] ),
                    ...(result.attachments?.length?[["Files",result.attachments.slice(0,2).join(", "),SI.violet]]:[] ),
                  ].map(([k,v,c])=>(
                    <div key={k}><span style={{color:"#64748b"}}>{k} </span><span style={{color:c}}>{v}</span></div>
                  ))}
                </div>
              </div>
            ):(
              <div style={{color:SI.rose,display:"flex",alignItems:"center",gap:6}}>⊗ {result.message}</div>
            )}
          </div>
        )}

        {/* Dispatch history */}
        {history.length>0 && (
          <div style={{borderTop:`1px solid ${SI.border}60`,paddingTop:12}}>
            <div style={{fontFamily:MONO,fontSize:9.5,textTransform:"uppercase",letterSpacing:".1em",color:"#475569",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              🕐 Recent Dispatches
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:120,overflowY:"auto",scrollbarWidth:"thin"}}>
              {history.map(h=>(
                <div key={h.id} style={{display:"flex",alignItems:"center",gap:10,fontFamily:MONO,fontSize:9.5}}>
                  <span style={{color:"#475569",minWidth:52,flexShrink:0}}>{h.ts}</span>
                  <span style={{color:"#94a3b8",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.task.slice(0,46)}{h.task.length>46?"…":""}</span>
                  <span style={{color:SI.cyan,flexShrink:0}}>{h.routed_to.slice(0,22)}</span>
                  {h.files>0&&<span style={{color:SI.violet,flexShrink:0}}>+{h.files}f</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function SIDashboard() {
  const [tick,        setTick]        = useState(0);
  const [iteration,   setIteration]   = useState(42);
  const [cpu,         setCpu]         = useState(68);
  const [ram,         setRam]         = useState(41);
  const [agents,      setAgents]      = useState(AGENTS);
  const [goals,       setGoals]       = useState(SEED_GOALS);
  const [exps,        setExps]        = useState(SEED_EXPS);
  const [studyCycles, setStudyCycles] = useState(3);
  const [pipeRuns,    setPipeRuns]    = useState(1);
  const [logs,        setLogs]        = useState(SEED_LOGS);
  const [liveCount,   setLiveCount]   = useState(3);
  const [approval,    setApproval]    = useState(null);
  const [newGoal,     setNewGoal]     = useState("");
  const [goalPri,     setGoalPri]     = useState(5);
  const [spawnInput,  setSpawnInput]  = useState("");
  const [selfPrompt,  setSelfPrompt]  = useState(false);
  const [spawnStatus, setSpawnStatus] = useState("idle");
  const [spawnResult, setSpawnResult] = useState(null);
  const [suggIdx,     setSuggIdx]     = useState(0);
  const spawnRef  = useRef(null);
  const logBottom = useRef(null);

  useEffect(()=>{ logBottom.current?.scrollIntoView({behavior:"smooth"}); },[logs]);
  useEffect(()=>{ const id=setInterval(()=>setSuggIdx(i=>(i+1)%SPAWN_SUGG.length),3500); return()=>clearInterval(id); },[]);

  useEffect(()=>{
    const id=setInterval(()=>{
      setTick(t=>t+1); setIteration(i=>i+1); setLiveCount(n=>n+1);
      setCpu(c=>Math.min(88,Math.max(28,c+(Math.random()-.46)*6)));
      setRam(r=>Math.min(70,Math.max(28,r+(Math.random()-.5)*2.5)));
      if(Math.random()>.38){const tmpl=LIVE_POOL[Math.floor(Math.random()*LIVE_POOL.length)];const e=tmpl(liveCount);setLogs(l=>[...l.slice(-60),{id:Date.now(),ts:ts(),...e}]);}
      if(Math.random()>.8){const s=["working","working","reflecting","idle"];setAgents(prev=>prev.map((a,i)=>i===0?a:{...a,status:s[Math.floor(Math.random()*s.length)]}));}
      if(Math.random()>.92)setStudyCycles(s=>s+1);
    },1500);
    return()=>clearInterval(id);
  },[liveCount]);

  useEffect(()=>{const id=setTimeout(()=>setApproval({action:"spawn",details:{role:"researcher",reason:"High task load detected"}}),4000);return()=>clearTimeout(id);},[]);

  const pushLog=useCallback((lv,src,msg)=>setLogs(l=>[...l.slice(-60),{id:Date.now(),ts:ts(),lv,src,msg}]),[]);

  const handleSpawn=useCallback(()=>{
    const desc=spawnInput.trim(); if(!desc||spawnStatus==="thinking") return;
    setSpawnStatus("thinking"); setSpawnResult(null);
    pushLog("SPAWN","terminal",`Analysing: "${desc}"`);
    setTimeout(()=>{
      const d=desc.toLowerCase();
      let matched="worker",conf=0.1;
      const kws={researcher:["research","search","explore","web","browse","scout"],code:["code","python","program","script","develop","engineer","software"],designer:["design","ui","ux","visual","wireframe","layout","figma"],assessor:["assess","qa","quality","gate","audit","test"],finaliser:["finalise","finalize","final","deliver","synthesise","ship"],evaluator:["evaluat","score","judge","critic","rate"],reflection:["reflect","introspect","lesson","meta","retrospect"]};
      for(const [t,ws] of Object.entries(kws)){const h=ws.filter(w=>d.includes(w)).length;const s=h/ws.length;if(s>conf){matched=t;conf=s;}}
      const exists=agents.find(a=>a.type===matched);
      if(exists){
        setSpawnStatus("duplicate");
        setSpawnResult({status:"duplicate",archetype:matched,existing_ids:[exists.id],message:`A ${matched} agent already exists in the fleet (${exists.id}). No new agent spawned.`});
        pushLog("WARN","agent-factory",`Duplicate detected — ${matched} already in fleet: ${exists.id}`);
        pushLog("SYS","terminal",`No spawn needed. Existing: ${exists.id}`);
      } else {
        const arc=ARCHETYPES[matched]||ARCHETYPES.worker;
        const newId=`${matched.slice(0,3)}-${Math.random().toString(36).slice(2,6)}`;
        setAgents(prev=>[...prev,{id:newId,role:matched,status:"working",model:"llama3",tasks:0,type:matched}]);
        const sp=selfPrompt?`You are newly spawned ${matched} agent ${newId}. Introduce yourself and propose your first self-directed task.`:null;
        setSpawnStatus("spawned");
        setSpawnResult({status:"spawned",agent_id:newId,archetype:matched,role:`${matched}-agent`,confidence:conf,skills_injected:(arc&&["heuristic_score","detect_errors"])||[],fleet_updated:agents.length+1,self_prompted:selfPrompt,self_prompt_task:sp});
        pushLog("SPAWN","agent-factory",`Agent spawned | id=${newId} | type=${matched} | tools=[filesystem,memory,git]`);
        pushLog("INFO","skills.registry",`Skills injected fleet-wide (${agents.length+1} agents updated)`);
        if(selfPrompt&&sp)pushLog("SPAWN","meta-orchestrator",`Self-prompt queued for ${newId}`);
        setPipeRuns(p=>p+1);
      }
      setSpawnInput("");
      setTimeout(()=>{setSpawnStatus("idle");setSpawnResult(null);},5500);
    },1500);
  },[spawnInput,selfPrompt,spawnStatus,agents,pushLog]);

  const handleApprovalDecide=approved=>{
    const action=approval?.action; setApproval(null);
    pushLog(approved?"EVENT":"WARN","human-gate",approved?`✓ Approved: ${action}`:`✗ Vetoed: ${action}`);
  };

  const handleDispatch=entry=>{
    pushLog("EVENT","task-dispatch",`Task dispatched → ${entry.routed_to}: "${entry.task.slice(0,55)}"`);
    setPipeRuns(p=>p+1);
  };

  const activeCount=agents.filter(a=>a.status!=="idle").length;
  const cpuColor=cpu>80?SI.rose:cpu>65?SI.amber:SI.cyan;
  const statusC={working:SI.cyan,reflecting:SI.violet,idle:"#475569",error:SI.rose};

  const spawnResultBorder=spawnStatus==="duplicate"?`rgba(251,191,36,.35)`:spawnStatus==="spawned"?`rgba(52,211,153,.35)`:spawnStatus==="error"?`rgba(251,113,133,.35)`:SI.border;
  const spawnResultBg=spawnStatus==="duplicate"?`rgba(251,191,36,.05)`:spawnStatus==="spawned"?`rgba(52,211,153,.05)`:spawnStatus==="error"?`rgba(251,113,133,.05)`:"transparent";

  return (
    <div style={{minHeight:"100vh",background:SI.bg,fontFamily:SANS,color:"#cbd5e1",position:"relative",overflow:"hidden"}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f172a}::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        button,textarea,input,select{font-family:inherit}
        textarea,input{outline:none}
      `}</style>

      {/* Background */}
      <div style={{position:"fixed",inset:0,zIndex:0}}><LiveBG/></div>

      {/* NavBar */}
      <div style={{position:"fixed",top:0,left:0,right:0,zIndex:40,background:"rgba(15,23,42,.7)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${SI.border}`,height:54,display:"flex",alignItems:"center",padding:"0 20px",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20,display:"inline-block",animation:"spin 20s linear infinite"}}>🧠</span>
          <div>
            <div style={{fontFamily:SANS,fontSize:13,fontWeight:700,letterSpacing:".08em",color:"#f1f5f9"}}>SYNTHETIC<span style={{color:SI.cyan}}>INTELLIGENCE</span></div>
            <div style={{fontFamily:MONO,fontSize:9,color:"#64748b"}}>Embodiment v3.0 · Iteration #{iteration} · 46/46 tests</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:SI.emerald,display:"inline-block",boxShadow:`0 0 6px ${SI.emerald}`,animation:"pulse 2s infinite"}}/>
            <span style={{fontFamily:MONO,fontSize:10,color:SI.emerald,textTransform:"uppercase"}}>Neural Link Active</span>
          </div>
          <div style={{width:1,height:16,background:SI.border}}/>
          <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>localhost:8000</span>
        </div>
      </div>

      {/* Page content */}
      <div style={{position:"relative",zIndex:10,paddingTop:68,paddingBottom:28,padding:"68px 16px 28px",maxWidth:1340,margin:"0 auto"}}>

        {/* ── Vitals ──────────────────────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
          {[
            {label:"CPU Load",      value:`${cpu.toFixed(1)}%`, pct:cpu,         color:cpuColor  },
            {label:"RAM Usage",     value:`${ram.toFixed(1)}%`, pct:ram,         color:SI.emerald},
            {label:"Active Agents", value:`${activeCount}`,     pct:activeCount, color:SI.violet },
            {label:"Study Cycles",  value:`#${studyCycles}`,    pct:100,         color:SI.amber  },
            {label:"Pipeline Runs", value:`${pipeRuns}`,        pct:100,         color:SI.cyan   },
          ].map(v=>(
            <Panel key={v.label} style={{padding:"12px 16px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,.018),transparent)"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                <span style={{fontFamily:MONO,fontSize:9,textTransform:"uppercase",letterSpacing:".1em",color:"#64748b"}}>{v.label}</span>
                <span style={{fontFamily:MONO,fontSize:18,fontWeight:700,color:v.color,textShadow:`0 0 14px ${v.color}`}}>{v.value}</span>
              </div>
              <Bar pct={v.pct} color={v.color} h={5}/>
              <div style={{position:"absolute",top:11,right:11,width:6,height:6,borderRadius:"50%",background:v.color,boxShadow:`0 0 6px ${v.color}`,animation:"pulse 2s infinite"}}/>
            </Panel>
          ))}
        </div>

        {/* ── Main 3-col grid ─────────────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 320px",gap:20,marginBottom:20}}>

          {/* Fleet */}
          <Panel style={{padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontFamily:MONO,fontSize:11,textTransform:"uppercase",letterSpacing:".1em",color:"#94a3b8",display:"flex",alignItems:"center",gap:8}}><span style={{color:SI.cyan}}>🤖</span>Agent Fleet · {agents.length}</div>
              <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>{activeCount} active</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {agents.map(a=>{
                const arc=ARCHETYPES[a.type]||ARCHETYPES.worker;
                const sc=statusC[a.status]||"#475569";
                return (
                  <div key={a.id} style={{background:"rgba(2,6,23,.5)",border:`1px solid ${a.status!=="idle"?sc+"40":SI.border}`,borderRadius:8,padding:"9px 11px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                      <div style={{position:"relative"}}>
                        <span style={{fontSize:15}}>{arc.emoji}</span>
                        <span style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:"50%",background:sc,boxShadow:a.status!=="idle"?`0 0 5px ${sc}`:"none"}}/>
                      </div>
                      <div>
                        <div style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:"#e2e8f0"}}>{a.id}</div>
                        <div style={{fontFamily:MONO,fontSize:8.5,color:"#64748b",textTransform:"uppercase"}}>{a.role}</div>
                      </div>
                      <div style={{marginLeft:"auto",textAlign:"right"}}>
                        <div style={{fontFamily:MONO,fontSize:8.5,color:SI.emerald}}>{a.tasks} tasks</div>
                      </div>
                    </div>
                    <Pill color={sc}>{a.status}</Pill>
                  </div>
                );
              })}
            </div>
            <div style={{height:38,border:`1px solid ${SI.border}40`,borderRadius:8,background:"rgba(2,6,23,.3)",position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontFamily:MONO,fontSize:8.5,color:"#334155",textTransform:"uppercase",letterSpacing:".14em"}}>Message Bus · Pipeline Channel · ONLINE</span>
            </div>
          </Panel>

          {/* Terminal + Spawn Console */}
          <Panel style={{overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 18px",borderBottom:`1px solid ${SI.border}60`}}>
              <div style={{fontFamily:MONO,fontSize:10,textTransform:"uppercase",letterSpacing:".1em",color:"#94a3b8",display:"flex",alignItems:"center",gap:8}}>💻 Log · Spawn Console</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:6,height:6,borderRadius:"50%",background:SI.emerald,display:"inline-block",animation:"pulse 2s infinite"}}/><span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>LIVE</span></div>
            </div>
            {/* Log */}
            <div style={{height:156,overflowY:"auto",padding:"7px 18px",scrollbarWidth:"thin"}}>
              {logs.map(log=>(
                <div key={log.id} style={{display:"flex",gap:8,fontFamily:MONO,fontSize:10,lineHeight:1.7}}>
                  <span style={{color:"#475569",minWidth:50,flexShrink:0}}>{log.ts}</span>
                  <span style={{minWidth:42,fontWeight:700,color:LEVEL_COLOR[log.lv]||SI.cyan,flexShrink:0}}>{log.lv}</span>
                  <span style={{minWidth:106,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{log.src}</span>
                  <span style={{color:log.lv==="SPAWN"?SI.violet:log.lv==="SYS"?"#475569":"#cbd5e1",fontStyle:log.lv==="SYS"?"italic":"normal"}}>{log.msg}</span>
                </div>
              ))}
              <div ref={logBottom}/>
            </div>
            {/* Divider */}
            <div style={{height:1,background:`${SI.border}80`,margin:"0 18px"}}/>
            {/* Spawn console */}
            <div style={{padding:"12px 18px 16px",flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                <span style={{fontSize:12}}>⚡</span>
                <span style={{fontFamily:MONO,fontSize:9.5,textTransform:"uppercase",letterSpacing:".1em",color:SI.violet}}>Agent Spawn Console</span>
                <span style={{fontFamily:MONO,fontSize:8.5,color:"#334155",marginLeft:"auto"}}>Tab=complete · Enter=spawn</span>
              </div>
              <div style={{display:"flex",gap:7,marginBottom:9}}>
                <div style={{flex:1,position:"relative"}}>
                  <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:`${SI.violet}70`,fontFamily:MONO,fontSize:12}}>›</span>
                  <input ref={spawnRef} value={spawnInput} onChange={e=>setSpawnInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")handleSpawn();if(e.key==="Tab"){e.preventDefault();setSpawnInput(SPAWN_SUGG[suggIdx]);}}}
                    disabled={spawnStatus==="thinking"}
                    placeholder={`e.g. "${SPAWN_SUGG[suggIdx]}"`}
                    style={{width:"100%",background:"#020617",border:`1px solid ${SI.border}`,borderRadius:7,paddingLeft:22,paddingRight:10,paddingTop:8,paddingBottom:8,fontFamily:MONO,fontSize:11,color:"#e2e8f0",boxSizing:"border-box",opacity:spawnStatus==="thinking"?.6:1}}
                    onFocus={e=>e.target.style.borderColor=`${SI.violet}60`}
                    onBlur={e=>e.target.style.borderColor=SI.border}
                  />
                </div>
                <button onClick={()=>setSelfPrompt(s=>!s)} style={{padding:"0 10px",borderRadius:7,border:`1px solid ${selfPrompt?`${SI.violet}55`:SI.border}`,background:selfPrompt?`${SI.violet}12`:"transparent",color:selfPrompt?SI.violet:"#64748b",fontFamily:MONO,fontSize:9,textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap"}}>
                  {selfPrompt?"⊡":"⊠"} SP
                </button>
                <button onClick={handleSpawn} disabled={!spawnInput.trim()||spawnStatus==="thinking"} style={{padding:"0 13px",borderRadius:7,border:`1px solid ${SI.violet}50`,background:`${SI.violet}12`,color:SI.violet,fontFamily:MONO,fontSize:10,textTransform:"uppercase",cursor:"pointer",display:"flex",alignItems:"center",gap:6,opacity:(!spawnInput.trim()||spawnStatus==="thinking")?.4:1}}>
                  {spawnStatus==="thinking"?<span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span>:"⚡"}
                  {spawnStatus==="thinking"?"…":"Spawn"}
                </button>
              </div>
              {spawnResult && (
                <div style={{borderRadius:7,border:`1px solid ${spawnResultBorder}`,background:spawnResultBg,padding:"9px 11px",fontFamily:MONO,fontSize:10,marginBottom:8}}>
                  {spawnStatus==="duplicate"&&<div><div style={{color:SI.amber,fontWeight:700,marginBottom:4}}>⚠ Already Exists · {spawnResult.existing_ids?.join(", ")}</div><div style={{color:"#94a3b8",fontSize:9.5}}>{spawnResult.message}</div></div>}
                  {spawnStatus==="spawned"&&<div><div style={{color:SI.emerald,fontWeight:700,marginBottom:6}}>✓ Spawned · {spawnResult.agent_id} · {spawnResult.archetype}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2px 14px",fontSize:9.5}}>{[["Role",spawnResult.role,"#e2e8f0"],["Confidence",`${((spawnResult.confidence||0)*100).toFixed(0)}%`,"#e2e8f0"],["Skills",spawnResult.skills_injected?.join(","),SI.violet],["Fleet",`${spawnResult.fleet_updated} agents`,SI.emerald]].map(([k,v,c])=><div key={k}><span style={{color:"#64748b"}}>{k} </span><span style={{color:c}}>{v}</span></div>)}</div>{spawnResult.self_prompted&&<div style={{marginTop:7,paddingTop:7,borderTop:`1px solid ${SI.border}`,color:SI.violet,fontSize:9}}>self-prompt → {spawnResult.self_prompt_task?.slice(0,90)}…</div>}</div>}
                  {spawnStatus==="error"&&<div style={{color:SI.rose}}>⊗ {spawnResult.message}</div>}
                </div>
              )}
              {spawnStatus==="idle"&&!spawnResult&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {Object.keys(ARCHETYPES).map(k=>(
                    <button key={k} onClick={()=>{setSpawnInput(`a ${k} agent`);spawnRef.current?.focus();}}
                      style={{fontFamily:MONO,fontSize:8.5,color:"#64748b",background:"rgba(15,23,42,.8)",border:`1px solid ${SI.border}`,borderRadius:4,padding:"2px 8px",cursor:"pointer",transition:"all .15s"}}
                      onMouseEnter={e=>{e.target.style.color=SI.violet;e.target.style.borderColor=`${SI.violet}40`;}}
                      onMouseLeave={e=>{e.target.style.color="#64748b";e.target.style.borderColor=SI.border;}}>
                      {ARCHETYPES[k].emoji} {k}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {/* Right column: Goals + Experience */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Goal Pipeline */}
            <Panel style={{padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontFamily:MONO,fontSize:10,textTransform:"uppercase",letterSpacing:".1em",color:"#94a3b8",display:"flex",alignItems:"center",gap:6}}><span style={{color:SI.rose}}>🎯</span>Goals</div>
                <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>2 pending</span>
              </div>
              <form onSubmit={e=>{e.preventDefault();if(!newGoal.trim())return;setGoals(g=>[...g,{id:`g-${String(Date.now()).slice(-3)}`,desc:newGoal,pri:goalPri,status:"planning",pipe:false}]);setNewGoal("");}} style={{display:"flex",gap:5,marginBottom:12}}>
                <input value={newGoal} onChange={e=>setNewGoal(e.target.value)} placeholder="Inject directive..."
                  style={{flex:1,background:"#020617",border:`1px solid ${SI.border}`,borderRadius:7,padding:"6px 9px",fontFamily:MONO,fontSize:10.5,color:"#e2e8f0"}}
                  onFocus={e=>e.target.style.borderColor=`${SI.cyan}45`} onBlur={e=>e.target.style.borderColor=SI.border}
                />
                <select value={goalPri} onChange={e=>setGoalPri(Number(e.target.value))} style={{background:"#020617",border:`1px solid ${SI.border}`,borderRadius:7,padding:"6px 5px",fontFamily:MONO,fontSize:10,color:"#94a3b8"}}>
                  {[1,2,3,5,7,10].map(p=><option key={p} value={p}>P{p}</option>)}
                </select>
                <button type="submit" style={{background:`${SI.cyan}15`,border:`1px solid ${SI.cyan}40`,color:SI.cyan,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontSize:13}}>＋</button>
              </form>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
                {GOAL_STAGES.map(stage=>{
                  const sg=goals.filter(g=>g.status===stage.key);
                  return (
                    <div key={stage.key} style={{background:`${stage.c}08`,border:`1px solid ${stage.c}28`,borderRadius:6,padding:5,minHeight:100}}>
                      <div style={{fontFamily:MONO,fontSize:8,fontWeight:700,textTransform:"uppercase",color:stage.c,textAlign:"center",marginBottom:4}}>{stage.key.slice(0,4)}</div>
                      {sg.map(g=>(
                        <div key={g.id} style={{background:"rgba(2,6,23,.7)",border:`1px solid ${SI.border}`,borderRadius:4,padding:"5px 6px",marginBottom:3}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontFamily:MONO,fontSize:7.5,color:"#64748b"}}>{g.id}</span>{g.pipe&&<span style={{fontSize:8,color:SI.violet}}>⑂</span>}</div>
                          <p style={{fontFamily:SANS,fontSize:9,color:"#cbd5e1",lineHeight:1.35,margin:0}}>{g.desc}</p>
                          <div style={{marginTop:3}}><span style={{fontFamily:MONO,fontSize:7.5,padding:"1px 4px",borderRadius:2,background:g.pri<=3?`${SI.rose}15`:"#1e293b",color:g.pri<=3?SI.rose:"#64748b"}}>P{g.pri}</span></div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Experience */}
            <Panel style={{padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontFamily:MONO,fontSize:10,textTransform:"uppercase",letterSpacing:".1em",color:"#94a3b8",display:"flex",alignItems:"center",gap:6}}><span style={{color:SI.violet}}>📖</span>Experiences</div>
                <span style={{fontFamily:MONO,fontSize:9,color:"#475569"}}>Avg 0.77</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {exps.map(e=>(
                  <div key={e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",borderRadius:7,border:`1px solid ${e.ok?SI.border:"rgba(251,113,133,.22)"}`,background:e.ok?"rgba(2,6,23,.4)":"rgba(251,113,133,.04)"}}>
                    <span>{e.score>=.8?"📈":e.score>=.5?"➖":"📉"}</span>
                    <div style={{flex:1,minWidth:0}}><div style={{fontFamily:SANS,fontSize:10.5,color:"#cbd5e1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.task}</div><div style={{fontFamily:MONO,fontSize:8.5,color:"#475569",marginTop:1}}>{e.ts}</div></div>
                    <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:"#94a3b8"}}>{(e.score*100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        {/* ── Task Dispatch Panel — full width ────────────────────────────── */}
        <TaskDispatch agents={agents} onDispatch={handleDispatch}/>

        {/* Footer */}
        <div style={{marginTop:20,paddingTop:12,borderTop:`1px solid rgba(30,41,59,.5)`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",gap:10,fontFamily:MONO,fontSize:9,color:"#334155"}}>
            <span>LangGraph</span><span>•</span><span>ChromaDB</span><span>•</span><span>Ollama</span><span>•</span><span>FastAPI SSE</span><span>•</span><span>Next.js 14</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:SI.cyan,display:"inline-block",boxShadow:`0 0 6px ${SI.cyan}`,animation:"pulse 2s infinite"}}/>
            <span style={{fontFamily:MONO,fontSize:9,color:"#334155"}}>Self-Improving Loop Active</span>
          </div>
        </div>
      </div>

      {approval && <ApprovalGate pending={approval} onDecide={handleApprovalDecide}/>}
    </div>
  );
}
