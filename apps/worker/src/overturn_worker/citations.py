"""Deterministic citation verifier — Python mirror of `packages/shared/src/citations.ts`.

Both implementations follow the same normalization rules so a draft produced
on the worker matches a draft uploaded via web. Tests cross-check the two
behaviors on identical fixtures.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_MIN_QUOTE_CHARS = 20

_CURLY_SINGLES = "‘’‚‛′"
_CURLY_DOUBLES = "“”„‟″"
_DASHES = "–—−"


def normalize(s: str) -> str:
    s = re.sub(f"[{_CURLY_SINGLES}]", "'", s)
    s = re.sub(f"[{_CURLY_DOUBLES}]", '"', s)
    s = re.sub(f"[{_DASHES}]", "-", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


@dataclass
class Citation:
    policy_id: str
    quote: str
    source_url: str | None = None
    page: str | int | None = None


@dataclass
class InvalidCitation:
    citation: Citation
    reason: str


@dataclass
class Verification:
    all_valid: bool
    valid_count: int
    invalid_citations: list[InvalidCitation]


@dataclass
class PolicyDoc:
    id: str
    body: str


def verify_citations(citations: list[Citation], policies: list[PolicyDoc]) -> Verification:
    by_id = {p.id: normalize(p.body) for p in policies}
    invalid: list[InvalidCitation] = []
    valid_count = 0

    for c in citations:
        body = by_id.get(c.policy_id)
        if body is None:
            invalid.append(
                InvalidCitation(c, f"policy {c.policy_id} not in retrieval set")
            )
            continue
        q = normalize(c.quote)
        if len(q) < _MIN_QUOTE_CHARS:
            invalid.append(
                InvalidCitation(
                    c,
                    f"quote too short (<{_MIN_QUOTE_CHARS} chars) — not specific enough",
                )
            )
            continue
        if q not in body:
            invalid.append(InvalidCitation(c, "quote not found verbatim in cited policy"))
            continue
        valid_count += 1

    return Verification(
        all_valid=len(invalid) == 0,
        valid_count=valid_count,
        invalid_citations=invalid,
    )
