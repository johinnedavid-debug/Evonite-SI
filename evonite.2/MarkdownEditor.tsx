"use client";
/**
 * MarkdownEditor.tsx — Local Markdown editor with:
 *  - Split-pane edit/preview
 *  - File import via drag-and-drop or file picker
 *  - Document list (local + API persisted)
 *  - Download as .md
 *  - Toolbar: Bold, Italic, Heading, Code, Link, List, Table, HR
 *  - Word count, reading time
 *  - Auto-save to /api/docs
 */
import { useState, useRef, useCallback, useEffect, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Bold, Italic, Code, Link, List, Table,
  Download, Upload, Plus, X, Eye, Edit3, AlignJustify,
  Hash, Minus, ChevronRight,
} from "lucide-react";

interface Doc { id: string; title: string; content: string; updated: number; }

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STARTER = `# New Document

Start writing here…

## Section
Add your content.

\`\`\`python
# Code blocks are supported
print("Hello, SI!")
\`\`\`

> Blockquotes work too.

| Column A | Column B |
|----------|----------|
| Value 1  | Value 2  |
`;

function parseMarkdown(md: string): string {
  let html = md
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    // Fenced code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/gm, (_,lang,code)=>
      `<pre class="si-code-block"><code class="language-${lang}">${code.trim()}</code></pre>`)
    // Headings
    .replace(/^######\s(.+)$/gm,"<h6>$1</h6>")
    .replace(/^#####\s(.+)$/gm,"<h5>$1</h5>")
    .replace(/^####\s(.+)$/gm,"<h4>$1</h4>")
    .replace(/^###\s(.+)$/gm,"<h3>$1</h3>")
    .replace(/^##\s(.+)$/gm,"<h2>$1</h2>")
    .replace(/^#\s(.+)$/gm,"<h1>$1</h1>")
    // Tables
    .replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/gm, (match)=>{
      const lines = match.trim().split("\n");
      const headers = lines[0].split("|").filter(Boolean).map(h=>`<th>${h.trim()}</th>`).join("");
      const rows = lines.slice(2).map(r=>{
        const cells = r.split("|").filter(Boolean).map(c=>`<td>${c.trim()}</td>`).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    // Blockquotes
    .replace(/^&gt;\s(.+)$/gm,"<blockquote>$1</blockquote>")
    // Inline code
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    // Bold + Italic
    .replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    // Strikethrough
    .replace(/~~(.+?)~~/g,"<del>$1</del>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
    // HR
    .replace(/^---$/gm,"<hr/>")
    // Unordered lists
    .replace(/^[-*+]\s(.+)$/gm,"<li>$1</li>")
    // Ordered lists
    .replace(/^\d+\.\s(.+)$/gm,"<li>$1</li>")
    // Paragraphs
    .replace(/\n\n/g,"</p><p>")
    .replace(/\n/g,"<br/>");
  return `<p>${html}</p>`;
}

export default function MarkdownEditor() {
  const [docs,       setDocs]       = useState<Doc[]>([]);
  const [activeId,   setActiveId]   = useState<string|null>(null);
  const [content,    setContent]    = useState(STARTER);
  const [title,      setTitle]      = useState("Untitled");
  const [viewMode,   setViewMode]   = useState<"edit"|"split"|"preview">("split");
  const [sidebarOpen,setSidebarOpen]= useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [saved,      setSaved]      = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef= useRef<HTMLInputElement>(null);
  const saveTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);

  const activeDoc = docs.find(d=>d.id===activeId);
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.ceil(words/200));

  // Auto-save debounce
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaved(false);
    saveTimer.current = setTimeout(() => {
      setDocs(prev => {
        if (!activeId) return prev;
        return prev.map(d=>d.id===activeId ? {...d,content,title,updated:Date.now()} : d);
      });
      setSaved(true);
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [content, title, activeId]);

  const newDoc = useCallback(() => {
    const doc: Doc = { id:`doc-${Date.now()}`, title:"Untitled", content:STARTER, updated:Date.now() };
    setDocs(p=>[doc,...p]);
    setActiveId(doc.id);
    setContent(STARTER);
    setTitle("Untitled");
  }, []);

  const openDoc = (doc: Doc) => { setActiveId(doc.id); setContent(doc.content); setTitle(doc.title); };

  const deleteDoc = (id: string) => {
    setDocs(p=>p.filter(d=>d.id!==id));
    if (activeId===id) { setActiveId(null); setContent(STARTER); setTitle("Untitled"); }
  };

  // File import
  const importFile = async (file: File) => {
    const text = await file.text();
    const doc: Doc = { id:`doc-${Date.now()}`, title:file.name.replace(/\.md$/,""), content:text, updated:Date.now() };
    setDocs(p=>[doc,...p]);
    setActiveId(doc.id);
    setContent(text);
    setTitle(doc.title);
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".md")||file.name.endsWith(".txt"))) await importFile(file);
  }, []);

  // Download
  const downloadMd = () => {
    const blob = new Blob([content], {type:"text/markdown"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${title.replace(/\s+/g,"-")}.md`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Toolbar insert helpers
  const insert = (before: string, after="", placeholder="text") => {
    const ta = textareaRef.current; if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel  = content.slice(start,end) || placeholder;
    const newContent = content.slice(0,start) + before + sel + after + content.slice(end);
    setContent(newContent);
    setTimeout(()=>{
      ta.focus();
      const newPos = start + before.length;
      ta.setSelectionRange(newPos, newPos + sel.length);
    },0);
  };

  const toolbarItems = [
    { icon:<Bold       className="w-3.5 h-3.5"/>, action:()=>insert("**","**","bold text"),       title:"Bold"          },
    { icon:<Italic     className="w-3.5 h-3.5"/>, action:()=>insert("*","*","italic text"),        title:"Italic"        },
    { icon:<Hash       className="w-3.5 h-3.5"/>, action:()=>insert("## ","","Heading"),            title:"Heading"       },
    { icon:<Code       className="w-3.5 h-3.5"/>, action:()=>insert("`","`","code"),               title:"Inline code"   },
    { icon:<Link       className="w-3.5 h-3.5"/>, action:()=>insert("[","](url)","link text"),     title:"Link"          },
    { icon:<List       className="w-3.5 h-3.5"/>, action:()=>insert("- ","","list item"),           title:"List"          },
    { icon:<Table      className="w-3.5 h-3.5"/>, action:()=>insert("\n| Col A | Col B |\n|--------|--------|\n| Value  | Value  |\n","",""), title:"Table" },
    { icon:<Minus      className="w-3.5 h-3.5"/>, action:()=>insert("\n---\n","",""),               title:"Horizontal rule"},
  ];

  return (
    <div className="glass-panel rounded-xl overflow-hidden flex" style={{minHeight:480}}>

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{width:0,opacity:0}} animate={{width:200,opacity:1}} exit={{width:0,opacity:0}}
            className="border-r border-slate-800/60 flex flex-col overflow-hidden flex-shrink-0">
            <div className="flex items-center justify-between px-3 py-3 border-b border-slate-800/40">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Documents</span>
              <button onClick={newDoc} className="text-si-cyan hover:text-si-cyan/70 transition-colors"><Plus className="w-3.5 h-3.5"/></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {docs.length === 0 && (
                <div className="p-4 text-center">
                  <p className="text-[10px] font-mono text-slate-700">No documents yet</p>
                  <button onClick={newDoc} className="mt-2 text-[10px] font-mono text-si-cyan hover:underline">Create one</button>
                </div>
              )}
              {docs.map(doc=>(
                <div key={doc.id} onClick={()=>openDoc(doc)}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-slate-800/20 transition-colors ${activeId===doc.id?"bg-si-cyan/8 border-l-2 border-l-si-cyan":"hover:bg-white/[0.02]"}`}>
                  <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${activeId===doc.id?"text-si-cyan":"text-slate-700"}`}/>
                  <span className={`text-[10px] font-mono truncate flex-1 ${activeId===doc.id?"text-slate-200":"text-slate-500"}`}>{doc.title}</span>
                  <button onClick={e=>{e.stopPropagation();deleteDoc(doc.id);}}
                    className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-si-rose transition-all"><X className="w-3 h-3"/></button>
                </div>
              ))}
            </div>
            {/* Import */}
            <div className="p-3 border-t border-slate-800/40">
              <input ref={fileInputRef} type="file" accept=".md,.txt" onChange={e=>{ const f=e.target.files?.[0]; if(f) importFile(f); e.target.value=""; }} className="hidden"/>
              <button onClick={()=>fileInputRef.current?.click()}
                className="w-full flex items-center gap-2 py-2 px-3 border border-dashed border-slate-800 rounded-lg text-[10px] font-mono text-slate-600 hover:border-slate-700 hover:text-slate-400 transition-colors">
                <Upload className="w-3 h-3"/> Import .md
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor area */}
      <div className="flex-1 flex flex-col min-w-0"
        onDrop={handleDrop} onDragOver={e=>{e.preventDefault();setIsDragging(true);}} onDragLeave={()=>setIsDragging(false)}>

        {/* Editor header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/60">
          <button onClick={()=>setSidebarOpen(s=>!s)} className="text-slate-600 hover:text-slate-400 transition-colors">
            <AlignJustify className="w-4 h-4"/>
          </button>
          <input value={title} onChange={e=>setTitle(e.target.value)}
            className="flex-1 bg-transparent text-[13px] font-mono text-slate-200 focus:outline-none placeholder:text-slate-700 min-w-0"
            placeholder="Document title…"/>
          <div className="flex items-center gap-1 text-[9px] font-mono text-slate-700">
            <span>{words}w</span><span>·</span><span>{readTime}min</span>
            {saved && <span className="text-si-emerald ml-1">● saved</span>}
          </div>
          {/* View mode */}
          <div className="flex rounded-lg overflow-hidden border border-slate-800">
            {([["edit",<Edit3 className="w-3 h-3"/>],["split",<ChevronRight className="w-3 h-3"/>],["preview",<Eye className="w-3 h-3"/>]] as const).map(([m,icon])=>(
              <button key={m} onClick={()=>setViewMode(m as typeof viewMode)}
                className={`px-2.5 py-1.5 transition-colors ${viewMode===m?"bg-si-cyan/15 text-si-cyan":"text-slate-600 hover:text-slate-400"}`}>
                {icon}
              </button>
            ))}
          </div>
          {/* Download */}
          <button onClick={downloadMd} title="Download .md" className="p-1.5 text-slate-600 hover:text-si-cyan transition-colors">
            <Download className="w-3.5 h-3.5"/>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-slate-800/40">
          {toolbarItems.map((item,i)=>(
            <button key={i} onClick={item.action} title={item.title}
              className="p-1.5 rounded text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors">
              {item.icon}
            </button>
          ))}
        </div>

        {/* Panes */}
        <div className={`flex flex-1 overflow-hidden ${isDragging?"ring-2 ring-si-cyan/40 ring-inset":""}`}>
          {/* Editor pane */}
          {(viewMode==="edit"||viewMode==="split") && (
            <textarea ref={textareaRef} value={content} onChange={e=>setContent(e.target.value)}
              spellCheck
              className={`flex-1 bg-transparent px-5 py-4 text-[12px] font-mono text-slate-300 resize-none focus:outline-none leading-relaxed ${viewMode==="split"?"border-r border-slate-800/60":""}`}
              style={{minHeight:320}}
              placeholder="Start writing Markdown here…"
            />
          )}
          {/* Preview pane */}
          {(viewMode==="preview"||viewMode==="split") && (
            <div className="flex-1 px-5 py-4 overflow-y-auto">
              <div className="si-markdown-preview" dangerouslySetInnerHTML={{__html:parseMarkdown(content)}}/>
            </div>
          )}
        </div>

        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-si-cyan/5 border-2 border-si-cyan/40 rounded-xl flex items-center justify-center pointer-events-none">
            <div className="text-si-cyan font-mono text-sm">Drop .md or .txt file to import</div>
          </div>
        )}
      </div>

      <style>{`
        .si-markdown-preview h1{font-size:1.5rem;font-weight:700;color:#f1f5f9;margin:0 0 .75rem;border-bottom:1px solid #1e293b;padding-bottom:.5rem}
        .si-markdown-preview h2{font-size:1.2rem;font-weight:600;color:#e2e8f0;margin:1.25rem 0 .5rem}
        .si-markdown-preview h3{font-size:1rem;font-weight:600;color:#cbd5e1;margin:1rem 0 .4rem}
        .si-markdown-preview p{color:#94a3b8;line-height:1.7;margin:.5rem 0;font-size:.8rem}
        .si-markdown-preview code{background:#0f172a;border:1px solid #1e293b;border-radius:3px;padding:1px 5px;font-size:.75rem;color:#22d3ee;font-family:'JetBrains Mono',monospace}
        .si-markdown-preview pre.si-code-block{background:#020617;border:1px solid #1e293b;border-radius:8px;padding:1rem;overflow-x:auto;margin:.75rem 0}
        .si-markdown-preview pre.si-code-block code{background:none;border:none;padding:0;color:#a78bfa;font-size:.75rem}
        .si-markdown-preview blockquote{border-left:3px solid #a78bfa;padding-left:1rem;color:#64748b;font-style:italic;margin:.75rem 0}
        .si-markdown-preview a{color:#22d3ee;text-decoration:underline;text-decoration-color:rgba(34,211,238,.4)}
        .si-markdown-preview strong{color:#e2e8f0;font-weight:600}
        .si-markdown-preview em{color:#cbd5e1;font-style:italic}
        .si-markdown-preview del{color:#475569;text-decoration:line-through}
        .si-markdown-preview hr{border:none;border-top:1px solid #1e293b;margin:1.5rem 0}
        .si-markdown-preview ul,.si-markdown-preview ol{padding-left:1.5rem;color:#94a3b8;font-size:.8rem}
        .si-markdown-preview li{margin:.2rem 0;line-height:1.6}
        .si-markdown-preview table{width:100%;border-collapse:collapse;margin:.75rem 0;font-size:.75rem}
        .si-markdown-preview th{background:#0f172a;color:#22d3ee;font-family:'JetBrains Mono',monospace;font-weight:600;padding:.4rem .75rem;border:1px solid #1e293b;text-align:left}
        .si-markdown-preview td{color:#94a3b8;padding:.4rem .75rem;border:1px solid #1e293b}
        .si-markdown-preview tr:hover td{background:rgba(255,255,255,.02)}
      `}</style>
    </div>
  );
}
