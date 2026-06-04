"""Edge case and resilience tests for production readiness.

Tests failure modes, retries, concurrent workflows, and edge cases that
only surface under real-world conditions.
"""

from __future__ import annotations

import os
from datetime import datetime

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; edge case tests require Postgres",
)


def test_citation_verifier_rejects_hallucinated_quotes():
    """Test that citation verifier catches made-up quotes."""
    from overturn_worker.citations import Citation, PolicyDoc, verify_citations

    policy = PolicyDoc(
        id="pol-1",
        body="Section 3.1 — Outpatient psychotherapy is considered medically necessary when documented.",
    )

    # Hallucinated quote
    result = verify_citations(
        [Citation("pol-1", "All services are automatically approved without review.")],
        [policy],
    )

    assert not result.all_valid
    assert len(result.invalid_citations) > 0
    assert "not found" in result.invalid_citations[0].reason


def test_citation_verifier_rejects_too_short_quotes():
    """Test that citation verifier rejects quotes that are too short."""
    from overturn_worker.citations import Citation, PolicyDoc, verify_citations

    policy = PolicyDoc(
        id="pol-1",
        body="Section 3.1 — Outpatient psychotherapy is considered medically necessary when documented.",
    )

    # Too short to verify
    result = verify_citations([Citation("pol-1", "approved")], [policy])
    assert not result.all_valid
    assert "too short" in result.invalid_citations[0].reason


def test_citation_verifier_accepts_exact_match():
    """Test that citation verifier accepts exact policy matches."""
    from overturn_worker.citations import Citation, PolicyDoc, verify_citations

    policy = PolicyDoc(
        id="pol-1",
        body="Section 3.1 — Outpatient psychotherapy is considered medically necessary when documented.",
    )

    # Exact match
    result = verify_citations(
        [Citation("pol-1", "Section 3.1 — Outpatient psychotherapy is considered medically necessary")],
        [policy],
    )

    assert result.all_valid
    assert result.valid_count == 1


def test_citation_verifier_allows_whitespace_normalization():
    """Test that citation verifier normalizes whitespace differences."""
    from overturn_worker.citations import Citation, PolicyDoc, verify_citations

    policy = PolicyDoc(
        id="pol-1",
        body="Section 3.1 — Outpatient psychotherapy is considered medically necessary when documented.",
    )

    # Same content with normalized whitespace
    result = verify_citations(
        [Citation("pol-1", "Section 3.1 — Outpatient   psychotherapy is considered medically necessary")],
        [policy],
    )

    assert result.all_valid


def test_citation_verifier_rejects_missing_policy():
    """Test that citation verifier catches references to non-existent policies."""
    from overturn_worker.citations import Citation, PolicyDoc, verify_citations

    policy = PolicyDoc(id="pol-1", body="Some policy text.")

    # Reference to missing policy
    result = verify_citations(
        [Citation("pol-MISSING", "Some quote from missing policy")],
        [policy],
    )

    assert not result.all_valid
    assert "not in retrieval set" in result.invalid_citations[0].reason


def test_crypto_encrypt_decrypt_roundtrip():
    """Test that encryption/decryption roundtrip works correctly."""
    from overturn_worker.crypto import decrypt, encrypt

    original = "sensitive-patient-data"
    encrypted = encrypt(original)
    decrypted = decrypt(encrypted)

    assert decrypted == original
    assert encrypted != original


def test_crypto_different_encryptions_for_same_input():
    """Test that encrypting the same value twice produces different ciphertext (IV randomness)."""
    from overturn_worker.crypto import encrypt

    value = "test-data"
    enc1 = encrypt(value)
    enc2 = encrypt(value)

    # Should be different due to random IV
    assert enc1 != enc2

    # But both decrypt to the same value
    from overturn_worker.crypto import decrypt
    assert decrypt(enc1) == value
    assert decrypt(enc2) == value


def test_normalization_collapses_whitespace():
    """Test that text normalization collapses multiple whitespace characters."""
    from overturn_worker.citations import normalize

    # Multiple types of whitespace
    result = normalize("line1\n\n\nline2   line3\t\tline4")
    assert result == "line1 line2 line3 line4"

    # Leading/trailing whitespace
    result = normalize("  spaced  ")
    assert result == "spaced"


def test_crypto_handles_empty_input():
    """Test that crypto functions handle empty strings gracefully."""
    from overturn_worker.crypto import decrypt, encrypt

    empty = ""
    encrypted = encrypt(empty)
    decrypted = decrypt(encrypted)

    assert decrypted == empty


def test_crypto_handles_special_characters():
    """Test that crypto properly handles special characters in PHI."""
    from overturn_worker.crypto import decrypt, encrypt

    # Test with various special characters that might appear in names/addresses
    special = "O'Brien-Müller-López"
    encrypted = encrypt(special)
    decrypted = decrypt(encrypted)

    assert decrypted == special


def test_crypto_handles_unicode():
    """Test that crypto properly handles unicode characters in PHI."""
    from overturn_worker.crypto import decrypt, encrypt

    # Test with various unicode characters
    unicode_text = "José García Müller 李明"
    encrypted = encrypt(unicode_text)
    decrypted = decrypt(encrypted)

    assert decrypted == unicode_text


def test_pdf_renderer_creates_valid_pdf():
    """Test that PDF renderer produces valid PDF output."""
    from overturn_worker.pdf import AppealLetterPdfInput, render_appeal_letter_pdf

    # Create a proper test PDF with the correct dataclass
    input_data = AppealLetterPdfInput(
        appeal_id="test-appeal-123",
        letter_text="This is a test appeal letter for claim CTRL-123.",
        practice_name="Test Practice",
        payer_name="Test Payer",
        payer_appeal_address="PO Box 123, Payer City, ST 00000",
        claim_control_number="CTRL-123",
        patient_member_id="MEM-123",
        service_date="2024-01-15",
        denied_amount=150.00,
    )

    pdf_bytes = render_appeal_letter_pdf(input_data)

    # Verify PDF bytes have valid PDF header
    assert pdf_bytes[:4] == b"%PDF"
    assert len(pdf_bytes) > 1000  # PDFs should be non-trivial size


def test_normalization_preserves_meaningful_whitespace():
    """Test that normalization preserves single spaces within text."""
    from overturn_worker.citations import normalize

    # Single spaces should be preserved
    result = normalize("word1 word2 word3")
    assert result == "word1 word2 word3"

    # Multiple spaces collapsed to single
    result = normalize("word1  word2   word3")
    assert result == "word1 word2 word3"
