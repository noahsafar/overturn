"""Lightweight recurring jobs that don't need Temporal durability.

These are advisory ticks (deadline alerts today; digests later). The web
endpoints they call are idempotent, so an extra firing after a restart is
harmless — which is exactly why they don't warrant workflow machinery.
"""

from __future__ import annotations

import asyncio
import logging
import os

from . import web_client

logger = logging.getLogger(__name__)


def _interval_s() -> int:
    # Daily by default; overridable for dev/testing.
    return int(os.environ.get("DEADLINE_SCAN_INTERVAL_S", str(24 * 3600)))


async def start_deadline_scan_loop() -> None:
    """Fire the web app's deadline scan once at startup, then daily."""
    while True:
        try:
            await asyncio.to_thread(web_client.trigger_deadline_scan)
            logger.info("deadline scan triggered")
        except Exception as e:  # noqa: BLE001 — advisory, never crash the worker
            logger.warning("deadline scan failed: %s", e)
        await asyncio.sleep(_interval_s())
