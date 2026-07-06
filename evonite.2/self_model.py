"""
memory/self_model.py — The Synthetic Intelligence's persistent self-model.

The self-model is a living knowledge graph that the SI maintains about itself:
  - Its own architecture and agent capabilities
  - Known strengths and weaknesses per role/task-type
  - Bottlenecks, error patterns, and performance trends
  - Capability gaps (things it cannot do yet)
  - Version history of improvements made

It is stored in ChromaDB (SELF_MODEL_COLLECTION) and updated every study cycle.
The Meta-Orchestrator reads from it when planning, spawning, and self-tasking.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

import config
from memory.vector_store import VectorStore
from utils.logging import get_logger

logger = get_logger(__name__)

COLLECTION = config.SELF_MODEL_COLLECTION


@dataclass
class CapabilityNode:
    """A single capability entry in the self-model."""
    node_id: str = field(default_factory=lambda: str(uuid.uuid4())[:12])
    category: str = "general"          # general | role | skill | tool | bottleneck | gap
    name: str = ""
    description: str = ""
    strength: float = 0.5              # 0.0 (weak) → 1.0 (strong)
    evidence_count: int = 0            # number of experiences supporting this
    last_updated: float = field(default_factory=time.time)
    tags: List[str] = field(default_factory=list)
    related: List[str] = field(default_factory=list)   # node_ids of related nodes

    def to_text(self) -> str:
        return (
            f"[{self.category}] {self.name}: {self.description} "
            f"(strength={self.strength:.2f}, evidence={self.evidence_count})"
        )

    def to_metadata(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "category": self.category,
            "name": self.name,
            "strength": round(self.strength, 4),
            "evidence_count": self.evidence_count,
            "last_updated": self.last_updated,
            "tags": json.dumps(self.tags),
        }


@dataclass
class ImprovementRecord:
    """A logged improvement action — tracks the SI's evolution over time."""
    record_id: str = field(default_factory=lambda: str(uuid.uuid4())[:12])
    improvement_type: str = "prompt_tuning"
    # prompt_tuning | skill_creation | agent_reconfiguration | architecture_tweak
    description: str = ""
    rationale: str = ""
    proposed_by: str = "meta-orchestrator"
    approved: bool = False
    applied: bool = False
    created_at: float = field(default_factory=time.time)
    applied_at: Optional[float] = None
    outcome_score_delta: float = 0.0   # score change after applying


class SelfModel:
    """
    The SI's dynamic self-knowledge base.

    Provides read/write access to the capability graph and improvement history.
    All data persists in ChromaDB.

    Usage::

        model = SelfModel(vector_store)
        model.upsert_capability(CapabilityNode(
            category="role",
            name="researcher",
            description="Strong at synthesis, weak at recent facts",
            strength=0.72,
        ))
        gaps = model.get_capability_gaps(threshold=0.4)
    """

    def __init__(self, vector_store: VectorStore) -> None:
        self._vs = vector_store
        # Ensure collection exists
        self._vs._col(COLLECTION)
        logger.info("SelfModel initialised (collection='%s')", COLLECTION)

    # ── Capability graph ──────────────────────────────────────────────────────

    def upsert_capability(self, node: CapabilityNode) -> str:
        """Insert or update a capability node."""
        node.last_updated = time.time()
        doc_id = self._vs.upsert(
            collection=COLLECTION,
            text=node.to_text(),
            metadata=node.to_metadata(),
            doc_id=node.node_id,
        )
        logger.debug("Self-model upsert: [%s] %s (strength=%.2f)", node.category, node.name, node.strength)
        return doc_id

    def get_capability(self, node_id: str) -> Optional[CapabilityNode]:
        doc = self._vs.get(COLLECTION, node_id)
        if not doc:
            return None
        return self._doc_to_node(doc)

    def search_capabilities(self, query: str, n: int = 5) -> List[CapabilityNode]:
        results = self._vs.query(COLLECTION, query, n_results=n)
        return [self._doc_to_node(r) for r in results]

    def get_by_category(self, category: str, limit: int = 20) -> List[CapabilityNode]:
        results = self._vs.query(
            COLLECTION,
            query_text=category,
            n_results=limit,
            where={"category": category},
        )
        return [self._doc_to_node(r) for r in results]

    def get_capability_gaps(self, threshold: float = 0.4) -> List[CapabilityNode]:
        """Return capabilities with strength below *threshold* — the weak spots."""
        all_nodes = self._vs.list_all(COLLECTION, limit=200)
        gaps = []
        for doc in all_nodes:
            strength = float(doc["metadata"].get("strength", 0.5))
            if strength < threshold:
                gaps.append(self._doc_to_node(doc))
        gaps.sort(key=lambda n: n.strength)
        return gaps

    def get_strengths(self, threshold: float = 0.75) -> List[CapabilityNode]:
        """Return capabilities with strength above *threshold*."""
        all_nodes = self._vs.list_all(COLLECTION, limit=200)
        strengths = []
        for doc in all_nodes:
            strength = float(doc["metadata"].get("strength", 0.5))
            if strength >= threshold:
                strengths.append(self._doc_to_node(doc))
        strengths.sort(key=lambda n: n.strength, reverse=True)
        return strengths

    def reinforce(self, node_id: str, delta: float = 0.05) -> None:
        """Strengthen a capability after a successful outcome."""
        node = self.get_capability(node_id)
        if node:
            node.strength = min(1.0, node.strength + delta)
            node.evidence_count += 1
            self.upsert_capability(node)

    def weaken(self, node_id: str, delta: float = 0.05) -> None:
        """Weaken a capability after a failure."""
        node = self.get_capability(node_id)
        if node:
            node.strength = max(0.0, node.strength - delta)
            node.evidence_count += 1
            self.upsert_capability(node)

    # ── Improvement history ───────────────────────────────────────────────────

    def log_improvement(self, record: ImprovementRecord) -> str:
        text = (
            f"[improvement:{record.improvement_type}] {record.description} "
            f"rationale: {record.rationale}"
        )
        meta = {
            "record_id":        record.record_id,
            "improvement_type": record.improvement_type,
            "approved":         record.approved,
            "applied":          record.applied,
            "created_at":       record.created_at,
            "outcome_delta":    record.outcome_score_delta,
            "proposed_by":      record.proposed_by,
        }
        return self._vs.upsert(COLLECTION, text, meta, doc_id=f"impr-{record.record_id}")

    def get_improvement_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        results = self._vs.query(COLLECTION, "improvement", n_results=limit,
                                 where={"improvement_type": {"$ne": ""}})
        return [r["metadata"] for r in results]

    # ── Summary ───────────────────────────────────────────────────────────────

    def snapshot(self) -> Dict[str, Any]:
        """Return a concise self-model snapshot for logging and prompting."""
        all_docs = self._vs.list_all(COLLECTION, limit=300)
        if not all_docs:
            return {"total_nodes": 0, "gaps": [], "strengths": [], "improvements": 0}

        capability_docs = [d for d in all_docs if not d["metadata"].get("record_id", "").startswith("impr")]
        improvement_docs = [d for d in all_docs if d["metadata"].get("record_id", "").startswith("impr")]

        strengths_raw = sorted(
            [d for d in capability_docs if float(d["metadata"].get("strength", 0)) >= 0.7],
            key=lambda d: -float(d["metadata"].get("strength", 0))
        )[:5]
        gaps_raw = sorted(
            [d for d in capability_docs if float(d["metadata"].get("strength", 1)) < 0.5],
            key=lambda d: float(d["metadata"].get("strength", 1))
        )[:5]

        return {
            "total_nodes":   len(capability_docs),
            "improvements":  len(improvement_docs),
            "strengths": [{"name": d["metadata"].get("name"), "strength": d["metadata"].get("strength")} for d in strengths_raw],
            "gaps":      [{"name": d["metadata"].get("name"), "strength": d["metadata"].get("strength")} for d in gaps_raw],
        }

    def to_prompt_block(self) -> str:
        """Format the self-model as a concise block for LLM prompts."""
        snap = self.snapshot()
        lines = [
            f"Self-Model Snapshot ({snap['total_nodes']} capability nodes, {snap['improvements']} improvements logged)",
            "Strengths: " + ", ".join(f"{s['name']} ({float(s['strength']):.2f})" for s in snap["strengths"]) or "none yet",
            "Gaps:      " + ", ".join(f"{g['name']} ({float(g['strength']):.2f})" for g in snap["gaps"]) or "none identified",
        ]
        return "\n".join(lines)

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _doc_to_node(doc: Dict[str, Any]) -> CapabilityNode:
        m = doc.get("metadata", {})
        return CapabilityNode(
            node_id=m.get("node_id", doc.get("id", "")),
            category=m.get("category", "general"),
            name=m.get("name", ""),
            description=doc.get("text", ""),
            strength=float(m.get("strength", 0.5)),
            evidence_count=int(m.get("evidence_count", 0)),
            last_updated=float(m.get("last_updated", 0)),
            tags=json.loads(m.get("tags", "[]")),
        )
