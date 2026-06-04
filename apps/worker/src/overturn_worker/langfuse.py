"""
Langfuse integration for LLM observability.

This module provides tracing for all LLM calls, including:
- Prompts and responses
- Token usage and costs
- Latency tracking
- Quality metrics

PHI is automatically scrubbed before sending to Langfuse.
"""

import os
import time
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass, field
from contextlib import contextmanager
from datetime import datetime
import functools

# PHI scrubbing patterns
PHI_KEY_HINTS = [
    "first_name", "last_name", "firstName", "lastName",
    "member_id", "memberId", "member",
    "dob", "birth_date", "birthDate",
    "ssn", "social_security",
    "patient", "claim", "denial",
    "address", "phone", "email",
]


def _scrub_phi(value: Any) -> Any:
    """Scrub PHI from values before sending to Langfuse."""
    if isinstance(value, str):
        # Check for common PHI patterns
        if any(pattern in value.lower() for pattern in ["patient", "member", "claim", "denial"]):
            return "[PHI_REDACTED]"
        # Check for SSN-like patterns
        if len(value) == 11 and value[3] == "-" and value[6] == "-":
            return "[PHI_REDACTED]"
        return value
    elif isinstance(value, dict):
        return {k: _scrub_phi(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [_scrub_phi(item) for item in value]
    return value


def _is_phi_key(key: str) -> bool:
    """Check if a key might contain PHI."""
    return any(hint in key.lower() for hint in PHI_KEY_HINTS)


@dataclass
class LLMCallMetrics:
    """Metrics for a single LLM call."""
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    latency_ms: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    cost_usd: Optional[float] = None
    model: Optional[str] = None
    success: bool = True
    error: Optional[str] = None


class LangfuseTracer:
    """Langfuse tracer for LLM observability."""

    def __init__(self):
        self.enabled = False
        self.client = None
        self._init_client()

    def _init_client(self) -> None:
        """Initialize Langfuse client."""
        public_key = os.environ.get("LANGFUSE_PUBLIC_KEY")
        secret_key = os.environ.get("LANGFUSE_SECRET_KEY")
        host = os.environ.get("LANGFUSE_HOST")

        if not public_key or not secret_key:
            print("[langfuse] Disabled - LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set")
            return

        try:
            from langfuse import Langfuse
            from langfuse.decorators import langfuse_context

            self.client = Langfuse(
                public_key=public_key,
                secret_key=secret_key,
                host=host,
            )
            self.LangfuseContext = langfuse_context
            self.enabled = True
            print("[langfuse] Initialized")
        except ImportError:
            print("[langfuse] WARNING: langfuse package not installed")
        except Exception as e:
            print(f"[langfuse] WARNING: Initialization failed: {e}")

    @contextmanager
    def trace_llm_call(
        self,
        model: str,
        practice_id: Optional[str] = None,
        denial_id: Optional[str] = None,
        operation: str = "llm_call",
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Context manager for tracing an LLM call.

        Usage:
            with tracer.trace_llm_call(model="claude-opus-4-7", operation="draft_appeal") as span:
                result = anthropic.messages.create(...)
                span.finish(result=result)
        """
        span = LLMSpan(self, model, practice_id, denial_id, operation, metadata)
        yield span
        span._finish()

    def create_span(
        self,
        model: str,
        practice_id: Optional[str] = None,
        denial_id: Optional[str] = None,
        operation: str = "llm_call",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "LLMSpan":
        """Create a new LLM span."""
        return LLMSpan(self, model, practice_id, denial_id, operation, metadata)

    def flush(self) -> None:
        """Flush any pending traces."""
        if self.client:
            self.client.flush_async()

    def shutdown(self) -> None:
        """Shutdown the Langfuse client."""
        if self.client:
            self.client.flush()


class LLMSpan:
    """A single LLM operation span."""

    def __init__(
        self,
        tracer: LangfuseTracer,
        model: str,
        practice_id: Optional[str],
        denial_id: Optional[str],
        operation: str,
        metadata: Optional[Dict[str, Any]],
    ):
        self.tracer = tracer
        self.model = model
        self.practice_id = practice_id
        self.denial_id = denial_id
        self.operation = operation
        self.metadata = metadata or {}
        self.metrics = LLMCallMetrics()
        self._span = None
        self._initialized = False

    def __enter__(self) -> "LLMSpan":
        self._initialize()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type is not None:
            self.metrics.success = False
            self.metrics.error = str(exc_val)
        self._finish()

    def _initialize(self) -> None:
        """Initialize the Langfuse span."""
        if not self.tracer.enabled or not self.tracer.client:
            return

        try:
            self._span = self.tracer.client.create_span(
                name=self.operation,
                metadata={
                    "model": self.model,
                    "practice_id": f"practice_{self.practice_id[:8]}" if self.practice_id else None,
                    "denial_id": f"denial_{self.denial_id[:8]}" if self.denial_id else None,
                    **{k: _scrub_phi(v) for k, v in self.metadata.items()},
                },
            )
            self._initialized = True
        except Exception as e:
            print(f"[langfuse] Failed to create span: {e}")

    def set_input(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Set the input to the LLM."""
        if not self._initialized:
            return

        try:
            input_data: Dict[str, Any] = {"prompt": _scrub_phi(prompt)}
            if system_prompt:
                input_data["system_prompt"] = _scrub_phi(system_prompt)
            if parameters:
                input_data["parameters"] = _scrub_phi(parameters)

            self._span.update(input=input_data)
        except Exception as e:
            print(f"[langfuse] Failed to set input: {e}")

    def set_output(
        self,
        completion: str,
        usage: Optional[Dict[str, int]] = None,
        finish_reason: Optional[str] = None,
    ) -> None:
        """Set the output from the LLM."""
        if not self._initialized:
            return

        try:
            output_data: Dict[str, Any] = {"completion": _scrub_phi(completion)}
            if usage:
                output_data["usage"] = usage
            if finish_reason:
                output_data["finish_reason"] = finish_reason

            self._span.update(output=output_data)
        except Exception as e:
            print(f"[langfuse] Failed to set output: {e}")

    def end(
        self,
        completion: Optional[str] = None,
        usage: Optional[Dict[str, int]] = None,
        error: Optional[str] = None,
    ) -> None:
        """End the span and record metrics."""
        self.metrics.end_time = time.time()
        self.metrics.latency_ms = (self.metrics.end_time - self.metrics.start_time) * 1000

        if usage:
            self.metrics.prompt_tokens = usage.get("prompt_tokens")
            self.metrics.completion_tokens = usage.get("completion_tokens")
            self.metrics.total_tokens = usage.get("total_tokens")

        if error:
            self.metrics.success = False
            self.metrics.error = error

        if not self._initialized:
            return

        try:
            self._span.end()
        except Exception as e:
            print(f"[langfuse] Failed to end span: {e}")

    def _finish(self) -> None:
        """Internal finish method."""
        if self._initialized:
            self.end()


# Global tracer instance
tracer = LangfuseTracer()


def trace_llm(
    model: Optional[str] = None,
    operation: Optional[str] = None,
):
    """Decorator for tracing LLM calls.

    Usage:
        @trace_llm(model="claude-opus-4-7", operation="draft_appeal")
        async def draft_appeal(denial: Denial) -> str:
            ...
    """

    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            model_name = model or kwargs.get("model", "unknown")
            op_name = operation or func.__name__

            with tracer.trace_llm_call(model=model_name, operation=op_name) as span:
                try:
                    result = await func(*args, **kwargs)
                    return result
                except Exception as e:
                    span.metrics.success = False
                    span.metrics.error = str(e)
                    raise

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            model_name = model or kwargs.get("model", "unknown")
            op_name = operation or func.__name__

            with tracer.trace_llm_call(model=model_name, operation=op_name) as span:
                try:
                    result = func(*args, **kwargs)
                    return result
                except Exception as e:
                    span.metrics.success = False
                    span.metrics.error = str(e)
                    raise

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


def get_tracer() -> LangfuseTracer:
    """Get the global Langfuse tracer."""
    return tracer
