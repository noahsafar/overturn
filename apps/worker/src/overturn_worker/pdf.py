"""Appeal-letter PDF rendering.

Used by the fax (Documo) and mail (Lob) submission channels — both expect a
PDF rather than raw text. Pure reportlab so the worker container needs no
system fonts beyond what reportlab ships with.

The layout is intentionally plain:
  - top-right return address (the practice)
  - top-left date
  - addressee block (the payer's appeals office)
  - Re: line with claim metadata
  - body (the letter text)
  - signature block

If the appeal letter already starts with a date / addressee block — which
the LLM draft does — we drop our header to avoid duplicates.
"""

from __future__ import annotations

import io
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


@dataclass
class AppealLetterPdfInput:
    appeal_id: str
    letter_text: str
    practice_name: str
    payer_name: str
    payer_appeal_address: str | None
    claim_control_number: str
    patient_member_id: str
    service_date: str
    denied_amount: float


# Treats the body letter as plain text with paragraphs separated by blank lines.
_LETTER_HEADER_HINTS = re.compile(r"^(?:[A-Z][a-z]+ \d{1,2}, \d{4}|To whom|Re:|Dear)", re.MULTILINE)


def render_appeal_letter_pdf(input_: AppealLetterPdfInput, output_path: str | None = None) -> bytes:
    """Render the appeal letter PDF. Returns the PDF bytes; optionally writes
    to disk if `output_path` is provided.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        title=f"Appeal — claim {input_.claim_control_number}",
        author=input_.practice_name,
    )

    base = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body",
        parent=base["BodyText"],
        fontName="Times-Roman",
        fontSize=11,
        leading=15,
        alignment=0,
    )
    small = ParagraphStyle(
        "Small",
        parent=base["BodyText"],
        fontName="Times-Roman",
        fontSize=9,
        textColor="#666666",
    )
    header = ParagraphStyle(
        "Header",
        parent=base["BodyText"],
        fontName="Times-Bold",
        fontSize=11,
    )

    story: list = []

    # If the letter text already includes a date + addressee, skip our header.
    drop_header = bool(_LETTER_HEADER_HINTS.search(input_.letter_text[:600]))

    if not drop_header:
        story.append(Paragraph(input_.practice_name, header))
        story.append(Spacer(1, 0.15 * inch))
        story.append(Paragraph(datetime.utcnow().strftime("%B %d, %Y"), body))
        story.append(Spacer(1, 0.15 * inch))
        addressee = input_.payer_name
        if input_.payer_appeal_address:
            addressee += "<br/>" + input_.payer_appeal_address.replace(",", "<br/>")
        story.append(Paragraph(addressee, body))
        story.append(Spacer(1, 0.25 * inch))
        re_line = (
            f"<b>Re:</b> Appeal of denied claim<br/>"
            f"&nbsp;&nbsp;Claim control number: {input_.claim_control_number}<br/>"
            f"&nbsp;&nbsp;Member ID: {input_.patient_member_id}<br/>"
            f"&nbsp;&nbsp;Date of service: {input_.service_date}<br/>"
            f"&nbsp;&nbsp;Denied amount: ${input_.denied_amount:,.2f}"
        )
        story.append(Paragraph(re_line, body))
        story.append(Spacer(1, 0.3 * inch))

    # Body — split on blank lines into paragraphs, escape HTML-special chars.
    text = input_.letter_text.strip()
    # Escape <, > so they don't get interpreted as Paragraph markup.
    paragraphs = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").split("\n\n")
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        # Single newlines within a paragraph become <br/> for soft breaks.
        story.append(Paragraph(p.replace("\n", "<br/>"), body))
        story.append(Spacer(1, 0.12 * inch))

    story.append(Spacer(1, 0.4 * inch))
    story.append(Paragraph(
        f"<i>Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · "
        f"appeal {input_.appeal_id}</i>", small,
    ))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()

    if output_path:
        os.makedirs(Path(output_path).parent, exist_ok=True)
        Path(output_path).write_bytes(pdf_bytes)

    return pdf_bytes
