"""
skills/base_skills.py — Core reusable skills available to all agents.

Each function decorated with @skill is auto-discovered by SkillRegistry.load_module().
"""

import hashlib
import json
import re
import textwrap
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from skills.registry import skill


# ── Text utilities ────────────────────────────────────────────────────────────

@skill(description="Summarise text to N sentences", tags=["text", "summarise"])
def summarise_text(text: str, max_sentences: int = 3) -> str:
    """Return the first *max_sentences* sentences of *text*."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return " ".join(sentences[:max_sentences])


@skill(description="Extract bullet points from text", tags=["text", "extract"])
def extract_bullets(text: str) -> List[str]:
    """Return lines that look like bullet points (-, *, •, numbered)."""
    pattern = r"^\s*(?:[-*•]|\d+[.):])\s+(.+)$"
    return [m.group(1).strip() for m in re.finditer(pattern, text, re.MULTILINE)]


@skill(description="Count tokens (words) in text", tags=["text", "metrics"])
def count_tokens(text: str) -> int:
    """Rough token count: splits on whitespace."""
    return len(text.split())


@skill(description="Wrap text to given width", tags=["text"])
def wrap_text(text: str, width: int = 80) -> str:
    return textwrap.fill(text, width)


# ── JSON utilities ────────────────────────────────────────────────────────────

@skill(description="Pretty-print a JSON string", tags=["json", "formatting"])
def pretty_json(data: Any, indent: int = 2) -> str:
    """Return a pretty-printed JSON string for *data*."""
    return json.dumps(data, indent=indent, default=str)


@skill(description="Extract a value from a JSON string by dotted key path", tags=["json"])
def json_get(json_str: str, path: str) -> Any:
    """
    Navigate *json_str* using a dotted *path* like 'results.0.score'.

    Returns None if the path doesn't exist.
    """
    try:
        obj = json.loads(json_str) if isinstance(json_str, str) else json_str
        for key in path.split("."):
            if isinstance(obj, list):
                obj = obj[int(key)]
            else:
                obj = obj[key]
        return obj
    except (KeyError, IndexError, ValueError, TypeError):
        return None


# ── Evaluation / scoring ──────────────────────────────────────────────────────

@skill(description="Score task output against expected criteria (heuristic)", tags=["eval", "scoring"])
def heuristic_score(
    output: str,
    criteria: Optional[List[str]] = None,
    expected_keywords: Optional[List[str]] = None,
) -> float:
    """
    Simple heuristic scoring 0.0–1.0.

    Checks keyword presence and output length.
    """
    if not output.strip():
        return 0.0

    score = 0.3  # base for having any output

    if expected_keywords:
        matches = sum(1 for kw in expected_keywords if kw.lower() in output.lower())
        score += 0.5 * (matches / len(expected_keywords))

    if criteria:
        # A proxy: if criteria words appear in output
        hits = sum(1 for c in criteria if any(w in output.lower() for w in c.lower().split()))
        score += 0.2 * (hits / len(criteria))

    # Penalise very short outputs
    words = len(output.split())
    if words < 5:
        score *= 0.5

    return min(round(score, 3), 1.0)


@skill(description="Detect error patterns in text", tags=["eval", "error-detection"])
def detect_errors(text: str) -> Dict[str, Any]:
    """
    Scan *text* for common error indicators.

    Returns dict with 'has_error', 'patterns', 'severity'.
    """
    patterns = {
        "exception": r"\b(?:Exception|Error|Traceback|raise)\b",
        "timeout": r"\b(?:timeout|timed out|deadline)\b",
        "none_value": r"\bNone\b.*(?:returned|got|received)",
        "empty_result": r"\b(?:empty|no results?|not found|missing)\b",
        "permission": r"\b(?:permission denied|unauthorized|forbidden)\b",
    }
    found = {}
    for name, pat in patterns.items():
        if re.search(pat, text, re.IGNORECASE):
            found[name] = True

    severity = "none"
    if "exception" in found or "permission" in found:
        severity = "high"
    elif found:
        severity = "medium"

    return {
        "has_error": bool(found),
        "patterns": list(found.keys()),
        "severity": severity,
    }


# ── Reflection helpers ────────────────────────────────────────────────────────

@skill(description="Build a reflection prompt from task, output, and score", tags=["reflection"])
def build_reflection_prompt(
    task: str,
    output: str,
    score: float,
    previous_lessons: Optional[List[str]] = None,
) -> str:
    """
    Construct a structured reflection prompt to send to an LLM.

    Returns a ready-to-use prompt string.
    """
    lessons_block = ""
    if previous_lessons:
        lessons_block = "\n\nPreviously learned lessons:\n" + "\n".join(
            f"- {l}" for l in previous_lessons[:5]
        )

    return f"""You are a self-reflective AI agent performing a post-task review.

## Task
{task}

## Your Output
{output[:1500]}

## Performance Score
{score:.2f} / 1.00{lessons_block}

## Reflection Instructions
1. What did you do well?
2. What went wrong or could be improved?
3. List 2-3 concrete lessons for next time.
4. Suggest one specific change to your approach.

Respond in JSON with keys: "strengths", "weaknesses", "lessons", "improvement".
"""


# ── Time utilities ─────────────────────────────────────────────────────────────

@skill(description="Return current UTC timestamp", tags=["time"])
def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@skill(description="Measure execution time of a callable", tags=["time", "metrics"])
def measure_time(fn, *args, **kwargs) -> Dict[str, Any]:
    """Call *fn* with *args*/*kwargs* and return result + elapsed seconds."""
    start = time.perf_counter()
    result = fn(*args, **kwargs)
    elapsed = time.perf_counter() - start
    return {"result": result, "elapsed_s": round(elapsed, 4)}


# ── Hashing / fingerprinting ──────────────────────────────────────────────────

@skill(description="SHA-256 fingerprint of a string", tags=["utils"])
def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


# ── Task generation helpers ───────────────────────────────────────────────────

@skill(description="Generate a list of self-improvement tasks given platform context", tags=["self-tasking"])
def generate_self_tasks(context: Dict[str, Any]) -> List[str]:
    """
    Produce candidate self-improvement tasks based on platform *context*.

    *context* should contain keys like 'recent_failures', 'low_score_tasks',
    'unused_skills', 'agent_count'.
    """
    tasks = []
    if context.get("recent_failures"):
        tasks.append("Analyse recent failures and extract root causes")
    if context.get("low_score_tasks"):
        tasks.append("Review and improve prompts for low-scoring tasks")
    if context.get("unused_skills"):
        tasks.append("Create a test harness for unused skills")
    if int(context.get("agent_count", 0)) < 3:
        tasks.append("Spawn a researcher agent to explore new problem domains")
    tasks.append("Run a full self-evaluation cycle and update the experience library")
    tasks.append("Generate a new skill to address a capability gap")
    return tasks
