"""SQLAlchemy models — same physical schema as `packages/db/prisma/schema.prisma`.

Prisma owns the migrations; we just bind to the existing tables. Column
names match Prisma's `@@map` defaults (camelCase fields, PascalCase tables).
"""

from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    create_engine,
)
from sqlalchemy.dialects.postgresql import ARRAY, ENUM as PG_ENUM, JSONB

# Bind to the Postgres enum types Prisma already created. create_type=False
# tells SQLAlchemy not to issue CREATE TYPE — the migration owns them.
ClaimStatusPgEnum = PG_ENUM(
    "SUBMITTED", "PAID", "DENIED", "APPEALED", "PARTIALLY_PAID", "WRITE_OFF",
    name="ClaimStatus", create_type=False,
)
UserRolePgEnum = PG_ENUM(
    "OWNER", "ADMIN", "STAFF", name="UserRole", create_type=False,
)
ReviewDecisionPgEnum = PG_ENUM(
    "APPROVED", "REJECTED", "EDITED_AND_APPROVED",
    name="ReviewDecision", create_type=False,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import SETTINGS


# Prisma generates postgres URLs without the +psycopg driver hint; normalize.
# Also handles Heroku's legacy `postgres://` form, which SQLAlchemy refuses
# to load directly.
def _engine_url() -> str:
    url = SETTINGS.database_url
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    elif url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    return url


# Lazy-init the engine so importing the models module doesn't require a
# postgres driver at import time. This matters for unit tests that exercise
# activities without touching the DB.
_engine = None
_SessionFactory = None


def _ensure() -> None:
    global _engine, _SessionFactory
    if _engine is None:
        _engine = create_engine(_engine_url(), pool_pre_ping=True, future=True)
        _SessionFactory = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)


class _LazySession:
    def __call__(self):
        _ensure()
        return _SessionFactory()  # type: ignore[misc]


SessionLocal = _LazySession()


def get_engine():
    _ensure()
    return _engine


class Base(DeclarativeBase):
    pass


# Enums matching Prisma schema
class AppealStatusEnum(enum.Enum):
    PENDING = "PENDING"
    LOADING_CONTEXT = "LOADING_CONTEXT"
    RETRIEVING_POLICIES = "RETRIEVING_POLICIES"
    STRATEGIZING = "STRATEGIZING"
    DRAFTING = "DRAFTING"
    VERIFYING_CITATIONS = "VERIFYING_CITATIONS"
    REWRITING = "REWRITING"
    READY = "READY"
    FAILED = "FAILED"


class Practice(Base):
    __tablename__ = "Practice"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    npi: Mapped[str] = mapped_column(String, unique=True)
    taxId: Mapped[str] = mapped_column(String)
    specialty: Mapped[str] = mapped_column(String)
    billingEmail: Mapped[str | None] = mapped_column(String, nullable=True)
    stripeCustomerId: Mapped[str | None] = mapped_column(String, nullable=True)
    recoveryFeeBps: Mapped[int] = mapped_column(Integer)
    onboardingCompletedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    clearinghouseSftpHost: Mapped[str | None] = mapped_column(String, nullable=True)
    clearinghouseSftpUser: Mapped[str | None] = mapped_column(String, nullable=True)
    clearinghouseSftpPathEnc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    clearinghouseEnabled: Mapped[bool] = mapped_column(Boolean, default=False)
    clearinghouseLastPolledAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    clearinghouseLastSuccessAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    clearinghouseLastError: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime)


class Payer(Base):
    __tablename__ = "Payer"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    payerIdNumbers: Mapped[list[str]] = mapped_column(ARRAY(String))
    portalUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    ivrPhone: Mapped[str | None] = mapped_column(String, nullable=True)
    faxNumber: Mapped[str | None] = mapped_column(String, nullable=True)
    appealAddress: Mapped[str | None] = mapped_column(String, nullable=True)
    epaSupported: Mapped[bool] = mapped_column(Boolean)
    appealWindowDays: Mapped[int | None] = mapped_column(Integer, nullable=True)


class PayerPolicy(Base):
    __tablename__ = "PayerPolicy"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    payerId: Mapped[str] = mapped_column(String, ForeignKey("Payer.id"))
    policyType: Mapped[str] = mapped_column(String)
    denialCode: Mapped[str | None] = mapped_column(String, nullable=True)
    effectiveDate: Mapped[datetime] = mapped_column(DateTime)
    body: Mapped[str] = mapped_column(Text)
    sourceUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    scrapedAt: Mapped[datetime] = mapped_column(DateTime)


class PayerCredential(Base):
    __tablename__ = "PayerCredential"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    practiceId: Mapped[str] = mapped_column(String, ForeignKey("Practice.id"))
    payerId: Mapped[str] = mapped_column(String, ForeignKey("Payer.id"))
    credentialType: Mapped[str] = mapped_column(String)
    usernameEnc: Mapped[bytes] = mapped_column(LargeBinary)
    passwordEnc: Mapped[bytes] = mapped_column(LargeBinary)
    mfaSecretEnc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    configJson: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime)
    rotatedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Patient(Base):
    __tablename__ = "Patient"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    practiceId: Mapped[str] = mapped_column(String, ForeignKey("Practice.id"))
    externalId: Mapped[str] = mapped_column(String)
    firstNameEnc: Mapped[bytes] = mapped_column(LargeBinary)
    lastNameEnc: Mapped[bytes] = mapped_column(LargeBinary)
    dobEnc: Mapped[bytes] = mapped_column(LargeBinary)
    memberIdEnc: Mapped[bytes] = mapped_column(LargeBinary)
    insurancePayerId: Mapped[str | None] = mapped_column(
        String, ForeignKey("Payer.id"), nullable=True
    )
    deletedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Claim(Base):
    __tablename__ = "Claim"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    practiceId: Mapped[str] = mapped_column(String, ForeignKey("Practice.id"))
    patientId: Mapped[str] = mapped_column(String, ForeignKey("Patient.id"))
    payerId: Mapped[str] = mapped_column(String, ForeignKey("Payer.id"))
    serviceDate: Mapped[datetime] = mapped_column(DateTime)
    cptCodes: Mapped[list[str]] = mapped_column(ARRAY(String))
    icdCodes: Mapped[list[str]] = mapped_column(ARRAY(String))
    billedAmount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    controlNumber: Mapped[str | None] = mapped_column(String, nullable=True)
    renderingProvider: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(ClaimStatusPgEnum)
    submittedAt: Mapped[datetime] = mapped_column(DateTime)
    patient: Mapped[Patient] = relationship(Patient, lazy="joined", foreign_keys=[patientId])
    payer: Mapped[Payer] = relationship(Payer, lazy="joined", foreign_keys=[payerId])
    practice: Mapped[Practice] = relationship(Practice, lazy="joined", foreign_keys=[practiceId])


class Denial(Base):
    __tablename__ = "Denial"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    claimId: Mapped[str] = mapped_column(String, ForeignKey("Claim.id"))
    denialCode: Mapped[str] = mapped_column(String)
    denialReason: Mapped[str] = mapped_column(Text)
    deniedAmount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    eraRawText: Mapped[str] = mapped_column(Text)
    serviceCpt: Mapped[str | None] = mapped_column(String, nullable=True)
    receivedAt: Mapped[datetime] = mapped_column(DateTime)
    chartExcerptsText: Mapped[str | None] = mapped_column(Text, nullable=True)
    filingDeadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    predictedWinProb: Mapped[float | None] = mapped_column(nullable=True)
    priorityScore: Mapped[float | None] = mapped_column(nullable=True)
    priorityTier: Mapped[str | None] = mapped_column(String, nullable=True)
    scoreExplain: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    claim: Mapped[Claim] = relationship(Claim, lazy="joined", foreign_keys=[claimId])


class Appeal(Base):
    __tablename__ = "Appeal"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    denialId: Mapped[str] = mapped_column(String, ForeignKey("Denial.id"))
    draftLetter: Mapped[str] = mapped_column(Text)
    templateUsed: Mapped[str] = mapped_column(String)
    citations: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String)
    submittedVia: Mapped[str | None] = mapped_column(String, nullable=True)
    submittedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    outcome: Mapped[str] = mapped_column(String)
    recoveredAmount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    ourFee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    outcomeRecordedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confidenceScore: Mapped[float | None] = mapped_column(nullable=True)
    agentRunId: Mapped[str | None] = mapped_column(String, ForeignKey("AgentRun.id"), nullable=True)
    humanReviewId: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime)
    denial: Mapped[Denial] = relationship(Denial, lazy="joined", foreign_keys=[denialId])


class Submission(Base):
    __tablename__ = "Submission"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    appealId: Mapped[str] = mapped_column(String, ForeignKey("Appeal.id"))
    channel: Mapped[str] = mapped_column(String)
    attemptNumber: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String)
    confirmationNumber: Mapped[str | None] = mapped_column(String, nullable=True)
    providerRef: Mapped[str | None] = mapped_column(String, nullable=True)
    errorMessage: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshots: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    idempotencyKey: Mapped[str] = mapped_column(String, unique=True)
    startedAt: Mapped[datetime] = mapped_column(DateTime)
    completedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AgentRun(Base):
    __tablename__ = "AgentRun"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workflowType: Mapped[str] = mapped_column(String)
    resourceId: Mapped[str] = mapped_column(String)
    agentType: Mapped[str] = mapped_column(String)
    startedAt: Mapped[datetime] = mapped_column(DateTime)
    completedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String)
    confidenceScore: Mapped[float | None] = mapped_column(nullable=True)
    costCents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    errorMessage: Mapped[str | None] = mapped_column(Text, nullable=True)
    auditTrail: Mapped[dict] = mapped_column(JSONB)


class FollowUpCheck(Base):
    __tablename__ = "FollowUpCheck"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    appealId: Mapped[str] = mapped_column(String, ForeignKey("Appeal.id"))
    practiceId: Mapped[str] = mapped_column(String, ForeignKey("Practice.id"))
    scheduledFor: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String)
    outcome: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime)
    completedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Invoice(Base):
    __tablename__ = "Invoice"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    practiceId: Mapped[str] = mapped_column(String, ForeignKey("Practice.id"))
    periodStart: Mapped[datetime] = mapped_column(DateTime)
    periodEnd: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String)
    totalCents: Mapped[int] = mapped_column(Integer)
    stripeInvoiceId: Mapped[str | None] = mapped_column(String, nullable=True)
    stripeHostedUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime)
    issuedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paidAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class InvoiceLineItem(Base):
    __tablename__ = "InvoiceLineItem"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    invoiceId: Mapped[str] = mapped_column(String, ForeignKey("Invoice.id"))
    appealId: Mapped[str] = mapped_column(String, ForeignKey("Appeal.id"), unique=True)
    description: Mapped[str] = mapped_column(String)
    recoveredAmount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    feeCents: Mapped[int] = mapped_column(Integer)
    createdAt: Mapped[datetime] = mapped_column(DateTime)


class AuditEvent(Base):
    __tablename__ = "AuditEvent"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    practiceId: Mapped[str] = mapped_column(String, ForeignKey("Practice.id"))
    userId: Mapped[str | None] = mapped_column(String, ForeignKey("User.id"), nullable=True)
    action: Mapped[str] = mapped_column(String)
    resourceType: Mapped[str] = mapped_column(String)
    resourceId: Mapped[str | None] = mapped_column(String, nullable=True)
    ipAddress: Mapped[str | None] = mapped_column(String, nullable=True)
    userAgent: Mapped[str | None] = mapped_column(String, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime)


class Notification(Base):
    __tablename__ = "Notification"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    practiceId: Mapped[str] = mapped_column(String, ForeignKey("Practice.id"))
    channel: Mapped[str] = mapped_column(String)
    template: Mapped[str] = mapped_column(String)
    recipient: Mapped[str] = mapped_column(String)
    subject: Mapped[str | None] = mapped_column(String, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String)
    providerRef: Mapped[str | None] = mapped_column(String, nullable=True)
    errorMessage: Mapped[str | None] = mapped_column(String, nullable=True)
    sentAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime)
