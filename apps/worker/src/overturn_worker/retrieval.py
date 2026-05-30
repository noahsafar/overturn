"""Policy retrieval — RAG.

Hybrid retrieval:
  1. Exact denialCode match (strongest signal).
  2. The appeal-format template (always include — required for letter shape).
  3. pgvector cosine-similarity over PayerPolicy.embedding for semantic fill-in.
  4. Keyword fallback when embeddings aren't populated yet.
"""

from __future__ import annotations

import logging

from sqlalchemy import or_, select, text

from .embeddings import get_embedding
from .models import PayerPolicy, SessionLocal

logger = logging.getLogger(__name__)


def retrieve_policies(payer_id: str, denial_code: str, top_k: int = 8) -> list[PayerPolicy]:
    """Return the top-k most relevant payer policies."""
    with SessionLocal() as s:
        # 1. Exact denial-code match
        exact = list(
            s.scalars(
                select(PayerPolicy).where(
                    PayerPolicy.payerId == payer_id,
                    PayerPolicy.denialCode == denial_code,
                )
            ).all()
        )

        # 2. Appeal-format template (always include — load-bearing for letter shape)
        appeal_fmt = list(
            s.scalars(
                select(PayerPolicy).where(
                    PayerPolicy.payerId == payer_id,
                    PayerPolicy.policyType == "appeal_format",
                )
            ).all()
        )

        seen: set[str] = set()
        out: list[PayerPolicy] = []
        for p in [*exact, *appeal_fmt]:
            if p.id not in seen:
                seen.add(p.id)
                out.append(p)

        if len(out) >= top_k:
            return out[:top_k]

        # 3. Semantic vector fallback
        try:
            query_vec = get_embedding(f"denial code {denial_code}")
            vec_literal = "[" + ",".join(f"{x:.7f}" for x in query_vec) + "]"
            rows = s.execute(
                text(
                    """
                    SELECT id FROM "PayerPolicy"
                    WHERE "payerId" = :payer_id
                      AND embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:vec AS vector)
                    LIMIT :limit
                    """
                ),
                {"payer_id": payer_id, "vec": vec_literal, "limit": top_k * 2},
            ).all()
            for (pid,) in rows:
                if pid in seen:
                    continue
                p = s.get(PayerPolicy, pid)
                if p is None:
                    continue
                seen.add(pid)
                out.append(p)
                if len(out) >= top_k:
                    break
        except Exception as e:  # noqa: BLE001
            logger.warning("vector retrieval failed, using keyword fallback: %s", e)

        # 4. Keyword fallback
        if len(out) < top_k:
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
            for p in rest:
                if p.id in seen:
                    continue
                seen.add(p.id)
                out.append(p)
                if len(out) >= top_k:
                    break

    return out[:top_k]


def backfill_embeddings(payer_id: str | None = None) -> int:
    """Compute + persist embeddings for every PayerPolicy lacking one.

    Pass `payer_id` to limit scope. Returns the count of rows updated.
    Idempotent — re-running only touches rows that are still NULL.
    """
    with SessionLocal() as s:
        if payer_id:
            rows = s.execute(
                text(
                    'SELECT id, body FROM "PayerPolicy" '
                    "WHERE embedding IS NULL AND \"payerId\" = :pid"
                ),
                {"pid": payer_id},
            ).all()
        else:
            rows = s.execute(
                text('SELECT id, body FROM "PayerPolicy" WHERE embedding IS NULL')
            ).all()
        updated = 0
        for pid, body in rows:
            try:
                vec = get_embedding(body)
                vec_literal = "[" + ",".join(f"{x:.7f}" for x in vec) + "]"
                s.execute(
                    text(
                        'UPDATE "PayerPolicy" SET embedding = CAST(:vec AS vector) '
                        "WHERE id = :id"
                    ),
                    {"vec": vec_literal, "id": pid},
                )
                updated += 1
            except Exception as e:  # noqa: BLE001
                logger.warning("embed failed for policy %s: %s", pid, e)
        s.commit()
    return updated
