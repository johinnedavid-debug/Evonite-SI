"""
skills/registry.py — Runtime skill registration, discovery, and injection.

Skills are plain Python callables decorated with @skill or registered manually.
The registry stores them by name and can inject a subset into any agent's
tool-belt at runtime.
"""

import importlib
import importlib.util
import inspect
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import config
from utils.logging import get_logger

logger = get_logger(__name__)


@dataclass
class SkillSpec:
    """Metadata + callable for a registered skill."""
    name: str
    fn: Callable
    description: str = ""
    tags: List[str] = field(default_factory=list)
    version: str = "0.1.0"
    author: str = "system"
    registered_at: float = field(default_factory=time.time)
    call_count: int = 0
    error_count: int = 0

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        self.call_count += 1
        try:
            return self.fn(*args, **kwargs)
        except Exception:
            self.error_count += 1
            raise

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "tags": self.tags,
            "version": self.version,
            "author": self.author,
            "call_count": self.call_count,
            "error_count": self.error_count,
        }


class SkillRegistry:
    """
    Central registry for all platform skills.

    Usage::

        registry = SkillRegistry()
        registry.load_module("skills.base_skills")

        @registry.register(description="Adds two numbers", tags=["math"])
        def add(a: int, b: int) -> int:
            return a + b

        skill = registry.get("add")
        skill(1, 2)   # → 3
    """

    def __init__(self) -> None:
        self._skills: Dict[str, SkillSpec] = {}

    # ── Registration ─────────────────────────────────────────────────────────

    def register(
        self,
        fn: Optional[Callable] = None,
        *,
        name: Optional[str] = None,
        description: str = "",
        tags: Optional[List[str]] = None,
        version: str = "0.1.0",
        author: str = "system",
    ) -> Any:
        """
        Register a skill callable.

        Can be used as a decorator (with or without arguments)::

            @registry.register(description="My skill", tags=["example"])
            def my_skill(): ...

            # or just:
            @registry.register
            def my_skill(): ...
        """
        def _do_register(func: Callable) -> Callable:
            skill_name = name or func.__name__
            desc = description or (inspect.getdoc(func) or "")
            spec = SkillSpec(
                name=skill_name,
                fn=func,
                description=desc,
                tags=tags or [],
                version=version,
                author=author,
            )
            self._skills[skill_name] = spec
            logger.debug("Skill registered: %s v%s", skill_name, version)
            return func

        if fn is not None:
            # Called as @registry.register (no parentheses)
            return _do_register(fn)
        # Called as @registry.register(...) — return the actual decorator
        return _do_register

    def unregister(self, name: str) -> bool:
        if name in self._skills:
            del self._skills[name]
            logger.info("Skill unregistered: %s", name)
            return True
        return False

    # ── Discovery ─────────────────────────────────────────────────────────────

    def get(self, name: str) -> Optional[SkillSpec]:
        return self._skills.get(name)

    def list_skills(self, tag: Optional[str] = None) -> List[SkillSpec]:
        skills = list(self._skills.values())
        if tag:
            skills = [s for s in skills if tag in s.tags]
        return skills

    def names(self) -> List[str]:
        return list(self._skills.keys())

    def as_tool_dicts(self, names: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Return skill specs as LangChain-style tool dicts for injection into agents.

        Args:
            names: If given, only return these skill names.
        """
        target = names or list(self._skills.keys())
        tools = []
        for n in target:
            spec = self._skills.get(n)
            if spec:
                tools.append({
                    "name": spec.name,
                    "description": spec.description,
                    "callable": spec.fn,
                    "tags": spec.tags,
                })
        return tools

    # ── Dynamic loading ───────────────────────────────────────────────────────

    def load_module(self, module_path: str) -> int:
        """
        Import a Python module by dotted path and register any callables
        that have a ``_skill_meta`` attribute (set by the @skill decorator).

        Args:
            module_path: e.g. "skills.base_skills"

        Returns:
            Number of skills loaded.
        """
        try:
            mod = importlib.import_module(module_path)
        except ImportError as exc:
            logger.error("Could not import skill module '%s': %s", module_path, exc)
            return 0

        count = 0
        for attr_name in dir(mod):
            obj = getattr(mod, attr_name)
            if callable(obj) and hasattr(obj, "_skill_meta"):
                meta: dict = obj._skill_meta  # type: ignore[attr-defined]
                self.register(
                    fn=obj,
                    name=meta.get("name", attr_name),
                    description=meta.get("description", ""),
                    tags=meta.get("tags", []),
                    version=meta.get("version", "0.1.0"),
                    author=meta.get("author", "module"),
                )
                count += 1
        logger.info("Loaded %d skill(s) from '%s'", count, module_path)
        return count

    def load_file(self, path: Path) -> int:
        """
        Dynamically load a .py file and register its decorated skills.

        Useful for injecting newly written skill files at runtime.

        Args:
            path: Absolute path to a .py file.

        Returns:
            Number of skills loaded.
        """
        module_name = f"_dynamic_skill_{path.stem}_{int(time.time())}"
        spec = importlib.util.spec_from_file_location(module_name, path)
        if spec is None or spec.loader is None:
            logger.error("Cannot load skill file: %s", path)
            return 0
        mod = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = mod
        try:
            spec.loader.exec_module(mod)  # type: ignore[union-attr]
        except Exception as exc:
            logger.error("Error executing skill file %s: %s", path, exc)
            return 0

        count = 0
        for attr_name in dir(mod):
            obj = getattr(mod, attr_name)
            if callable(obj) and hasattr(obj, "_skill_meta"):
                meta = obj._skill_meta  # type: ignore[attr-defined]
                self.register(
                    fn=obj,
                    name=meta.get("name", attr_name),
                    description=meta.get("description", ""),
                    tags=meta.get("tags", []),
                    version=meta.get("version", "0.1.0"),
                    author=meta.get("author", "dynamic"),
                )
                count += 1
        logger.info("Loaded %d skill(s) from file '%s'", count, path)
        return count

    def stats(self) -> Dict[str, Any]:
        total_calls = sum(s.call_count for s in self._skills.values())
        total_errors = sum(s.error_count for s in self._skills.values())
        return {
            "total_skills": len(self._skills),
            "total_calls": total_calls,
            "total_errors": total_errors,
            "skills": [s.as_dict() for s in self._skills.values()],
        }


def skill(
    description: str = "",
    tags: Optional[List[str]] = None,
    version: str = "0.1.0",
    author: str = "system",
) -> Callable:
    """
    Decorator that marks a function as a platform skill.

    The function can then be auto-discovered by SkillRegistry.load_module().

    Example::

        @skill(description="Reverse a string", tags=["text"])
        def reverse_text(text: str) -> str:
            return text[::-1]
    """
    def decorator(fn: Callable) -> Callable:
        fn._skill_meta = {  # type: ignore[attr-defined]
            "name": fn.__name__,
            "description": description or (inspect.getdoc(fn) or fn.__name__),
            "tags": tags or [],
            "version": version,
            "author": author,
        }
        return fn
    return decorator


# ── Module-level singleton ────────────────────────────────────────────────────
_registry: Optional[SkillRegistry] = None


def get_registry() -> SkillRegistry:
    """Return the global SkillRegistry singleton."""
    global _registry
    if _registry is None:
        _registry = SkillRegistry()
    return _registry
