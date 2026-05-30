"""Citation verifier — mirror of the TS unit tests in
`packages/shared/src/citations.test.ts`. The two implementations must agree."""

from __future__ import annotations

from overturn_worker.citations import Citation, PolicyDoc, normalize, verify_citations


POLICY = PolicyDoc(
    id="pol-1",
    body=(
        "Blue Cross Blue Shield Medical Policy MP-2024-50.\n\n"
        "Section 3.1 — Medical Necessity Criteria. Outpatient psychotherapy is "
        "considered medically necessary when the member has a documented DSM-5 "
        "diagnosis and symptoms produce significant functional impairment."
    ),
)


def test_accepts_exact_quote():
    r = verify_citations(
        [
            Citation(
                "pol-1",
                "Outpatient psychotherapy is considered medically necessary when the member has a documented DSM-5 diagnosis",
            )
        ],
        [POLICY],
    )
    assert r.all_valid
    assert r.valid_count == 1


def test_accepts_curly_and_dash_variance():
    r = verify_citations(
        [
            Citation(
                "pol-1",
                "Section 3.1 — Medical Necessity Criteria. Outpatient psychotherapy is considered medically necessary",
            )
        ],
        [POLICY],
    )
    assert r.all_valid


def test_rejects_hallucinated_quote():
    r = verify_citations(
        [
            Citation(
                "pol-1",
                "All outpatient services are automatically approved without documentation.",
            )
        ],
        [POLICY],
    )
    assert not r.all_valid
    assert "not found" in r.invalid_citations[0].reason


def test_rejects_missing_policy():
    r = verify_citations(
        [Citation("pol-MISSING", "anything anything anything anything anything")],
        [POLICY],
    )
    assert not r.all_valid
    assert "not in retrieval set" in r.invalid_citations[0].reason


def test_rejects_short_quote():
    r = verify_citations([Citation("pol-1", "DSM-5")], [POLICY])
    assert not r.all_valid
    assert "too short" in r.invalid_citations[0].reason


def test_normalize_collapses_whitespace():
    assert normalize("a\n\nb   c") == "a b c"
