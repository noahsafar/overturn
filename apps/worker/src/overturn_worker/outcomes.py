"""Outcome ingestion — match incoming ERAs back to open appeals.

When a payer's follow-up 835 arrives, we need to flip the corresponding
Appeal's outcome (WON / PARTIAL / LOST) and roll its recovered amount into
the practice's current-period invoice. This module is the heart of the
money loop: until an outcome is recorded, nothing gets invoiced.

Idempotency rules:
- Each Appeal can be invoiced at most once. The InvoiceLineItem.appealId
  is unique, so a duplicate ingest cannot double-bill.
- An Appeal whose outcome is no longer PENDING is left untouched. Outcome
  can only progress PENDING → terminal.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from .era_parser import EraClaim, parse
from .models import Appeal, Claim, Invoice, InvoiceLineItem, Practice, SessionLocal

logger = logging.getLogger(__name__)


@dataclass
class OutcomeUpdate:
    appeal_id: str
    claim_control_number: str
    outcome: str  # WON | PARTIAL | LOST
    recovered_amount: float
    fee_cents: int
    invoice_id: str


def _cuid() -> str:
    return "cm" + uuid.uuid4().hex[:22]


def _classify_outcome(paid: float, billed: float, denied: float) -> str:
    """Decide WON / PARTIAL / LOST from an 835 line.

    Rules (defensive — payers vary):
      paid >= (billed - denied) and paid > 0       → WON
      0 < paid < (billed - denied)                 → PARTIAL
      paid == 0                                    → LOST
    """
    if paid <= 0:
        return "LOST"
    expected = max(billed - denied, 0.0)
    # 1-cent tolerance handles float rounding from EDI numerics.
    if paid + 0.01 >= expected:
        return "WON"
    return "PARTIAL"


def _period_for(now: datetime) -> tuple[datetime, datetime]:
    """Return (periodStart, periodEnd) for the calendar month containing `now`."""
    start = datetime(now.year, now.month, 1, tzinfo=now.tzinfo)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1, tzinfo=now.tzinfo)
    else:
        end = datetime(now.year, now.month + 1, 1, tzinfo=now.tzinfo)
    return start, end


def _get_or_create_open_invoice(session, practice: Practice, now: datetime) -> Invoice:
    """Return the practice's current-period DRAFT invoice, creating one if absent."""
    start, end = _period_for(now)
    existing = session.scalar(
        select(Invoice).where(
            Invoice.practiceId == practice.id,
            Invoice.periodStart == start,
            Invoice.periodEnd == end,
        )
    )
    if existing is not None:
        return existing

    inv = Invoice(
        id=_cuid(),
        practiceId=practice.id,
        periodStart=start,
        periodEnd=end,
        status="DRAFT",
        totalCents=0,
        stripeInvoiceId=None,
        stripeHostedUrl=None,
        createdAt=now,
        issuedAt=None,
        paidAt=None,
    )
    session.add(inv)
    session.flush()
    return inv


def _record_outcome_for_claim(session, era_claim: EraClaim, now: datetime) -> OutcomeUpdate | None:
    """Apply a single ERA claim's outcome to its Appeal + invoice. Returns None
    if no matching open appeal exists."""
    if not era_claim.control_number:
        return None

    claim = session.scalar(
        select(Claim).where(Claim.controlNumber == era_claim.control_number)
    )
    if claim is None:
        return None

    appeals = (
        session.execute(
            select(Appeal)
            .join(Appeal.denial)
            .where(Appeal.denial.has(claimId=claim.id))
            .order_by(Appeal.createdAt.desc())
        )
        .scalars()
        .all()
    )
    appeal = next((a for a in appeals if a.outcome == "PENDING"), None)
    if appeal is None:
        # Could be SUBMITTED but PENDING outcome; check that too. Many of our
        # rows have outcome PENDING and submittedAt set.
        appeal = next((a for a in appeals if a.outcome in ("PENDING", "SUBMITTED")), None)
    if appeal is None:
        return None

    practice = session.scalar(select(Practice).where(Practice.id == claim.practiceId))
    if practice is None:
        logger.warning("claim %s practice %s missing", claim.id, claim.practiceId)
        return None

    outcome = _classify_outcome(era_claim.paid, era_claim.billed, era_claim.denied)
    recovered = Decimal(str(era_claim.paid)) if outcome != "LOST" else Decimal("0")
    fee_bps = practice.recoveryFeeBps or 2500
    # recovered is in dollars; bps is /10_000. fee in cents = recovered * bps / 100.
    fee_cents = int((recovered * Decimal(fee_bps) / Decimal(100)).quantize(Decimal("1")))

    # Update the appeal
    appeal.outcome = outcome
    appeal.recoveredAmount = recovered
    appeal.ourFee = Decimal(fee_cents) / Decimal(100)
    appeal.outcomeRecordedAt = now

    # If WON or PARTIAL, add an invoice line item (skipped for LOST).
    invoice_id = ""
    if outcome in ("WON", "PARTIAL") and recovered > 0:
        invoice = _get_or_create_open_invoice(session, practice, now)
        invoice_id = invoice.id

        # Idempotency: appealId is unique on InvoiceLineItem, so a second
        # ingest of the same ERA won't double-charge.
        existing_line = session.scalar(
            select(InvoiceLineItem).where(InvoiceLineItem.appealId == appeal.id)
        )
        if existing_line is None:
            line = InvoiceLineItem(
                id=_cuid(),
                invoiceId=invoice.id,
                appealId=appeal.id,
                description=(
                    f"Recovered appeal — claim {era_claim.control_number} "
                    f"({outcome.lower()}, ${recovered:.2f})"
                ),
                recoveredAmount=recovered,
                feeCents=fee_cents,
                createdAt=now,
            )
            session.add(line)
            invoice.totalCents = (invoice.totalCents or 0) + fee_cents

    # Also flip the claim status to reflect recovery.
    claim.status = "PAID" if outcome == "WON" else "PARTIALLY_PAID" if outcome == "PARTIAL" else "DENIED"

    return OutcomeUpdate(
        appeal_id=appeal.id,
        claim_control_number=era_claim.control_number,
        outcome=outcome,
        recovered_amount=float(recovered),
        fee_cents=fee_cents,
        invoice_id=invoice_id,
    )


def ingest_era_outcomes(era_text: str) -> list[OutcomeUpdate]:
    """Parse an ERA and apply any outcomes to existing open appeals.

    Returns the list of OutcomeUpdates produced. Claims with no matching open
    appeal are silently skipped (the upload flow handles new-denial creation
    separately).
    """
    claims = parse(era_text)
    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)  # SQLAlchemy naive UTC

    updates: list[OutcomeUpdate] = []
    with SessionLocal() as session:
        for era_claim in claims:
            try:
                update = _record_outcome_for_claim(session, era_claim, now)
                if update is not None:
                    updates.append(update)
            except Exception as e:
                logger.exception("failed to record outcome for claim %s: %s",
                                 era_claim.control_number, e)
        session.commit()

    # Fire notifications after commit — outside the transaction so failures
    # here can't roll back the outcome recording.
    if updates:
        try:
            from .web_client import notify_appeal_outcome

            for u in updates:
                notify_appeal_outcome(u.appeal_id)
        except Exception as e:  # noqa: BLE001
            logger.warning("outcome notify failed: %s", e)
    return updates
