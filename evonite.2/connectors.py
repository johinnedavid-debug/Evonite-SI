"""
tools/connectors.py — External tool connectors agents can use to do real work.

Each connector wraps an external service (filesystem, web search, GitHub, shell,
REST API, etc.) behind a uniform async interface.  Agents acquire connectors via
the ToolBelt and call them by name.

All connectors respect the platform's safety model:
  • Read-only connectors are always allowed.
  • Write / destructive connectors require explicit enablement in config.
  • Network connectors honour TOOL_ALLOW_NETWORK.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

import config
from utils.logging import get_logger

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Result container
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ToolResult:
    """Standard result returned by every connector call."""
    tool: str
    action: str
    success: bool
    data: Any = None
    error: Optional[str] = None
    duration_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def as_str(self) -> str:
        if not self.success:
            return f"[{self.tool}:{self.action}] ERROR — {self.error}"
        if isinstance(self.data, str):
            return self.data[:4000]
        return json.dumps(self.data, default=str)[:4000]


# ═══════════════════════════════════════════════════════════════════════════════
# Abstract base
# ═══════════════════════════════════════════════════════════════════════════════

class BaseConnector(ABC):
    """
    All external tool connectors derive from this class.

    Subclasses must implement ``call(action, **kwargs) -> ToolResult``.
    """
    name: str = "base"
    description: str = ""
    requires_network: bool = False
    is_destructive: bool = False   # True → needs explicit enablement

    @abstractmethod
    async def call(self, action: str, **kwargs: Any) -> ToolResult:
        """Dispatch *action* with *kwargs* and return a ToolResult."""

    def _ok(self, action: str, data: Any, **meta: Any) -> ToolResult:
        return ToolResult(tool=self.name, action=action, success=True, data=data, metadata=meta)

    def _err(self, action: str, error: str) -> ToolResult:
        logger.warning("[%s:%s] error: %s", self.name, action, error)
        return ToolResult(tool=self.name, action=action, success=False, error=error)


# ═══════════════════════════════════════════════════════════════════════════════
# Connector implementations
# ═══════════════════════════════════════════════════════════════════════════════

class FileSystemConnector(BaseConnector):
    """
    Read / write files within a sandboxed workspace directory.

    Actions:
        read   path             → file contents as str
        write  path, content    → writes file, returns path
        list   path             → list of filenames
        exists path             → bool
        delete path             → deletes file (destructive)
    """
    name = "filesystem"
    description = "Read and write files within the workspace directory"
    is_destructive = True   # write/delete are destructive

    def __init__(self, workspace: Optional[Path] = None) -> None:
        self._root = workspace or (config.BASE_DIR / "workspace")
        self._root.mkdir(parents=True, exist_ok=True)

    def _safe_path(self, path: str) -> Path:
        """Resolve *path* relative to workspace and reject path traversal."""
        resolved = (self._root / path).resolve()
        if not str(resolved).startswith(str(self._root.resolve())):
            raise PermissionError(f"Path traversal blocked: {path}")
        return resolved

    async def call(self, action: str, **kwargs: Any) -> ToolResult:
        path_str = kwargs.get("path", "")
        try:
            p = self._safe_path(path_str)
        except PermissionError as exc:
            return self._err(action, str(exc))

        if action == "read":
            if not p.exists():
                return self._err(action, f"File not found: {path_str}")
            return self._ok(action, p.read_text(encoding="utf-8"))

        if action == "write":
            content = kwargs.get("content", "")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
            return self._ok(action, str(p), bytes_written=len(content.encode()))

        if action == "list":
            target = p if p.is_dir() else p.parent
            files = [f.name for f in target.iterdir()] if target.exists() else []
            return self._ok(action, files)

        if action == "exists":
            return self._ok(action, p.exists())

        if action == "delete":
            if p.exists():
                p.unlink()
            return self._ok(action, f"Deleted: {path_str}")

        return self._err(action, f"Unknown action: {action}")


class WebSearchConnector(BaseConnector):
    """
    Lightweight web search via DuckDuckGo instant-answer JSON API (no key needed).

    Actions:
        search  query, max_results=5  → list of {title, url, snippet}
        fetch   url                   → raw page text (truncated)
    """
    name = "web_search"
    description = "Search the web and fetch page content"
    requires_network = True

    async def call(self, action: str, **kwargs: Any) -> ToolResult:
        if not getattr(config, "TOOL_ALLOW_NETWORK", False):
            return self._err(action, "Network tools are disabled. Set TOOL_ALLOW_NETWORK=true.")

        loop = asyncio.get_event_loop()

        if action == "search":
            query = kwargs.get("query", "")
            max_results = int(kwargs.get("max_results", 5))
            try:
                results = await loop.run_in_executor(None, self._ddg_search, query, max_results)
                return self._ok(action, results, query=query)
            except Exception as exc:
                return self._err(action, str(exc))

        if action == "fetch":
            url = kwargs.get("url", "")
            try:
                text = await loop.run_in_executor(None, self._fetch_url, url)
                return self._ok(action, text[:6000], url=url)
            except Exception as exc:
                return self._err(action, str(exc))

        return self._err(action, f"Unknown action: {action}")

    @staticmethod
    def _ddg_search(query: str, max_results: int) -> List[Dict[str, str]]:
        encoded = query.replace(" ", "+")
        url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_html=1&skip_disambig=1"
        req = Request(url, headers={"User-Agent": "AI-Platform/1.0"})
        try:
            with urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
        except Exception as exc:
            raise RuntimeError(f"DDG request failed: {exc}") from exc

        results = []
        # RelatedTopics contains the search hits
        for topic in data.get("RelatedTopics", [])[:max_results]:
            if isinstance(topic, dict) and "Text" in topic:
                results.append({
                    "title": topic.get("Text", "")[:80],
                    "url": topic.get("FirstURL", ""),
                    "snippet": topic.get("Text", "")[:200],
                })
        return results

    @staticmethod
    def _fetch_url(url: str) -> str:
        req = Request(url, headers={"User-Agent": "AI-Platform/1.0"})
        try:
            with urlopen(req, timeout=15) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
        except (URLError, HTTPError) as exc:
            raise RuntimeError(f"Fetch failed: {exc}") from exc
        # Very naive HTML → text strip
        text = re.sub(r"<[^>]+>", " ", raw)
        text = re.sub(r"\s+", " ", text).strip()
        return text


class GitConnector(BaseConnector):
    """
    Run git commands in the platform's own repo.

    Actions:
        status                        → git status output
        diff   path=""                → git diff
        log    n=5                    → last n commit summaries
        commit message, files=[]      → stage files and commit (destructive)
        add    files=[]               → git add
    """
    name = "git"
    description = "Interact with the platform git repository"
    is_destructive = True

    def __init__(self, repo_path: Optional[Path] = None) -> None:
        self._repo = repo_path or config.BASE_DIR

    async def call(self, action: str, **kwargs: Any) -> ToolResult:
        if not getattr(config, "GIT_AUTO_COMMIT", False) and action in ("commit", "add"):
            return self._err(action, "Git write operations disabled. Set GIT_AUTO_COMMIT=true.")

        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(None, self._run_git, action, kwargs)
            return result
        except Exception as exc:
            return self._err(action, str(exc))

    def _run_git(self, action: str, kwargs: Dict[str, Any]) -> ToolResult:
        def git(*args: str) -> str:
            proc = subprocess.run(
                ["git", *args], cwd=self._repo,
                capture_output=True, text=True, timeout=30,
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr.strip())
            return proc.stdout.strip()

        if action == "status":
            return self._ok(action, git("status", "--short"))
        if action == "diff":
            path = kwargs.get("path", "")
            args = ["diff"] + ([path] if path else [])
            return self._ok(action, git(*args))
        if action == "log":
            n = int(kwargs.get("n", 5))
            return self._ok(action, git("log", f"--oneline", f"-{n}"))
        if action == "add":
            files = kwargs.get("files", ["."])
            for f in files:
                git("add", f)
            return self._ok(action, f"Staged: {files}")
        if action == "commit":
            msg = kwargs.get("message", "Auto-commit by AI Platform")
            full_msg = f"{config.GIT_COMMIT_PREFIX} {msg}"
            files = kwargs.get("files", [])
            if files:
                for f in files:
                    git("add", f)
            git("commit", "-m", full_msg)
            return self._ok(action, f"Committed: {full_msg}")
        return self._err(action, f"Unknown action: {action}")


class ShellConnector(BaseConnector):
    """
    Run whitelisted shell commands in a controlled subprocess.

    Only commands in SHELL_ALLOWED_COMMANDS are permitted.

    Actions:
        run  command, args=[], cwd=None, timeout=30
    """
    name = "shell"
    description = "Run whitelisted shell commands"
    is_destructive = True

    ALLOWED = {
        "python3", "python", "pytest", "black", "isort",
        "pip", "echo", "cat", "ls", "head", "tail", "wc",
        "grep", "find", "date", "uname",
    }

    async def call(self, action: str, **kwargs: Any) -> ToolResult:
        if not getattr(config, "TOOL_ALLOW_SHELL", False):
            return self._err(action, "Shell tool disabled. Set TOOL_ALLOW_SHELL=true.")

        if action != "run":
            return self._err(action, f"Unknown action: {action}")

        command = kwargs.get("command", "")
        if command not in self.ALLOWED:
            return self._err(action, f"Command '{command}' not in allowlist.")

        args = kwargs.get("args", [])
        cwd = kwargs.get("cwd", str(config.BASE_DIR))
        timeout = int(kwargs.get("timeout", 30))

        loop = asyncio.get_event_loop()
        try:
            out = await loop.run_in_executor(
                None,
                lambda: subprocess.run(
                    [command, *[str(a) for a in args]],
                    cwd=cwd, capture_output=True, text=True, timeout=timeout,
                ),
            )
            data = out.stdout or out.stderr
            return self._ok(action, data, returncode=out.returncode)
        except subprocess.TimeoutExpired:
            return self._err(action, f"Command timed out after {timeout}s")
        except Exception as exc:
            return self._err(action, str(exc))


class MemoryConnector(BaseConnector):
    """
    Let agents query their own vector-store memory directly as a tool.

    Actions:
        search  query, n=5, collection="experiences"
        store   text, metadata={}, collection="agent_memory"
    """
    name = "memory"
    description = "Search and store in the vector memory system"

    def __init__(self, vector_store: Any) -> None:
        self._vs = vector_store

    async def call(self, action: str, **kwargs: Any) -> ToolResult:
        collection = kwargs.get("collection", config.CHROMA_COLLECTION_EXPERIENCES)

        if action == "search":
            query = kwargs.get("query", "")
            n = int(kwargs.get("n", 5))
            results = self._vs.query(collection, query, n_results=n)
            return self._ok(action, results, collection=collection)

        if action == "store":
            text = kwargs.get("text", "")
            metadata = kwargs.get("metadata", {})
            doc_id = self._vs.upsert(collection, text, metadata)
            return self._ok(action, doc_id, collection=collection)

        return self._err(action, f"Unknown action: {action}")


class RESTConnector(BaseConnector):
    """
    Generic HTTP REST connector for calling external APIs.

    Actions:
        get    url, headers={}, params={}
        post   url, headers={}, body={}
    """
    name = "rest_api"
    description = "Call external REST APIs"
    requires_network = True

    async def call(self, action: str, **kwargs: Any) -> ToolResult:
        if not getattr(config, "TOOL_ALLOW_NETWORK", False):
            return self._err(action, "Network tools disabled. Set TOOL_ALLOW_NETWORK=true.")

        url = kwargs.get("url", "")
        headers = kwargs.get("headers", {})
        loop = asyncio.get_event_loop()

        if action == "get":
            params = kwargs.get("params", {})
            if params:
                qs = "&".join(f"{k}={v}" for k, v in params.items())
                url = f"{url}?{qs}"
            try:
                data = await loop.run_in_executor(None, self._get, url, headers)
                return self._ok(action, data, url=url)
            except Exception as exc:
                return self._err(action, str(exc))

        if action == "post":
            body = kwargs.get("body", {})
            try:
                data = await loop.run_in_executor(None, self._post, url, headers, body)
                return self._ok(action, data, url=url)
            except Exception as exc:
                return self._err(action, str(exc))

        return self._err(action, f"Unknown action: {action}")

    @staticmethod
    def _get(url: str, headers: Dict[str, str]) -> str:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")[:8000]

    @staticmethod
    def _post(url: str, headers: Dict[str, str], body: Dict) -> str:
        data = json.dumps(body).encode()
        h = {"Content-Type": "application/json", **headers}
        req = Request(url, data=data, headers=h, method="POST")
        with urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")[:8000]


# ═══════════════════════════════════════════════════════════════════════════════
# Tool Belt — per-agent connector collection
# ═══════════════════════════════════════════════════════════════════════════════

class ToolBelt:
    """
    Collection of connectors available to a single agent.

    Agents call tools via::

        result = await belt.use("filesystem", "read", path="notes.txt")
        result = await belt.use("web_search", "search", query="LangGraph docs")
    """

    def __init__(self) -> None:
        self._connectors: Dict[str, BaseConnector] = {}

    def attach(self, connector: BaseConnector) -> "ToolBelt":
        """Add a connector; returns self for chaining."""
        self._connectors[connector.name] = connector
        logger.debug("ToolBelt: attached connector '%s'", connector.name)
        return self

    def detach(self, name: str) -> None:
        self._connectors.pop(name, None)

    def list_tools(self) -> List[Dict[str, str]]:
        return [
            {"name": c.name, "description": c.description,
             "network": c.requires_network, "destructive": c.is_destructive}
            for c in self._connectors.values()
        ]

    async def use(self, tool_name: str, action: str, **kwargs: Any) -> ToolResult:
        """
        Invoke a connector by name.

        Returns an error ToolResult if the connector doesn't exist.
        """
        connector = self._connectors.get(tool_name)
        if connector is None:
            return ToolResult(
                tool=tool_name, action=action, success=False,
                error=f"Connector '{tool_name}' not attached to this agent.",
            )
        start = time.perf_counter()
        result = await connector.call(action, **kwargs)
        result.duration_ms = (time.perf_counter() - start) * 1000
        logger.debug(
            "Tool call: %s:%s success=%s (%.1fms)",
            tool_name, action, result.success, result.duration_ms,
        )
        return result

    def summary(self) -> str:
        if not self._connectors:
            return "No tools attached."
        lines = [f"  • {c.name}: {c.description}" for c in self._connectors.values()]
        return "Available tools:\n" + "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
# Default tool-belt factory
# ═══════════════════════════════════════════════════════════════════════════════

def build_default_toolbelt(vector_store: Any) -> ToolBelt:
    """Create a ToolBelt pre-loaded with safe, always-on connectors."""
    belt = ToolBelt()
    belt.attach(FileSystemConnector())
    belt.attach(MemoryConnector(vector_store))
    # Network + destructive connectors only if explicitly enabled
    if getattr(config, "TOOL_ALLOW_NETWORK", False):
        belt.attach(WebSearchConnector())
        belt.attach(RESTConnector())
    if getattr(config, "TOOL_ALLOW_SHELL", False):
        belt.attach(ShellConnector())
    belt.attach(GitConnector())
    return belt
