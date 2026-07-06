"""
meta_loops/improvement_cycle.py — SI Self-Improvement loop.

Uses study cycle findings to:
  1. Propose concrete improvements (prompt changes, new skills, agent reconfigs)
  2. Generate new skill code via LLM
  3. Test new skills in the sandbox
  4. Gate changes behind human approval
  5. Inject approved skills into the registry fleet-wide
  6. Log every improvement action to the Self-Model
"""

from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain_community.llms import Ollama

import config
from memory.self_model import ImprovementRecord, SelfModel
from skills.registry import SkillRegistry
from utils.logging import get_logger, log_event
from utils.sandbox import Sandbox

logger = get_logger(__name__)


@dataclass
class ImprovementProposal:
    """A single proposed improvement action."""
    proposal_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    improvement_type: str = "prompt_tuning"
    title: str = ""
    rationale: str = ""
    # For skill_creation: the generated Python code
    skill_code: Optional[str] = None
    skill_name: Optional[str] = None
    # For prompt_tuning: the new prompt template
    new_prompt: Optional[str] = None
    # Approval state
    requires_approval: bool = True
    approved: bool = False
    applied: bool = False
    test_passed: bool = False
    created_at: float = field(default_factory=time.time)


@dataclass
class ImprovementCycleReport:
    """Summary of a full improvement cycle."""
    cycle_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    proposals_generated: int = 0
    proposals_approved: int = 0
    proposals_applied: int = 0
    skills_created: List[str] = field(default_factory=list)
    skills_failed: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

    def summary(self) -> Dict[str, Any]:
        return {
            "cycle_id":            self.cycle_id,
            "proposals_generated": self.proposals_generated,
            "proposals_approved":  self.proposals_approved,
            "proposals_applied":   self.proposals_applied,
            "skills_created":      self.skills_created,
            "skills_failed":       self.skills_failed,
        }


class ImprovementCycle:
    """
    Drives the SI's self-improvement process.

    Called by the Meta-Orchestrator after each Study Cycle.

    Usage::

        cycle = ImprovementCycle(self_model, skill_registry, sandbox, approval_fn)
        report = await cycle.run(study_findings)
    """

    def __init__(
        self,
        self_model: SelfModel,
        skill_registry: SkillRegistry,
        sandbox: Sandbox,
        approval_fn,          # async (action, details) → bool
        llm: Optional[Any] = None,
    ) -> None:
        self._self_model   = self_model
        self._skills       = skill_registry
        self._sandbox      = sandbox
        self._approval_fn  = approval_fn
        self._llm          = llm or Ollama(model=config.META_MODEL, base_url=config.OLLAMA_BASE_URL)
        self._cycle_count  = 0

    # ── Main entry ────────────────────────────────────────────────────────────

    async def run(
        self,
        study_findings: Dict[str, Any],
        exp_stats: Dict[str, Any],
    ) -> ImprovementCycleReport:
        """
        Generate, gate, and apply improvement proposals.

        Args:
            study_findings: Output dict from StudyReport (patterns, gaps, etc.)
            exp_stats:      ExperienceLibrary.summary_stats()

        Returns:
            ImprovementCycleReport
        """
        self._cycle_count += 1
        report = ImprovementCycleReport()
        log_event(logger, "improvement_cycle_started", cycle=self._cycle_count)

        # ── 1. Generate proposals ─────────────────────────────────────────────
        proposals = await self._generate_proposals(study_findings, exp_stats)
        report.proposals_generated = len(proposals)

        # ── 2. For each proposal: gate → test → apply ─────────────────────────
        for proposal in proposals:
            # Approval gate
            if proposal.requires_approval and config.REQUIRE_HUMAN_APPROVAL_FOR_SKILL_INJECT:
                approved = await self._approval_fn(
                    f"Apply improvement: {proposal.title}",
                    {"type": proposal.improvement_type, "rationale": proposal.rationale,
                     "skill": proposal.skill_name},
                )
                proposal.approved = approved
            else:
                proposal.approved = True  # auto-approve low-risk

            if not proposal.approved:
                logger.info("Improvement '%s' not approved — skipping", proposal.title)
                continue

            report.proposals_approved += 1

            # Apply based on type
            if proposal.improvement_type == "skill_creation" and proposal.skill_code:
                success = await self._create_and_inject_skill(proposal)
                if success:
                    report.proposals_applied += 1
                    report.skills_created.append(proposal.skill_name or "unnamed")
                    self._log_improvement(proposal, applied=True)
                else:
                    report.skills_failed.append(proposal.skill_name or "unnamed")
                    self._log_improvement(proposal, applied=False)

            elif proposal.improvement_type == "prompt_tuning":
                # Log the proposal — the orchestrator picks it up for next cycle
                self._log_improvement(proposal, applied=True)
                report.proposals_applied += 1
                logger.info("Prompt tuning proposal logged: %s", proposal.title)

            elif proposal.improvement_type == "agent_reconfiguration":
                self._log_improvement(proposal, applied=True)
                report.proposals_applied += 1
                logger.info("Agent reconfig proposal logged: %s", proposal.title)

        log_event(logger, "improvement_cycle_complete", **report.summary())
        return report

    # ── Proposal generation ───────────────────────────────────────────────────

    async def _generate_proposals(
        self,
        study_findings: Dict[str, Any],
        exp_stats: Dict[str, Any],
    ) -> List[ImprovementProposal]:
        """Use the LLM to generate improvement proposals from study findings."""
        self_model_block = self._self_model.to_prompt_block()
        current_skills   = self._skills.names()

        prompt = f"""You are the Self-Improvement module of a Synthetic Intelligence.

## Self-Model
{self_model_block}

## Study Findings
Patterns:    {study_findings.get('patterns', [])}
Bottlenecks: {study_findings.get('bottlenecks', [])}
Gaps:        {study_findings.get('gaps', [])}
Strengths:   {study_findings.get('strengths', [])}

## Platform Stats
{json.dumps(exp_stats, indent=2, default=str)}

## Current Skills
{current_skills}

## Task
Propose 2-3 concrete improvements. Focus on:
- Creating new skills to fill capability gaps
- Prompt tuning for underperforming roles
- Agent reconfiguration for bottlenecks

Return as JSON array:
[
  {{
    "type": "skill_creation",
    "title": "<short title>",
    "rationale": "<why this helps>",
    "skill_name": "<function_name>",
    "skill_description": "<what it does>",
    "skill_template": "<brief description of what the skill code should do>"
  }},
  {{
    "type": "prompt_tuning",
    "title": "<short title>",
    "rationale": "<why this helps>",
    "role": "<agent role to tune>",
    "suggested_addition": "<what to add to the system prompt>"
  }}
]

Output ONLY the JSON array.
"""
        loop = asyncio.get_event_loop()
        try:
            raw = await asyncio.wait_for(
                loop.run_in_executor(None, self._llm.invoke, prompt),
                timeout=config.AGENT_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            logger.error("Improvement proposal generation failed: %s", exc)
            return []

        proposals = []
        try:
            m = re.search(r"\[.*\]", raw, re.DOTALL)
            if m:
                items = json.loads(m.group())
                for item in items:
                    p = ImprovementProposal(
                        improvement_type=item.get("type", "prompt_tuning"),
                        title=item.get("title", "Untitled"),
                        rationale=item.get("rationale", ""),
                        skill_name=item.get("skill_name"),
                        requires_approval=True,
                    )
                    if p.improvement_type == "skill_creation" and p.skill_name:
                        # Generate the actual code for this skill
                        p.skill_code = await self._generate_skill_code(
                            name=p.skill_name,
                            description=item.get("skill_description", p.title),
                            template=item.get("skill_template", ""),
                        )
                    proposals.append(p)
        except Exception as exc:
            logger.error("Could not parse improvement proposals: %s", exc)

        logger.info("Generated %d improvement proposals", len(proposals))
        return proposals

    async def _generate_skill_code(
        self, name: str, description: str, template: str
    ) -> str:
        """Ask the LLM to write a new skill function."""
        prompt = f"""Write a Python function named `{name}` that implements:

Description: {description}
Template hint: {template}

Rules:
- Only use allowed stdlib imports: {sorted(config.SANDBOX_ALLOWED_IMPORTS)}
- No I/O, no network
- Decorated with: @skill(description="{description}", tags=["auto-generated"])
- Import skill decorator: from skills.registry import skill
- Keep it under 25 lines

Output ONLY the raw Python code, no markdown fences.
"""
        loop = asyncio.get_event_loop()
        try:
            code = await asyncio.wait_for(
                loop.run_in_executor(None, self._llm.invoke, prompt),
                timeout=config.AGENT_TIMEOUT_SECONDS,
            )
            return re.sub(r"```(?:python)?\n?", "", str(code)).strip().rstrip("`")
        except Exception as exc:
            logger.error("Skill code generation failed for '%s': %s", name, exc)
            return ""

    # ── Skill creation & injection ────────────────────────────────────────────

    async def _create_and_inject_skill(self, proposal: ImprovementProposal) -> bool:
        """
        Test the proposed skill in sandbox, write it to disk, then inject into registry.

        Returns True if the skill was successfully created and injected.
        """
        code = proposal.skill_code or ""
        name = proposal.skill_name or "unnamed_skill"

        if not code.strip():
            logger.warning("Skill '%s' has empty code — skipping", name)
            return False

        # ── Test in sandbox ────────────────────────────────────────────────────
        test_code = f"{code}\n\nresult = {name}.__doc__ or '{name} OK'\nprint(result)"
        test_result = await self._sandbox.execute(test_code)
        proposal.test_passed = test_result.success

        if not test_result.success:
            logger.warning(
                "Skill '%s' failed sandbox test: %s", name, test_result.error
            )
            return False

        # ── Write to disk ──────────────────────────────────────────────────────
        skill_path = config.GENERATED_SKILLS_DIR / f"{name}.py"
        header = (
            f'"""Auto-generated skill: {name}\n'
            f'Rationale: {proposal.rationale}\n'
            f'Created: {time.strftime("%Y-%m-%d %H:%M:%S")}\n"""\n\n'
            f"from skills.registry import skill\n\n"
        )
        skill_path.write_text(header + code, encoding="utf-8")
        logger.info("Skill '%s' written to %s", name, skill_path)

        # ── Inject into live registry ──────────────────────────────────────────
        loaded = self._skills.load_file(skill_path)
        if loaded > 0:
            logger.info("Skill '%s' injected into registry (%d function(s))", name, loaded)
            return True
        else:
            logger.warning("Skill '%s' file loaded but no @skill decorated functions found", name)
            return False

    # ── Self-model logging ────────────────────────────────────────────────────

    def _log_improvement(self, proposal: ImprovementProposal, applied: bool) -> None:
        record = ImprovementRecord(
            improvement_type=proposal.improvement_type,
            description=proposal.title,
            rationale=proposal.rationale,
            approved=proposal.approved,
            applied=applied,
            applied_at=time.time() if applied else None,
        )
        self._self_model.log_improvement(record)
