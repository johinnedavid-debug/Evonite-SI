"""
base_agent.py — Abstract base class for all platform agents.

Every agent (worker, researcher, evaluator, …) inherits from BaseAgent.
Concrete subclasses must implement `execute_task`.
"""

import asyncio
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from langchain_community.llms import Ollama
from langchain.schema import HumanMessage, SystemMessage

import config
from memory.experience_library import Experience, ExperienceLibrary
from memory.vector_store import VectorStore
from skills.registry import SkillRegistry
from utils.logging import get_logger
from utils.sandbox import Sandbox

logger = get_logger(__name__)


@dataclass
class AgentState:
    """Mutable runtime state for an agent."""
    agent_id: str
    role: str
    status: str = "idle"           # idle | running | reflecting | done | error
    current_task: Optional[str] = None
    task_history: List[Dict[str, Any]] = field(default_factory=list)
    short_term_memory: List[str] = field(default_factory=list)  # recent context
    iteration: int = 0
    total_score: float = 0.0
    skills_injected: List[str] = field(default_factory=list)
    spawned_by: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def avg_score(self) -> float:
        n = len(self.task_history)
        if n == 0:
            return 0.0
        return sum(t.get("score", 0) for t in self.task_history) / n


@dataclass
class TaskResult:
    """Structured output from a single task execution."""
    task: str
    output: str
    success: bool
    score: float = 0.0
    steps: List[str] = field(default_factory=list)
    error: Optional[str] = None
    duration_s: float = 0.0
    tokens_used: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


class BaseAgent(ABC):
    """
    Abstract base for all AI Platform agents.

    Subclasses must implement:
        execute_task(task: str) -> TaskResult

    The base class handles:
    - LLM initialisation (Ollama)
    - Skill injection
    - Memory (short-term + experience library)
    - Reflection loop
    - State management
    """

    def __init__(
        self,
        role: str,
        system_prompt: str,
        vector_store: VectorStore,
        experience_library: ExperienceLibrary,
        skill_registry: SkillRegistry,
        sandbox: Sandbox,
        model: Optional[str] = None,
        agent_id: Optional[str] = None,
        spawned_by: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.agent_id = agent_id or f"agent-{uuid.uuid4().hex[:8]}"
        self.role = role
        self.system_prompt = system_prompt
        self.state = AgentState(
            agent_id=self.agent_id,
            role=role,
            spawned_by=spawned_by,
            metadata=metadata or {},
        )

        # ── LLM ──────────────────────────────────────────────────────────────
        self._model_name = model or config.WORKER_MODEL
        self._llm = Ollama(
            model=self._model_name,
            base_url=config.OLLAMA_BASE_URL,
        )

        # ── Shared services ───────────────────────────────────────────────────
        self._vs = vector_store
        self._exp_lib = experience_library
        self._skills = skill_registry
        self._sandbox = sandbox

        self._logger = get_logger(f"agent.{self.agent_id}")
        self._logger.info(
            "Agent created | role=%s | model=%s | spawned_by=%s",
            role, self._model_name, spawned_by,
        )

    # ── Abstract interface ────────────────────────────────────────────────────

    @abstractmethod
    async def execute_task(self, task: str) -> TaskResult:
        """
        Execute *task* and return a TaskResult.

        Subclasses implement the core domain logic here.
        """
        ...

    # ── LLM helpers ──────────────────────────────────────────────────────────

    async def _llm_call(self, prompt: str, system: Optional[str] = None) -> str:
        """
        Send *prompt* to the configured Ollama LLM and return the response.

        Runs in a thread executor so the asyncio loop is not blocked.
        """
        sys_txt = system or self.system_prompt
        full_prompt = f"{sys_txt}\n\n{prompt}"
        loop = asyncio.get_event_loop()
        try:
            response = await asyncio.wait_for(
                loop.run_in_executor(None, self._llm.invoke, full_prompt),
                timeout=config.AGENT_TIMEOUT_SECONDS,
            )
            return str(response)
        except asyncio.TimeoutError:
            self._logger.error("LLM call timed out after %ds", config.AGENT_TIMEOUT_SECONDS)
            return "[LLM TIMEOUT]"
        except Exception as exc:
            self._logger.error("LLM call failed: %s", exc)
            return f"[LLM ERROR: {exc}]"

    # ── Memory helpers ────────────────────────────────────────────────────────

    def remember(self, text: str) -> None:
        """Add *text* to short-term memory (capped at 10 items)."""
        self.state.short_term_memory.append(text)
        if len(self.state.short_term_memory) > 10:
            self.state.short_term_memory.pop(0)

    def recall_context(self) -> str:
        """Return recent short-term memory as a formatted string."""
        if not self.state.short_term_memory:
            return "(no recent context)"
        return "\n".join(f"• {m}" for m in self.state.short_term_memory[-5:])

    async def retrieve_similar_experiences(self, task: str, n: int = 3) -> str:
        """Return a formatted block of similar past experiences."""
        exps = self._exp_lib.search_similar(task, n=n, success_only=True)
        if not exps:
            return "(no similar past experiences found)"
        lines = []
        for e in exps:
            meta = e["metadata"]
            lines.append(
                f"- [{meta.get('agent_role', '?')}] score={float(meta.get('score', 0)):.2f}: "
                f"{e['text'][:200]}"
            )
        return "\n".join(lines)

    # ── Skill helpers ─────────────────────────────────────────────────────────

    def inject_skill(self, skill_name: str) -> bool:
        """Inject a skill from the registry into this agent."""
        spec = self._skills.get(skill_name)
        if spec is None:
            self._logger.warning("Skill '%s' not found in registry", skill_name)
            return False
        if skill_name not in self.state.skills_injected:
            self.state.skills_injected.append(skill_name)
            self._logger.info("Skill injected: %s", skill_name)
        return True

    def available_skills(self) -> List[Dict[str, Any]]:
        return self._skills.as_tool_dicts(self.state.skills_injected)

    def use_skill(self, skill_name: str, *args: Any, **kwargs: Any) -> Any:
        spec = self._skills.get(skill_name)
        if spec is None:
            raise ValueError(f"Skill '{skill_name}' is not available to this agent.")
        return spec(*args, **kwargs)

    # ── Reflection ────────────────────────────────────────────────────────────

    async def reflect(self, result: TaskResult) -> str:
        """
        Run a reflection cycle after a task.

        Returns the reflection text (also stored in experience library).
        """
        self._logger.info(
            "Reflecting | task=%s... | score=%.2f | success=%s",
            result.task[:60],
            result.score,
            result.success,
        )
        lessons = self._exp_lib.extract_global_lessons(limit=20)
        from skills.base_skills import build_reflection_prompt
        prompt = build_reflection_prompt(
            task=result.task,
            output=result.output,
            score=result.score,
            previous_lessons=lessons[:5],
        )
        reflection_text = await self._llm_call(prompt)

        # Record experience
        exp = Experience(
            agent_id=self.agent_id,
            agent_role=self.role,
            task=result.task,
            input_summary=result.task[:300],
            output_summary=result.output[:300],
            steps=result.steps,
            success=result.success,
            score=result.score,
            error=result.error,
            reflection=reflection_text[:500],
        )
        # Try to parse lessons from LLM response
        import json as _json
        import re as _re
        try:
            m = _re.search(r"\{.*\}", reflection_text, _re.DOTALL)
            if m:
                parsed = _json.loads(m.group())
                exp.lessons_learned = parsed.get("lessons", [])
        except Exception:
            pass

        self._exp_lib.record(exp)
        return reflection_text

    # ── Full task lifecycle ───────────────────────────────────────────────────

    async def run(self, task: str) -> TaskResult:
        """
        Full task lifecycle: execute → reflect → update state.

        Args:
            task: Natural-language task description.

        Returns:
            TaskResult
        """
        self.state.status = "running"
        self.state.current_task = task
        self.state.iteration += 1
        start = time.perf_counter()

        self._logger.info("Starting task [iter=%d]: %s", self.state.iteration, task[:80])

        result = await self.execute_task(task)
        result.duration_s = time.perf_counter() - start

        # Update state
        self.state.task_history.append({
            "task": task,
            "success": result.success,
            "score": result.score,
            "duration_s": round(result.duration_s, 2),
        })
        self.remember(f"Task: {task[:80]} → score={result.score:.2f}")

        # Reflection
        self.state.status = "reflecting"
        try:
            await self.reflect(result)
        except Exception as exc:
            self._logger.warning("Reflection failed: %s", exc)

        self.state.status = "idle"
        self.state.current_task = None
        self._logger.info(
            "Task complete | success=%s | score=%.2f | duration=%.1fs",
            result.success, result.score, result.duration_s,
        )
        return result

    def status_dict(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "role": self.role,
            "model": self._model_name,
            "status": self.state.status,
            "iteration": self.state.iteration,
            "avg_score": round(self.state.avg_score, 3),
            "skills": self.state.skills_injected,
            "spawned_by": self.state.spawned_by,
        }
