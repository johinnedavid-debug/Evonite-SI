"""
utils/sandbox.py — Safe, time-limited execution environment for agent-generated code.

Only a whitelisted set of stdlib imports is permitted.  The sandbox runs code
in a separate thread so asyncio is not blocked and a hard timeout can be applied.
"""

import ast
import concurrent.futures
import io
import sys
import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import config
from utils.logging import get_logger

logger = get_logger(__name__)


@dataclass
class ExecutionResult:
    success: bool
    stdout: str = ""
    stderr: str = ""
    return_value: Any = None
    duration_ms: float = 0.0
    error: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "success": self.success,
            "stdout": self.stdout[:4000],        # cap to avoid log bloat
            "stderr": self.stderr[:2000],
            "return_value": str(self.return_value)[:500] if self.return_value is not None else None,
            "duration_ms": round(self.duration_ms, 2),
            "error": self.error,
        }


class ImportGuard(ast.NodeVisitor):
    """AST visitor that raises if a disallowed import is found."""

    def __init__(self, allowed: set) -> None:
        self._allowed = allowed

    def visit_Import(self, node: ast.Import) -> None:  # noqa: N802
        for alias in node.names:
            top = alias.name.split(".")[0]
            if top not in self._allowed:
                raise PermissionError(f"Import '{alias.name}' is not allowed in sandbox.")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:  # noqa: N802
        module = node.module or ""
        top = module.split(".")[0]
        if top not in self._allowed:
            raise PermissionError(f"Import 'from {module} import …' is not allowed in sandbox.")
        self.generic_visit(node)


def _validate_ast(code: str) -> None:
    """
    Parse *code* and reject disallowed imports or dangerous builtins.

    Raises:
        SyntaxError: If code cannot be parsed.
        PermissionError: If a disallowed import or builtin is used.
    """
    tree = ast.parse(code, mode="exec")
    ImportGuard(config.SANDBOX_ALLOWED_IMPORTS).visit(tree)

    # Reject calls to __import__, exec, eval, compile, open, etc.
    blocked_calls = {"__import__", "exec", "eval", "compile", "open", "breakpoint"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in blocked_calls:
                raise PermissionError(f"Call to '{node.func.id}' is not allowed in sandbox.")
            if isinstance(node.func, ast.Attribute) and node.func.attr in blocked_calls:
                raise PermissionError(
                    f"Attribute call '.{node.func.attr}' is not allowed in sandbox."
                )


def _run_code(code: str, context: Dict[str, Any]) -> Any:
    """Execute *code* inside *context* and return the last expression value."""
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    old_stdout, old_stderr = sys.stdout, sys.stderr
    sys.stdout = stdout_capture
    sys.stderr = stderr_capture
    return_value = None
    try:
        local_ns: Dict[str, Any] = {**context}
        exec(compile(code, "<sandbox>", "exec"), {"__builtins__": _safe_builtins()}, local_ns)  # noqa: S102
        # If the last line is an expression, grab it
        try:
            tree = ast.parse(code, mode="exec")
            last = tree.body[-1] if tree.body else None
            if isinstance(last, ast.Expr):
                return_value = eval(  # noqa: S307
                    compile(ast.Expression(last.value), "<sandbox_eval>", "eval"),
                    {"__builtins__": _safe_builtins()},
                    local_ns,
                )
        except Exception:
            pass
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
    return return_value, stdout_capture.getvalue(), stderr_capture.getvalue()


def _safe_builtins() -> dict:
    """Return a restricted __builtins__ dict."""
    import builtins
    allowed_names = {
        "abs", "all", "any", "ascii", "bin", "bool", "bytes", "callable",
        "chr", "dict", "dir", "divmod", "enumerate", "filter", "float",
        "format", "frozenset", "getattr", "hasattr", "hash", "hex", "id",
        "int", "isinstance", "issubclass", "iter", "len", "list", "map",
        "max", "min", "next", "object", "oct", "ord", "pow", "print",
        "range", "repr", "reversed", "round", "set", "setattr", "slice",
        "sorted", "str", "sum", "super", "tuple", "type", "vars", "zip",
        "True", "False", "None", "NotImplemented", "Ellipsis",
        "Exception", "ValueError", "TypeError", "KeyError", "IndexError",
        "AttributeError", "RuntimeError", "StopIteration",
    }
    return {name: getattr(builtins, name) for name in allowed_names if hasattr(builtins, name)}


class Sandbox:
    """
    Thread-pool-backed sandbox for running agent-generated Python snippets.

    Example::

        sb = Sandbox()
        result = await sb.execute("x = 2 + 2\\nprint(x)")
        print(result.stdout)   # "4\\n"
    """

    def __init__(self, timeout: Optional[int] = None) -> None:
        self._timeout = timeout or config.SANDBOX_TIMEOUT_SECONDS
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)

    async def execute(
        self,
        code: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> ExecutionResult:
        """
        Validate and execute *code* in a restricted environment.

        Args:
            code:    Python source code to execute.
            context: Optional dict of names to inject as locals.

        Returns:
            ExecutionResult with stdout, stderr, return value, timing.
        """
        import asyncio

        context = context or {}
        start = time.perf_counter()

        # ── Static validation ────────────────────────────────────────────────
        try:
            _validate_ast(code)
        except (SyntaxError, PermissionError) as exc:
            logger.warning("Sandbox validation failed: %s", exc)
            return ExecutionResult(
                success=False,
                error=f"Validation error: {exc}",
                duration_ms=(time.perf_counter() - start) * 1000,
            )

        # ── Timed execution in thread ─────────────────────────────────────────
        loop = asyncio.get_event_loop()
        try:
            future = loop.run_in_executor(self._executor, _run_code, code, context)
            return_value, stdout, stderr = await asyncio.wait_for(
                future, timeout=self._timeout
            )
            duration_ms = (time.perf_counter() - start) * 1000
            logger.debug("Sandbox executed successfully in %.1fms", duration_ms)
            return ExecutionResult(
                success=True,
                stdout=stdout,
                stderr=stderr,
                return_value=return_value,
                duration_ms=duration_ms,
            )
        except asyncio.TimeoutError:
            logger.error("Sandbox timeout after %ds", self._timeout)
            return ExecutionResult(
                success=False,
                error=f"Execution timed out after {self._timeout}s",
                duration_ms=(time.perf_counter() - start) * 1000,
            )
        except Exception as exc:  # noqa: BLE001
            tb = traceback.format_exc()
            logger.error("Sandbox runtime error: %s", exc)
            return ExecutionResult(
                success=False,
                stdout="",
                stderr=tb,
                error=str(exc),
                duration_ms=(time.perf_counter() - start) * 1000,
            )

    def close(self) -> None:
        self._executor.shutdown(wait=False)
