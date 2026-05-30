"""Dev entrypoint — runs the FastAPI server, the Temporal worker, and the
local fake portal all in one process. Production splits these into separate
containers (see infra/docker)."""

from __future__ import annotations

import asyncio
import logging

import uvicorn

from .api import app as fastapi_app
from .clearinghouse import start_poll_loop as start_ingest_loop
from .config import SETTINGS
from .fake_portal import app as fake_portal_app
from .worker import main as run_temporal_worker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _serve(app, port: int, name: str) -> None:
    cfg = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="info")
    server = uvicorn.Server(cfg)
    logger.info("starting %s on :%d", name, port)
    await server.serve()


async def main() -> None:
    tasks = [
        asyncio.create_task(_serve(fastapi_app, 8001, "worker-api")),
        asyncio.create_task(_serve(fake_portal_app, 4555, "fake-portal")),
        asyncio.create_task(start_ingest_loop()),
    ]
    # Temporal worker is optional in pure-API dev (e.g. running unit tests
    # that don't need a Temporal cluster).
    try:
        tasks.append(asyncio.create_task(run_temporal_worker()))
    except Exception as e:  # noqa: BLE001
        logger.warning("Temporal worker not started: %s", e)

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
