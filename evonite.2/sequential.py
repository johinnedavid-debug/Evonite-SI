"""
pipeline/sequential.py — Sequential agent pipeline execution.

Defines a typed Pipeline where a named chain of agents each receive the
previous agent's output as their input context.  Built-in stages:

    Coder → Designer → Assessor → Finaliser

But pipelines are fully composable — any sequence of agent roles is valid.
Each stage produces a StageResult that feeds into the next, and a complete
PipelineResult is returned when all stages finish.

The pipeline integrates with the LangGraph state machine for graph-driven
orchestration, but can also be run standalone as ``await pipeline.run(goal)``.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from utils.logging import get_logger, log_event

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Data containers
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class StageResult:
    """Output produced by a single pipeline stage."""
    stage_name: str
    agent_id: str
    agent_role: str
    task: str
    output: str
    success: bool
    score: float = 0.0
    duration_s: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

    def to_context_block(self) -> str:
        """Format this result as input context for the next stage."""
        status = "✓ SUCCESS" if self.success else "✗ FAILED"
        return (
            f"=== {self.stage_name.upper()} STAGE OUTPUT ({status}, score={self.score:.2f}) ===\n"
            f"{self.output}\n"
            f"{'='*60}"
        )


@dataclass
class PipelineResult:
    """Aggregated result of a complete pipeline run."""
    pipeline_id: str
    goal: str
    stages: List[StageResult] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None
    success: bool = False
    final_output: str = ""
    overall_score: float = 0.0

    @property
    def duration_s(self) -> float:
        if self.finished_at:
            return self.finished_at - self.started_at
        return time.time() - self.started_at

    @property
    def stage_names(self) -> List[str]:
        return [s.stage_name for s in self.stages]

    def summary(self) -> Dict[str, Any]:
        return {
            "pipeline_id": self.pipeline_id,
            "goal": self.goal[:80],
            "stages": self.stage_names,
            "overall_score": round(self.overall_score, 3),
            "success": self.success,
            "duration_s": round(self.duration_s, 2),
            "stage_scores": {s.stage_name: round(s.score, 3) for s in self.stages},
        }


# ═══════════════════════════════════════════════════════════════════════════════
# Stage definition
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class PipelineStage:
    """
    Definition of a single stage in a pipeline.

    Attributes:
        name:           Human-readable stage identifier (e.g. "coder").
        agent_role:     Role string used to look up an agent in the factory.
        agent_type:     Agent archetype to spawn if none is available.
        task_template:  f-string template for building the stage's task.
                        Receives: goal=..., context=..., previous=...
        required:       If False, pipeline continues even if this stage fails.
        min_score:      Pipeline retries (up to max_retries) if score < this.
        max_retries:    Max retry attempts before moving on.
        tools:          List of tool names to pre-inject for this stage.
        skills:         List of skill names to pre-inject for this stage.
    """
    name: str
    agent_role: str
    agent_type: str = "worker"
    task_template: str = "{goal}\n\nContext from previous stages:\n{context}"
    required: bool = True
    min_score: float = 0.5
    max_retries: int = 2
    tools: List[str] = field(default_factory=list)
    skills: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
# Built-in stage definitions
# ═══════════════════════════════════════════════════════════════════════════════

CODER_STAGE = PipelineStage(
    name="coder",
    agent_role="software-engineer",
    agent_type="code",
    task_template=(
        "You are the CODER stage. Write complete, working code for the following goal.\n\n"
        "Goal: {goal}\n\n"
        "Previous context:\n{context}\n\n"
        "Produce:\n"
        "1. Implementation code (clearly labelled)\n"
        "2. Brief explanation of design decisions\n"
        "3. Known limitations or TODOs\n"
    ),
    tools=["filesystem", "git"],
    skills=["detect_errors", "fingerprint"],
)

DESIGNER_STAGE = PipelineStage(
    name="designer",
    agent_role="ux-designer",
    agent_type="worker",
    task_template=(
        "You are the DESIGNER stage. Review the coder's output and produce design artefacts.\n\n"
        "Goal: {goal}\n\n"
        "Coder output:\n{context}\n\n"
        "Produce:\n"
        "1. User-facing interface description or layout spec\n"
        "2. UX improvements or visual design notes\n"
        "3. Accessibility considerations\n"
        "4. Any design decisions that should inform the final product\n"
    ),
    tools=["filesystem"],
    skills=["summarise_text", "extract_bullets"],
)

ASSESSOR_STAGE = PipelineStage(
    name="assessor",
    agent_role="qa-engineer",
    agent_type="evaluator",
    task_template=(
        "You are the ASSESSOR stage. Critically evaluate all prior work.\n\n"
        "Original goal: {goal}\n\n"
        "All prior stage outputs:\n{context}\n\n"
        "Evaluate on:\n"
        "1. Does the code correctly solve the goal? (accuracy)\n"
        "2. Is the design coherent and usable? (design quality)\n"
        "3. What bugs, gaps, or risks exist? (risk assessment)\n"
        "4. Overall quality score 0-10 and justification\n\n"
        "Respond as JSON: {{\"accuracy\":N, \"design\":N, \"risk\":\"text\", \"overall\":N, \"approved\":bool, \"notes\":\"text\"}}"
    ),
    tools=["memory"],
    skills=["heuristic_score", "detect_errors"],
    min_score=0.6,
)

FINALISER_STAGE = PipelineStage(
    name="finaliser",
    agent_role="technical-lead",
    agent_type="worker",
    task_template=(
        "You are the FINALISER stage. Synthesise all prior work into a polished final deliverable.\n\n"
        "Original goal: {goal}\n\n"
        "All prior stage outputs (read carefully):\n{context}\n\n"
        "Produce:\n"
        "1. FINAL DELIVERABLE: Clean, complete, production-ready output addressing the goal\n"
        "2. Incorporate the assessor's feedback\n"
        "3. Document any remaining open questions\n"
        "4. Write a one-paragraph executive summary\n"
    ),
    tools=["filesystem", "git", "memory"],
    skills=["summarise_text", "build_reflection_prompt"],
)

# The standard 4-stage pipeline
STANDARD_PIPELINE_STAGES = [CODER_STAGE, DESIGNER_STAGE, ASSESSOR_STAGE, FINALISER_STAGE]


# ═══════════════════════════════════════════════════════════════════════════════
# Pipeline executor
# ═══════════════════════════════════════════════════════════════════════════════

class SequentialPipeline:
    """
    Runs a sequence of agents where each stage receives the previous output.

    The pipeline can run:
    - Standalone: ``result = await pipeline.run(goal)``
    - Via orchestrator: ``orchestrator.submit_pipeline(goal, pipeline)``

    Stages that fail (error or low score) are retried up to max_retries before
    the pipeline continues (if required=False) or aborts (if required=True).

    Example::

        factory = AgentFactory(...)
        pipeline = SequentialPipeline(
            stages=STANDARD_PIPELINE_STAGES,
            factory=factory,
        )
        result = await pipeline.run("Build a markdown task tracker CLI")
        print(result.final_output)
    """

    def __init__(
        self,
        stages: List[PipelineStage],
        factory: Any,           # AgentFactory — avoid circular import
        pipeline_id: Optional[str] = None,
        on_stage_complete: Optional[Callable[[StageResult], None]] = None,
    ) -> None:
        self._stages = stages
        self._factory = factory
        self.pipeline_id = pipeline_id or f"pipe-{uuid.uuid4().hex[:8]}"
        self._on_stage_complete = on_stage_complete

    # ── Main entry ────────────────────────────────────────────────────────────

    async def run(self, goal: str) -> PipelineResult:
        """
        Execute all stages sequentially and return a PipelineResult.

        Args:
            goal: The overall task description for the whole pipeline.

        Returns:
            PipelineResult with all stage outputs and final deliverable.
        """
        result = PipelineResult(pipeline_id=self.pipeline_id, goal=goal)
        context_blocks: List[str] = []

        log_event(
            logger, "pipeline_started",
            pipeline_id=self.pipeline_id,
            goal=goal[:80],
            stages=[s.name for s in self._stages],
        )

        for stage_def in self._stages:
            stage_result = await self._run_stage(stage_def, goal, context_blocks)
            result.stages.append(stage_result)
            context_blocks.append(stage_result.to_context_block())

            if self._on_stage_complete:
                try:
                    self._on_stage_complete(stage_result)
                except Exception:
                    pass

            if stage_result.error and stage_def.required and stage_def.min_score > 0:
                logger.error(
                    "Required stage '%s' failed — aborting pipeline %s",
                    stage_def.name, self.pipeline_id,
                )
                result.success = False
                result.finished_at = time.time()
                result.final_output = f"Pipeline aborted at stage '{stage_def.name}': {stage_result.error}"
                result.overall_score = self._avg_score(result.stages)
                log_event(logger, "pipeline_aborted", pipeline_id=self.pipeline_id, stage=stage_def.name)
                return result

        # All stages complete
        result.success = all(s.success for s in result.stages if _stage_required(s, self._stages))
        result.final_output = result.stages[-1].output if result.stages else ""
        result.overall_score = self._avg_score(result.stages)
        result.finished_at = time.time()

        log_event(
            logger, "pipeline_complete",
            **result.summary(),
        )
        return result

    # ── Stage runner ──────────────────────────────────────────────────────────

    async def _run_stage(
        self,
        stage_def: PipelineStage,
        goal: str,
        context_blocks: List[str],
    ) -> StageResult:
        """Run a single stage, with retries."""
        context = "\n\n".join(context_blocks) if context_blocks else "(This is the first stage — no prior context.)"
        task = stage_def.task_template.format(
            goal=goal,
            context=context,
            previous=context_blocks[-1] if context_blocks else "",
        )

        logger.info(
            "Pipeline[%s] → stage '%s' (agent_type=%s)",
            self.pipeline_id, stage_def.name, stage_def.agent_type,
        )

        for attempt in range(1, stage_def.max_retries + 2):  # +1 for initial try
            agent = self._acquire_agent(stage_def)
            if agent is None:
                return StageResult(
                    stage_name=stage_def.name,
                    agent_id="none",
                    agent_role=stage_def.agent_role,
                    task=task,
                    output="",
                    success=False,
                    error="No agent available and could not spawn one.",
                )

            # Inject tools
            for tool_name in stage_def.tools:
                if hasattr(agent, "_toolbelt") and agent._toolbelt:
                    pass  # already available from factory injection
            # Inject skills
            for skill_name in stage_def.skills:
                agent.inject_skill(skill_name)

            start = time.perf_counter()
            try:
                task_result = await agent.run(task)
            except Exception as exc:
                logger.error("Stage '%s' attempt %d raised: %s", stage_def.name, attempt, exc)
                task_result = None
                err_str = str(exc)
            else:
                err_str = task_result.error

            duration = time.perf_counter() - start

            if task_result and task_result.score >= stage_def.min_score:
                logger.info(
                    "Stage '%s' complete | score=%.2f | attempt=%d",
                    stage_def.name, task_result.score, attempt,
                )
                return StageResult(
                    stage_name=stage_def.name,
                    agent_id=agent.agent_id,
                    agent_role=stage_def.agent_role,
                    task=task,
                    output=task_result.output,
                    success=task_result.success,
                    score=task_result.score,
                    duration_s=duration,
                    metadata=task_result.metadata,
                    error=task_result.error,
                )

            if attempt <= stage_def.max_retries:
                logger.warning(
                    "Stage '%s' score %.2f < %.2f — retrying (attempt %d/%d)",
                    stage_def.name,
                    task_result.score if task_result else 0,
                    stage_def.min_score,
                    attempt,
                    stage_def.max_retries + 1,
                )
                await asyncio.sleep(1)

        # Exhausted retries
        final_result = task_result
        return StageResult(
            stage_name=stage_def.name,
            agent_id=agent.agent_id if agent else "none",
            agent_role=stage_def.agent_role,
            task=task,
            output=final_result.output if final_result else "",
            success=False,
            score=final_result.score if final_result else 0.0,
            duration_s=time.perf_counter() - start,
            error=err_str or f"Max retries exceeded (min_score={stage_def.min_score})",
        )

    # ── Agent acquisition ─────────────────────────────────────────────────────

    def _acquire_agent(self, stage_def: PipelineStage) -> Optional[Any]:
        """
        Find an idle agent matching the stage role, or spawn a new one.

        Returns None if no agent is available and spawning fails.
        """
        # Prefer an idle agent with the right role
        for agent in self._factory.idle_agents():
            if agent.role == stage_def.agent_role:
                return agent

        # Spawn a new one
        from agent_factory import AgentSpec
        spec = AgentSpec(
            role=stage_def.agent_role,
            agent_type=stage_def.agent_type,
            initial_skills=stage_def.skills,
            spawned_by=f"pipeline-{self.pipeline_id}",
            metadata={"pipeline_id": self.pipeline_id, "stage": stage_def.name},
        )
        try:
            return self._factory.create(spec)
        except RuntimeError as exc:
            logger.error("Cannot acquire agent for stage '%s': %s", stage_def.name, exc)
            return None

    @staticmethod
    def _avg_score(stages: List[StageResult]) -> float:
        if not stages:
            return 0.0
        return sum(s.score for s in stages) / len(stages)


def _stage_required(stage_result: StageResult, stage_defs: List[PipelineStage]) -> bool:
    for sd in stage_defs:
        if sd.name == stage_result.stage_name:
            return sd.required
    return True


# ═══════════════════════════════════════════════════════════════════════════════
# Custom pipeline builder
# ═══════════════════════════════════════════════════════════════════════════════

class PipelineBuilder:
    """
    Fluent builder for constructing custom pipelines.

    Example::

        pipeline = (
            PipelineBuilder(factory)
            .add_stage("research",  "researcher",  agent_type="researcher")
            .add_stage("code",      "coder",       agent_type="code")
            .add_stage("review",    "reviewer",    agent_type="evaluator")
            .build()
        )
        result = await pipeline.run("Build a web scraper")
    """

    def __init__(self, factory: Any) -> None:
        self._factory = factory
        self._stages: List[PipelineStage] = []

    def add_stage(
        self,
        name: str,
        agent_role: str,
        agent_type: str = "worker",
        task_template: Optional[str] = None,
        required: bool = True,
        min_score: float = 0.5,
        max_retries: int = 1,
        tools: Optional[List[str]] = None,
        skills: Optional[List[str]] = None,
    ) -> "PipelineBuilder":
        stage = PipelineStage(
            name=name,
            agent_role=agent_role,
            agent_type=agent_type,
            task_template=task_template or PipelineStage.__dataclass_fields__["task_template"].default,
            required=required,
            min_score=min_score,
            max_retries=max_retries,
            tools=tools or [],
            skills=skills or [],
        )
        self._stages.append(stage)
        return self

    def build(self, pipeline_id: Optional[str] = None) -> SequentialPipeline:
        return SequentialPipeline(
            stages=self._stages,
            factory=self._factory,
            pipeline_id=pipeline_id,
        )
