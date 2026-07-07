# Evonite-SI Architecture

## System Overview

Evonite-SI is a **self-improving multi-agent orchestration platform** designed to spawn, coordinate, and monitor autonomous AI agents across a distributed fleet.

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│          Frontend Dashboard (Next.js)                       │
│  - Real-time agent monitoring (SSE stream)                  │
│  - Task dispatch & approval gates                           │
│  - Hardware scanner & model management                      │
└────────────────────┬────────────────────────────────────────┘
                     │ REST + SSE
┌────────────────────▼────────────────────────────────────────┐
│          FastAPI Backend (api_server.py)                    │
│  POST /api/spawn         - Spawn agents                     │
│  POST /api/task          - Dispatch tasks                   │
│  GET  /api/stream        - Real-time updates (SSE)          │
│  GET  /api/hardware/scan - Hardware profiling               │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────────┐
│     Meta-Orchestrator (meta_orchestrator.py)                   │
│  - LangGraph-based state machine                              │
│  - Goal prioritization & agent routing                        │
│  - Fleet-wide skill injection                                 │
└────────────────────┬──────────────────────────────────────────┘
                     │
         ┌───────────┼──────────────────┐
         │           │                  │
┌────────▼─────────┐ │  ┌──────────────▼───────────────┐
│  Agent Factory   │ │  │  Memory Layer                 │
│  - Type check    │ │  │  - Experience Library         │
│  - Skill binding │ │  │  - Self Model                 │
│  - Spawn logic   │ │  │  - Vector Store (Chroma)      │
└────────┬─────────┘ │  └──���───────────┬───────────────┘
         │           │                 │
         ├───────────┼─────────────────┤
         │
    ┌────▼─────────────────────────────────┐
    │   Agent Fleet                         │
    │  ┌──────────────────────────────┐   │
    │  │ worker-a7d2                   │   │
    │  │ ├─ skills: [...]             │   │
    │  │ ├─ state: running            │   │
    │  │ └─ output: {...}             │   │
    │  ├──────────────────────────────┤   │
    │  │ researcher-f4c9               │   │
    │  │ code-2e1a                     │   │
    │  │ ...                           │   │
    │  └──────────────────────────────┘   │
    └──────────────────────────────────────┘
```

## Core Components

### 1. FastAPI Backend (`api_server.py`)

HTTP/SSE gateway exposing the orchestrator to the frontend.

**Key Endpoints**:

- `POST /api/spawn` — Fuzzy-match human description to archetype, spawn agent
- `POST /api/task` — Dispatch tasks with optional file attachments
- `GET /api/stream` — Real-time dashboard updates (Server-Sent Events)
- `POST /api/goals` — Queue goals with priority
- `POST /api/approve` — Human approval gate for sensitive actions
- `GET /api/hardware/scan` — Profile local hardware, recommend models

### 2. Meta-Orchestrator (`meta_orchestrator.py`)

LangGraph-based state machine coordinating agent fleet.

**Responsibilities**:
- Goal queue prioritization
- Agent routing & assignment
- Skill injection (fleet-wide capability updates)
- Fleet monitoring & resource tracking
- Self-prompting for autonomous improvement

### 3. Agent Factory (`agent_factory.py`)

Spawns and configures agents by archetype.

**Archetypes**: worker, researcher, evaluator, reflection, code, designer, assessor, finaliser

### 4. Memory Layer

- **Experience Library**: Stores execution traces for learning
- **Self Model**: Agent's internal capability map
- **Vector Store**: Semantic search over knowledge (ChromaDB)

### 5. Skill Registry (`skills/`)

Catalog of callable agent capabilities:
- `heuristic_score` — Quality rating
- `detect_errors` — Mistake identification
- `summarise_text` — Content condensing
- `extract_bullets` — Key info extraction
- `build_reflection_prompt` — Meta-learning prompts

### 6. Utilities

- **Logging**: Structured event tracing
- **Monitoring**: CPU/memory/GPU profiling
- **Sandbox**: Secure Python code execution
- **Hardware Scanner**: Local device profiling & LLM recommendations

## Agent Lifecycle

### Spawn Flow

```
User describes agent
       ↓
Fuzzy-match to archetype (e.g., "web scraper" → "researcher")
       ↓
Check for existing agents of that type
       ↓
If exists → return 409 (Conflict)
       ↓
If not → AgentFactory.create(spec)
       ↓
Initialize skills, vector store, experience library
       ↓
Add to fleet, register in meta-orchestrator
       ↓
Optional: Fleet-wide skill injection
       ↓
Optional: Self-prompt task for new agent
       ↓
Return agent_id to user
```

### Task Dispatch Flow

```
User POST /api/task
       ↓
Parse task, files, priority
       ↓
If agent_id specified → direct dispatch to agent.run(task)
       ↓
If agent_id null → MetaOrchestrator.add_goal(...)
       ↓
Orchestrator queues goal, awaits slot
       ↓
Router finds best-fit agent (by archetype/skill affinity)
       ↓
Agent executes, streams results to orchestrator
       ↓
Orchestrator logs completion, updates dashboard
       ↓
Results available via /api/stream (SSE) or polling
```

## Data Flow: Real-time Dashboard

1. Backend calls `orchestrator.dashboard()` every 1 second
2. Payload includes fleet snapshot, goal queue, system vitals
3. FastAPI wraps in SSE: `event: dashboard\ndata: {...}\n\n`
4. Frontend listens via `EventSource`, re-renders on update

## Configuration

Edit `backend/config.py`:

```python
META_MODEL = "mistral:latest"
WORKER_MODEL = "neural-chat:latest"
MAX_AGENTS = 16
REQUIRE_HUMAN_APPROVAL_FOR_SPAWN = True
LOGS_DIR = Path("./logs")
CHROMA_PERSIST_DIR = Path("./chroma_data")
```

## Extension Points

### Adding a New Skill

```python
class MyCustomSkill(BaseSkill):
    name = "my_custom_skill"
    
    async def execute(self, input_data: dict, context: dict) -> dict:
        return {"result": ...}
```

### Adding a New Agent Archetype

```python
KNOWN_ARCHETYPES["my_archetype"] = {
    "description": "...",
    "skills": ["skill1", "skill2"],
}
```
