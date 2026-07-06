"""
utils/logging.py — Structured, coloured logging for the AI Platform.
"""

import logging
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import config

# ── ANSI colour codes ────────────────────────────────────────────────────────
RESET = "\033[0m"
BOLD  = "\033[1m"
COLOURS = {
    "DEBUG":    "\033[36m",   # cyan
    "INFO":     "\033[32m",   # green
    "WARNING":  "\033[33m",   # yellow
    "ERROR":    "\033[31m",   # red
    "CRITICAL": "\033[35m",   # magenta
}


class ColouredFormatter(logging.Formatter):
    """Console formatter with ANSI colours."""

    def format(self, record: logging.LogRecord) -> str:
        colour = COLOURS.get(record.levelname, "")
        record.levelname = f"{colour}{BOLD}{record.levelname:<8}{RESET}"
        return super().format(record)


class JSONFileHandler(logging.FileHandler):
    """Writes each log record as a single JSON line (JSONL)."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "msg": record.getMessage(),
                "module": record.module,
                "line": record.lineno,
            }
            if record.exc_info:
                entry["exc"] = self.formatException(record.exc_info)
            if hasattr(record, "extra"):
                entry.update(record.extra)
            self.stream.write(json.dumps(entry) + "\n")
            self.stream.flush()
        except Exception:
            self.handleError(record)


def get_logger(name: str, extra_file: Optional[Path] = None) -> logging.Logger:
    """
    Return a configured logger.

    Args:
        name: Logger name (usually __name__ of the calling module).
        extra_file: Optional additional log-file path.

    Returns:
        Configured Logger instance.
    """
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # already configured

    logger.setLevel(getattr(logging, config.LOG_LEVEL, logging.INFO))

    # ── Console handler ──────────────────────────────────────────────────────
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(ColouredFormatter(config.LOG_FORMAT))
    logger.addHandler(ch)

    # ── Main JSONL file ──────────────────────────────────────────────────────
    main_log = config.LOGS_DIR / "platform.jsonl"
    fh = JSONFileHandler(main_log, encoding="utf-8")
    fh.setFormatter(logging.Formatter())  # raw; emit() handles formatting
    logger.addHandler(fh)

    # ── Optional per-component file ──────────────────────────────────────────
    if extra_file:
        efh = JSONFileHandler(extra_file, encoding="utf-8")
        efh.setFormatter(logging.Formatter())
        logger.addHandler(efh)

    logger.propagate = False
    return logger


def log_event(
    logger: logging.Logger,
    event: str,
    level: str = "INFO",
    **kwargs: Any,
) -> None:
    """
    Emit a structured log event with arbitrary keyword metadata.

    Args:
        logger: Target logger.
        event:  Short event name / description.
        level:  Logging level string.
        **kwargs: Additional key-value pairs merged into the log record.
    """
    extra = {"event": event, **kwargs}
    record = logging.LogRecord(
        name=logger.name,
        level=getattr(logging, level.upper(), logging.INFO),
        pathname="",
        lineno=0,
        msg=event,
        args=(),
        exc_info=None,
    )
    record.extra = extra  # type: ignore[attr-defined]
    logger.handle(record)
