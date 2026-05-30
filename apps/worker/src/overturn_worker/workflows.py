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
        return result


@workflow.defn
class FollowUpCheckWorkflow:
    """Check on a submitted appeal 14 days later. Phase 1 stub — Phase 2
    fills in the voice-IVR / portal-status check activities."""

    @workflow.run
    async def run(self, appeal_id: str, confirmation: str) -> None:
        await workflow.sleep(timedelta(days=14))
        # Phase 1 deliberately leaves the actual follow-up unimplemented;
        # the dev spec marks voice as out of scope.
        return None
