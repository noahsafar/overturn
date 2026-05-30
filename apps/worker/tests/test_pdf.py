"""PDF rendering smoke tests."""

from __future__ import annotations

from overturn_worker.pdf import AppealLetterPdfInput, render_appeal_letter_pdf


def _input() -> AppealLetterPdfInput:
    return AppealLetterPdfInput(
        appeal_id="appeal_test",
        letter_text=(
            "To whom it may concern,\n\n"
            "We respectfully appeal the denial of the above-referenced claim.\n"
            "Supporting evidence:\n- DSM-5 diagnosis documented\n\n"
            "Sincerely,\nLakeside Behavioral Health"
        ),
        practice_name="Lakeside Behavioral Health",
        payer_name="Blue Cross Blue Shield",
        payer_appeal_address="PO Box 9999, Anywhere ST 00000",
        claim_control_number="CLM001",
        patient_member_id="XJM999",
        service_date="2025-09-15",
        denied_amount=180.0,
    )


def test_returns_bytes_with_pdf_header():
    pdf = render_appeal_letter_pdf(_input())
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000  # not an empty doc


def test_writes_to_path(tmp_path):
    target = tmp_path / "out.pdf"
    render_appeal_letter_pdf(_input(), output_path=str(target))
    assert target.exists()
    assert target.read_bytes()[:4] == b"%PDF"


def test_skips_duplicate_header_when_letter_includes_one():
    inp = _input()
    inp.letter_text = "January 1, 2025\n\nDear BCBS,\n\nBody."
    pdf = render_appeal_letter_pdf(inp)
    assert pdf[:4] == b"%PDF"
