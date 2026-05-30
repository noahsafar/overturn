"""End-to-end integration test covering the full money loop:

  1. A denial is on file
  2. AppealDraftWorkflow activities run (stubbed LLM) → Appeal in READY
  3. Reviewer approves → fax submission produces a PDF + Submission row
  4. Follow-up ERA arrives → outcome ingest flips Appeal to WON
  5. Invoice line item is created at the right fee

If any of these steps regresses, the pricing model breaks. This test is the
canary on the load-bearing flow.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from decimal import Decimal

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; full-loop test requires Postgres",
)


def _new_id(prefix: str = "cm") -> str:
    return prefix + uuid.uuid4().hex[:22]


@pytest.fixture
def loop_fixture():
    from overturn_worker.crypto import encrypt
    from overturn_worker.models import (
        Appeal, AuditEvent, Claim, Denial, Invoice, InvoiceLineItem, Patient,
        Payer, PayerPolicy, Practice, SessionLocal, Submission,
    )
    from sqlalchemy import delete

    pid = _new_id()
    payer_id = _new_id()
    policy_id = _new_id()
    patient_id = _new_id()
    claim_id = _new_id()
    denial_id = _new_id()
    control = f"E2E-{uuid.uuid4().hex[:10]}"
    now = datetime.utcnow()

    with SessionLocal() as s:
        s.add(Practice(
            id=pid, name="E2E Practice", npi=f"NPI-{uuid.uuid4().hex[:8]}",
            taxId="00-0000000", specialty="Behavioral Health",
            billingEmail="billing@e2e.local",
            stripeCustomerId=None, recoveryFeeBps=2500,
            onboardingCompletedAt=None, clearinghouseSftpHost=None,
            clearinghouseSftpUser=None, clearinghouseSftpPathEnc=None,
            createdAt=now,
        ))
        s.add(Payer(
            id=payer_id, name="E2E Payer", payerIdNumbers=["E2E"],
            portalUrl=None, ivrPhone=None, faxNumber="+18005550199",
            appealAddress="PO Box 1, Test ST 00000", epaSupported=False,
        ))
        s.flush()
        s.add(PayerPolicy(
            id=policy_id, payerId=payer_id,
            policyType="denial_reason", denialCode="CO-50",
            effectiveDate=now,
            body=(
                "Section 3.1 — Outpatient psychotherapy is considered medically "
                "necessary when documentation shows a DSM-5 diagnosis."
            ),
            sourceUrl="https://example.test/policy",
            scrapedAt=now,
        ))
        s.add(Patient(
            id=patient_id, practiceId=pid, externalId=f"P-{uuid.uuid4().hex[:8]}",
            firstNameEnc=encrypt("Alex"), lastNameEnc=encrypt("Kim"),
            dobEnc=encrypt("1992-03-04"), memberIdEnc=encrypt("MEM-E2E"),
            insurancePayerId=payer_id,
        ))
        s.flush()
        s.add(Claim(
            id=claim_id, practiceId=pid, patientId=patient_id, payerId=payer_id,
            serviceDate=now, cptCodes=["90837"], icdCodes=["F33.1"],
            billedAmount=Decimal("400.00"), controlNumber=control,
            status="DENIED", submittedAt=now,
        ))
        s.flush()
        s.add(Denial(
            id=denial_id, claimId=claim_id, denialCode="CO-50",
            denialReason="Not medically necessary",
            deniedAmount=Decimal("400.00"), eraRawText="", receivedAt=now,
        ))
        s.commit()

    yield {
        "practice_id": pid, "payer_id": payer_id, "policy_id": policy_id,
        "patient_id": patient_id, "claim_id": claim_id,
        "denial_id": denial_id, "control_number": control,
    }

    from sqlalchemy import select as sa_select
    with SessionLocal() as s:
        appeal_ids = list(
            s.execute(
                sa_select(Appeal.id).where(Appeal.denialId == denial_id)
            ).scalars()
        )
        invoice_ids = list(
            s.execute(sa_select(Invoice.id).where(Invoice.practiceId == pid)).scalars()
        )
        if appeal_ids:
            s.execute(
                delete(InvoiceLineItem).where(InvoiceLineItem.appealId.in_(appeal_ids))
            )
            s.execute(delete(Submission).where(Submission.appealId.in_(appeal_ids)))
        if invoice_ids:
            s.execute(delete(Invoice).where(Invoice.id.in_(invoice_ids)))
        s.execute(delete(Appeal).where(Appeal.denialId == denial_id))
        s.execute(delete(Denial).where(Denial.id == denial_id))
        s.execute(delete(Claim).where(Claim.id == claim_id))
        s.execute(delete(Patient).where(Patient.id == patient_id))
        s.execute(delete(PayerPolicy).where(PayerPolicy.id == policy_id))
        s.execute(delete(AuditEvent).where(AuditEvent.practiceId == pid))
        s.execute(delete(Payer).where(Payer.id == payer_id))
        s.execute(delete(Practice).where(Practice.id == pid))
        s.commit()


@pytest.mark.asyncio
async def test_full_money_loop(loop_fixture):
    """Denial → draft → submit → follow-up ERA → invoice line. The full thread."""
    from overturn_worker import activities
    from overturn_worker.models import (
        Appeal, InvoiceLineItem, Invoice, Submission, SessionLocal,
    )
    from overturn_worker.outcomes import ingest_era_outcomes
    from sqlalchemy import select

    f = loop_fixture

    # 1. Create the appeal record (workflow does this upfront)
    appeal_id = await activities.create_appeal(f["denial_id"])

    # 2. Load context + retrieve policies + strategize + draft
    ctx = await activities.load_denial_context(f["denial_id"])
    policies = await activities.retrieve_payer_policies_act(f["payer_id"], "CO-50")
    strategy = await activities.llm_strategize(ctx, policies)
    draft = await activities.llm_draft_appeal(ctx, policies, strategy)

    # 3. Verify citations
    verified = await activities.verify_citations_act(draft, policies)
    assert verified["all_valid"], f"verifier rejected stub draft: {verified}"

    # 4. Persist the draft
    await activities.save_appeal_draft(
        appeal_id, f["denial_id"], draft, strategy, verified["valid_count"], 0
    )

    # 5. Approve + submit via fax
    appeal = await activities.load_appeal(appeal_id)
    payer = await activities.load_payer(f["payer_id"])
    submit_res = await activities.fax_submit_appeal(appeal, payer)
    assert submit_res["success"]

    # 6. Record submission timestamp
    await activities.record_submission(appeal_id, submit_res)

    with SessionLocal() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        assert a is not None
        assert a.submittedVia == "FAX"

    # 7. Simulate follow-up ERA arriving with PAID status
    era = (
        f"CLP*{f['control_number']}*1*400.00*400.00*0.00*MC*XYZ*11*1*CO~"
        f"CAS*CO*0*0.00~"
    )
    updates = ingest_era_outcomes(era)
    assert len(updates) == 1
    u = updates[0]
    assert u.outcome == "WON"
    assert u.fee_cents == 10000  # 25% of $400 = $100 = 10000 cents

    # 8. Verify invoice line item was created
    with SessionLocal() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        assert a.outcome == "WON"
        assert a.recoveredAmount == Decimal("400.00")
        assert a.ourFee == Decimal("100.00")

        line = s.scalar(select(InvoiceLineItem).where(InvoiceLineItem.appealId == appeal_id))
        assert line is not None
        assert line.feeCents == 10000
        assert line.recoveredAmount == Decimal("400.00")

        invoice = s.scalar(select(Invoice).where(Invoice.id == line.invoiceId))
        assert invoice is not None
        assert invoice.status == "DRAFT"
        assert invoice.totalCents == 10000

        sub = s.scalar(select(Submission).where(Submission.appealId == appeal_id))
        assert sub is not None
        assert sub.channel == "FAX"
        assert sub.status == "SUCCESS"
