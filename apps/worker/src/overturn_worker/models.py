"""SQLAlchemy models — same physical schema as `packages/db/prisma/schema.prisma`.

Prisma owns the migrations; we just bind to the existing tables. Column
names match Prisma's `@@map` defaults (camelCase fields, PascalCase tables).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    create_engine,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, relationship
import enum

from .config import SETTINGS


# Prisma generates postgres URLs without the +psycopg driver hint; normalize.
def _engine_url() -> str:
    url = SETTINGS.database_url
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
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
    status: Mapped[str] = mapped_column(String)
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
    receivedAt: Mapped[datetime] = mapped_column(DateTime)
    claim: Mapped[Claim] = relationship(Claim, lazy="joined", foreign_keys=[claimId])


class Appeal(Base):
    __tablename__ = "Appeal"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    denialId: Mapped[str] = mapped_column(String, ForeignKey("Denial.id"))
    draftLetter: Mapped[str] = mapped_column(Text)
    templateUsed: Mapped[str] = mapped_column(String)
    citations: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String)  # Database has enum constraint
    submittedVia: Mapped[str | None] = mapped_column(String, nullable=True)
    submittedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    outcome: Mapped[str] = mapped_column(String)
    recoveredAmount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    ourFee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    agentRunId: Mapped[str | None] = mapped_column(String, ForeignKey("AgentRun.id"), nullable=True)
    humanReviewId: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime)
    denial: Mapped[Denial] = relationship(Denial, lazy="joined", foreign_keys=[denialId])


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
