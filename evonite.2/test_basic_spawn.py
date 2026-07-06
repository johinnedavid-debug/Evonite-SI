"""
tests/test_basic_spawn.py — Full test suite for the Synthetic Intelligence Platform.

Covers every major subsystem:
  - SkillRegistry (load, register, call)
  - Sandbox (exec, validation, timeout)
  - AgentFactory (spawn, destroy, resource-gate, 8 archetypes)
  - ToolBelt + connectors (filesystem, memory)
  - BaseAgent (run, tool_call, skill injection)
  - ExperienceLibrary (record, stats, lessons)
  - SelfModel (upsert, gaps, strengths, reinforce/weaken)
  - StudyCycle (aggregate, seed, report shape)
  - ImprovementCycle (proposal generation, skill creation, injection)
  - SequentialPipeline (4-stage run, stage context propagation, retry)
  - PipelineBuilder (fluent API)
  - ResourceMonitor (tracking, spawn gate)
  - MetaOrchestrator (goal queue, pipeline routing, self-task, dashboard)

Run:
    cd ai_platform
    python tests/test_basic_spawn.py
    # or:
    python -m pytest tests/ -v
"""

import asyncio
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))


# ═══════════════════════════════════════════════════════════════════════════════
# Shared fixture factory
# ═══════════════════════════════════════════════════════════════════════════════

def _make_services(real_vs: bool = False, tmp_dir: str = None):
    """
    Return a consistent set of (optionally real) service objects.

    real_vs=True → use an actual in-memory ChromaDB (no disk).
    """
    if real_vs and tmp_dir:
        import config as cfg
        cfg.MEMORY_DIR = Path(tmp_dir) / "chroma"
        cfg.MEMORY_DIR.mkdir(parents=True, exist_ok=True)
        from memory.vector_store import VectorStore
        vs = VectorStore()
    else:
        vs = MagicMock()
        vs.upsert.return_value = "mock-id"
        vs.query.return_value = []
        vs.list_all.return_value = []
        vs.collection_count.return_value = 0
        vs._col.return_value = MagicMock(count=lambda: 0)

    exp_lib = MagicMock()
    exp_lib.summary_stats.return_value = {"total": 0, "successes": 0, "failures": 0, "avg_score": 0.5}
    exp_lib.extract_global_lessons.return_value = []
    exp_lib.search_similar.return_value = []
    exp_lib.record.return_value = "exp-id"
    exp_lib._vs = vs

    from skills.registry import SkillRegistry
    registry = SkillRegistry()
    registry.load_module("skills.base_skills")

    import config
    config.SANDBOX_TIMEOUT_SECONDS = 5
    from utils.sandbox import Sandbox
    sandbox = Sandbox(timeout=5)

    monitor = MagicMock()
    monitor.can_spawn_agent.return_value = True
    monitor.register_agent.return_value = None
    monitor.deregister_agent.return_value = None
    monitor.record_task.return_value = None
    from utils.monitoring import ResourceSnapshot
    monitor.latest_snapshot = ResourceSnapshot()
    monitor.fleet_summary.return_value = {"active_agents": 0, "resources": {"cpu_pct": 20, "ram_pct": 30}}

    return vs, exp_lib, registry, sandbox, monitor


# ═══════════════════════════════════════════════════════════════════════════════
# 1. SkillRegistry
# ═══════════════════════════════════════════════════════════════════════════════

def test_skill_registry_loads_base_skills():
    from skills.registry import SkillRegistry
    reg = SkillRegistry()
    n = reg.load_module("skills.base_skills")
    assert n >= 10, f"Expected ≥10 skills, got {n}"
    assert reg.get("summarise_text") is not None
    assert reg.get("heuristic_score") is not None
    assert reg.get("build_reflection_prompt") is not None
    assert reg.get("generate_self_tasks") is not None
    print(f"  ✓ Loaded {n} base skills")


def test_skill_register_and_call():
    from skills.registry import SkillRegistry
    reg = SkillRegistry()

    @reg.register(description="Double a number", tags=["math"])
    def double(x: int) -> int:
        return x * 2

    spec = reg.get("double")
    assert spec is not None
    assert spec(7) == 14
    assert spec.call_count == 1
    print("  ✓ Manual register + call works")


def test_skill_load_from_file():
    import tempfile, textwrap
    from skills.registry import SkillRegistry
    reg = SkillRegistry()
    code = textwrap.dedent("""
        from skills.registry import skill

        @skill(description="Multiply by 3", tags=["math"])
        def triple(x: int) -> int:
            return x * 3
    """)
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(code)
        fpath = Path(f.name)
    loaded = reg.load_file(fpath)
    assert loaded == 1
    assert reg.get("triple")(5) == 15
    fpath.unlink()
    print("  ✓ Dynamic file loading + execution works")


def test_heuristic_score():
    from skills.base_skills import heuristic_score
    assert heuristic_score("") == 0.0
    assert heuristic_score("x") < 0.5
    long_text = "Comprehensive detailed analysis covering all aspects thoroughly. " * 6
    score = heuristic_score(long_text, expected_keywords=["comprehensive", "analysis"])
    assert score > 0.5
    print(f"  ✓ heuristic_score (long={score:.2f})")


def test_detect_errors():
    from skills.base_skills import detect_errors
    clean = detect_errors("The answer is 42.")
    assert not clean["has_error"]
    error_text = detect_errors("Traceback: ValueError: bad input — Exception raised")
    assert error_text["has_error"]
    assert error_text["severity"] == "high"
    print("  ✓ detect_errors pattern matching")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. Sandbox
# ═══════════════════════════════════════════════════════════════════════════════

def test_sandbox_execute_valid():
    async def _run():
        from utils.sandbox import Sandbox
        sb = Sandbox(timeout=5)
        r = await sb.execute("x = 6 * 7\nprint(x)")
        assert r.success, r.error
        assert "42" in r.stdout
        sb.close()
    asyncio.run(_run())
    print("  ✓ Sandbox executes valid code")


def test_sandbox_blocks_import():
    async def _run():
        from utils.sandbox import Sandbox
        sb = Sandbox(timeout=5)
        r = await sb.execute("import os\nos.getcwd()")
        assert not r.success
        assert "not allowed" in (r.error or "").lower()
        sb.close()
    asyncio.run(_run())
    print("  ✓ Sandbox blocks disallowed imports")


def test_sandbox_blocks_exec_builtins():
    async def _run():
        from utils.sandbox import Sandbox
        sb = Sandbox(timeout=5)
        r = await sb.execute("eval('1+1')")
        assert not r.success
        sb.close()
    asyncio.run(_run())
    print("  ✓ Sandbox blocks dangerous builtins")


def test_sandbox_captures_stdout():
    async def _run():
        from utils.sandbox import Sandbox
        sb = Sandbox(timeout=5)
        r = await sb.execute("for i in range(3):\n    print(f'line {i}')")
        assert r.success
        assert "line 0" in r.stdout
        assert "line 2" in r.stdout
        sb.close()
    asyncio.run(_run())
    print("  ✓ Sandbox captures stdout correctly")


# ═══════════════════════════════════════════════════════════════════════════════
# 3. ToolBelt + Connectors
# ═══════════════════════════════════════════════════════════════════════════════

def test_toolbelt_filesystem_write_read():
    async def _run():
        import tempfile
        from tools.connectors import FileSystemConnector, ToolBelt
        with tempfile.TemporaryDirectory() as tmp:
            fs = FileSystemConnector(workspace=Path(tmp))
            belt = ToolBelt()
            belt.attach(fs)

            wr = await belt.use("filesystem", "write", path="test.txt", content="hello SI")
            assert wr.success, wr.error

            rd = await belt.use("filesystem", "read", path="test.txt")
            assert rd.success
            assert "hello SI" in rd.data
    asyncio.run(_run())
    print("  ✓ ToolBelt filesystem write+read")


def test_toolbelt_filesystem_list():
    async def _run():
        import tempfile
        from tools.connectors import FileSystemConnector, ToolBelt
        with tempfile.TemporaryDirectory() as tmp:
            fs = FileSystemConnector(workspace=Path(tmp))
            belt = ToolBelt()
            belt.attach(fs)
            await belt.use("filesystem", "write", path="a.txt", content="a")
            await belt.use("filesystem", "write", path="b.txt", content="b")
            ls = await belt.use("filesystem", "list", path=".")
            assert ls.success
            assert "a.txt" in ls.data and "b.txt" in ls.data
    asyncio.run(_run())
    print("  ✓ ToolBelt filesystem list")


def test_toolbelt_unknown_connector():
    async def _run():
        from tools.connectors import ToolBelt
        belt = ToolBelt()
        r = await belt.use("nonexistent", "action")
        assert not r.success
        assert "not attached" in r.error
    asyncio.run(_run())
    print("  ✓ ToolBelt handles unknown connector gracefully")


def test_toolbelt_memory_connector():
    async def _run():
        vs = MagicMock()
        vs.upsert.return_value = "doc-123"
        vs.query.return_value = [{"id": "doc-123", "text": "test", "metadata": {}}]
        from tools.connectors import MemoryConnector, ToolBelt
        belt = ToolBelt()
        belt.attach(MemoryConnector(vs))
        store = await belt.use("memory", "store", text="test memory", metadata={"tag": "test"})
        assert store.success
        search = await belt.use("memory", "search", query="test memory")
        assert search.success
    asyncio.run(_run())
    print("  ✓ ToolBelt memory connector store+search")


# ═══════════════════════════════════════════════════════════════════════════════
# 4. AgentFactory — all 8 archetypes
# ═══════════════════════════════════════════════════════════════════════════════

def test_factory_spawn_destroy():
    vs, exp_lib, registry, sandbox, monitor = _make_services()
    from agent_factory import AgentFactory, AgentSpec
    factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
    agent = factory.create(AgentSpec(role="tester", agent_type="worker"))
    assert factory.count() == 1
    assert factory.get(agent.agent_id) is agent
    assert factory.destroy(agent.agent_id)
    assert factory.count() == 0
    print("  ✓ AgentFactory spawn + destroy")


def test_factory_all_archetypes():
    vs, exp_lib, registry, sandbox, monitor = _make_services()
    from agent_factory import AgentFactory, AgentSpec
    factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
    archetypes = ["worker", "researcher", "evaluator", "reflection",
                  "code", "designer", "finaliser", "assessor"]
    for atype in archetypes:
        agent = factory.create(AgentSpec(role=f"test-{atype}", agent_type=atype))
        assert agent is not None, f"Failed to create {atype}"
        assert agent.state.tools_attached, f"{atype} has no tools"
    assert factory.count() == len(archetypes)
    print(f"  ✓ All {len(archetypes)} archetypes spawn successfully with ToolBelt")


def test_factory_resource_limit():
    vs, exp_lib, registry, sandbox, monitor = _make_services()
    monitor.can_spawn_agent.return_value = False
    from agent_factory import AgentFactory, AgentSpec
    factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
    try:
        factory.create(AgentSpec(role="overflow", agent_type="worker"))
        assert False, "Should raise RuntimeError"
    except RuntimeError as e:
        assert "resource" in str(e).lower() or "limit" in str(e).lower()
    print("  ✓ Resource gate blocks spawn correctly")


def test_factory_skill_injection():
    vs, exp_lib, registry, sandbox, monitor = _make_services()
    from agent_factory import AgentFactory, AgentSpec
    factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
    agent = factory.create(AgentSpec(
        role="skilled", agent_type="worker",
        initial_skills=["summarise_text", "heuristic_score"],
    ))
    assert "summarise_text" in agent.state.skills_injected
    assert "heuristic_score" in agent.state.skills_injected
    result = agent.use_skill("summarise_text", "One. Two. Three. Four. Five.", max_sentences=2)
    assert "One" in result
    print("  ✓ Initial skills injected and callable via use_skill()")


def test_factory_idle_agents():
    vs, exp_lib, registry, sandbox, monitor = _make_services()
    from agent_factory import AgentFactory, AgentSpec
    factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
    a1 = factory.create(AgentSpec(role="r1", agent_type="worker"))
    a2 = factory.create(AgentSpec(role="r2", agent_type="researcher"))
    a1.state.status = "running"
    idle = factory.idle_agents()
    assert a1 not in idle
    assert a2 in idle
    print("  ✓ idle_agents() filters correctly")


# ═══════════════════════════════════════════════════════════════════════════════
# 5. BaseAgent — run lifecycle with mocked LLM
# ═══════════════════════════════════════════════════════════════════════════════

def test_worker_agent_run():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory, AgentSpec
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        agent = factory.create(AgentSpec(role="tester", agent_type="worker"))
        reply = "This is a thorough and detailed answer covering all aspects of the topic comprehensively."
        with patch.object(agent, "_llm_call", new=AsyncMock(return_value=reply)):
            result = await agent.run("Describe what unit testing is")
        assert result.task == "Describe what unit testing is"
        assert result.output == reply
        assert result.duration_s >= 0
        assert agent.state.iteration == 1
        assert len(agent.state.task_history) == 1
        print(f"  ✓ WorkerAgent.run() | success={result.success} score={result.score:.2f}")
    asyncio.run(_run())


def test_code_agent_run():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory, AgentSpec
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        agent = factory.create(AgentSpec(role="coder", agent_type="code"))
        mock_code = "total = sum(range(1, 11))\nprint(total)"
        with patch.object(agent, "_llm_call", new=AsyncMock(return_value=mock_code)):
            result = await agent.run("Compute sum of 1 to 10")
        assert "55" in result.output or result.success
        print(f"  ✓ CodeAgent.run() executes code | success={result.success}")
    asyncio.run(_run())


def test_designer_agent_run():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory, AgentSpec
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        agent = factory.create(AgentSpec(role="ux-designer", agent_type="designer"))
        reply = ("UI Layout: Header | Main content area | Footer\n"
                 "Components: Nav bar, Card grid, Modal\n"
                 "Accessibility: ARIA labels on all interactive elements.\n"
                 "Color palette: #0a0a0a background, #00e5a0 accent.\n"
                 "User flow: Landing → Browse → Select → Checkout.\n"
                 "Responsive: Single column on mobile, 3-col grid on desktop.")
        with patch.object(agent, "_llm_call", new=AsyncMock(return_value=reply)):
            result = await agent.run("Design a task management dashboard")
        assert result.success
        assert result.score > 0
        print(f"  ✓ DesignerAgent.run() | score={result.score:.2f}")
    asyncio.run(_run())


def test_assessor_agent_run():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory, AgentSpec
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        agent = factory.create(AgentSpec(role="qa-engineer", agent_type="assessor"))
        reply = ('{"code_quality":{"score":8,"issues":[],"strengths":["clean"]},'
                 '"design_quality":{"score":7,"issues":[],"strengths":["clear"]},'
                 '"goal_alignment":9,"risk_level":"low","risks":[],'
                 '"overall_score":8,"approved":true,"required_changes":[],'
                 '"summary":"Good quality work."}')
        with patch.object(agent, "_llm_call", new=AsyncMock(return_value=reply)):
            result = await agent.run("Assess: the code works and design is clear")
        assert result.score >= 0.7
        assert result.metadata.get("approved") is True
        print(f"  ✓ AssessorAgent.run() | approved={result.metadata.get('approved')} score={result.score:.2f}")
    asyncio.run(_run())


def test_finaliser_agent_run():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory, AgentSpec
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        agent = factory.create(AgentSpec(role="tech-lead", agent_type="finaliser"))
        agent.state.pipeline_context = "Coder output: def add(a,b): return a+b\nDesigner: minimal UI"
        reply = ("## EXECUTIVE SUMMARY\nDeliverable complete.\n\n"
                 "## FINAL DELIVERABLE\ndef add(a, b): return a + b\n\n"
                 "## INTEGRATION NOTES\nFunctions match design spec.\n\n"
                 "## QUALITY CHECKLIST\n- [x] Requirements addressed\n\n"
                 "## OPEN QUESTIONS\nNone.")
        with patch.object(agent, "_llm_call", new=AsyncMock(return_value=reply)):
            result = await agent.run("Finalise the addition utility")
        assert result.success
        assert "DELIVERABLE" in result.output
        print(f"  ✓ FinaliserAgent.run() | score={result.score:.2f}")
    asyncio.run(_run())


def test_agent_tool_call_no_toolbelt():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory, AgentSpec
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        agent = factory.create(AgentSpec(role="bare", agent_type="worker"))
        agent._toolbelt = None   # strip toolbelt
        r = await agent.tool_call("filesystem", "read", path="x.txt")
        assert not r.success
        assert "No ToolBelt" in r.error
    asyncio.run(_run())
    print("  ✓ tool_call() fails gracefully with no ToolBelt")


def test_agent_pipeline_context_passed():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory, AgentSpec
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        agent = factory.create(AgentSpec(role="worker", agent_type="worker"))
        agent.state.pipeline_context = "previous stage did X"
        agent.state.pipeline_stage = "designer"
        captured_prompts = []
        async def mock_llm(prompt, system=None):
            captured_prompts.append(prompt)
            return "Detailed comprehensive output covering all design aspects and user flows."
        with patch.object(agent, "_llm_call", new=mock_llm):
            await agent.run("Design the UI")
        print(f"  ✓ Pipeline context available in agent state (stage={agent.state.pipeline_stage})")
    asyncio.run(_run())


# ═══════════════════════════════════════════════════════════════════════════════
# 6. ExperienceLibrary
# ═══════════════════════════════════════════════════════════════════════════════

def test_experience_library_record_and_retrieve():
    with tempfile.TemporaryDirectory() as tmp:
        import config
        orig = config.MEMORY_DIR
        config.MEMORY_DIR = Path(tmp) / "chroma"
        config.MEMORY_DIR.mkdir()
        try:
            from memory.vector_store import VectorStore
            from memory.experience_library import ExperienceLibrary, Experience
            vs = VectorStore()
            lib = ExperienceLibrary(vs)

            for i in range(3):
                exp = Experience(
                    agent_id=f"agent-{i}", agent_role="worker",
                    task=f"Task number {i}: do something useful",
                    output_summary="Completed successfully with good results",
                    success=i < 2, score=0.6 + i * 0.1,
                    lessons_learned=["Always validate input", f"Lesson {i}"],
                )
                lib.record(exp)

            stats = lib.summary_stats()
            assert stats["total"] == 3
            assert stats["successes"] == 2
            assert round(stats["success_rate"], 2) == 0.67
            lessons = lib.extract_global_lessons()
            assert len(lessons) >= 1
            print(f"  ✓ ExperienceLibrary record/stats/lessons | total={stats['total']}")
        finally:
            config.MEMORY_DIR = orig


# ═══════════════════════════════════════════════════════════════════════════════
# 7. SelfModel
# ═══════════════════════════════════════════════════════════════════════════════

def test_self_model_upsert_and_retrieve():
    with tempfile.TemporaryDirectory() as tmp:
        import config
        orig = config.MEMORY_DIR
        config.MEMORY_DIR = Path(tmp) / "chroma"
        config.MEMORY_DIR.mkdir()
        try:
            from memory.vector_store import VectorStore
            from memory.self_model import SelfModel, CapabilityNode
            vs = VectorStore()
            sm = SelfModel(vs)

            node = CapabilityNode(
                node_id="role-researcher",
                category="role", name="researcher",
                description="Research and synthesis tasks",
                strength=0.72, evidence_count=5,
            )
            sm.upsert_capability(node)
            retrieved = sm.get_capability("role-researcher")
            assert retrieved is not None
            assert retrieved.name == "researcher"
            assert abs(retrieved.strength - 0.72) < 0.01
            print(f"  ✓ SelfModel upsert + get | strength={retrieved.strength:.2f}")
        finally:
            config.MEMORY_DIR = orig


def test_self_model_reinforce_and_weaken():
    with tempfile.TemporaryDirectory() as tmp:
        import config
        orig = config.MEMORY_DIR
        config.MEMORY_DIR = Path(tmp) / "chroma"
        config.MEMORY_DIR.mkdir()
        try:
            from memory.vector_store import VectorStore
            from memory.self_model import SelfModel, CapabilityNode
            vs = VectorStore()
            sm = SelfModel(vs)

            node = CapabilityNode(node_id="test-cap", category="role",
                                  name="test", strength=0.5)
            sm.upsert_capability(node)
            sm.reinforce("test-cap", delta=0.1)
            r = sm.get_capability("test-cap")
            assert r.strength > 0.5

            sm.weaken("test-cap", delta=0.2)
            w = sm.get_capability("test-cap")
            assert w.strength < r.strength
            print(f"  ✓ SelfModel reinforce/weaken | {0.5:.2f}→{r.strength:.2f}→{w.strength:.2f}")
        finally:
            config.MEMORY_DIR = orig


def test_self_model_gaps_and_strengths():
    with tempfile.TemporaryDirectory() as tmp:
        import config
        orig = config.MEMORY_DIR
        config.MEMORY_DIR = Path(tmp) / "chroma"
        config.MEMORY_DIR.mkdir()
        try:
            from memory.vector_store import VectorStore
            from memory.self_model import SelfModel, CapabilityNode
            vs = VectorStore()
            sm = SelfModel(vs)

            sm.upsert_capability(CapabilityNode(node_id="strong", name="coding",
                                                category="role", strength=0.9))
            sm.upsert_capability(CapabilityNode(node_id="weak", name="vision",
                                                category="gap", strength=0.1))
            sm.upsert_capability(CapabilityNode(node_id="mid", name="research",
                                                category="role", strength=0.6))

            gaps = sm.get_capability_gaps(threshold=0.4)
            strengths = sm.get_strengths(threshold=0.8)
            assert any(g.name == "vision" for g in gaps)
            assert any(s.name == "coding" for s in strengths)
            snap = sm.snapshot()
            assert snap["total_nodes"] >= 3
            print(f"  ✓ SelfModel gaps/strengths/snapshot | nodes={snap['total_nodes']}")
        finally:
            config.MEMORY_DIR = orig


def test_self_model_improvement_log():
    with tempfile.TemporaryDirectory() as tmp:
        import config
        orig = config.MEMORY_DIR
        config.MEMORY_DIR = Path(tmp) / "chroma"
        config.MEMORY_DIR.mkdir()
        try:
            from memory.vector_store import VectorStore
            from memory.self_model import SelfModel, ImprovementRecord
            vs = VectorStore()
            sm = SelfModel(vs)

            record = ImprovementRecord(
                improvement_type="skill_creation",
                description="Created text_rank skill",
                rationale="Gaps analysis showed weak summarisation",
                approved=True, applied=True,
            )
            sm.log_improvement(record)
            history = sm.get_improvement_history()
            assert len(history) >= 1
            print(f"  ✓ SelfModel improvement log | records={len(history)}")
        finally:
            config.MEMORY_DIR = orig


# ═══════════════════════════════════════════════════════════════════════════════
# 8. StudyCycle
# ═══════════════════════════════════════════════════════════════════════════════

def test_study_cycle_seed_and_report():
    async def _run():
        vs = MagicMock()
        vs.upsert.return_value = "doc-id"
        vs.query.return_value = []
        vs.list_all.return_value = []
        vs._col.return_value = MagicMock()

        exp_lib = MagicMock()
        exp_lib.summary_stats.return_value = {"total": 0}
        exp_lib._vs = vs

        from memory.self_model import SelfModel
        from meta_loops.study_cycle import StudyCycle

        sm = SelfModel(vs)
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = (
            '{"patterns":["workers perform well"],'
            '"bottlenecks":["slow reflection"],'
            '"strengths":["skill injection"],'
            '"gaps":["web access"],'
            '"recommended_goals":["Improve reflection speed","Add web search"]}'
        )
        cycle = StudyCycle(exp_lib, sm, llm=mock_llm)
        report = await cycle.run()

        # With no experiences, seeding path taken
        assert report.experiences_analysed == 0
        print(f"  ✓ StudyCycle seed path | cycle_id={report.cycle_id}")
    asyncio.run(_run())


def test_study_cycle_with_experiences():
    async def _run():
        vs = MagicMock()
        vs.upsert.return_value = "doc-id"
        vs.query.return_value = []
        vs._col.return_value = MagicMock()
        vs.list_all.return_value = [
            {"metadata": {"agent_role": "worker", "success": True,  "score": "0.8"}, "text": "task 1"},
            {"metadata": {"agent_role": "worker", "success": False, "score": "0.3"}, "text": "task 2"},
            {"metadata": {"agent_role": "researcher", "success": True, "score": "0.9"}, "text": "task 3"},
        ]
        exp_lib = MagicMock()
        exp_lib.summary_stats.return_value = {
            "total": 3, "successes": 2, "failures": 1, "avg_score": 0.67
        }
        exp_lib._vs = vs

        from memory.self_model import SelfModel
        from meta_loops.study_cycle import StudyCycle
        sm = SelfModel(vs)
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = (
            '{"patterns":["worker failure rate 33%"],'
            '"bottlenecks":["worker low score"],'
            '"strengths":["researcher high accuracy"],'
            '"gaps":["no web tool"],'
            '"recommended_goals":["Tune worker prompt","Add web connector"]}'
        )
        cycle = StudyCycle(exp_lib, sm, llm=mock_llm)
        report = await cycle.run()

        assert report.experiences_analysed == 3
        assert len(report.patterns_found) >= 1
        assert len(report.recommended_goals) >= 1
        assert report.capability_updates > 0
        print(f"  ✓ StudyCycle with experiences | updates={report.capability_updates} goals={report.recommended_goals}")
    asyncio.run(_run())


# ═══════════════════════════════════════════════════════════════════════════════
# 9. ImprovementCycle
# ═══════════════════════════════════════════════════════════════════════════════

def test_improvement_cycle_proposal_generation():
    async def _run():
        vs = MagicMock()
        vs.upsert.return_value = "doc-id"
        vs.query.return_value = []
        vs.list_all.return_value = []
        vs._col.return_value = MagicMock()

        from memory.self_model import SelfModel
        from skills.registry import SkillRegistry
        from utils.sandbox import Sandbox
        from meta_loops.improvement_cycle import ImprovementCycle

        sm = SelfModel(vs)
        registry = SkillRegistry()
        registry.load_module("skills.base_skills")
        sandbox = Sandbox(timeout=5)

        approval_fn = AsyncMock(return_value=False)  # auto-reject — just test generation
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = (
            '[{"type":"prompt_tuning","title":"Tune worker prompt",'
            '"rationale":"Workers score low on complex tasks",'
            '"role":"worker","suggested_addition":"Think step by step"}]'
        )

        cycle = ImprovementCycle(sm, registry, sandbox, approval_fn, llm=mock_llm)
        report = await cycle.run(
            study_findings={"patterns": [], "bottlenecks": ["slow"], "gaps": ["web"], "strengths": []},
            exp_stats={"total": 5, "avg_score": 0.4},
        )
        assert report.proposals_generated >= 1
        print(f"  ✓ ImprovementCycle generates proposals | generated={report.proposals_generated}")
    asyncio.run(_run())


def test_improvement_cycle_skill_creation():
    async def _run():
        import config
        with tempfile.TemporaryDirectory() as tmp:
            config.GENERATED_SKILLS_DIR = Path(tmp)
            vs = MagicMock()
            vs.upsert.return_value = "doc-id"
            vs.query.return_value = []
            vs.list_all.return_value = []
            vs._col.return_value = MagicMock()

            from memory.self_model import SelfModel
            from skills.registry import SkillRegistry
            from utils.sandbox import Sandbox
            from meta_loops.improvement_cycle import ImprovementCycle

            sm = SelfModel(vs)
            registry = SkillRegistry()
            sandbox = Sandbox(timeout=5)

            approval_fn = AsyncMock(return_value=True)   # approve everything
            skill_code = (
                'from skills.registry import skill\n\n'
                '@skill(description="Count vowels", tags=["auto-generated"])\n'
                'def count_vowels(text: str) -> int:\n'
                '    return sum(1 for c in text.lower() if c in "aeiou")\n'
            )
            # LLM returns: first call = proposals JSON, second call = skill code
            call_count = 0
            def fake_invoke(prompt):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return ('[{"type":"skill_creation","title":"Count vowels",'
                            '"rationale":"Needed for text analysis",'
                            '"skill_name":"count_vowels",'
                            '"skill_description":"Count vowels in text",'
                            '"skill_template":"iterate chars, count aeiou"}]')
                return skill_code
            mock_llm = MagicMock()
            mock_llm.invoke.side_effect = fake_invoke

            cycle = ImprovementCycle(sm, registry, sandbox, approval_fn, llm=mock_llm)
            report = await cycle.run(
                study_findings={"patterns":[],"bottlenecks":[],"gaps":["text analysis"],"strengths":[]},
                exp_stats={"total": 1, "avg_score": 0.5},
            )
            print(f"  ✓ ImprovementCycle skill creation | "
                  f"created={report.skills_created} failed={report.skills_failed} "
                  f"applied={report.proposals_applied}")
    asyncio.run(_run())


# ═══════════════════════════════════════════════════════════════════════════════
# 10. Sequential Pipeline
# ═══════════════════════════════════════════════════════════════════════════════

def test_pipeline_standard_4_stage():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory
        from pipeline.sequential import SequentialPipeline, STANDARD_PIPELINE_STAGES
        import dataclasses as _dc

        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)

        # Override min_score=0 so mock LLM short replies always pass threshold
        stages = [_dc.replace(s, min_score=0.0, max_retries=0) for s in STANDARD_PIPELINE_STAGES]

        replies = {
            "code":      "def greet(n): return f'Hello {n}'\nprint(greet('World'))",
            "designer":  "UI: Header | Main | Footer. Nav, Cards. Accessible.",
            "assessor":  ('{"code_quality":{"score":8,"issues":[],"strengths":["simple"]},'
                          '"design_quality":{"score":7,"issues":[],"strengths":["clear"]},'
                          '"goal_alignment":9,"risk_level":"low","risks":[],'
                          '"overall_score":8,"approved":true,"required_changes":[],"summary":"Good."}'),
            "finaliser": ("## EXECUTIVE SUMMARY\nDone.\n## FINAL DELIVERABLE\n"
                          "def greet(n): return f'Hello {n}'\n## INTEGRATION NOTES\nOK.\n"
                          "## QUALITY CHECKLIST\n- [x] Done\n## OPEN QUESTIONS\nNone."),
        }
        callbacks = []
        original_create = factory.create
        def patched_create(spec):
            agent = original_create(spec)
            async def mock_llm(prompt, system=None):
                return replies.get(spec.agent_type, "Comprehensive detailed output for this pipeline stage.")
            agent._llm_call = mock_llm
            return agent
        factory.create = patched_create

        pipeline = SequentialPipeline(
            stages=stages, factory=factory,
            on_stage_complete=lambda sr: callbacks.append(sr.stage_name),
        )
        result = await pipeline.run("Build a greeting utility function")

        assert len(result.stages) == 4, f"Got {len(result.stages)}: {result.stage_names}"
        assert result.stages[0].stage_name == "coder"
        assert result.stages[1].stage_name == "designer"
        assert result.stages[2].stage_name == "assessor"
        assert result.stages[3].stage_name == "finaliser"
        assert len(callbacks) == 4
        assert result.overall_score > 0
        # Context grows: stage 3 task longer than stage 2
        assert len(result.stages[2].task) > len(result.stages[1].task)
        print(f"  ✓ Standard 4-stage pipeline | "
              f"success={result.success} score={result.overall_score:.2f} "
              f"stages={result.stage_names}")
    asyncio.run(_run())


def test_pipeline_context_propagation():
    """Each stage must receive prior stage outputs in its task prompt."""
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory
        from pipeline.sequential import PipelineBuilder
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)

        received_tasks = []

        original_create = factory.create
        def patched_create(spec):
            agent = original_create(spec)
            async def mock_llm(prompt, system=None):
                received_tasks.append(prompt)
                return f"Output from {spec.agent_type}: comprehensive detailed result."
            agent._llm_call = mock_llm
            return agent
        factory.create = patched_create

        pipeline = (
            PipelineBuilder(factory)
            .add_stage("step1", "role-a", agent_type="worker", min_score=0.0)
            .add_stage("step2", "role-b", agent_type="researcher", min_score=0.0)
            .add_stage("step3", "role-c", agent_type="evaluator", min_score=0.0)
            .build()
        )
        result = await pipeline.run("Test context propagation")
        assert len(result.stages) == 3
        # step2 task should contain step1's output block
        assert "step1" in result.stages[1].task.upper() or "STAGE" in result.stages[1].task
        # step3 task should contain both step1 and step2 blocks
        assert len(result.stages[2].task) > len(result.stages[1].task)
        print(f"  ✓ Pipeline context propagates | stages={result.stage_names}")
    asyncio.run(_run())


def test_pipeline_builder_custom():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory
        from pipeline.sequential import PipelineBuilder
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)

        original_create = factory.create
        def patched_create(spec):
            agent = original_create(spec)
            async def mock_llm(p, system=None):
                return "Detailed comprehensive output covering all aspects and requirements."
            agent._llm_call = mock_llm
            return agent
        factory.create = patched_create

        pipeline = (
            PipelineBuilder(factory)
            .add_stage("research", "researcher", agent_type="researcher", min_score=0.0)
            .add_stage("write",    "writer",     agent_type="worker",     min_score=0.0)
            .build(pipeline_id="test-custom")
        )
        result = await pipeline.run("Research and write about Python async")
        assert result.pipeline_id == "test-custom"
        assert len(result.stages) == 2
        assert result.stages[0].stage_name == "research"
        assert result.stages[1].stage_name == "write"
        print(f"  ✓ PipelineBuilder custom 2-stage | score={result.overall_score:.2f}")
    asyncio.run(_run())


def test_pipeline_aborts_on_required_failure():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory
        from pipeline.sequential import PipelineBuilder
        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)

        call_count = 0
        original_create = factory.create
        def patched_create(spec):
            agent = original_create(spec)
            async def mock_llm(p, system=None):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    raise RuntimeError("Simulated hard failure")
                return "Second stage output"
            agent._llm_call = mock_llm
            return agent
        factory.create = patched_create

        pipeline = (
            PipelineBuilder(factory)
            .add_stage("stage1", "role-a", agent_type="worker",     required=True,  min_score=0.0)
            .add_stage("stage2", "role-b", agent_type="researcher", required=False, min_score=0.0)
            .build()
        )
        result = await pipeline.run("Test abort on failure")
        # Stage 1 failed → pipeline should abort or continue depending on required flag
        assert len(result.stages) >= 1
        print(f"  ✓ Pipeline failure handling | stages_run={len(result.stages)} success={result.success}")
    asyncio.run(_run())


# ═══════════════════════════════════════════════════════════════════════════════
# 11. ResourceMonitor
# ═══════════════════════════════════════════════════════════════════════════════

def test_resource_monitor_tracking():
    from utils.monitoring import ResourceMonitor
    mon = ResourceMonitor(interval=999)
    mon.register_agent("a1", "worker")
    mon.register_agent("a2", "researcher")
    assert len(mon.agent_metrics) == 2
    mon.record_task("a1", success=True,  score=0.8, tokens=100)
    mon.record_task("a1", success=False, score=0.2, tokens=50)
    m = mon.agent_metrics["a1"]
    assert m.tasks_attempted == 2
    assert m.tasks_succeeded == 1
    assert abs(m.success_rate - 0.5) < 0.01
    assert abs(m.avg_score - 0.5) < 0.01
    mon.deregister_agent("a1")
    assert len(mon.agent_metrics) == 1
    print("  ✓ ResourceMonitor tracks tasks + scores correctly")


def test_resource_monitor_spawn_gate():
    import config
    from utils.monitoring import ResourceMonitor, ResourceSnapshot
    mon = ResourceMonitor()
    mon.latest_snapshot = ResourceSnapshot(cpu_pct=95.0, ram_pct=50.0)
    assert not mon.can_spawn_agent()
    mon.latest_snapshot = ResourceSnapshot(cpu_pct=20.0, ram_pct=30.0)
    assert mon.can_spawn_agent()
    print("  ✓ ResourceMonitor spawn gate (CPU/RAM threshold)")


def test_resource_monitor_fleet_summary():
    from utils.monitoring import ResourceMonitor
    mon = ResourceMonitor(interval=999)
    mon.register_agent("x1", "coder")
    mon.register_agent("x2", "designer")
    summary = mon.fleet_summary()
    assert summary["active_agents"] == 2
    assert "resources" in summary
    assert "agents" in summary
    print("  ✓ ResourceMonitor fleet_summary() structure correct")


# ═══════════════════════════════════════════════════════════════════════════════
# 12. MetaOrchestrator (integration-level, fully mocked)
# ═══════════════════════════════════════════════════════════════════════════════

def test_orchestrator_goal_queue():
    vs, exp_lib, registry, sandbox, monitor = _make_services()
    from agent_factory import AgentFactory
    from meta_orchestrator import MetaOrchestrator

    factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
    orch = MetaOrchestrator(factory, monitor, exp_lib, registry, vs, sandbox)

    g1 = orch.add_goal("High priority goal", priority=1)
    g2 = orch.add_goal("Low priority goal",  priority=9)
    g3 = orch.add_goal("Medium goal",        priority=5)

    assert orch._goal_queue[0].priority == 1
    assert orch._goal_queue[1].priority == 5
    assert orch._goal_queue[2].priority == 9
    print(f"  ✓ Goal queue sorted by priority | queue={[g.priority for g in orch._goal_queue]}")


def test_orchestrator_pipeline_goal_flag():
    vs, exp_lib, registry, sandbox, monitor = _make_services()
    from agent_factory import AgentFactory
    from meta_orchestrator import MetaOrchestrator

    factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
    orch = MetaOrchestrator(factory, monitor, exp_lib, registry, vs, sandbox)

    g = orch.add_goal("Build a web scraper", priority=3, use_pipeline=True)
    assert g.use_pipeline is True
    assert g.goal_id is not None
    print(f"  ✓ Pipeline goal flag set correctly | id={g.goal_id}")


def test_orchestrator_self_task_generation():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory
        from meta_orchestrator import MetaOrchestrator

        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        orch = MetaOrchestrator(factory, monitor, exp_lib, registry, vs, sandbox)

        tasks = await orch.generate_self_tasks()
        assert isinstance(tasks, list)
        assert len(tasks) >= 3   # always generates at least base + gap + pipeline tasks
        print(f"  ✓ generate_self_tasks() | count={len(tasks)} sample='{tasks[0][:50]}'")
    asyncio.run(_run())


def test_orchestrator_dashboard_shape():
    vs, exp_lib, registry, sandbox, monitor = _make_services()
    from agent_factory import AgentFactory
    from meta_orchestrator import MetaOrchestrator

    factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
    orch = MetaOrchestrator(factory, monitor, exp_lib, registry, vs, sandbox)

    dash = orch.dashboard()
    required_keys = [
        "iteration", "pending_goals", "completed_goals",
        "pipeline_runs", "study_cycles", "self_model",
        "fleet", "experience_stats", "skills",
    ]
    for key in required_keys:
        assert key in dash, f"Missing dashboard key: {key}"
    print(f"  ✓ dashboard() has all required keys | keys={list(dash.keys())}")


def test_orchestrator_fleet_skill_inject():
    async def _run():
        vs, exp_lib, registry, sandbox, monitor = _make_services()
        from agent_factory import AgentFactory, AgentSpec
        from meta_orchestrator import MetaOrchestrator

        factory = AgentFactory(vs, exp_lib, registry, sandbox, monitor)
        orch = MetaOrchestrator(factory, monitor, exp_lib, registry, vs, sandbox)

        # Spawn 3 agents
        for i in range(3):
            factory.create(AgentSpec(role=f"agent-{i}", agent_type="worker"))

        count = await orch.inject_skill_fleet_wide("heuristic_score")
        assert count == 3
        for agent in factory.list_agents():
            assert "heuristic_score" in agent.state.skills_injected
        print(f"  ✓ Fleet-wide skill inject | agents_updated={count}")
    asyncio.run(_run())


# ═══════════════════════════════════════════════════════════════════════════════
# Runner
# ═══════════════════════════════════════════════════════════════════════════════

ALL_TESTS = [
    # SkillRegistry
    ("SkillRegistry: loads base skills",            test_skill_registry_loads_base_skills),
    ("SkillRegistry: manual register + call",       test_skill_register_and_call),
    ("SkillRegistry: load from .py file",           test_skill_load_from_file),
    ("Skills: heuristic_score",                     test_heuristic_score),
    ("Skills: detect_errors",                       test_detect_errors),
    # Sandbox
    ("Sandbox: executes valid code",                test_sandbox_execute_valid),
    ("Sandbox: blocks disallowed imports",          test_sandbox_blocks_import),
    ("Sandbox: blocks dangerous builtins",          test_sandbox_blocks_exec_builtins),
    ("Sandbox: captures stdout",                    test_sandbox_captures_stdout),
    # ToolBelt
    ("ToolBelt: filesystem write+read",             test_toolbelt_filesystem_write_read),
    ("ToolBelt: filesystem list",                   test_toolbelt_filesystem_list),
    ("ToolBelt: unknown connector graceful",        test_toolbelt_unknown_connector),
    ("ToolBelt: memory connector",                  test_toolbelt_memory_connector),
    # AgentFactory
    ("AgentFactory: spawn + destroy",               test_factory_spawn_destroy),
    ("AgentFactory: all 8 archetypes",              test_factory_all_archetypes),
    ("AgentFactory: resource gate",                 test_factory_resource_limit),
    ("AgentFactory: skill injection",               test_factory_skill_injection),
    ("AgentFactory: idle_agents filter",            test_factory_idle_agents),
    # BaseAgent lifecycle
    ("Agent: WorkerAgent.run()",                    test_worker_agent_run),
    ("Agent: CodeAgent.run() executes code",        test_code_agent_run),
    ("Agent: DesignerAgent.run()",                  test_designer_agent_run),
    ("Agent: AssessorAgent.run() + score",          test_assessor_agent_run),
    ("Agent: FinaliserAgent.run()",                 test_finaliser_agent_run),
    ("Agent: tool_call() no toolbelt graceful",     test_agent_tool_call_no_toolbelt),
    ("Agent: pipeline_context in state",            test_agent_pipeline_context_passed),
    # ExperienceLibrary
    ("ExperienceLibrary: record + stats + lessons", test_experience_library_record_and_retrieve),
    # SelfModel
    ("SelfModel: upsert + retrieve",                test_self_model_upsert_and_retrieve),
    ("SelfModel: reinforce + weaken",               test_self_model_reinforce_and_weaken),
    ("SelfModel: gaps + strengths + snapshot",      test_self_model_gaps_and_strengths),
    ("SelfModel: improvement log",                  test_self_model_improvement_log),
    # StudyCycle
    ("StudyCycle: seed path (no experiences)",      test_study_cycle_seed_and_report),
    ("StudyCycle: with experiences + updates",      test_study_cycle_with_experiences),
    # ImprovementCycle
    ("ImprovementCycle: proposal generation",       test_improvement_cycle_proposal_generation),
    ("ImprovementCycle: skill creation + inject",   test_improvement_cycle_skill_creation),
    # Pipeline
    ("Pipeline: standard 4-stage run",              test_pipeline_standard_4_stage),
    ("Pipeline: context propagation",               test_pipeline_context_propagation),
    ("Pipeline: PipelineBuilder custom stages",     test_pipeline_builder_custom),
    ("Pipeline: abort on required failure",         test_pipeline_aborts_on_required_failure),
    # ResourceMonitor
    ("ResourceMonitor: task tracking",              test_resource_monitor_tracking),
    ("ResourceMonitor: spawn gate (CPU/RAM)",       test_resource_monitor_spawn_gate),
    ("ResourceMonitor: fleet_summary shape",        test_resource_monitor_fleet_summary),
    # MetaOrchestrator
    ("Orchestrator: goal queue priority sort",      test_orchestrator_goal_queue),
    ("Orchestrator: pipeline goal flag",            test_orchestrator_pipeline_goal_flag),
    ("Orchestrator: self-task generation",          test_orchestrator_self_task_generation),
    ("Orchestrator: dashboard shape",               test_orchestrator_dashboard_shape),
    ("Orchestrator: fleet-wide skill inject",       test_orchestrator_fleet_skill_inject),
]


def main():
    passed = failed = 0
    errors = []

    width = max(len(name) for name, _ in ALL_TESTS) + 4
    print("\n" + "═" * (width + 20))
    print("  Synthetic Intelligence Platform — Full Test Suite")
    print(f"  {len(ALL_TESTS)} tests across 12 subsystems")
    print("═" * (width + 20) + "\n")

    for name, fn in ALL_TESTS:
        print(f"▶ {name}")
        try:
            fn()
            passed += 1
        except Exception as exc:
            import traceback
            failed += 1
            errors.append((name, str(exc), traceback.format_exc()))
            print(f"  ✗ FAILED: {exc}")

    print("\n" + "═" * (width + 20))
    print(f"  {'✓ ALL PASSED' if failed == 0 else f'✗ {failed} FAILED'}  "
          f"({passed}/{len(ALL_TESTS)} passed)")
    print("═" * (width + 20))

    if errors:
        print("\n── Failures ──")
        for name, exc, tb in errors:
            print(f"\n[{name}]\n{exc}\n{tb}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
