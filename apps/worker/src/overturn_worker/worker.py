"""Temporal worker process — registers workflows and activities and polls."""

from __future__ import annotations

import asyncio
import logging

from temporalio.client import Client
from temporalio.worker import Worker

from . import activities
from .config import SETTINGS
from .workflows import AppealDraftWorkflow, AppealSubmitWorkflow, FollowUpCheckWorkflow

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("worker")


ACTIVITY_REGISTRY = [
    activities.create_appeal,
    activities.update_appeal_status,
    activities.load_denial_context,
    activities.retrieve_payer_policies_act,
    activities.llm_strategize,
    activities.llm_draft_appeal,
    activities.verify_citations_act,
    activities.llm_redraft_fix_citations,
    activities.save_appeal_draft,
    activities.save_skipped_appeal,
    activities.load_appeal,
    activities.load_payer,
    activities.browser_agent_submit_portal,
    activities.fax_submit_appeal,
    activities.mail_queue_appeal,
    activities.record_submission,
]


async def main() -> None:
    client = await Client.connect(SETTINGS.temporal_host, namespace=SETTINGS.temporal_namespace)
    worker = Worker(
        client,
        task_queue=SETTINGS.temporal_task_queue,
        workflows=[AppealDraftWorkflow, AppealSubmitWorkflow, FollowUpCheckWorkflow],
        activities=ACTIVITY_REGISTRY,
    )
    logger.info("Temporal worker started — task_queue=%s", SETTINGS.temporal_task_queue)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
