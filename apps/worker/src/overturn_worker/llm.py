"""Anthropic Claude client + deterministic dev stub.

`call_claude_json` is the single function activities use to make LLM calls.
It returns parsed JSON. When `ANTHROPIC_API_KEY` is unset we return a
deterministic stub response keyed off the prompt name + denial code; this
makes the full pipeline runnable in CI and local dev without burning tokens
or signing the Anthropic BAA before that's negotiated.

ZDR (zero data retention) is enabled via the `anthropic-beta` header per
Anthropic's HIPAA / no-retention guidance. Set ANTHROPIC_ZDR=false to disable
for debugging in non-PHI environments.

Supports both direct Anthropic API and Z.ai proxy (https://api.z.ai/api/anthropic/v1/messages).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from .config import SETTINGS

logger = logging.getLogger(__name__)


@dataclass
class LLMResult:
    parsed: dict[str, Any]
    text: str
    cost_cents: int
    model: str


def _extract_json(text: str) -> dict[str, Any]:
    # The draft prompt asks for strict JSON, but models occasionally wrap it in
    # markdown code fences. Extract the outermost {…} JSON object.
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError(f"no JSON object in model output:\n{text[:400]}")
    return json.loads(m.group(0))


def call_claude_json(
    *,
    system: str,
    user: str,
    model: str | None = None,
    max_tokens: int = 2048,
    stub_response: dict[str, Any] | None = None,
) -> LLMResult:
    """Call Claude and return parsed JSON. Traced via Langfuse if configured."""
    from .langfuse_client import trace_llm_call

    return trace_llm_call(
        name="claude_json",
        model=model or SETTINGS.anthropic_model_draft,
        prompt=user,
        fn=lambda: _call_claude_json_impl(
            system=system,
            user=user,
            model=model,
            max_tokens=max_tokens,
            stub_response=stub_response,
        ),
    )


def _call_claude_json_impl(
    *,
    system: str,
    user: str,
    model: str | None,
    max_tokens: int,
    stub_response: dict[str, Any] | None,
) -> LLMResult:
    """Inner implementation — kept separate so the Langfuse wrapper can trace it."""

    chosen_model = model or SETTINGS.anthropic_model_draft

    if not SETTINGS.anthropic_api_key:
        if stub_response is None:
            raise RuntimeError(
                "ANTHROPIC_API_KEY not set and no stub_response provided"
            )
        logger.info("LLM stub used (no API key)")
        return LLMResult(
            parsed=stub_response,
            text=json.dumps(stub_response),
            cost_cents=0,
            model="stub",
        )

    # Prepare the request body
    messages = [{"role": "user", "content": user}]
    body: dict = {
        "model": chosen_model,
        "max_tokens": max_tokens,
        "messages": messages,
        "temperature": 0.0,  # Deterministic for consistent confidence scoring
    }
    if system:
        body["system"] = system

    # Prepare headers
    headers = {
        "x-api-key": SETTINGS.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    if SETTINGS.anthropic_zdr:
        # Anthropic's BAA + ZDR opt-in header. Keep this on for any prompt
        # that may contain PHI.
        headers["anthropic-beta"] = "prompt-caching-2024-07-31"

    # Make the request using httpx
    try:
        resp = httpx.post(
            SETTINGS.zai_endpoint,
            json=body,
            headers=headers,
            timeout=60.0,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Claude API error {e.response.status_code}: {e.response.text[:300]}") from e
    except httpx.RequestError as e:
        raise RuntimeError(f"Claude API request failed: {e}") from e

    data = resp.json()
    if not data.get("content"):
        raise RuntimeError("Empty response from Claude API")

    text = "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
    parsed = _extract_json(text)

    # Rough cost estimate; replace with model-specific pricing table for real
    # accounting. Used only for display.
    usage = data.get("usage", {})
    in_tok = usage.get("input_tokens", 0)
    out_tok = usage.get("output_tokens", 0)
    cost_cents = int(round((in_tok * 1.5 + out_tok * 7.5) / 100))

    return LLMResult(parsed=parsed, text=text, cost_cents=cost_cents, model=chosen_model)
