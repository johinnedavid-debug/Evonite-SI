"""
memory/experience_library.py — Store and retrieve agent trajectories, successes, and failures.

Each experience is a structured record that captures:
- What was attempted (task, agent role, input)
- What happened (output, steps taken)
- How it went (success/failure, score, reflections)
- What was learned (extracted lessons)
"""

import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

import config
from memory.vector_store import VectorStore
from utils.logging import get_logger

logger = get_logger(__name__)

COLLECTION = config.CHROMA_COLLECTION_EXPERIENCES


@dataclass
class Experience:
    """A single recorded agent experience."""
    experience_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = ""
    agent_role: str = ""
    task: str = ""
    task_type: str = "general"
    input_summary: str = ""
    output_summary: str = ""
    steps: List[str] = field(default_factory=list)
    success: bool = False
    score: float = 0.0
    error: Optional[str] = None
    reflection: str = ""
    lessons_learned: List[str] = field(default_factory=list)
    skills_used: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    tags: List[str] = field(default_factory=list)

    def to_text(self) -> str:
        """Produce the text that will be embedded for semantic search."""
        parts = [
            f"Task: {self.task}",
            f"Role: {self.agent_role}",
            f"Success: {self.success}",
            f"Score: {self.score:.2f}",
            f"Output: {self.output_summary[:500]}",
            f"Reflection: {self.reflection[:500]}",
            "Lessons: " + "; ".join(self.lessons_learned[:5]),
        ]
        return "\n".join(parts)

    def to_metadata(self) -> Dict[str, Any]:
        """Return flat metadata dict (no nested objects) for ChromaDB."""
        return {
            "experience_id": self.experience_id,
            "agent_id": self.agent_id,
            "agent_role": self.agent_role,
            "task_type": self.task_type,
            "success": self.success,
            "score": round(self.score, 4),
            "created_at": self.created_at,
            "tags": json.dumps(self.tags),
            "skills_used": json.dumps(self.skills_used),
            "lessons_learned": json.dumps(self.lessons_learned[:5]),
        }


class ExperienceLibrary:
    """
    Fleet-wide repository of past agent experiences.

    Experiences are persisted in ChromaDB (vector-searchable) and can be
    retrieved semantically, by agent, or filtered by success/score.
    """

    def __init__(self, vector_store: VectorStore) -> None:
        self._vs = vector_store
        logger.info("ExperienceLibrary ready (collection='%s')", COLLECTION)

    # ── Write ─────────────────────────────────────────────────────────────────

    def record(self, experience: Experience) -> str:
        """
        Persist an experience.

        Returns:
            experience_id
        """
        doc_id = self._vs.upsert(
            collection=COLLECTION,
            text=experience.to_text(),
            metadata=experience.to_metadata(),
            doc_id=experience.experience_id,
        )
        status = "✓" if experience.success else "✗"
        logger.info(
            "Experience recorded %s | agent=%s | score=%.2f | id=%s",
            status, experience.agent_id, experience.score, doc_id,
        )
        return doc_id

    # ── Read ──────────────────────────────────────────────────────────────────

    def search_similar(
        self,
        query: str,
        n: int = 5,
        success_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Return the *n* most semantically similar experiences.

        Args:
            query:        Natural-language description of what you're looking for.
            n:            Maximum results.
            success_only: If True, only return successful experiences.
        """
        where = {"success": True} if success_only else None
        return self._vs.query(COLLECTION, query, n_results=n, where=where)

    def get_best_for_task(self, task_description: str, n: int = 3) -> List[Dict[str, Any]]:
        """Return the highest-scoring experiences for a similar task."""
        results = self.search_similar(task_description, n=n * 3, success_only=True)
        # Re-sort by score metadata
        results.sort(key=lambda r: float(r["metadata"].get("score", 0)), reverse=True)
        return results[:n]

    def get_failures(self, task_description: str, n: int = 5) -> List[Dict[str, Any]]:
        """Retrieve failure experiences similar to a task — useful for reflection."""
        where = {"success": False}
        return self._vs.query(COLLECTION, task_description, n_results=n, where=where)

    def get_by_agent(self, agent_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        where = {"agent_id": agent_id}
        return self._vs.query(
            COLLECTION,
            query_text=agent_id,
            n_results=limit,
            where=where,
        )

    # ── Stats ─────────────────────────────────────────────────────────────────

    def summary_stats(self) -> Dict[str, Any]:
        """Return fleet-wide experience statistics."""
        all_exp = self._vs.list_all(COLLECTION, limit=1000)
        total = len(all_exp)
        if total == 0:
            return {"total": 0}
        successes = sum(1 for e in all_exp if e["metadata"].get("success"))
        scores = [float(e["metadata"].get("score", 0)) for e in all_exp]
        return {
            "total": total,
            "successes": successes,
            "failures": total - successes,
            "success_rate": round(successes / total, 3),
            "avg_score": round(sum(scores) / len(scores), 3),
            "max_score": round(max(scores), 3),
            "min_score": round(min(scores), 3),
        }

    def extract_global_lessons(self, limit: int = 50) -> List[str]:
        """
        Aggregate lessons_learned across recent successful experiences.

        Returns:
            Deduplicated list of lesson strings.
        """
        recent = self._vs.list_all(COLLECTION, limit=limit)
        seen: set = set()
        lessons: List[str] = []
        for exp in recent:
            raw = exp["metadata"].get("lessons_learned", "[]")
            try:
                for lesson in json.loads(raw):
                    if lesson and lesson not in seen:
                        seen.add(lesson)
                        lessons.append(lesson)
            except (json.JSONDecodeError, TypeError):
                pass
        return lessons
