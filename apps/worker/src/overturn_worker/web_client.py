"""Worker → web internal HTTP client.

Used for notifications that need to happen *after* a workflow completes
(e.g. emailing reviewers that an appeal is ready) — these belong in the web
side because they're not part of the durable workflow itself.

The web endpoint is authenticated with INTERNAL_SHARED_SECRET; we send it
on every call. Failures here are logged but never thrown — they're advisory
rather than load-bearing.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _base() -> str:
    return os.environ.get("WEB_INTERNAL_URL", "http://localhost:3000")


def _post(path: str, body: dict[str, Any]) -> None:
    base = _base()
    secret = os.environ.get("INTERNAL_SHARED_SECRET", "")
    headers = {"content-type": "application/json"}
    if secret:
        headers["x-internal-secret"] = secret
    try:
        r = httpx.post(f"{base}{path}", json=body, headers=headers, timeout=10.0)
        if r.status_code >= 400:
            logger.warning("web notify %s → %d: %s", path, r.status_code, r.text[:300])
    except httpx.RequestError as e:
        logger.warning("web notify %s failed: %s", path, e)


def notify_appeal_ready(appeal_id: str) -> None:
    _post("/api/internal/notify", {"event": "appeal.ready", "appealId": appeal_id})


def notify_appeal_outcome(appeal_id: str) -> None:
    _post("/api/internal/notify", {"event": "appeal.outcome", "appealId": appeal_id})


def trigger_deadline_scan() -> None:
    """Ask the web app to alert practices about expiring un-appealed denials.

    The endpoint is idempotent (7-day dedupe per denial), so calling this
    more often than daily is harmless.
    """
    _post("/api/internal/cron/deadline-scan", {})
