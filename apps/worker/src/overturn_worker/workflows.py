"""Temporal workflow definitions — matches the pseudocode in the dev spec.

Workflow code must be deterministic. All side effects live in activities.
"""

from __future__ import annotations

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from . import activities


@workflow.defn
class AppealDraftWorkflow:
    @workflow.run
    async def run(self, denial_id: str) -> str:
        # Create appeal record upfront so we can track progress
        appeal_id = await workflow.execute_activity(
            activities.create_appeal,
            denial_id,
            start_to_close_timeout=timedelta(seconds=10),
        )

        await workflow.execute_activity(
            activities.update_appeal_status,
            args=[appeal_id, "LOADING_CONTEXT"],
            start_to_close_timeout=timedelta(seconds=5),
        )

        ctx = await workflow.execute_activity(
            activities.load_denial_context,
            denial_id,
            start_to_close_timeout=timedelta(seconds=30),
        )

        await workflow.execute_activity(
            activities.update_appeal_status,
            args=[appeal_id, "RETRIEVING_POLICIES"],
            start_to_close_timeout=timedelta(seconds=5),
        )

        policies = await workflow.execute_activity(
            activities.retrieve_payer_policies_act,
            args=[ctx["payer_id"], ctx["denial_code"]],
            start_to_close_timeout=timedelta(seconds=20),
        )

        await workflow.execute_activity(
            activities.update_appeal_status,
            args=[appeal_id, "STRATEGIZING"],
            start_to_close_timeout=timedelta(seconds=5),
        )

        strategy = await workflow.execute_activity(
            activities.llm_strategize,
            args=[ctx, policies],
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        await workflow.execute_activity(
            activities.update_appeal_status,
            args=[appeal_id, "DRAFTING"],
            start_to_close_timeout=timedelta(seconds=5),
        )

        draft = await workflow.execute_activity(
            activities.llm_draft_appeal,
            args=[ctx, policies, strategy],
            start_to_close_timeout=timedelta(seconds=120),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        await workflow.execute_activity(
            activities.update_appeal_status,
            args=[appeal_id, "VERIFYING_CITATIONS"],
            start_to_close_timeout=timedelta(seconds=5),
        )

        verified = await workflow.execute_activity(
            activities.verify_citations_act,
            args=[draft, policies],
            start_to_close_timeout=timedelta(seconds=30),
        )

        if not verified["all_valid"]:
            await workflow.execute_activity(
                activities.update_appeal_status,
                args=[appeal_id, "REWRITING"],
                start_to_close_timeout=timedelta(seconds=5),
            )
            draft = await workflow.execute_activity(
                activities.llm_redraft_fix_citations,
                args=[draft, verified["invalid_explained"], policies],
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
            verified = await workflow.execute_activity(
                activities.verify_citations_act,
                args=[draft, policies],
                start_to_close_timeout=timedelta(seconds=30),
            )

        await workflow.execute_activity(
            activities.update_appeal_status,
            args=[appeal_id, "READY"],
            start_to_close_timeout=timedelta(seconds=5),
        )

        return await workflow.execute_activity(
            activities.save_appeal_draft,
            args=[
                appeal_id,  # Use the appeal_id we created upfront
                denial_id,
                draft,
                strategy,
                verified["valid_count"],
                0,  # cost_cents — wire in real cost once Anthropic is live
            ],
            start_to_close_timeout=timedelta(seconds=30),
        )


@workflow.defn
class AppealSubmitWorkflow:
    @workflow.run
    async def run(self, appeal_id: str) -> dict:
        appeal = await workflow.execute_activity(
            activities.load_appeal,
            appeal_id,
            start_to_close_timeout=timedelta(seconds=20),
        )
        payer = await workflow.execute_activity(
            activities.load_payer,
            appeal["payer_id"],
            start_to_close_timeout=timedelta(seconds=20),
        )

        if payer.get("portal_url"):
            result = await workflow.execute_activity(
                activities.browser_agent_submit_portal,
                args=[appeal, payer],
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=RetryPolicy(maximum_attempts=2),
                heartbeat_timeout=timedelta(seconds=60),
            )
        elif payer.get("fax_number"):
            result = await workflow.execute_activity(
                activities.fax_submit_appeal,
                args=[appeal, payer],
                start_to_close_timeout=timedelta(seconds=60),
            )
        else:
            result = await workflow.execute_activity(
                activities.mail_queue_appeal,
                args=[appeal, payer],
                start_to_close_timeout=timedelta(seconds=60),
            )

        await workflow.execute_activity(
            activities.record_submission,
            args=[appeal_id, result],
            start_to_close_timeout=timedelta(seconds=20),
        )

        # Kick off the follow-up cadence as a child workflow. We don't
        # await it — submission returns immediately; follow-up checks run
        # asynchronously across the next ~60 days.
        confirmation = result.get("confirmation_number", "")
        await workflow.start_child_workflow(
            FollowUpCheckWorkflow.run,
            args=[appeal_id, confirmation],
            id=f"followup-{appeal_id}",
            task_queue=workflow.info().task_queue,
            parent_close_policy=workflow.ParentClosePolicy.ABANDON,
        )
        return result


@workflow.defn
class FollowUpCheckWorkflow:
    """Tracks an appeal's outcome after submission.

    Schedule: 14, 30, 60 days from submission. At each tick:
      - If outcome is already terminal (WON/PARTIAL/LOST/REJECTED), exit early.
      - Otherwise, mark a FollowUpCheck row COMPLETED if it falls due, or
        escalate (notify ops) if no outcome has landed by the 30/60 day mark.

    Phase 2 will add real portal status-check + voice-IVR follow-up
    activities to this workflow; right now the check is "did an ERA arrive
    that flipped this appeal's outcome." That's enough to close the loop on
    fax + portal submissions where the payer pays via a follow-up 835.
    """

    SCHEDULE_DAYS = (14, 30, 60)

    @workflow.run
    async def run(self, appeal_id: str, confirmation: str) -> dict:
        # Seed the schedule rows up-front so they show in /admin/ops as
        # planned work, not invisible promises.
        scheduled = await workflow.execute_activity(
            activities.schedule_followup_checks,
            args=[appeal_id, list(self.SCHEDULE_DAYS)],
            start_to_close_timeout=timedelta(seconds=20),
        )

        last_result: dict = {"appeal_id": appeal_id, "checks_run": 0, "escalated": False}
        for check_id, days in zip(scheduled, self.SCHEDULE_DAYS):
            await workflow.sleep(timedelta(days=days))
            result = await workflow.execute_activity(
                activities.run_followup_check,
                args=[appeal_id, check_id, days],
                start_to_close_timeout=timedelta(seconds=30),
            )
            last_result = {**result, "appeal_id": appeal_id}
            # Terminal outcome → no further checks needed.
            if result.get("outcome_terminal"):
                return last_result
        return last_result
