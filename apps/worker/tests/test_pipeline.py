"""In-process pipeline test — runs the strategize/draft/verify chain against
the LLM stubs, without a real Anthropic key or Temporal cluster. This is the
fast feedback loop for prompt and verifier changes.

The full end-to-end (including FastAPI + Temporal + fake portal) lives in
the top-level `scripts/run-e2e.mjs`.
"""

from __future__ import annotations

import asyncio
import os

import pytest

# Ensure no real key leaks into the stubbed path
os.environ.pop("ANTHROPIC_API_KEY", None)

from overturn_worker import activities  # noqa: E402
from overturn_worker.citations import Citation, PolicyDoc, verify_citations  # noqa: E402


@pytest.mark.asyncio
async def test_stub_pipeline_produces_valid_citation():
    ctx = {
        "denial_id": "denial-x",
        "claim_id": "claim-x",
        "payer_id": "payer-x",
        "payer_name": "Test Payer",
        "denial_code": "CO-50",
        "denial_reason": "not medically necessary",
        "denied_amount": 180.0,
        "service_date": "2025-09-15",
        "cpt_codes": ["90837"],
        "icd_codes": ["F33.1"],
        "chart_excerpts": ["DSM-5 diagnosis documented", "Treatment plan on file"],
        "patient_first_name": "Jordan",
        "patient_last_name": "Rivera",
        "patient_member_id": "XJM999",
        "patient_dob": "1988-04-12",
        "practice_name": "Lakeside Behavioral Health",
    }
    policies = [
        {
            "id": "pol-1",
            "policy_type": "denial_reason",
            "denial_code": "CO-50",
            "body": (
                "BCBS Medical Policy MP-2024-50. Outpatient psychotherapy "
                "is considered medically necessary when the member has a "
                "documented DSM-5 diagnosis and symptoms produce significant "
                "functional impairment in occupational, social, or self-care "
                "domains."
            ),
            "source_url": "https://example/policy",
        },
        {
            "id": "pol-fmt",
            "policy_type": "appeal_format",
            "denial_code": None,
            "body": "Appeals must include claim control number, member name, "
            "date of service, denial code, and requested remedy.",
            "source_url": None,
        },
    ]

    strategy = await activities.llm_strategize(ctx, policies)
    assert strategy["predictedWinProbability"] >= 0.4
    assert strategy["argumentCategory"] == "MEDICAL_NECESSITY"

    draft = await activities.llm_draft_appeal(ctx, policies, strategy)
    assert "Lakeside Behavioral Health" in draft["letter"]
    assert "$180.00" in draft["letter"]
    assert len(draft["citations"]) >= 1

    # Verifier must accept the stub draft
    citations = [
        Citation(
            policy_id=c["policyId"],
            quote=c["quote"],
            source_url=c.get("sourceUrl"),
            page=c.get("page"),
        )
        for c in draft["citations"]
    ]
    res = verify_citations(citations, [PolicyDoc(p["id"], p["body"]) for p in policies])
    assert res.all_valid, f"verifier rejected stub draft: {res.invalid_citations}"
