"""
utils/monitoring.py — CPU / RAM / GPU resource tracking and agent-fleet metrics.
"""

import asyncio
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

try:
    import psutil
    _PSUTIL = True
except ImportError:
    _PSUTIL = False

import config
from utils.logging import get_logger

logger = get_logger(__name__)


@dataclass
class ResourceSnapshot:
    """Point-in-time resource reading."""
    ts: float = field(default_factory=time.time)
    cpu_pct: float = 0.0
    ram_pct: float = 0.0
    ram_used_mb: float = 0.0
    ram_total_mb: float = 0.0
    gpu_pct: Optional[float] = None
    gpu_vram_pct: Optional[float] = None

    def as_dict(self) -> dict:
        return {
            "ts": self.ts,
            "cpu_pct": round(self.cpu_pct, 1),
            "ram_pct": round(self.ram_pct, 1),
            "ram_used_mb": round(self.ram_used_mb, 1),
            "ram_total_mb": round(self.ram_total_mb, 1),
            "gpu_pct": self.gpu_pct,
            "gpu_vram_pct": self.gpu_vram_pct,
        }


@dataclass
class AgentMetrics:
    """Per-agent lifecycle counters."""
    agent_id: str
    role: str
    spawned_at: float = field(default_factory=time.time)
    tasks_attempted: int = 0
    tasks_succeeded: int = 0
    tasks_failed: int = 0
    total_tokens_used: int = 0
    last_active: float = field(default_factory=time.time)
    avg_score: float = 0.0
    score_history: List[float] = field(default_factory=list)

    @property
    def success_rate(self) -> float:
        total = self.tasks_attempted
        return self.tasks_succeeded / total if total > 0 else 0.0

    def record_score(self, score: float) -> None:
        self.score_history.append(score)
        self.avg_score = sum(self.score_history) / len(self.score_history)

    def as_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "role": self.role,
            "uptime_s": round(time.time() - self.spawned_at, 1),
            "tasks_attempted": self.tasks_attempted,
            "tasks_succeeded": self.tasks_succeeded,
            "tasks_failed": self.tasks_failed,
            "success_rate": round(self.success_rate, 3),
            "avg_score": round(self.avg_score, 3),
            "total_tokens_used": self.total_tokens_used,
        }


class ResourceMonitor:
    """
    Periodic resource sampler and agent-fleet tracker.

    Usage::

        monitor = ResourceMonitor()
        monitor.register_agent("agent-001", "researcher")
        await monitor.start()          # background loop
        snap = monitor.latest_snapshot
    """

    def __init__(self, interval: float = 5.0) -> None:
        self._interval = interval
        self._running = False
        self._history: List[ResourceSnapshot] = []
        self._max_history = 720          # ~1 hour at 5-second intervals
        self.agent_metrics: Dict[str, AgentMetrics] = {}
        self.latest_snapshot: ResourceSnapshot = ResourceSnapshot()

    # ── Agent registry ────────────────────────────────────────────────────────

    def register_agent(self, agent_id: str, role: str) -> None:
        self.agent_metrics[agent_id] = AgentMetrics(agent_id=agent_id, role=role)
        logger.info("Registered agent in monitor: %s (%s)", agent_id, role)

    def deregister_agent(self, agent_id: str) -> None:
        self.agent_metrics.pop(agent_id, None)
        logger.info("Deregistered agent from monitor: %s", agent_id)

    def record_task(
        self,
        agent_id: str,
        success: bool,
        score: float = 0.0,
        tokens: int = 0,
    ) -> None:
        m = self.agent_metrics.get(agent_id)
        if not m:
            return
        m.tasks_attempted += 1
        m.total_tokens_used += tokens
        m.last_active = time.time()
        if success:
            m.tasks_succeeded += 1
        else:
            m.tasks_failed += 1
        m.record_score(score)

    # ── Resource sampling ─────────────────────────────────────────────────────

    def _sample(self) -> ResourceSnapshot:
        snap = ResourceSnapshot()
        if _PSUTIL:
            snap.cpu_pct = psutil.cpu_percent(interval=None)
            vm = psutil.virtual_memory()
            snap.ram_pct = vm.percent
            snap.ram_used_mb = vm.used / 1024 / 1024
            snap.ram_total_mb = vm.total / 1024 / 1024
        return snap

    def can_spawn_agent(self) -> bool:
        """Return True if resources allow spawning another agent."""
        snap = self.latest_snapshot
        active = len(self.agent_metrics)
        if active >= config.MAX_AGENTS:
            logger.warning("Max agent count reached (%d)", config.MAX_AGENTS)
            return False
        if active >= config.MAX_CONCURRENT_AGENTS:
            logger.warning("Max concurrent agent count reached (%d)", config.MAX_CONCURRENT_AGENTS)
            return False
        if snap.cpu_pct > config.CPU_SPAWN_THRESHOLD:
            logger.warning("CPU too high to spawn (%.1f%%)", snap.cpu_pct)
            return False
        if snap.ram_pct > config.RAM_SPAWN_THRESHOLD:
            logger.warning("RAM too high to spawn (%.1f%%)", snap.ram_pct)
            return False
        return True

    def fleet_summary(self) -> dict:
        return {
            "active_agents": len(self.agent_metrics),
            "max_agents": config.MAX_AGENTS,
            "resources": self.latest_snapshot.as_dict(),
            "agents": [m.as_dict() for m in self.agent_metrics.values()],
        }

    # ── Background loop ───────────────────────────────────────────────────────

    async def start(self) -> None:
        self._running = True
        logger.info("ResourceMonitor started (interval=%.1fs)", self._interval)
        while self._running:
            self.latest_snapshot = self._sample()
            self._history.append(self.latest_snapshot)
            if len(self._history) > self._max_history:
                self._history.pop(0)
            await asyncio.sleep(self._interval)

    def stop(self) -> None:
        self._running = False
        logger.info("ResourceMonitor stopped.")
