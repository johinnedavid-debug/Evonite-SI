"""
meta_orchestrator.py — Central supervisor of the AI Platform.

Responsibilities:
  • Decompose high-level goals into sub-goals
  • Route tasks to idle agents or spawn new ones
  • Monitor fleet health and realign priorities
  • Drive the reflection / self-improvement cycle
  • Generate self-tasks when idle
  • Gate sensitive actions behind human approval
"""

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from langchain_community.llms import Ollama

import config
from agent_factory import AgentFactory, AgentSpec
from graph.main_graph import OrchestratorState, build_orchestrator_graph
from memory.experience_library import ExperienceLibrary
from memory.vector_store import VectorStore
from skills.registry import SkillRegistry
from utils.logging import get_logger, log_event
from utils.monitoring import ResourceMonitor

logger = get_logger(__name__, config.LOGS_DIR / "orchestrator.jsonl")


@dataclass
class PlatformGoal:
    """A high-level platform objective."""
    goal_id: str
    description: str
    priority: int = 5          # 1 (highest) – 10 (lowest)
    created_at: float = field(default_factory=time.time)
    completed: bool = False
    result_summary: str = ""


class MetaOrchestrator:
    """
    Central supervisor for the self-improving multi-agent platform.

    The orchestrator owns:
    - The LangGraph execution graph
    - The AgentFactory (creates / destroys agents)
    - The ResourceMonitor (fleet health)
    - Goal queue and priority scheduling
    - Approval gates for sensitive operations
    """

    def __init__(
        self,
        factory: AgentFactory,
        monitor: ResourceMonitor,
        exp_lib: ExperienceLibrary,
        skill_registry: SkillRegistry,
    ) -> None:
        self._factory = factory
        self._monitor = monitor
        self._exp_lib = exp_lib
        self._skills = skill_registry

        self._llm = Ollama(
            model=config.META_MODEL,
            base_url=config.OLLAMA_BASE_URL,
        )

        self._goal_queue: List[PlatformGoal] = []
        self._completed_goals: List[PlatformGoal] = []
        self._graph = build_orchestrator_graph(self)
        self._running = False
        self._iteration = 0

        logger.info(
            "MetaOrchestrator initialised | model=%s | max_agents=%d",
            config.META_MODEL,
            config.MAX_AGENTS,
        )

    # ═══════════════════════════════════════════════════════════════════════
    # Public API
    # ═══════════════════════════════════════════════════════════════════════

    def add_goal(self, description: str, priority: int = 5) -> PlatformGoal:
        """Enqueue a new high-level goal."""
        import uuid
        goal = PlatformGoal(
            goal_id=str(uuid.uuid4())[:8],
            description=description,
            priority=priority,
        )
        self._goal_queue.append(goal)
        self._goal_queue.sort(key=lambda g: g.priority)
        logger.info("Goal added [pri=%d]: %s", priority, description[:80])
        return goal

    async def run_forever(self) -> None:
        """Main event loop — process goals, then self-task when idle."""
        self._running = True
        log_event(logger, "orchestrator_started")

        # Seed with bootstrap goals
        self._seed_bootstrap_goals()

        while self._running:
            self._iteration += 1
            try:
                if self._goal_queue:
                    goal = self._goal_queue.pop(0)
                    await self._execute_goal(goal)
                else:
                    logger.info("No pending goals — entering self-task mode")
                    await self._self_task_cycle()

                # Periodic fleet health check
                await self._fleet_health_check()
                await asyncio.sleep(1)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Orchestrator loop error [iter=%d]: %s", self._iteration, exc)
                await asyncio.sleep(5)

        log_event(logger, "orchestrator_stopped", iterations=self._iteration)

    def stop(self) -> None:
        self._running = False
        logger.info("Stop requested for MetaOrchestrator")

    # ═══════════════════════════════════════════════════════════════════════
    # LangGraph node implementations (called by graph/main_graph.py)
    # ═══════════════════════════════════════════════════════════════════════

    async def decompose_goal(self, goal: str) -> List[str]:
        """Break a high-level goal into sub-goals using the LLM."""
        prompt = f"""You are a planning AI. Break the following goal into 2-4 concrete sub-tasks.
Return ONLY a JSON array of strings, no explanation.

Goal: {goal}

Example output: ["Sub-task 1", "Sub-task 2", "Sub-task 3"]
"""
        response = await self._llm_call(prompt)
        try:
            m = re.search(r"\[.*\]", response, re.DOTALL)
            if m:
                sub_goals = json.loads(m.group())
                if isinstance(sub_goals, list) and sub_goals:
                    return [str(s) for s in sub_goals]
        except Exception:
            pass
        logger.warning("Goal decomposition parse failed; treating goal as single task")
        return [goal]

    async def route_task(
        self, task: str
    ) -> Tuple[Optional[str], bool, Optional[Dict[str, Any]]]:
        """
        Choose an existing idle agent or decide to spawn a new one.

        Returns:
            (agent_id, spawn_requested, new_agent_spec)
        """
        # Try idle agents first
        idle = self._factory.idle_agents()
        if idle:
            agent = idle[0]
            logger.info("Routing task to idle agent: %s (%s)", agent.agent_id, agent.role)
            return agent.agent_id, False, None

        # Decide what kind of agent to spawn
        spec_dict = await self._decide_agent_spec(task)
        return None, True, spec_dict

    async def dispatch_task(
        self, agent_id: Optional[str], task: str
    ) -> Dict[str, Any]:
        """Run a task on the specified agent and return result as dict."""
        if agent_id is None:
            return {"success": False, "score": 0.0, "output": "No agent assigned", "task": task}

        agent = self._factory.get(agent_id)
        if agent is None:
            logger.error("dispatch_task: agent %s not found", agent_id)
            return {"success": False, "score": 0.0, "output": "Agent not found", "task": task}

        result = await agent.run(task)
        self._monitor.record_task(
            agent_id, result.success, result.score, result.tokens_used
        )
        return {
            "task": task,
            "agent_id": agent_id,
            "success": result.success,
            "score": result.score,
            "output": result.output[:500],
            "duration_s": result.duration_s,
        }

    async def run_reflection(self, result: Dict[str, Any]) -> str:
        """Ask the reflection agent to analyse a task result."""
        reflection_agents = self._factory.agents_by_role("meta-reflector")
        if not reflection_agents:
            # Spawn one if absent
            spec = AgentSpec(
                role="meta-reflector",
                agent_type="reflection",
                initial_skills=["build_reflection_prompt", "heuristic_score"],
                spawned_by="meta-orchestrator",
            )
            try:
                agent = self._factory.create(spec)
            except RuntimeError as exc:
                logger.warning("Cannot spawn reflection agent: %s", exc)
                return "(reflection skipped – resource limit)"
        else:
            agent = reflection_agents[0]

        task_desc = (
            f"Reflect on this task result: success={result.get('success')}, "
            f"score={result.get('score', 0):.2f}, output={result.get('output', '')[:200]}"
        )
        ref_result = await agent.run(task_desc)
        return ref_result.output

    async def generate_improvement_plan(self, reflection: str) -> str:
        """Generate a concrete improvement plan from a reflection text."""
        prompt = f"""Based on this reflection, create a concrete improvement plan.
List 3-5 specific, actionable steps. Be precise.

Reflection:
{reflection[:1000]}

Improvement plan (as numbered list):
"""
        return await self._llm_call(prompt)

    async def generate_self_tasks(self) -> List[str]:
        """Generate self-improvement tasks when the platform is idle."""
        stats = self._exp_lib.summary_stats()
        fleet = self._monitor.fleet_summary()
        context = {
            "recent_failures": stats.get("failures", 0) > 0,
            "low_score_tasks": stats.get("avg_score", 1.0) < config.MIN_ACCEPTABLE_SCORE,
            "unused_skills": len(self._skills.names()) < 3,
            "agent_count": fleet.get("active_agents", 0),
        }
        from skills.base_skills import generate_self_tasks
        tasks = generate_self_tasks(context)
        logger.info("Generated %d self-tasks", len(tasks))
        return tasks

    # ── Approval gate ────────────────────────────────────────────────────────

    def requires_approval(self, action_type: str) -> bool:
        mapping = {
            "spawn": config.REQUIRE_HUMAN_APPROVAL_FOR_SPAWN,
            "skill_inject": config.REQUIRE_HUMAN_APPROVAL_FOR_SKILL_INJECT,
            "code_change": config.REQUIRE_HUMAN_APPROVAL_FOR_CODE_CHANGE,
        }
        return mapping.get(action_type, True)

    async def request_approval(
        self, action: str, details: Dict[str, Any]
    ) -> bool:
        """
        Gate an action behind human approval (interactive prompt).

        In non-interactive / CI environments this auto-approves.
        """
        detail_str = json.dumps(details, indent=2, default=str)
        print(f"\n{'='*60}")
        print(f"⚠️  HUMAN APPROVAL REQUIRED")
        print(f"Action : {action}")
        print(f"Details:\n{detail_str}")
        print("Approve? [y/N]: ", end="", flush=True)
        try:
            loop = asyncio.get_event_loop()
            answer = await asyncio.wait_for(
                loop.run_in_executor(None, input), timeout=30
            )
            approved = answer.strip().lower() in ("y", "yes")
        except (asyncio.TimeoutError, EOFError):
            logger.warning("Approval timed out / non-interactive — auto-approving")
            approved = True
        log_event(logger, "human_approval", action=action, approved=approved)
        return approved

    async def spawn_agent(self, spec_dict: Dict[str, Any]) -> str:
        """Create an agent from a spec dict and return its ID."""
        spec = AgentSpec(
            role=spec_dict.get("role", "general-worker"),
            agent_type=spec_dict.get("agent_type", "worker"),
            system_prompt=spec_dict.get("system_prompt", ""),
            model=spec_dict.get("model"),
            initial_skills=spec_dict.get("initial_skills", []),
            metadata=spec_dict.get("metadata", {}),
            spawned_by="meta-orchestrator",
        )
        agent = self._factory.create(spec)
        return agent.agent_id

    # ═══════════════════════════════════════════════════════════════════════
    # Internal helpers
    # ═══════════════════════════════════════════════════════════════════════

    async def _llm_call(self, prompt: str) -> str:
        loop = asyncio.get_event_loop()
        try:
            response = await asyncio.wait_for(
                loop.run_in_executor(None, self._llm.invoke, prompt),
                timeout=config.AGENT_TIMEOUT_SECONDS,
            )
            return str(response)
        except asyncio.TimeoutError:
            logger.error("Meta LLM call timed out")
            return "[TIMEOUT]"
        except Exception as exc:
            logger.error("Meta LLM call failed: %s", exc)
            return f"[ERROR: {exc}]"

    async def _execute_goal(self, goal: PlatformGoal) -> None:
        """Run the full LangGraph execution for a single goal."""
        logger.info("Executing goal [%s]: %s", goal.goal_id, goal.description[:80])
        initial_state: OrchestratorState = {
            "goal": goal.description,
            "sub_goals": [],
            "current_sub_goal": "",
            "assigned_agent_id": None,
            "task_result": None,
            "reflection": "",
            "improvement_plan": "",
            "iteration": 0,
            "status": "planning",
            "spawn_requested": False,
            "new_agent_spec": None,
            "self_tasks": [],
            "approval_needed": False,
            "approval_granted": False,
            "error": None,
        }
        try:
            final_state = await self._graph.ainvoke(initial_state)
            goal.completed = True
            goal.result_summary = str(final_state.get("task_result", {}).get("output", ""))[:200]
            self._completed_goals.append(goal)
            log_event(
                logger,
                "goal_completed",
                goal_id=goal.goal_id,
                description=goal.description[:60],
                result=goal.result_summary[:100],
            )
        except Exception as exc:
            logger.error("Goal execution failed [%s]: %s", goal.goal_id, exc)
            goal.result_summary = f"ERROR: {exc}"

    async def _self_task_cycle(self) -> None:
        """Generate and enqueue self-improvement tasks."""
        tasks = await self.generate_self_tasks()
        for i, task in enumerate(tasks[:3]):   # cap at 3 per cycle
            self.add_goal(task, priority=7)
        await asyncio.sleep(config.SELF_TASK_INTERVAL_SECONDS)

    async def _fleet_health_check(self) -> None:
        """Log fleet status and clean up stuck agents."""
        summary = self._monitor.fleet_summary()
        log_event(
            logger,
            "fleet_health",
            active_agents=summary["active_agents"],
            cpu=summary["resources"].get("cpu_pct"),
            ram=summary["resources"].get("ram_pct"),
        )

    async def _decide_agent_spec(self, task: str) -> Dict[str, Any]:
        """Use the LLM to pick the best agent archetype for a task."""
        prompt = f"""Given this task, choose the most appropriate agent type.

Task: {task}

Agent types:
- worker: general tasks
- researcher: investigation and synthesis
- evaluator: assessment and scoring
- reflection: analysis and improvement
- code: Python coding and execution

Reply with ONLY a JSON object:
{{"role": "<short role name>", "agent_type": "<type>", "initial_skills": []}}
"""
        response = await self._llm_call(prompt)
        try:
            m = re.search(r"\{.*\}", response, re.DOTALL)
            if m:
                return json.loads(m.group())
        except Exception:
            pass
        return {"role": "general-worker", "agent_type": "worker", "initial_skills": []}

    def _seed_bootstrap_goals(self) -> None:
        """Add initial bootstrap goals to get the platform started."""
        self.add_goal(
            "Run a self-evaluation: review the experience library and report platform health",
            priority=1,
        )
        self.add_goal(
            "Identify the top 3 capability gaps and propose new skills to address them",
            priority=2,
        )
        self.add_goal(
            "Spawn a researcher agent to explore novel task domains",
            priority=3,
        )

    def dashboard(self) -> Dict[str, Any]:
        """Return a snapshot of orchestrator state for display."""
        return {
            "iteration": self._iteration,
            "pending_goals": len(self._goal_queue),
            "completed_goals": len(self._completed_goals),
            "fleet": self._monitor.fleet_summary(),
            "experience_stats": self._exp_lib.summary_stats(),
            "skills": self._skills.stats(),
        }
