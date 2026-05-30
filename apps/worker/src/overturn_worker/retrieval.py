"""Policy retrieval — RAG.

Production: pgvector cosine-similarity over `PayerPolicy.embedding`.
Fallback: keyword + denial_code match, which is what runs in dev and
covers the seeded BCBS dataset perfectly well.
"""

from __future__ import annotations

from sqlalchemy import or_, select

from .models import PayerPolicy, SessionLocal


def retrieve_policies(payer_id: str, denial_code: str, top_k: int = 8) -> list[PayerPolicy]:
    """Return the top-k policies most likely to be relevant to this denial.

    Order:
      1. Policies with an exact `denialCode` match
      2. The appeal-format template for this payer (always include)
      3. Other policies for this payer (capped)
    """
    with SessionLocal() as s:
        exact = s.scalars(
            select(PayerPolicy).where(
                PayerPolicy.payerId == payer_id,
                PayerPolicy.denialCode == denial_code,
            )
        ).all()

        appeal_fmt = s.scalars(
            select(PayerPolicy).where(
                PayerPolicy.payerId == payer_id,
                PayerPolicy.policyType == "appeal_format",
            )
        ).all()

        rest = s.scalars(
            select(PayerPolicy)
            .where(
                PayerPolicy.payerId == payer_id,
                or_(
                    PayerPolicy.denialCode != denial_code,
                    PayerPolicy.denialCode.is_(None),
                ),
                PayerPolicy.policyType != "appeal_format",
            )
            .limit(top_k)
        ).all()

    # Dedupe while preserving order.
    seen: set[str] = set()
    out: list[PayerPolicy] = []
    for p in [*exact, *appeal_fmt, *rest]:
        if p.id not in seen:
            seen.add(p.id)
            out.append(p)
        if len(out) >= top_k:
            break
    return out
