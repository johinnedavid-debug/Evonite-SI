"""
agent_factory.py — Dynamic creation and registry of specialized agents.

The factory knows about built-in agent archetypes and can also create
fully custom agents from a specification dict.  All created agents are
tracked in an internal registry so the Meta-Orchestrator can query them.
"""

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Type

from base_agent import BaseAgent, TaskResult
from memory.experience_library import ExperienceLibrary
from memory.vector_store import VectorStore
from skills.registry import SkillRegistry
from utils.logging import get_logger
from utils.monitoring import ResourceMonitor
from utils.sandbox import Sandbox
import config

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Built-in concrete agent types
# ═══════════════════════════════════════════════════════════════════════════════

class WorkerAgent(BaseAgent):
    """General-purpose task executor."""

    async def execute_task(self, task: str) -> TaskResult:
        context = self.recall_context()
        similar = await self.retrieve_similar_experiences(task)

        prompt = f"""You are a {self.role} agent.

Recent context:
{context}

Similar past experiences:
{similar}

Task:
{task}

Complete the task thoroughly. Think step by step.
"""
        output = await self._llm_call(prompt)
        from skills.base_skills import heuristic_score, detect_errors
        errors = detect_errors(output)
        score = heuristic_score(output) * (0.5 if errors["has_error"] else 1.0)
        return TaskResult(
            task=task,
            output=output,
            success=not errors["has_error"],
            score=score,
            steps=["prompt_construction", "llm_call", "scoring"],
        )


class ResearcherAgent(BaseAgent):
    """Explores topics and synthesises information."""

    async def execute_task(self, task: str) -> TaskResult:
        # Step 1: Plan the research
        plan_prompt = f"Create a concise research plan (3-5 bullet points) for: {task}"
        plan = await self._llm_call(plan_prompt)
        self.remember(f"Research plan: {plan[:150]}")

        # Step 2: Execute research
        exec_prompt = f"""Research task: {task}

Research plan:
{plan}

Provide a thorough, structured response with sources if possible.
"""
        output = await self._llm_call(exec_prompt)
        from skills.base_skills import heuristic_score
        score = heuristic_score(output, expected_keywords=task.split()[:5])
        return TaskResult(
            task=task,
            output=output,
            success=len(output.split()) > 20,
            score=score,
            steps=["plan", "execute"],
        )


class EvaluatorAgent(BaseAgent):
    """Scores and critiques other agents' outputs."""

    async def execute_task(self, task: str) -> TaskResult:
        prompt = f"""You are a critical evaluator. Assess the following on a scale of 0-10
across these dimensions: accuracy, completeness, clarity, usefulness.

Item to evaluate:
{task}

Respond in this JSON format:
{{
  "accuracy": <0-10>,
  "completeness": <0-10>,
  "clarity": <0-10>,
  "usefulness": <0-10>,
  "overall": <0-10>,
  "feedback": "<concise feedback>",
  "suggestions": ["<suggestion 1>", "<suggestion 2>"]
}}
"""
        output = await self._llm_call(prompt)
        # Try to parse the score
        import json, re
        score = 0.5
        try:
            m = re.search(r"\{.*\}", output, re.DOTALL)
            if m:
                parsed = json.loads(m.group())
                score = float(parsed.get("overall", 5)) / 10.0
        except Exception:
            pass
        return TaskResult(
            task=task,
            output=output,
            success=True,
            score=score,
            steps=["evaluate", "score"],
        )


class ReflectionAgent(BaseAgent):
    """Specialises in reflection and lesson extraction."""

    async def execute_task(self, task: str) -> TaskResult:
        lessons = self._exp_lib.extract_global_lessons(limit=30)
        stats = self._exp_lib.summary_stats()
        prompt = f"""You are a meta-reflection agent reviewing the AI platform's performance.

Platform statistics:
{stats}

Collected lessons from past experiences:
{chr(10).join(f"- {l}" for l in lessons[:15])}

Reflection request:
{task}

Provide:
1. Key patterns and trends
2. Top 3 areas for improvement
3. Specific actionable recommendations
4. A priority action list
"""
        output = await self._llm_call(prompt)
        from skills.base_skills import heuristic_score
        score = heuristic_score(output, criteria=["patterns", "improvement", "recommendations"])
        return TaskResult(
            task=task,
            output=output,
            success=True,
            score=score,
            steps=["gather_lessons", "reflect", "recommend"],
        )


class CodeAgent(BaseAgent):
    """Writes and executes Python code in the sandbox."""

    async def execute_task(self, task: str) -> TaskResult:
        # Generate code
        code_prompt = f"""Write a Python function or script to: {task}

Rules:
- Only use allowed imports: {sorted(config.SANDBOX_ALLOWED_IMPORTS)}
- No file I/O, no network calls
- Print the result using print()
- Keep it concise (< 30 lines)

Output ONLY the raw Python code with no markdown fences.
"""
        code = await self._llm_call(code_prompt)
        # Strip markdown fences if present
        import re
        code = re.sub(r"```(?:python)?\n?", "", code).strip().rstrip("`")

        # Execute in sandbox
        exec_result = await self._sandbox.execute(code)
        output = (
            exec_result.stdout or exec_result.stderr or str(exec_result.return_value or "")
        )
        if exec_result.error:
            output += f"\nError: {exec_result.error}"

        score = 0.8 if exec_result.success else 0.2
        return TaskResult(
            task=task,
            output=f"Code:\n{code}\n\nOutput:\n{output}",
            success=exec_result.success,
            score=score,
            steps=["code_generation", "sandbox_execution"],
            error=exec_result.error,
            metadata={"code": code, "execution": exec_result.as_dict()},
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Agent specification + factory
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class AgentSpec:
    """Blueprint for creating a new agent."""
    role: str
    agent_type: str = "worker"          # worker | researcher | evaluator | reflection | code
    system_prompt: str = ""
    model: Optional[str] = None
    initial_skills: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    agent_id: Optional[str] = None
    spawned_by: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.system_prompt:
            self.system_prompt = _default_system_prompt(self.role, self.agent_type)
        self.agent_id = self.agent_id or f"{self.agent_type}-{uuid.uuid4().hex[:8]}"


def _default_system_prompt(role: str, agent_type: str) -> str:
    base = f"You are a {role} agent in a self-improving AI platform."
    descriptions = {
        "worker": "Complete assigned tasks efficiently and report results clearly.",
        "researcher": "Explore topics deeply and synthesise findings into actionable insights.",
        "evaluator": "Critically assess outputs and provide structured scores and feedback.",
        "reflection": "Analyse patterns, extract lessons, and recommend improvements.",
        "code": "Write clean, correct Python code to solve computational problems.",
    }
    desc = descriptions.get(agent_type, "Perform your assigned role to the best of your ability.")
    return f"{base} {desc}"


_TYPE_MAP: Dict[str, Type[BaseAgent]] = {
    "worker": WorkerAgent,
    "researcher": ResearcherAgent,
    "evaluator": EvaluatorAgent,
    "reflection": ReflectionAgent,
    "code": CodeAgent,
}


class AgentFactory:
    """
    Creates, tracks, and destroys platform agents.

    Usage::

        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        agent = factory.create(AgentSpec(role="data analyst", agent_type="researcher"))
        await agent.run("Summarise recent failures in the experience library")
    """

    def __init__(
        self,
        vector_store: VectorStore,
        experience_library: ExperienceLibrary,
        skill_registry: SkillRegistry,
        sandbox: Sandbox,
        monitor: ResourceMonitor,
    ) -> None:
        self._vs = vector_store
        self._exp_lib = experience_library
        self._skills = skill_registry
        self._sandbox = sandbox
        self._monitor = monitor
        self._agents: Dict[str, BaseAgent] = {}

    # ── Creation ──────────────────────────────────────────────────────────────

    def create(self, spec: AgentSpec) -> BaseAgent:
        """
        Instantiate and register a new agent from *spec*.

        Raises:
            RuntimeError: If resource limits prevent spawning.
        """
        if not self._monitor.can_spawn_agent():
            raise RuntimeError(
                "Cannot spawn agent: resource limits exceeded or too many agents active."
            )

        agent_cls = _TYPE_MAP.get(spec.agent_type, WorkerAgent)
        agent = agent_cls(
            role=spec.role,
            system_prompt=spec.system_prompt,
            vector_store=self._vs,
            experience_library=self._exp_lib,
            skill_registry=self._skills,
            sandbox=self._sandbox,
            model=spec.model,
            agent_id=spec.agent_id,
            spawned_by=spec.spawned_by,
            metadata=spec.metadata,
        )

        # Inject initial skills
        for skill_name in spec.initial_skills:
            agent.inject_skill(skill_name)

        self._agents[agent.agent_id] = agent
        self._monitor.register_agent(agent.agent_id, spec.role)
        logger.info(
            "Agent spawned | id=%s | type=%s | role=%s | skills=%s",
            agent.agent_id, spec.agent_type, spec.role, spec.initial_skills,
        )
        return agent

    def destroy(self, agent_id: str) -> bool:
        """Remove an agent from the registry."""
        if agent_id in self._agents:
            del self._agents[agent_id]
            self._monitor.deregister_agent(agent_id)
            logger.info("Agent destroyed: %s", agent_id)
            return True
        return False

    # ── Registry queries ──────────────────────────────────────────────────────

    def get(self, agent_id: str) -> Optional[BaseAgent]:
        return self._agents.get(agent_id)

    def list_agents(self) -> List[BaseAgent]:
        return list(self._agents.values())

    def agents_by_role(self, role: str) -> List[BaseAgent]:
        return [a for a in self._agents.values() if a.role == role]

    def idle_agents(self) -> List[BaseAgent]:
        return [a for a in self._agents.values() if a.state.status == "idle"]

    def count(self) -> int:
        return len(self._agents)

    def fleet_status(self) -> List[Dict[str, Any]]:
        return [a.status_dict() for a in self._agents.values()]
