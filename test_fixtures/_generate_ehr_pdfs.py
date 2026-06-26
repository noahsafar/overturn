"""Render the .txt source notes in test_fixtures/ehr/ to .pdf files.

A real EHR export of a chart almost always lands as a PDF (sometimes
formatted, sometimes a print-to-PDF of the chart screen). These fixtures
are intentionally print-to-PDF style so a biller can drop them into the
chart-excerpts uploader exactly as they would in production.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas


EHR_DIR = Path(__file__).parent / "ehr"


def render(text: str, dest: Path) -> None:
    c = canvas.Canvas(str(dest), pagesize=letter)
    width, height = letter
    margin = 0.6 * inch
    line_height = 11
    chars_per_line = 92

    # Footer for each page — small, like a real EHR print.
    def draw_footer(page_num: int) -> None:
        c.setFont("Helvetica-Oblique", 7)
        c.setFillGray(0.45)
        c.drawString(margin, 0.4 * inch,
                     "Confidential health information — print for authorized use only.")
        c.drawRightString(width - margin, 0.4 * inch, f"Page {page_num}")
        c.setFillGray(0)

    page_num = 1
    y = height - margin
    c.setFont("Courier", 9)
    for raw_line in text.splitlines():
        wrapped = textwrap.wrap(raw_line, width=chars_per_line) or [""]
        for chunk in wrapped:
            if y < margin + 0.5 * inch:
                draw_footer(page_num)
                c.showPage()
                page_num += 1
                c.setFont("Courier", 9)
                y = height - margin
            c.drawString(margin, y, chunk)
            y -= line_height
    draw_footer(page_num)
    c.save()


def main() -> None:
    txts = sorted(EHR_DIR.glob("*.txt"))
    if not txts:
        raise SystemExit("No .txt source notes found in test_fixtures/ehr/")
    print(f"Rendering {len(txts)} EHR notes to PDF:")
    for txt in txts:
        pdf = txt.with_suffix(".pdf")
        render(txt.read_text(), pdf)
        print(f"  {txt.name}  →  {pdf.name}  ({pdf.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
