"""Langfuse LLM tracing wrapper.

Production: every Claude call is wrapped in a Langfuse generation event so
you can see prompts, responses, latency, and costs in the Langfuse UI.

Dev (no LANGFUSE_PUBLIC_KEY): a no-op that just returns the result of the
wrapped call. Same call surface for the activity code regardless of mode.

PHI handling: the prompt sent to Langfuse goes through `scrub_for_logs()`
which redacts likely PHI patterns. For real HIPAA-grade usage, host
Langfuse yourself in your HIPAA AWS account (see production-wiring.md).
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

_PHI_PATTERNS = [
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
    (re.compile(r"\b(19|20)\d{2}-\d{2}-\d{2}\b"), "[DOB]"),
    # synthetic and real member-id patterns
    (re.compile(r"\b[A-Z]{2,4}\d{6,12}\b"), "[MEMBER_ID]"),
    # 10-digit phone
    (re.compile(r"\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[PHONE]"),
]


def scrub_for_logs(text: str) -> str:
    """Replace likely-PHI patterns with bracketed placeholders. Best-effort —
    self-hosted Langfuse + a real BAA is the proper compliance answer."""
    out = text
    for pat, replacement in _PHI_PATTERNS:
        out = pat.sub(replacement, out)
    return out


_client = None
_init_attempted = False


def _get_client():
    global _client, _init_attempted
    if _init_attempted:
        return _client
    _init_attempted = True
    public = os.environ.get("LANGFUSE_PUBLIC_KEY")
    secret = os.environ.get("LANGFUSE_SECRET_KEY")
    host = os.environ.get("LANGFUSE_HOST")
    if not (public and secret):
        return None
    try:
        from langfuse import Langfuse  # type: ignore[import-not-found]

        _client = Langfuse(public_key=public, secret_key=secret, host=host)
        logger.info("[langfuse] initialized")
    except Exception as e:  # noqa: BLE001
        logger.warning("[langfuse] init failed: %s", e)
        _client = None
    return _client


def trace_llm_call(
    *,
    name: str,
    model: str,
    prompt: str,
    fn: Callable[[], T],
) -> T:
    """Wrap an LLM call with a Langfuse generation. No-op if not configured.

    Errors in the trace setup never propagate — telemetry must not break the
    business call.
    """
    client = _get_client()
    if client is None:
        return fn()

    try:
        gen = client.generation(
            name=name,
            model=model,
            input=scrub_for_logs(prompt)[:8000],
        )
    except Exception as e:  # noqa: BLE001
        logger.debug("[langfuse] generation start failed: %s", e)
        return fn()

    try:
        result = fn()
        try:
            output_str = ""
            if hasattr(result, "text"):
                output_str = scrub_for_logs(getattr(result, "text", "") or "")[:8000]
            gen.end(output=output_str)
        except Exception:  # noqa: BLE001
            pass
        return result
    except Exception as e:
        try:
            gen.end(level="ERROR", status_message=str(e)[:300])
        except Exception:  # noqa: BLE001
            pass
        raise
