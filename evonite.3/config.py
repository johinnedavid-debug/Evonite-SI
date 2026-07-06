"""
config.py — Central configuration for the AI Platform.
All tunables live here; import this module everywhere else.
"""

import os
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
LOGS_DIR = BASE_DIR / "logs"
MEMORY_DIR = BASE_DIR / "memory" / "chroma_db"
SKILLS_DIR = BASE_DIR / "skills"
LOGS_DIR.mkdir(exist_ok=True)
MEMORY_DIR.mkdir(parents=True, exist_ok=True)

# ── Ollama / Model settings ──────────────────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Meta-Orchestrator uses the strongest available model
META_MODEL = os.getenv("META_MODEL", "llama3")

# Worker agents use a lighter model by default
WORKER_MODEL = os.getenv("WORKER_MODEL", "llama3")

# Reflection / eval agent
REFLECTION_MODEL = os.getenv("REFLECTION_MODEL", "llama3")

# ── Agent limits ─────────────────────────────────────────────────────────────
MAX_AGENTS = int(os.getenv("MAX_AGENTS", "100"))
MAX_CONCURRENT_AGENTS = int(os.getenv("MAX_CONCURRENT_AGENTS", "10"))
AGENT_TIMEOUT_SECONDS = int(os.getenv("AGENT_TIMEOUT_SECONDS", "120"))

# ── Resource thresholds (monitoring) ─────────────────────────────────────────
CPU_SPAWN_THRESHOLD = float(os.getenv("CPU_SPAWN_THRESHOLD", "80.0"))   # % — don't spawn above this
RAM_SPAWN_THRESHOLD = float(os.getenv("RAM_SPAWN_THRESHOLD", "85.0"))   # %

# ── Human-approval gates ─────────────────────────────────────────────────────
# Set to False to run fully autonomously (not recommended for production)
REQUIRE_HUMAN_APPROVAL_FOR_SPAWN = os.getenv("REQUIRE_HUMAN_APPROVAL_FOR_SPAWN", "true").lower() == "true"
REQUIRE_HUMAN_APPROVAL_FOR_SKILL_INJECT = os.getenv("REQUIRE_HUMAN_APPROVAL_FOR_SKILL_INJECT", "true").lower() == "true"
REQUIRE_HUMAN_APPROVAL_FOR_CODE_CHANGE = os.getenv("REQUIRE_HUMAN_APPROVAL_FOR_CODE_CHANGE", "true").lower() == "true"

# ── Memory / ChromaDB ────────────────────────────────────────────────────────
CHROMA_COLLECTION_EXPERIENCES = "experiences"
CHROMA_COLLECTION_SKILLS = "skills"
CHROMA_COLLECTION_AGENT_MEMORY = "agent_memory"

# ── Reflection loop ──────────────────────────────────────────────────────────
REFLECTION_INTERVAL_SECONDS = int(os.getenv("REFLECTION_INTERVAL_SECONDS", "60"))
MAX_REFLECTION_ITERATIONS = int(os.getenv("MAX_REFLECTION_ITERATIONS", "5"))

# ── Self-tasking ─────────────────────────────────────────────────────────────
SELF_TASK_INTERVAL_SECONDS = int(os.getenv("SELF_TASK_INTERVAL_SECONDS", "300"))

# ── Logging ──────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"

# ── Git integration ──────────────────────────────────────────────────────────
GIT_AUTO_COMMIT = os.getenv("GIT_AUTO_COMMIT", "false").lower() == "true"
GIT_COMMIT_PREFIX = "[AI-Platform]"

# ── Evaluation scoring ───────────────────────────────────────────────────────
MIN_ACCEPTABLE_SCORE = float(os.getenv("MIN_ACCEPTABLE_SCORE", "0.6"))

# ── Sandbox ──────────────────────────────────────────────────────────────────
SANDBOX_TIMEOUT_SECONDS = int(os.getenv("SANDBOX_TIMEOUT_SECONDS", "30"))
SANDBOX_ALLOWED_IMPORTS = {
    "json", "math", "re", "datetime", "collections",
    "itertools", "functools", "typing", "pathlib",
    "os.path", "hashlib", "base64", "textwrap",
}
