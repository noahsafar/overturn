"""Outcome ingestion tests — exercise the money loop against the real DB.

Skipped automatically when DATABASE_URL is unset. These tests create rows
under a synthetic practice and clean up after themselves, but they do mutate
the DB so they should only run against dev/test instances.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from decimal import Decimal

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; outcome tests require a real Postgres",
)


def _new_id(prefix: str = "cm") -> str:
    return prefix + uuid.uuid4().hex[:22]


@pytest.fixture
def session_factory():
    from overturn_worker.models import SessionLocal

    return SessionLocal


@pytest.fixture
def fixtures(session_factory):
    """Create a synthetic practice + payer + claim + appeal and yield their ids."""
    from overturn_worker.models import (
        Appeal,
        Claim,
        Denial,
        Patient,
        Payer,
        Practice,
    )

    pid = _new_id()
    payer_id = _new_id()
    patient_id = _new_id()
    claim_id = _new_id()
    denial_id = _new_id()
    appeal_id = _new_id()
    control = f"TEST-{uuid.uuid4().hex[:10]}"
    now = datetime.utcnow()

    with session_factory() as s:
        s.add(Practice(
            id=pid, name="Test Practice", npi=f"NPI-{uuid.uuid4().hex[:8]}",
            taxId="00-0000000", specialty="Test", billingEmail="t@test.local",
            stripeCustomerId=None, recoveryFeeBps=2500, onboardingCompletedAt=None,
            clearinghouseSftpHost=None, clearinghouseSftpUser=None,
            clearinghouseSftpPathEnc=None, createdAt=now,
        ))
        s.add(Payer(
            id=payer_id, name="Test Payer", payerIdNumbers=["TEST001"],
            portalUrl=None, ivrPhone=None, faxNumber=None, appealAddress=None,
            epaSupported=False, appealWindowDays=180,
        ))
        s.flush()
        s.add(Patient(
            id=patient_id, practiceId=pid, externalId=f"PT-{uuid.uuid4().hex[:8]}",
            firstNameEnc=b"x", lastNameEnc=b"x", dobEnc=b"x", memberIdEnc=b"x",
            insurancePayerId=payer_id,
        ))
        s.flush()
        s.add(Claim(
            id=claim_id, practiceId=pid, patientId=patient_id, payerId=payer_id,
            serviceDate=now, cptCodes=[], icdCodes=[],
            billedAmount=Decimal("500.00"), controlNumber=control,
            status="DENIED", submittedAt=now,
        ))
        s.flush()
        s.add(Denial(
            id=denial_id, claimId=claim_id, denialCode="CO-50",
            denialReason="test", deniedAmount=Decimal("500.00"),
            eraRawText="", receivedAt=now,
        ))
        s.flush()
        s.add(Appeal(
            id=appeal_id, denialId=denial_id, draftLetter="dear payer",
            templateUsed="t", citations=[], status="READY",
            submittedVia="FAX", submittedAt=now, outcome="PENDING",
            recoveredAmount=None, ourFee=None, outcomeRecordedAt=None,
            agentRunId=None, humanReviewId=None, createdAt=now,
        ))
        s.commit()

    yield {
        "practice_id": pid, "payer_id": payer_id, "patient_id": patient_id,
        "claim_id": claim_id, "denial_id": denial_id, "appeal_id": appeal_id,
        "control_number": control,
    }

    # Cleanup — delete in FK-safe order.
    from overturn_worker.models import (
        Appeal, AuditEvent, Claim, Denial, Invoice, InvoiceLineItem,
        Notification, Patient, Payer, Practice,
    )
    from sqlalchemy import delete

    with session_factory() as s:
        s.execute(delete(InvoiceLineItem).where(InvoiceLineItem.appealId == appeal_id))
        s.execute(delete(Invoice).where(Invoice.practiceId == pid))
        s.execute(delete(Appeal).where(Appeal.id == appeal_id))
        s.execute(delete(Denial).where(Denial.id == denial_id))
        s.execute(delete(Claim).where(Claim.id == claim_id))
        s.execute(delete(Patient).where(Patient.id == patient_id))
        s.execute(delete(AuditEvent).where(AuditEvent.practiceId == pid))
        s.execute(delete(Notification).where(Notification.practiceId == pid))
        s.execute(delete(Payer).where(Payer.id == payer_id))
        s.execute(delete(Practice).where(Practice.id == pid))
        s.commit()


def test_full_pay_records_won_outcome_and_invoice_line(session_factory, fixtures):
    from overturn_worker.models import Appeal, InvoiceLineItem
    from overturn_worker.outcomes import ingest_era_outcomes
    from sqlalchemy import select

    era = (
        f"CLP*{fixtures['control_number']}*1*500.00*500.00*0.00*MC*XYZ*11*1*CO~"
        f"CAS*CO*0*0.00~"
    )
    updates = ingest_era_outcomes(era)
    assert len(updates) == 1
    u = updates[0]
    assert u.outcome == "WON"
    assert abs(u.recovered_amount - 500.0) < 0.001
    assert u.fee_cents == 12500  # 25% of $500 = $125 = 12500 cents

    with session_factory() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == fixtures["appeal_id"]))
        assert a.outcome == "WON"
        assert a.recoveredAmount == Decimal("500.00")
        assert a.ourFee == Decimal("125.00")
        line = s.scalar(
            select(InvoiceLineItem).where(InvoiceLineItem.appealId == fixtures["appeal_id"])
        )
        assert line is not None
        assert line.feeCents == 12500


def test_partial_pay_records_partial_outcome(session_factory, fixtures):
    from overturn_worker.models import Appeal
    from overturn_worker.outcomes import ingest_era_outcomes
    from sqlalchemy import select

    # paid 200 of 500 = PARTIAL
    era = f"CLP*{fixtures['control_number']}*2*500.00*200.00*0.00*MC*XYZ*11*1*CO~"
    updates = ingest_era_outcomes(era)
    assert len(updates) == 1
    assert updates[0].outcome == "PARTIAL"
    assert updates[0].fee_cents == 5000  # 25% of $200 = $50 = 5000 cents

    with session_factory() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == fixtures["appeal_id"]))
        assert a.outcome == "PARTIAL"


def test_zero_pay_records_lost_no_invoice(session_factory, fixtures):
    from overturn_worker.models import Appeal, InvoiceLineItem
    from overturn_worker.outcomes import ingest_era_outcomes
    from sqlalchemy import select

    # paid 0 = LOST
    era = (
        f"CLP*{fixtures['control_number']}*4*500.00*0.00*0.00*MC*XYZ*11*1*CO~"
        f"CAS*CO*50*500.00~"
    )
    updates = ingest_era_outcomes(era)
    assert len(updates) == 1
    assert updates[0].outcome == "LOST"
    assert updates[0].fee_cents == 0

    with session_factory() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == fixtures["appeal_id"]))
        assert a.outcome == "LOST"
        assert a.recoveredAmount == Decimal("0")
        line = s.scalar(
            select(InvoiceLineItem).where(InvoiceLineItem.appealId == fixtures["appeal_id"])
        )
        assert line is None


def test_ingest_is_idempotent(session_factory, fixtures):
    """A second ingest with the same ERA must NOT create a second invoice line."""
    from overturn_worker.models import Invoice, InvoiceLineItem
    from overturn_worker.outcomes import ingest_era_outcomes
    from sqlalchemy import select

    era = f"CLP*{fixtures['control_number']}*1*500.00*500.00*0.00*MC*XYZ*11*1*CO~"
    ingest_era_outcomes(era)
    # Second ingest — should leave invoice unchanged.
    second = ingest_era_outcomes(era)
    # On the second pass the appeal is already WON so outcome flip won't
    # happen, but more importantly there should still be exactly one line.
    with session_factory() as s:
        lines = s.execute(
            select(InvoiceLineItem).where(InvoiceLineItem.appealId == fixtures["appeal_id"])
        ).scalars().all()
        assert len(lines) == 1


def test_unknown_control_number_is_skipped(session_factory):
    """An ERA with a control number we've never seen must not error."""
    from overturn_worker.outcomes import ingest_era_outcomes

    era = "CLP*NEVER-SEEN-12345*1*100.00*100.00*0.00*MC*XYZ*11*1*CO~"
    updates = ingest_era_outcomes(era)
    assert updates == []
