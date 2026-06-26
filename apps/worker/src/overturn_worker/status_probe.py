"""Active follow-up: ask the payer where an appeal stands.

Used by FollowUpCheckWorkflow on 14/30/60-day ticks. Per-payer probes plug
in via the registry below — each probe is async and returns a dict shape:

    {
      "status": "DECIDED" | "PENDING" | "UNKNOWN" | "ERROR",
      "decision": "WON" | "LOST" | "PARTIAL" | None,
      "note": "free-text — surfaced in FollowUpCheck.notes",
      "evidence": { ... }  # optional, audit artifacts
    }

Only "DECIDED" with a non-null decision causes the workflow to flip the
appeal outcome. Everything else is informational.

The default probe returns UNKNOWN. Real per-payer automation (Stagehand
status-page scrape or IVR call) gets registered with `register_probe`.
"""

from __future__ import annotations

import logging
import os
from typing import Awaitable, Callable

from sqlalchemy import select

from .models import Appeal, SessionLocal

logger = logging.getLogger(__name__)

ProbeFn = Callable[[str, dict], Awaitable[dict]]
"""(appeal_id, context) -> probe result. Context carries payer + submission info."""

_PROBES: dict[str, ProbeFn] = {}


def register_probe(payer_match: str, fn: ProbeFn) -> None:
    """Register a probe for a payer name substring (case-insensitive)."""
    _PROBES[payer_match.lower()] = fn


def _lookup_probe(payer_name: str) -> ProbeFn | None:
    name = (payer_name or "").lower()
    for needle, fn in _PROBES.items():
        if needle in name:
            return fn
    return None


async def _default_probe(appeal_id: str, ctx: dict) -> dict:
    """Fallback when no payer-specific probe is registered.

    Returns UNKNOWN so the workflow falls through to its escalation logic
    instead of inventing a decision.
    """
    return {
        "status": "UNKNOWN",
        "decision": None,
        "note": "no per-payer status probe configured",
    }


async def probe_appeal_status(appeal_id: str) -> dict:
    """Look up the payer and dispatch to the registered probe.

    Captures payer + submission context inside the activity so the probe
    function doesn't need its own DB access. Errors are caught upstream
    (run_followup_check) and surfaced as ERROR status.
    """
    if os.environ.get("OVERTURN_DISABLE_STATUS_PROBE") == "1":
        return {"status": "UNKNOWN", "decision": None, "note": "probe disabled by env"}

    with SessionLocal() as s:
        appeal = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if appeal is None:
            return {"status": "ERROR", "decision": None, "note": "appeal not found"}
        payer_name = appeal.denial.claim.payer.name
        ctx = {
            "payer_name": payer_name,
            "payer_id": appeal.denial.claim.payerId,
            "confirmation_number": None,
            "submitted_via": appeal.submittedVia,
            "submitted_at": appeal.submittedAt.isoformat() if appeal.submittedAt else None,
        }
        # Use the most recent successful submission's confirmation number,
        # if any — that's the payer-side handle we'd type into a portal.
        from .models import Submission
        last_sub = s.scalar(
            select(Submission)
            .where(Submission.appealId == appeal_id, Submission.status == "SUCCESS")
            .order_by(Submission.startedAt.desc())
            .limit(1)
        )
        if last_sub is not None:
            ctx["confirmation_number"] = last_sub.confirmationNumber

    probe = _lookup_probe(payer_name) or _default_probe
    return await probe(appeal_id, ctx)


# ── Stub probe useful for tests and local dev ───────────────────────────────
async def _stub_decided_probe(appeal_id: str, ctx: dict) -> dict:
    """Pretend the payer decided WON — used in tests via register_probe.
    Not registered by default. Useful when you want to exercise the
    probe-flips-outcome path end-to-end without real automation."""
    return {
        "status": "DECIDED",
        "decision": "WON",
        "note": "stub probe — assumed WON",
        "evidence": {"appeal_id": appeal_id, "via": ctx.get("submitted_via")},
    }
