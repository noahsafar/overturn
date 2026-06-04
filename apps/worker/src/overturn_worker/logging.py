"""
Structured logging with correlation IDs and context capture.

This module provides:
- Structured JSON logging for production
- Correlation IDs for request tracing
- Context capture (user, practice, request)
- Performance tracking
- Sensitive data scrubbing
"""

import os
import json
import time
import re
import logging
import uuid
from typing import Any, Dict, Optional, Union
from dataclasses import dataclass, field, asdict
from datetime import datetime
from contextlib import contextmanager

# PHI scrubbing patterns
PHI_PATTERNS = [
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),  # SSN
    re.compile(r"\b(19|20)\d{2}-\d{2}-\d{2}\b"),  # ISO dates
    re.compile(r"\bMEM[A-Z0-9]{6,}\b", re.IGNORECASE),  # Member IDs
    re.compile(r"\bCLM[A-Z0-9]{6,}\b", re.IGNORECASE),  # Claim IDs
]


def _scrub_phi(value: Any) -> Any:
    """Scrub PHI from values before logging."""
    if isinstance(value, str):
        for pattern in PHI_PATTERNS:
            value = pattern.sub("[REDACTED]", value)
        return value
    elif isinstance(value, dict):
        return {k: _scrub_phi(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [_scrub_phi(item) for item in value]
    return value


@dataclass
class LogContext:
    """Context for log entries."""
    correlation_id: Optional[str] = None
    user_id: Optional[str] = None
    practice_id: Optional[str] = None
    request_id: Optional[str] = None
    denial_id: Optional[str] = None
    appeal_id: Optional[str] = None
    operation: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LogEntry:
    """A structured log entry."""
    level: str
    message: str
    timestamp: str
    context: Optional[LogContext] = None
    error: Optional[Dict[str, Any]] = None
    performance: Optional[Dict[str, Any]] = None
    logger: str = "overturn-worker"


class JSONFormatter(logging.Formatter):
    """Custom JSON formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        entry = LogEntry(
            level=record.levelname.lower(),
            message=record.getMessage(),
            timestamp=datetime.utcnow().isoformat(),
            logger=record.name,
        )

        # Add context from record
        if hasattr(record, "context"):
            entry.context = record.context

        # Add error info if present
        if record.exc_info:
            entry.error = {
                "name": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
                "stack": self.formatException(record.exc_info),
            }

        # Scrub PHI
        entry_dict = asdict(entry)
        entry_dict = _scrub_phi(entry_dict)

        return json.dumps(entry_dict)


class OverturnLogger:
    """Custom logger with correlation IDs and context."""

    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self._context = LogContext()

    def with_context(
        self,
        correlation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        practice_id: Optional[str] = None,
        **kwargs,
    ) -> "OverturnLogger":
        """Create a new logger with additional context."""
        new_logger = OverturnLogger(self.logger.name)
        new_logger._context = LogContext(
            correlation_id=correlation_id or self._context.correlation_id,
            user_id=user_id or self._context.user_id,
            practice_id=practice_id or self._context.practice_id,
            **{**self._context.extra, **kwargs},
        )
        return new_logger

    def _log(
        self,
        level: int,
        message: str,
        context: Optional[LogContext] = None,
        exc_info: Optional[bool] = False,
    ):
        """Internal logging method."""
        env = os.environ.get("NODE_ENV", os.environ.get("ENVIRONMENT", "development"))

        # Skip debug logs in production unless enabled
        if env == "production" and level == logging.DEBUG and not os.environ.get("DEBUG_LOGS"):
            return

        merged_context = self._context
        if context:
            # Merge contexts
            for field in ["correlation_id", "user_id", "practice_id", "request_id"]:
                if getattr(context, field):
                    setattr(merged_context, field, getattr(context, field))
            merged_context.extra.update(context.extra)

        record = self.logger.makeRecord(
            self.logger.name,
            level,
            "",
            (0,),  # No pathname/filename for programmatic logs
            message,
            (),
            exc_info,
        )
        record.context = merged_context

        self.logger.handle(record)

    def debug(self, message: str, **kwargs):
        self._log(logging.DEBUG, message, LogContext(extra=kwargs))

    def info(self, message: str, **kwargs):
        self._log(logging.INFO, message, LogContext(extra=kwargs))

    def warning(self, message: str, **kwargs):
        self._log(logging.WARNING, message, LogContext(extra=kwargs))

    def warn(self, message: str, **kwargs):
        self.warning(message, **kwargs)

    def error(self, message: str, exc_info: bool = False, **kwargs):
        self._log(logging.ERROR, message, LogContext(extra=kwargs), exc_info=exc_info)

    def critical(self, message: str, exc_info: bool = False, **kwargs):
        self._log(logging.CRITICAL, message, LogContext(extra=kwargs), exc_info=exc_info)


def generate_correlation_id() -> str:
    """Generate a new correlation ID."""
    return f"corr_{int(time.time())}_{uuid.uuid4().hex[:12]}"


def get_logger(name: str) -> OverturnLogger:
    """Get a logger with the given name."""
    return OverturnLogger(name)


@contextmanager
def track_performance(logger: OverturnLogger, operation: str):
    """Context manager for tracking operation performance."""
    start = time.time()
    try:
        yield
    finally:
        duration = (time.time() - start) * 1000  # Convert to ms
        logger.info(
            f"Operation: {operation}",
            performance={"operation": operation, "duration_ms": duration},
        )


class PerformanceTracker:
    """Helper for tracking operation performance."""

    def __init__(self, operation: str, logger: OverturnLogger):
        self.operation = operation
        self.logger = logger
        self.start_time = time.time()

    def end(self, **extra_context):
        """End tracking and log the duration."""
        duration = (time.time() - self.start_time) * 1000
        self.logger.info(
            f"Operation: {self.operation}",
            performance={"operation": self.operation, "duration_ms": duration},
            **extra_context,
        )
        return duration

    def track(self, sub_operation: str, callback):
        """Track a sub-operation."""
        start = time.time()
        try:
            return callback()
        finally:
            duration = (time.time() - start) * 1000
            self.logger.debug(
                f"{self.operation}/{sub_operation}",
                performance={"operation": sub_operation, "duration_ms": duration},
            )


def configure_logging():
    """Configure logging for the worker."""
    env = os.environ.get("NODE_ENV", os.environ.get("ENVIRONMENT", "development"))
    log_level = os.environ.get("LOG_LEVEL", "DEBUG" if env == "development" else "INFO").upper()

    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Clear existing handlers
    root_logger.handlers.clear()

    # Create console handler with JSON formatter in production
    handler = logging.StreamHandler()
    handler.setLevel(log_level)

    if env == "production":
        handler.setFormatter(JSONFormatter())
    else:
        # Pretty print in development
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)

    root_logger.addHandler(handler)

    # Configure specific loggers
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("temporalio").setLevel(logging.INFO)
    logging.getLogger("anthropic").setLevel(logging.INFO)


# Configure logging on import
configure_logging()


def log_api_request(
    logger: OverturnLogger,
    method: str,
    path: str,
    status_code: int,
    duration: float,
    **context,
):
    """Log an API request."""
    level = logging.ERROR if status_code >= 500 else logging.WARNING if status_code >= 400 else logging.INFO
    logger._log(
        level,
        f"{method} {path} - {status_code}",
        LogContext(extra={"api": {"method": method, "path": path, "status_code": status_code, "duration_ms": duration}, **context}),
    )


def log_database_query(
    logger: OverturnLogger,
    operation: str,
    table: str,
    duration: float,
    **context,
):
    """Log a database query."""
    logger.debug(
        f"DB Query: {operation} on {table}",
        database={"operation": operation, "table": table, "duration_ms": duration},
        **context,
    )


def log_llm_call(
    logger: OverturnLogger,
    model: str,
    operation: str,
    prompt_tokens: int,
    completion_tokens: int,
    duration: float,
    **context,
):
    """Log an LLM call."""
    logger.info(
        f"LLM Call: {model} - {operation}",
        llm={
            "model": model,
            "operation": operation,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
            "duration_ms": duration,
        },
        **context,
    )
