"""
main.py — Entry point for the Self-Improving AI Platform.

Launches the Meta-Orchestrator, resource monitor, and all supporting services.
"""

import asyncio
import signal
import sys
from pathlib import Path

# ── Make project root importable regardless of CWD ───────────────────────────
sys.path.insert(0, str(Path(__file__).parent))

import config
from agent_factory import AgentFactory
from memory.experience_library import ExperienceLibrary
from memory.vector_store import VectorStore
from meta_orchestrator import MetaOrchestrator
from skills.registry import SkillRegistry, get_registry
from utils.logging import get_logger, log_event
from utils.monitoring import ResourceMonitor
from utils.sandbox import Sandbox

logger = get_logger("main")

BANNER = r"""
╔══════════════════════════════════════════════════════════════╗
║          Self-Improving Multi-Agent AI Platform              ║
║          Local  ·  LangGraph  ·  Ollama  ·  ChromaDB         ║
╚══════════════════════════════════════════════════════════════╝
"""


def print_banner() -> None:
    print(BANNER)
    print(f"  Meta model  : {config.META_MODEL}")
    print(f"  Worker model: {config.WORKER_MODEL}")
    print(f"  Max agents  : {config.MAX_AGENTS}")
    print(f"  Approval    : spawn={config.REQUIRE_HUMAN_APPROVAL_FOR_SPAWN}")
    print(f"  Logs dir    : {config.LOGS_DIR}")
    print()


async def build_platform() -> MetaOrchestrator:
    """Initialise all platform components and wire them together."""
    logger.info("Building platform components …")

    # ── Persistent memory ─────────────────────────────────────────────────────
    vector_store = VectorStore()
    exp_lib = ExperienceLibrary(vector_store)

    # ── Skill registry ────────────────────────────────────────────────────────
    registry: SkillRegistry = get_registry()
    n = registry.load_module("skills.base_skills")
    logger.info("Loaded %d base skills", n)

    # ── Utilities ─────────────────────────────────────────────────────────────
    sandbox = Sandbox()
    monitor = ResourceMonitor(interval=5.0)

    # ── Agent factory ─────────────────────────────────────────────────────────
    factory = AgentFactory(
        vector_store=vector_store,
        experience_library=exp_lib,
        skill_registry=registry,
        sandbox=sandbox,
        monitor=monitor,
    )

    # ── Meta-Orchestrator ─────────────────────────────────────────────────────
    orchestrator = MetaOrchestrator(
        factory=factory,
        monitor=monitor,
        exp_lib=exp_lib,
        skill_registry=registry,
    )

    logger.info("Platform components ready")
    return orchestrator, monitor, sandbox


async def main() -> None:
    print_banner()
    log_event(logger, "platform_startup", meta_model=config.META_MODEL)

    orchestrator, monitor, sandbox = await build_platform()

    # ── Graceful shutdown ─────────────────────────────────────────────────────
    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def _handle_signal(*_):
        logger.info("Shutdown signal received")
        stop_event.set()
        orchestrator.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            # Windows
            signal.signal(sig, _handle_signal)

    # ── Launch background tasks ───────────────────────────────────────────────
    tasks = [
        asyncio.create_task(monitor.start(), name="resource_monitor"),
        asyncio.create_task(orchestrator.run_forever(), name="meta_orchestrator"),
    ]

    logger.info("Platform running — press Ctrl+C to stop")

    try:
        await stop_event.wait()
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("Shutting down …")
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        sandbox.close()
        monitor.stop()

        # Print final dashboard
        dash = orchestrator.dashboard()
        print("\n── Final Dashboard ──")
        import json
        print(json.dumps(dash, indent=2, default=str))
        log_event(logger, "platform_shutdown", **dash)
        logger.info("Platform shut down cleanly.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
