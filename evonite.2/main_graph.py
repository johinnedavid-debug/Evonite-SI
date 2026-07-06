"""
graph/main_graph.py — LangGraph-based hierarchical workflow definitions.

Defines the state machine that governs:
  1. Task routing (Meta-Orchestrator → agents)
  2. Reflection loop (execute → evaluate → reflect → improve)
  3. Self-improvement cycle
  4. Self-tasking loop
"""

import asyncio
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import END, StateGraph

from utils.logging import get_logger

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# State schemas
# ═══════════════════════════════════════════════════════════════════════════════

class OrchestratorState(TypedDict, total=False):
    """Shared state flowing through the Meta-Orchestrator graph."""
    goal: str
    sub_goals: List[str]
    current_sub_goal: str
    assigned_agent_id: Optional[str]
    task_result: Optional[Dict[str, Any]]
    reflection: str
    improvement_plan: str
    iteration: int
    status: str                 # planning | executing | reflecting | improving | done
    spawn_requested: bool
    new_agent_spec: Optional[Dict[str, Any]]
    self_tasks: List[str]
    approval_needed: bool
    approval_granted: bool
    error: Optional[str]


class ReflectionState(TypedDict, total=False):
    """State for a single reflection cycle."""
    task: str
    output: str
    score: float
    reflection: str
    lessons: List[str]
    improvement_actions: List[str]
    iteration: int
    done: bool


# ═══════════════════════════════════════════════════════════════════════════════
# Node factories (return async callables)
# ═══════════════════════════════════════════════════════════════════════════════

def make_planning_node(orchestrator: Any):
    """Node: decompose the top-level goal into sub-goals."""
    async def plan(state: OrchestratorState) -> OrchestratorState:
        logger.info("Graph[plan] goal=%s", state.get("goal", "")[:60])
        sub_goals = await orchestrator.decompose_goal(state["goal"])
        return {
            **state,
            "sub_goals": sub_goals,
            "current_sub_goal": sub_goals[0] if sub_goals else state["goal"],
            "status": "executing",
            "iteration": state.get("iteration", 0) + 1,
        }
    return plan


def make_routing_node(orchestrator: Any):
    """Node: select or spawn an agent for the current sub-goal."""
    async def route(state: OrchestratorState) -> OrchestratorState:
        sub_goal = state.get("current_sub_goal", state.get("goal", ""))
        logger.info("Graph[route] sub_goal=%s", sub_goal[:60])
        agent_id, spawn_requested, new_spec = await orchestrator.route_task(sub_goal)
        return {
            **state,
            "assigned_agent_id": agent_id,
            "spawn_requested": spawn_requested,
            "new_agent_spec": new_spec,
            "approval_needed": spawn_requested and orchestrator.requires_approval("spawn"),
        }
    return route


def make_approval_node(orchestrator: Any):
    """Node: request human approval for sensitive actions."""
    async def approval(state: OrchestratorState) -> OrchestratorState:
        if not state.get("approval_needed"):
            return {**state, "approval_granted": True}
        action = "spawn new agent" if state.get("spawn_requested") else "action"
        spec = state.get("new_agent_spec", {})
        granted = await orchestrator.request_approval(action, spec)
        return {**state, "approval_granted": granted}
    return approval


def make_spawn_node(orchestrator: Any):
    """Node: spawn a new agent if approved."""
    async def spawn(state: OrchestratorState) -> OrchestratorState:
        if not (state.get("spawn_requested") and state.get("approval_granted")):
            return state
        spec = state.get("new_agent_spec", {})
        new_agent_id = await orchestrator.spawn_agent(spec)
        logger.info("Graph[spawn] new_agent_id=%s", new_agent_id)
        return {**state, "assigned_agent_id": new_agent_id}
    return spawn


def make_execution_node(orchestrator: Any):
    """Node: dispatch the sub-goal to the assigned agent."""
    async def execute(state: OrchestratorState) -> OrchestratorState:
        agent_id = state.get("assigned_agent_id")
        task = state.get("current_sub_goal", state.get("goal", ""))
        logger.info("Graph[execute] agent=%s task=%s", agent_id, task[:60])
        result = await orchestrator.dispatch_task(agent_id, task)
        return {
            **state,
            "task_result": result,
            "status": "reflecting",
        }
    return execute


def make_reflection_node(orchestrator: Any):
    """Node: run reflection on the task result."""
    async def reflect(state: OrchestratorState) -> OrchestratorState:
        result = state.get("task_result", {})
        logger.info(
            "Graph[reflect] score=%.2f success=%s",
            float(result.get("score", 0)),
            result.get("success"),
        )
        reflection = await orchestrator.run_reflection(result)
        return {
            **state,
            "reflection": reflection,
            "status": "improving",
        }
    return reflect


def make_improvement_node(orchestrator: Any):
    """Node: generate an improvement plan based on reflection."""
    async def improve(state: OrchestratorState) -> OrchestratorState:
        reflection = state.get("reflection", "")
        plan = await orchestrator.generate_improvement_plan(reflection)
        return {
            **state,
            "improvement_plan": plan,
            "status": "done",
        }
    return improve


def make_self_task_node(orchestrator: Any):
    """Node: generate new tasks when idle."""
    async def self_task(state: OrchestratorState) -> OrchestratorState:
        tasks = await orchestrator.generate_self_tasks()
        return {**state, "self_tasks": tasks, "status": "planning"}
    return self_task


# ═══════════════════════════════════════════════════════════════════════════════
# Edge conditions
# ═══════════════════════════════════════════════════════════════════════════════

def needs_approval(state: OrchestratorState) -> str:
    return "approval" if state.get("approval_needed") else "spawn"


def needs_spawn(state: OrchestratorState) -> str:
    return "spawn" if state.get("spawn_requested") else "execute"


def next_sub_goal_or_done(state: OrchestratorState) -> str:
    sub_goals = state.get("sub_goals", [])
    current = state.get("current_sub_goal", "")
    try:
        idx = sub_goals.index(current)
        if idx + 1 < len(sub_goals):
            return "next"
        return "done"
    except ValueError:
        return "done"


def score_gate(state: OrchestratorState) -> str:
    """Route to improvement if score is low, otherwise to next task."""
    import config as cfg
    result = state.get("task_result", {})
    score = float(result.get("score", 0))
    if score < cfg.MIN_ACCEPTABLE_SCORE:
        return "reflect"
    return next_sub_goal_or_done(state)


# ═══════════════════════════════════════════════════════════════════════════════
# Graph builders
# ═══════════════════════════════════════════════════════════════════════════════

def build_orchestrator_graph(orchestrator: Any) -> StateGraph:
    """
    Assemble the main Meta-Orchestrator LangGraph.

    Nodes:
        plan → route → [approval →] [spawn →] execute → reflect → improve → (loop/end)

    Returns:
        Compiled LangGraph StateGraph.
    """
    g = StateGraph(OrchestratorState)

    g.add_node("plan", make_planning_node(orchestrator))
    g.add_node("route", make_routing_node(orchestrator))
    g.add_node("approval", make_approval_node(orchestrator))
    g.add_node("spawn", make_spawn_node(orchestrator))
    g.add_node("execute", make_execution_node(orchestrator))
    g.add_node("reflect", make_reflection_node(orchestrator))
    g.add_node("improve", make_improvement_node(orchestrator))
    g.add_node("self_task", make_self_task_node(orchestrator))

    g.set_entry_point("plan")

    g.add_edge("plan", "route")

    g.add_conditional_edges(
        "route",
        needs_approval,
        {"approval": "approval", "spawn": "spawn"},
    )

    g.add_conditional_edges(
        "approval",
        lambda s: "spawn" if s.get("approval_granted") else "execute",
        {"spawn": "spawn", "execute": "execute"},
    )

    g.add_edge("spawn", "execute")

    g.add_conditional_edges(
        "execute",
        score_gate,
        {"reflect": "reflect", "next": "route", "done": END},
    )

    g.add_edge("reflect", "improve")
    g.add_edge("improve", END)

    return g.compile()


def build_reflection_graph(agent: Any) -> StateGraph:
    """
    A minimal reflection loop graph for a single agent.

    plan → execute → score → reflect → (loop if iteration < max, else done)
    """
    g = StateGraph(ReflectionState)

    async def execute_node(state: ReflectionState) -> ReflectionState:
        result = await agent.execute_task(state["task"])
        return {
            **state,
            "output": result.output,
            "score": result.score,
            "iteration": state.get("iteration", 0) + 1,
        }

    async def reflect_node(state: ReflectionState) -> ReflectionState:
        from skills.base_skills import build_reflection_prompt
        prompt = build_reflection_prompt(
            task=state["task"],
            output=state["output"],
            score=state["score"],
        )
        reflection = await agent._llm_call(prompt)
        return {**state, "reflection": reflection}

    def loop_or_done(state: ReflectionState) -> str:
        import config as cfg
        if state.get("score", 0) >= cfg.MIN_ACCEPTABLE_SCORE:
            return "done"
        if state.get("iteration", 0) >= cfg.MAX_REFLECTION_ITERATIONS:
            return "done"
        return "retry"

    g.add_node("execute", execute_node)
    g.add_node("reflect", reflect_node)

    g.set_entry_point("execute")
    g.add_edge("execute", "reflect")
    g.add_conditional_edges(
        "reflect",
        loop_or_done,
        {"retry": "execute", "done": END},
    )

    return g.compile()
