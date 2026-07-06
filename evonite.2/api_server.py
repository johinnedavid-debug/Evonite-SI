# api_server.py  v2
"""
FastAPI bridge for the Synthetic Intelligence platform.
Exposes the MetaOrchestrator to the frontend via SSE + REST.

New in v2:
  POST /api/spawn  — describe an agent in plain English; the SI checks if a
                     matching archetype already exists, spawns if not, then
                     skill-injects fleet-wide and optionally self-prompts.
"""

import asyncio
import json
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

import config
from agent_factory import AgentFactory, AgentSpec
from memory.experience_library import ExperienceLibrary
from memory.self_model import SelfModel
from memory.vector_store import VectorStore
from meta_orchestrator import MetaOrchestrator
from skills.registry import SkillRegistry, get_registry
from utils.logging import get_logger
from utils.monitoring import ResourceMonitor
from utils.sandbox import Sandbox

logger = get_logger("api_server")

# ── Known archetypes (mirrors _TYPE_MAP in agent_factory.py) ─────────────────
KNOWN_ARCHETYPES = {
    "worker":     {"description": "General-purpose task executor",                "skills": ["heuristic_score", "detect_errors"]},
    "researcher": {"description": "Research and synthesis agent with web access", "skills": ["summarise_text", "extract_bullets"]},
    "evaluator":  {"description": "Scores and critiques agent outputs",           "skills": ["heuristic_score", "detect_errors"]},
    "reflection": {"description": "Meta-reflection and lesson extraction",        "skills": ["build_reflection_prompt", "heuristic_score"]},
    "code":       {"description": "Python code generation and sandbox execution", "skills": ["detect_errors", "fingerprint"]},
    "designer":   {"description": "UI/UX specification and design artefacts",     "skills": ["summarise_text", "extract_bullets"]},
    "assessor":   {"description": "Holistic quality assessment and go/no-go",     "skills": ["heuristic_score", "detect_errors"]},
    "finaliser":  {"description": "Synthesises pipeline work into final output",  "skills": ["summarise_text", "build_reflection_prompt"]},
}

# ── Shared state ──────────────────────────────────────────────────────────────
_orchestrator: MetaOrchestrator | None = None
_spawn_log: list = []           # ring buffer of recent spawn events


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _orchestrator
    vs       = VectorStore()
    exp_lib  = ExperienceLibrary(vs)
    registry = get_registry()
    registry.load_module("skills.base_skills")
    sandbox  = Sandbox()
    monitor  = ResourceMonitor(interval=5.0)
    factory  = AgentFactory(
        vector_store=vs, experience_library=exp_lib,
        skill_registry=registry, sandbox=sandbox, monitor=monitor,
    )
    _orchestrator = MetaOrchestrator(
        factory=factory, monitor=monitor,
        exp_lib=exp_lib, skill_registry=registry,
        vector_store=vs, sandbox=sandbox,
    )
    bg = [
        asyncio.create_task(monitor.start()),
        asyncio.create_task(_orchestrator.run_forever()),
    ]
    yield
    _orchestrator.stop()
    for t in bg:
        t.cancel()
    try:
        await asyncio.gather(*bg)
    except asyncio.CancelledError:
        pass
    sandbox.close()


app = FastAPI(title="Synthetic Intelligence API v2", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helper: fuzzy-match description to an archetype ──────────────────────────

def _match_archetype(description: str) -> tuple[str | None, float]:
    """
    Return (archetype_key, confidence) for the best match against KNOWN_ARCHETYPES.
    confidence ∈ [0, 1].  Returns (None, 0) if no good match found.
    """
    desc_lower = description.lower()
    scores: dict[str, float] = {}
    keyword_map = {
        "worker":     ["worker","general","task","executor","utility","helper"],
        "researcher": ["research","search","explore","investigate","scout","web","internet","browse"],
        "evaluator":  ["evaluat","score","judge","critic","rate","assess","review"],
        "reflection": ["reflect","introspect","lesson","meta","retrospect","learn"],
        "code":       ["code","coder","program","develop","script","python","software","engineer"],
        "designer":   ["design","ui","ux","visual","wireframe","layout","frontend","css","figma"],
        "assessor":   ["assess","qa","quality","gate","audit","test","inspect"],
        "finaliser":  ["finalise","finalize","final","deliver","synthesise","publish","ship","complete"],
    }
    for atype, keywords in keyword_map.items():
        hit = sum(1 for kw in keywords if kw in desc_lower)
        scores[atype] = hit / len(keywords)

    best = max(scores, key=scores.get)
    return (best, scores[best]) if scores[best] > 0 else (None, 0.0)


def _find_existing(archetype: str, factory: AgentFactory) -> list:
    """Return any live agents matching the archetype type."""
    return factory.agents_by_type(archetype)


def _spawn_log_entry(event: str, **kwargs) -> dict:
    entry = {"ts": time.strftime("%H:%M:%S"), "event": event, **kwargs}
    _spawn_log.append(entry)
    if len(_spawn_log) > 200:
        _spawn_log.pop(0)
    return entry


# ── REST: spawn endpoint ──────────────────────────────────────────────────────

@app.post("/api/spawn")
async def spawn_agent(request: Request):
    """
    Human-readable agent spawn request.

    Body: { "description": "I need a web scraping researcher", "self_prompt": true }

    Logic:
      1. Fuzzy-match description → archetype
      2. If archetype already exists in fleet → return 409 with details
      3. Otherwise → spawn agent, skill-inject fleet-wide
      4. If self_prompt=true → orchestrator self-prompts a task for the new agent
    """
    if not _orchestrator:
        return JSONResponse({"error": "Orchestrator not ready"}, status_code=503)

    body        = await request.json()
    description = body.get("description", "").strip()
    self_prompt = bool(body.get("self_prompt", False))
    custom_role = body.get("role", "").strip()

    if not description:
        return JSONResponse({"error": "description is required"}, status_code=400)

    # ── 1. Match archetype ────────────────────────────────────────────────────
    archetype, confidence = _match_archetype(description)

    if archetype is None or confidence < 0.05:
        # No match → treat as custom worker with the user's description as role
        archetype  = "worker"
        confidence = 0.0
        role_name  = custom_role or description[:40].lower().replace(" ", "-")
        is_custom  = True
    else:
        role_name = custom_role or f"{archetype}-agent"
        is_custom = False

    archetype_info = KNOWN_ARCHETYPES.get(archetype, {})
    _spawn_log_entry("describe", description=description, matched=archetype, confidence=round(confidence, 2))

    # ── 2. Check for existing matching agents ────────────────────────────────
    factory   = _orchestrator._factory
    existing  = _find_existing(archetype, factory)

    if existing:
        ids = [a.agent_id for a in existing]
        _spawn_log_entry("duplicate_detected", archetype=archetype, existing_ids=ids)
        return JSONResponse({
            "status":        "already_exists",
            "archetype":     archetype,
            "description":   archetype_info.get("description", ""),
            "existing_ids":  ids,
            "message":       (
                f"A {archetype} agent already exists in the fleet "
                f"({len(existing)} instance(s): {', '.join(ids)}). "
                f"No new agent spawned."
            ),
        }, status_code=409)

    # ── 3. Spawn ──────────────────────────────────────────────────────────────
    new_id = f"{archetype}-{uuid.uuid4().hex[:6]}"
    spec   = AgentSpec(
        role=role_name, agent_type=archetype,
        initial_skills=archetype_info.get("skills", []),
        agent_id=new_id, spawned_by="human-terminal",
        metadata={"origin": "terminal-spawn", "description": description},
    )
    try:
        agent = factory.create(spec)
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=503)

    _spawn_log_entry("spawned", agent_id=new_id, archetype=archetype, role=role_name,
                     skills=spec.initial_skills)

    # ── 4. Fleet-wide skill injection ─────────────────────────────────────────
    injected_count = await _orchestrator.inject_skill_fleet_wide(
        archetype_info.get("skills", ["heuristic_score"])[0]
    )
    _spawn_log_entry("skill_injected", skill=spec.initial_skills[0] if spec.initial_skills else "—",
                     agents_updated=injected_count)

    # ── 5. Optional self-prompt ────────────────────────────────────────────────
    self_prompt_task = None
    if self_prompt:
        self_prompt_task = (
            f"You are a newly spawned {archetype} agent ({new_id}). "
            f"Introduce yourself: describe your capabilities, "
            f"what kinds of tasks you excel at, and propose your first self-directed task."
        )
        _orchestrator.add_goal(
            description=self_prompt_task,
            priority=2,
            source="human-terminal",
        )
        _spawn_log_entry("self_prompted", agent_id=new_id, task=self_prompt_task[:80])

    return {
        "status":            "spawned",
        "agent_id":          new_id,
        "archetype":         archetype,
        "role":              role_name,
        "confidence":        round(confidence, 2),
        "is_custom":         is_custom,
        "skills_injected":   spec.initial_skills,
        "fleet_updated":     injected_count,
        "self_prompted":     self_prompt,
        "self_prompt_task":  self_prompt_task,
        "message":           (
            f"Spawned {archetype} agent '{new_id}' as '{role_name}'. "
            f"Skills {spec.initial_skills} injected fleet-wide ({injected_count} agents updated)."
            + (f" Self-prompt queued." if self_prompt else "")
        ),
    }


# ── REST: spawn log ───────────────────────────────────────────────────────────

@app.get("/api/spawn/log")
async def get_spawn_log():
    return {"log": _spawn_log[-50:]}


# ── Existing endpoints ────────────────────────────────────────────────────────

@app.get("/api/dashboard")
async def dashboard():
    if not _orchestrator:
        return JSONResponse({"error": "Orchestrator not ready"}, status_code=503)
    return _orchestrator.dashboard()


@app.post("/api/goals")
async def add_goal(request: Request):
    body = await request.json()
    goal = _orchestrator.add_goal(
        description=body.get("description", ""),
        priority=body.get("priority", 5),
    )
    return {"goal_id": goal.goal_id, "status": "queued"}


@app.post("/api/approve")
async def approve_action(request: Request):
    body = await request.json()
    action   = body.get("action")
    approved = body.get("approved", False)
    _orchestrator._pending_approval = {
        "action": action, "approved": approved, "timestamp": time.time(),
    }
    return {"status": "recorded", "action": action, "approved": approved}


@app.post("/api/stop")
async def stop():
    _orchestrator.stop()
    return {"status": "stop_requested"}


# ── SSE Real-time Stream ──────────────────────────────────────────────────────

async def dashboard_stream() -> AsyncGenerator[str, None]:
    while True:
        if not _orchestrator:
            yield f"event: error\ndata: {json.dumps({'msg': 'not ready'})}\n\n"
            await asyncio.sleep(2)
            continue
        payload         = _orchestrator.dashboard()
        payload["_ts"]  = time.time()
        payload["_pulse"] = abs(hash(str(payload["iteration"]))) % 1000
        payload["spawn_log"] = _spawn_log[-10:]   # last 10 spawn events
        yield f"event: dashboard\ndata: {json.dumps(payload, default=str)}\n\n"
        await asyncio.sleep(1.0)


@app.get("/api/stream")
async def stream():
    return StreamingResponse(
        dashboard_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# v3 — Task Dispatch endpoint
# ═══════════════════════════════════════════════════════════════════════════════

import base64
import mimetypes
from pathlib import Path

TASK_LOG: list = []   # ring buffer of dispatched tasks


def _task_log_entry(event: str, **kwargs) -> dict:
    entry = {"ts": time.strftime("%H:%M:%S"), "event": event, **kwargs}
    TASK_LOG.append(entry)
    if len(TASK_LOG) > 300:
        TASK_LOG.pop(0)
    return entry


@app.post("/api/task")
async def dispatch_task(request: Request):
    """
    Dispatch a task to a specific agent or let the orchestrator route it.

    Accepts multipart-style JSON body:
    {
      "task":         "Summarise this document",
      "agent_id":     "cod-7d26" | null,      # null → orchestrator picks
      "priority":     3,
      "use_pipeline": false,
      "context_url":  "https://...",           # optional URL to fetch
      "attachments":  [                        # optional file payloads
        { "name": "report.pdf", "type": "application/pdf", "data": "<base64>" }
      ]
    }

    Returns task_id, routed_to agent_id, queue position.
    """
    if not _orchestrator:
        return JSONResponse({"error": "Orchestrator not ready"}, status_code=503)

    body         = await request.json()
    task_text    = body.get("task", "").strip()
    agent_id     = body.get("agent_id")          # specific agent or None
    priority     = int(body.get("priority", 5))
    use_pipeline = bool(body.get("use_pipeline", False))
    context_url  = body.get("context_url", "").strip()
    attachments  = body.get("attachments", [])   # list of {name, type, data}

    if not task_text and not attachments:
        return JSONResponse({"error": "task text or attachments required"}, status_code=400)

    task_id = f"task-{uuid.uuid4().hex[:8]}"

    # ── Build enriched task description ──────────────────────────────────────
    parts = [task_text] if task_text else []

    if context_url:
        parts.append(f"\n[URL context: {context_url}]")
        _task_log_entry("url_attached", task_id=task_id, url=context_url)

    file_summaries = []
    for att in attachments[:5]:   # cap at 5 files
        name  = att.get("name", "file")
        ftype = att.get("type", "text/plain")
        data  = att.get("data", "")
        size_kb = round(len(data) * 3 / 4 / 1024, 1)  # base64 → bytes approx
        file_summaries.append(f"{name} ({ftype}, ~{size_kb}KB)")

        # For text-based files, decode and inline a preview
        if ftype.startswith("text/") or ftype in ("application/json", "application/xml"):
            try:
                decoded = base64.b64decode(data).decode("utf-8", errors="replace")
                parts.append(f"\n[File: {name}]\n{decoded[:3000]}")
            except Exception:
                parts.append(f"\n[File attached: {name}]")
        else:
            parts.append(f"\n[Binary file attached: {name} — {ftype}]")

        _task_log_entry("file_attached", task_id=task_id, name=name, type=ftype, size_kb=size_kb)

    full_task = "\n".join(parts)

    # ── Route to specific agent or orchestrator ───────────────────────────────
    routed_to = agent_id
    factory   = _orchestrator._factory

    if agent_id:
        # Direct dispatch to named agent
        agent = factory.get(agent_id)
        if not agent:
            return JSONResponse({"error": f"Agent '{agent_id}' not found"}, status_code=404)
        asyncio.create_task(agent.run(full_task))
        routed_to = agent_id
        _task_log_entry("direct_dispatch", task_id=task_id, agent_id=agent_id, task=task_text[:60])
    else:
        # Orchestrator-routed goal
        goal = _orchestrator.add_goal(
            description=full_task,
            priority=priority,
            use_pipeline=use_pipeline,
            source="human-task-panel",
        )
        routed_to = f"orchestrator→{goal.goal_id}"
        _task_log_entry("orchestrator_routed", task_id=task_id, goal_id=goal.goal_id,
                        priority=priority, pipeline=use_pipeline, task=task_text[:60])

    return {
        "status":       "dispatched",
        "task_id":      task_id,
        "routed_to":    routed_to,
        "priority":     priority,
        "use_pipeline": use_pipeline,
        "attachments":  file_summaries,
        "context_url":  context_url or None,
        "message":      (
            f"Task '{task_text[:50]}' dispatched as {task_id}. "
            f"Routed to {routed_to}."
            + (f" Attachments: {', '.join(file_summaries)}." if file_summaries else "")
        ),
    }


@app.get("/api/task/log")
async def get_task_log():
    return {"log": TASK_LOG[-50:]}


# ═══════════════════════════════════════════════════════════════════════════════
# v4 — Calendar, Markdown, Hardware/Model endpoints
# ═══════════════════════════════════════════════════════════════════════════════

import subprocess as _subprocess
from backend.hardware_scanner import scan_hardware, get_recommendations

# ── In-memory calendar store ──────────────────────────────────────────────────
import datetime as _dt
_CALENDAR_EVENTS: list[dict] = []


@app.get("/api/calendar")
async def get_calendar_events(month: int = 0, year: int = 0):
    now = _dt.datetime.now()
    m, y = month or now.month, year or now.year
    filtered = [e for e in _CALENDAR_EVENTS
                if e["date"].startswith(f"{y:04d}-{m:02d}")]
    return {"events": filtered, "month": m, "year": y}


@app.post("/api/calendar")
async def create_calendar_event(request: Request):
    body = await request.json()
    event = {
        "id":       f"evt-{uuid.uuid4().hex[:8]}",
        "title":    body.get("title", "Untitled"),
        "date":     body.get("date", ""),           # "YYYY-MM-DD"
        "time":     body.get("time", ""),           # "HH:MM"
        "type":     body.get("type", "task"),       # task | goal | meeting | reminder
        "agent":    body.get("agent", ""),
        "color":    body.get("color", "#22d3ee"),
        "notes":    body.get("notes", ""),
        "created":  time.time(),
    }
    _CALENDAR_EVENTS.append(event)
    return event


@app.delete("/api/calendar/{event_id}")
async def delete_calendar_event(event_id: str):
    global _CALENDAR_EVENTS
    before = len(_CALENDAR_EVENTS)
    _CALENDAR_EVENTS = [e for e in _CALENDAR_EVENTS if e["id"] != event_id]
    return {"deleted": before - len(_CALENDAR_EVENTS)}


# ── Markdown document store ───────────────────────────────────────────────────
_MARKDOWN_DOCS: dict[str, dict] = {}


@app.get("/api/docs")
async def list_docs():
    return {"docs": [{"id":k,"title":v["title"],"updated":v["updated"]} for k,v in _MARKDOWN_DOCS.items()]}


@app.get("/api/docs/{doc_id}")
async def get_doc(doc_id: str):
    doc = _MARKDOWN_DOCS.get(doc_id)
    if not doc:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return doc


@app.post("/api/docs")
async def create_doc(request: Request):
    body = await request.json()
    doc_id = f"doc-{uuid.uuid4().hex[:8]}"
    doc = {
        "id":       doc_id,
        "title":    body.get("title", "Untitled"),
        "content":  body.get("content", ""),
        "created":  time.time(),
        "updated":  time.time(),
        "tags":     body.get("tags", []),
    }
    _MARKDOWN_DOCS[doc_id] = doc
    return doc


@app.put("/api/docs/{doc_id}")
async def update_doc(doc_id: str, request: Request):
    body = await request.json()
    if doc_id not in _MARKDOWN_DOCS:
        return JSONResponse({"error": "Not found"}, status_code=404)
    _MARKDOWN_DOCS[doc_id].update({
        "title":   body.get("title", _MARKDOWN_DOCS[doc_id]["title"]),
        "content": body.get("content", _MARKDOWN_DOCS[doc_id]["content"]),
        "updated": time.time(),
    })
    return _MARKDOWN_DOCS[doc_id]


# ── Hardware scan + model recommendation ─────────────────────────────────────

@app.get("/api/hardware/scan")
async def hardware_scan():
    profile = await scan_hardware()
    recs    = get_recommendations(profile)
    return {
        "profile": {
            "os":               profile.os,
            "cpu_model":        profile.cpu_model,
            "cpu_cores":        profile.cpu_cores,
            "ram_gb":           profile.ram_gb,
            "gpu_vendor":       profile.gpu_vendor,
            "gpu_model":        profile.gpu_model,
            "vram_gb":          profile.vram_gb,
            "cuda_version":     profile.cuda_version,
            "rocm_version":     profile.rocm_version,
            "metal_support":    profile.metal_support,
            "ollama_installed": profile.ollama_installed,
            "ollama_version":   profile.ollama_version,
            "tier":             profile.capability_tier(),
        },
        "recommendations": [
            {
                "rank":          r.rank,
                "name":          r.name,
                "display_name":  r.display_name,
                "params":        r.params,
                "quant":         r.quant,
                "vram_required": r.vram_required,
                "ram_required":  r.ram_required,
                "tier":          r.tier,
                "use_case":      r.use_case,
                "speed_est":     r.speed_est,
                "quality":       r.quality,
                "pull_command":  r.pull_command,
                "size_gb":       r.size_gb,
            }
            for r in recs
        ],
    }


@app.post("/api/hardware/download")
async def download_model(request: Request):
    """
    Trigger `ollama pull <model>` in a background process.
    Returns immediately — poll /api/hardware/download/{model} for progress.
    """
    body  = await request.json()
    model = body.get("model", "").strip()
    if not model:
        return JSONResponse({"error": "model name required"}, status_code=400)

    # Safety: only allow known model names
    allowed = {r.name for r in __import__("backend.hardware_scanner", fromlist=["MODEL_CATALOGUE"]).MODEL_CATALOGUE}
    if model not in allowed:
        return JSONResponse({"error": f"Unknown model '{model}'"}, status_code=400)

    import shutil as _shutil
    if not _shutil.which("ollama"):
        return JSONResponse({"error": "Ollama is not installed. Visit https://ollama.com/download"}, status_code=503)

    # Fire-and-forget subprocess
    proc = _subprocess.Popen(
        ["ollama", "pull", model],
        stdout=_subprocess.PIPE, stderr=_subprocess.STDOUT,
        text=True,
    )
    return {
        "status":  "pulling",
        "model":   model,
        "pid":     proc.pid,
        "message": f"ollama pull {model} started (PID {proc.pid}). Check terminal for progress.",
    }
