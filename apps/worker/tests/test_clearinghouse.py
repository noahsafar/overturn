"""Clearinghouse SFTP / local-dir ingest tests."""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set",
)


def _new_id(prefix: str = "cm") -> str:
    return prefix + uuid.uuid4().hex[:22]


@pytest.fixture
def appeal_for_ingest(tmp_path, monkeypatch):
    """Create an open appeal whose claim controlNumber we can match against an
    ERA dropped into a temp directory."""
    from overturn_worker.crypto import encrypt
    from overturn_worker.models import (
        Appeal, Claim, Denial, Patient, Payer, Practice, SessionLocal,
        InvoiceLineItem, Invoice,
    )
    from sqlalchemy import delete

    pid = _new_id()
    payer_id = _new_id()
    patient_id = _new_id()
    claim_id = _new_id()
    denial_id = _new_id()
    appeal_id = _new_id()
    control = f"INGEST-{uuid.uuid4().hex[:10]}"
    now = datetime.utcnow()

    with SessionLocal() as s:
        s.add(Practice(
            id=pid, name="Ingest Practice", npi=f"NPI-{uuid.uuid4().hex[:8]}",
            taxId="00-0000000", specialty="Test", billingEmail=None,
            stripeCustomerId=None, recoveryFeeBps=2500,
            onboardingCompletedAt=None, clearinghouseSftpHost=None,
            clearinghouseSftpUser=None, clearinghouseSftpPathEnc=None,
            createdAt=now,
        ))
        s.add(Payer(
            id=payer_id, name="Test Payer", payerIdNumbers=["T"],
            portalUrl=None, ivrPhone=None, faxNumber=None, appealAddress=None,
            epaSupported=False, appealWindowDays=180,
        ))
        s.flush()
        s.add(Patient(
            id=patient_id, practiceId=pid, externalId=f"P-{uuid.uuid4().hex[:8]}",
            firstNameEnc=encrypt("Pat"), lastNameEnc=encrypt("Doe"),
            dobEnc=encrypt("1990-01-01"), memberIdEnc=encrypt("MEM"),
            insurancePayerId=payer_id,
        ))
        s.flush()
        s.add(Claim(
            id=claim_id, practiceId=pid, patientId=patient_id, payerId=payer_id,
            serviceDate=now, cptCodes=[], icdCodes=[],
            billedAmount=Decimal("300.00"), controlNumber=control,
            status="DENIED", submittedAt=now,
        ))
        s.flush()
        s.add(Denial(
            id=denial_id, claimId=claim_id, denialCode="CO-50",
            denialReason="t", deniedAmount=Decimal("300.00"),
            eraRawText="", receivedAt=now,
        ))
        s.flush()
        s.add(Appeal(
            id=appeal_id, denialId=denial_id, draftLetter="d",
            templateUsed="t", citations=[], status="READY",
            submittedVia="FAX", submittedAt=now, outcome="PENDING",
            recoveredAmount=None, ourFee=None, outcomeRecordedAt=None,
            agentRunId=None, humanReviewId=None, createdAt=now,
        ))
        s.commit()

    # Point the clearinghouse module at a tmp dir for this test.
    monkeypatch.setenv("CLEARINGHOUSE_DEV_DIR", str(tmp_path))

    yield {"control": control, "appeal_id": appeal_id, "practice_id": pid,
           "tmp": tmp_path, "claim_id": claim_id, "denial_id": denial_id,
           "patient_id": patient_id, "payer_id": payer_id}

    with SessionLocal() as s:
        s.execute(delete(InvoiceLineItem).where(InvoiceLineItem.appealId == appeal_id))
        s.execute(delete(Invoice).where(Invoice.practiceId == pid))
        s.execute(delete(Appeal).where(Appeal.id == appeal_id))
        s.execute(delete(Denial).where(Denial.id == denial_id))
        s.execute(delete(Claim).where(Claim.id == claim_id))
        s.execute(delete(Patient).where(Patient.id == patient_id))
        s.execute(delete(Payer).where(Payer.id == payer_id))
        s.execute(delete(Practice).where(Practice.id == pid))
        s.commit()


def test_dev_dir_ingest_moves_file_and_records_outcome(appeal_for_ingest):
    from overturn_worker.clearinghouse import run_ingest_once
    from overturn_worker.models import Appeal, SessionLocal
    from sqlalchemy import select

    tmp: Path = appeal_for_ingest["tmp"]
    era_file = tmp / "incoming-001.835"
    era_file.write_text(
        f"CLP*{appeal_for_ingest['control']}*1*300.00*300.00*0.00*MC*XYZ*11*1*CO~"
    )

    stats = run_ingest_once()
    assert stats.files_seen >= 1
    assert stats.files_processed >= 1
    assert stats.outcomes_recorded >= 1

    # File moved into processed/
    assert not era_file.exists()
    assert (tmp / "processed" / "incoming-001.835").exists()

    with SessionLocal() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == appeal_for_ingest["appeal_id"]))
        assert a.outcome == "WON"


def test_dev_dir_ingest_handles_corrupt_era(appeal_for_ingest):
    from overturn_worker.clearinghouse import run_ingest_once

    tmp: Path = appeal_for_ingest["tmp"]
    # Write a file that is not a valid ERA. The parser will succeed (returning
    # an empty list), so this file should land in `processed/`, not `failed/`.
    (tmp / "garbage.txt").write_text("not an era at all")

    stats = run_ingest_once()
    assert stats.files_seen == 1
    # No matching claim → no outcomes, no errors
    assert stats.errors == 0
