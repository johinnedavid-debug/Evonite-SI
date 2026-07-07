# Evonite-SI

A **synthetic intelligence mother panel** designed to spawn and orchestrate autonomous agents, providing a unified control hub for multi-agent AI systems.

## 🎯 Overview

Evonite-SI is a self-improving multi-agent AI platform that:
- **Spawns agents dynamically** based on natural language descriptions
- **Orchestrates fleet-wide operations** with a meta-controller
- **Routes tasks intelligently** across specialized agents (researchers, designers, coders, etc.)
- **Provides real-time monitoring** via SSE streaming dashboard
- **Manages hardware resources** with model recommendations for local LLMs

## 🏗️ Architecture

```
Evonite-SI/
├── backend/          FastAPI + LangGraph orchestration engine
├── frontend/         Next.js React dashboard
├── docs/             Architecture & design documentation
└── README.md         (You are here)
```

### Stack

- **Backend**: Python 3.11+ | FastAPI | LangGraph | ChromaDB | Ollama
- **Frontend**: Next.js 14 | React 18 | Tailwind CSS | Framer Motion
- **Database**: ChromaDB (vector embeddings)
- **Models**: Ollama (local LLMs, no external APIs)

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Ollama ([download](https://ollama.com))

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
python main.py
```

The API will start on `http://localhost:8000`.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The dashboard opens at `http://localhost:3000`.

## 💡 API Endpoints

### Agent Spawning

```bash
POST /api/spawn
{
  "description": "I need a web scraping researcher",
  "self_prompt": true
}
```

### Task Dispatch

```bash
POST /api/task
{
  "task": "Summarize this document",
  "agent_id": null,  # null → orchestrator picks
  "priority": 3,
  "attachments": []
}
```

### Real-time Dashboard

```bash
GET /api/stream  # Server-Sent Events
```

### Hardware Recommendations

```bash
GET /api/hardware/scan
POST /api/hardware/download  # Download models via Ollama
```

## 🤖 Agent Archetypes

| Type | Description | Skills |
|------|-------------|--------|
| **worker** | General-purpose task executor | heuristic_score, detect_errors |
| **researcher** | Research & synthesis with web access | summarise_text, extract_bullets |
| **evaluator** | Scores and critiques outputs | heuristic_score, detect_errors |
| **reflection** | Meta-reflection & lesson extraction | build_reflection_prompt, heuristic_score |
| **code** | Python code generation & sandbox execution | detect_errors, fingerprint |
| **designer** | UI/UX specs & design artifacts | summarise_text, extract_bullets |
| **assessor** | Holistic quality assessment | heuristic_score, detect_errors |
| **finaliser** | Synthesizes pipeline output | summarise_text, build_reflection_prompt |

## 📁 Project Structure

### Backend

```
backend/
├── main.py                 Entry point & CLI
├── config.py              Configuration & constants
├── api_server.py          FastAPI application
├── agent_factory.py       Agent spawning logic
├── meta_orchestrator.py   Fleet orchestration
├── memory/
│   ├── experience_library.py
│   ├── self_model.py
│   └── vector_store.py
├── skills/
│   ├── registry.py
│   └── base_skills.py
├── utils/
│   ├── logging.py
│   ├── monitoring.py
│   ├── sandbox.py
│   └── hardware_scanner.py
└── tests/
    └── conftest.py        Test fixtures
```

### Frontend

```
frontend/
├── components/           React components
│   ├── ApprovalGate.tsx
│   ├── TaskDispatch.tsx
│   ├── Terminal.tsx
│   ├── FleetNetwork.tsx
│   └── ...
├── pages/               Next.js pages
├── hooks/               Custom React hooks
├── styles/              Global styles
└── types/               TypeScript types
```

## 🔧 Configuration

Edit `backend/config.py` to customize:

```python
META_MODEL = "mistral:latest"          # Meta-controller model
WORKER_MODEL = "neural-chat:latest"   # Worker agents model
MAX_AGENTS = 16                        # Fleet size limit
REQUIRE_HUMAN_APPROVAL_FOR_SPAWN = True
```

## 📊 Monitoring

Access the real-time dashboard at `http://localhost:3000`:

- **Agent Fleet**: Spawned agents, types, and statuses
- **Goals Queue**: Queued tasks and priorities
- **System Vitals**: CPU, memory, GPU usage
- **Hardware Scan**: Installed models and recommendations

## 🧪 Testing

```bash
cd backend
pytest tests/ -v
```

## 📚 Documentation

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for:
- System design deep-dive
- Agent lifecycle & spawning flow
- LangGraph orchestration patterns
- Memory & vector store design

## 🤝 Contributing

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for development guidelines.

## 📝 License

MIT

## 👋 Support

Open an issue or discussion on GitHub.
