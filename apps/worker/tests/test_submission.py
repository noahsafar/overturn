"""Fax / mail submission activity tests — verify stub paths persist
Submission rows and produce PDF artifacts."""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; submission tests require Postgres",
)


def _new_id(prefix: str = "cm") -> str:
    return prefix + uuid.uuid4().hex[:22]


@pytest.fixture
def appeal_fixture():
    """Insert a minimal practice/patient/claim/denial/appeal so the activity
    has something to record against."""
    from overturn_worker.crypto import encrypt
    from overturn_worker.models import (
        Appeal, Claim, Denial, Patient, Payer, Practice, SessionLocal, Submission,
    )
    from sqlalchemy import delete

    pid = _new_id()
    payer_id = _new_id()
    patient_id = _new_id()
    claim_id = _new_id()
    denial_id = _new_id()
    appeal_id = _new_id()
    now = datetime.utcnow()

    with SessionLocal() as s:
        s.add(Practice(
            id=pid, name="Submission Test Practice", npi=f"NPI-{uuid.uuid4().hex[:8]}",
            taxId="00-0000000", specialty="Test", billingEmail=None,
            stripeCustomerId=None, recoveryFeeBps=2500, onboardingCompletedAt=None,
            clearinghouseSftpHost=None, clearinghouseSftpUser=None,
            clearinghouseSftpPathEnc=None, createdAt=now,
        ))
        s.add(Payer(
            id=payer_id, name="Test Payer", payerIdNumbers=["T"],
            portalUrl=None, ivrPhone=None, faxNumber="+18005550199",
            appealAddress="PO Box 1234, Somewhere ST 00000", epaSupported=False,
        ))
        s.flush()
        s.add(Patient(
            id=patient_id, practiceId=pid, externalId=f"P-{uuid.uuid4().hex[:8]}",
            firstNameEnc=encrypt("Pat"), lastNameEnc=encrypt("Doe"),
            dobEnc=encrypt("1990-01-01"), memberIdEnc=encrypt("MEM999"),
            insurancePayerId=payer_id,
        ))
        s.flush()
        s.add(Claim(
            id=claim_id, practiceId=pid, patientId=patient_id, payerId=payer_id,
            serviceDate=now, cptCodes=[], icdCodes=[],
            billedAmount=Decimal("250.00"), controlNumber=f"SUBTEST-{uuid.uuid4().hex[:8]}",
            status="DENIED", submittedAt=now,
        ))
        s.flush()
        s.add(Denial(
            id=denial_id, claimId=claim_id, denialCode="CO-50",
            denialReason="test", deniedAmount=Decimal("250.00"),
            eraRawText="", receivedAt=now,
        ))
        s.flush()
        s.add(Appeal(
            id=appeal_id, denialId=denial_id, draftLetter="Dear payer,\n\nAppeal.\n",
            templateUsed="t", citations=[], status="READY",
            submittedVia=None, submittedAt=None, outcome="PENDING",
            recoveredAmount=None, ourFee=None, outcomeRecordedAt=None,
            agentRunId=None, humanReviewId=None, createdAt=now,
        ))
        s.commit()

    yield {"appeal_id": appeal_id, "practice_id": pid, "payer_id": payer_id,
           "claim_id": claim_id, "denial_id": denial_id, "patient_id": patient_id}

    with SessionLocal() as s:
        s.execute(delete(Submission).where(Submission.appealId == appeal_id))
        s.execute(delete(Appeal).where(Appeal.id == appeal_id))
        s.execute(delete(Denial).where(Denial.id == denial_id))
        s.execute(delete(Claim).where(Claim.id == claim_id))
        s.execute(delete(Patient).where(Patient.id == patient_id))
        s.execute(delete(Payer).where(Payer.id == payer_id))
        s.execute(delete(Practice).where(Practice.id == pid))
        s.commit()


@pytest.mark.asyncio
async def test_fax_submit_stub_creates_submission_row(appeal_fixture):
    from overturn_worker import activities
    from overturn_worker.models import Submission, SessionLocal
    from sqlalchemy import select

    appeal = await activities.load_appeal(appeal_fixture["appeal_id"])
    payer = await activities.load_payer(appeal_fixture["payer_id"])
    result = await activities.fax_submit_appeal(appeal, payer)

    assert result["success"] is True
    assert result["channel"] == "FAX"
    assert result["confirmation_number"].startswith("FAX-")
    pdf_path = result["screenshots"][0]
    assert Path(pdf_path).exists()
    assert Path(pdf_path).read_bytes()[:4] == b"%PDF"

    with SessionLocal() as s:
        subs = s.execute(
            select(Submission).where(Submission.appealId == appeal_fixture["appeal_id"])
        ).scalars().all()
        assert len(subs) == 1
        sub = subs[0]
        assert sub.channel == "FAX"
        assert sub.status == "SUCCESS"
        assert sub.attemptNumber == 1


@pytest.mark.asyncio
async def test_mail_submit_stub_creates_submission_row(appeal_fixture):
    from overturn_worker import activities
    from overturn_worker.models import Submission, SessionLocal
    from sqlalchemy import select

    appeal = await activities.load_appeal(appeal_fixture["appeal_id"])
    payer = await activities.load_payer(appeal_fixture["payer_id"])
    result = await activities.mail_queue_appeal(appeal, payer)

    assert result["success"] is True
    assert result["channel"] == "MAIL"
    assert result["confirmation_number"].startswith("MAIL-")
    pdf_path = result["screenshots"][0]
    assert Path(pdf_path).read_bytes()[:4] == b"%PDF"

    with SessionLocal() as s:
        subs = s.execute(
            select(Submission).where(Submission.appealId == appeal_fixture["appeal_id"])
        ).scalars().all()
        assert len(subs) == 1
        assert subs[0].channel == "MAIL"
