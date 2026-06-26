# PDF denial parser.
#
# PDFs come in two shapes:
#  - ERA/835 dumped to PDF — still has CLP*/CAS*/N1*PR segments in the extracted
#    text. Deterministic parsing is near-100% reliable for these; LLM is waste.
#  - True EOBs (patient-facing remittance), scanned letters, payer-portal exports
#    — these are semi-structured and warrant LLM extraction.
#
# Strategy: extract text, sniff for 835 segments, route accordingly. OCR is the
# fallback when there's no embedded text (image-only PDFs).

import base64
import io
import logging
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class EobDenial(BaseModel):
    """Single denial extracted from a PDF."""
    control_number: Optional[str] = None
    patient_name: Optional[str] = None
    member_id: Optional[str] = None
    service_date: Optional[str] = None
    denial_code: str
    denial_reason: str
    denied_amount: float
    payer_name: Optional[str] = None
    billed_amount: Optional[float] = None
    # When populated (ERA-as-PDF path), these carry through to the web layer
    # so denial rows show the CPT and the actual surrounding 835 segments.
    cpt: Optional[str] = None
    raw_snippet: Optional[str] = None
    # ERA payment / production date (YYYY-MM-DD) — DTM*405 or BPR16. The web
    # layer uses this as Denial.receivedAt instead of the upload time.
    payment_date: Optional[str] = None
    # Rendering / servicing provider name from N1*PE. Used in the appeal
    # letter as the entity that performed the service.
    rendering_provider: Optional[str] = None


class EobParseRequest(BaseModel):
    """Request to parse a PDF."""
    pdf: str  # base64 encoded PDF
    filename: str


class EobParseResponse(BaseModel):
    """Response from PDF parsing."""
    denials: List[EobDenial]
    source: str
    confidence: float
    # "era" → parsed deterministically via era_parser
    # "eob" → parsed via LLM from embedded text
    # "ocr" → parsed via LLM from OCRed text
    source_type: str = "eob"
    # Populated when source_type == "era" so the caller can run outcome
    # ingestion against the same text. Empty otherwise.
    extracted_text: str = ""


def extract_text_from_pdf(pdf_base64: str) -> str:
    """Extract text content from a base64-encoded PDF."""
    try:
        import PyPDF2

        pdf_bytes = base64.b64decode(pdf_base64)
        pdf_file = io.BytesIO(pdf_bytes)

        text_content = ""
        pdf_reader = PyPDF2.PdfReader(pdf_file)

        for page in pdf_reader.pages:
            text_content += page.extract_text() + "\n"

        return text_content.strip()
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        return ""


def ocrextract_text_from_pdf(pdf_base64: str) -> str:
    """Extract text from image-based PDFs using OCR."""
    try:
        import fitz  # PyMuPDF

        pdf_bytes = base64.b64decode(pdf_base64)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        text_content = ""
        for page in doc:
            # First try text extraction
            page_text = page.get_text()
            if page_text.strip():
                text_content += page_text + "\n"
            else:
                # If no text, try OCR on the page image
                try:
                    from PIL import Image
                    import pytesseract

                    pix = page.get_pixmap()
                    img_data = pix.tobytes("png")
                    img = Image.open(io.BytesIO(img_data))
                    ocr_text = pytesseract.image_to_string(img)
                    text_content += ocr_text + "\n"
                except ImportError:
                    logger.warning("OCR not available, skipping image-based pages")
                except Exception as e:
                    logger.warning(f"OCR failed for page: {e}")

        doc.close()
        return text_content.strip()
    except ImportError:
        logger.warning("PyMuPDF not available, falling back to PyPDF2")
        return extract_text_from_pdf(pdf_base64)
    except Exception as e:
        logger.error(f"OCR extraction failed: {e}")
        return ""


def extract_denials_from_eob_text(text: str, filename: str) -> List[EobDenial]:
    """Use Claude to analyze EOB text and extract denial information.

    This uses AI to understand the document structure and extract accurate denial information,
    which is much more reliable than regex patterns for varying EOB formats.
    """
    from .llm import call_claude_json

    system = """You are an expert at analyzing healthcare Explanation of Benefits (EOB) documents.
Your task is to carefully extract denial information from the EOB text.

Extract the following for EACH denied/partially denied service:
1. Control number or claim number (identifies the specific claim)
2. Patient name
3. Member ID or insurance ID
4. Service date (date of service)
5. Denial code (CARC codes like CO-50, CO-45, PR-1, etc.)
6. Denial reason (explanation of why the claim was denied)
7. Denied amount (the dollar amount that was denied for that specific service)

IMPORTANT:
- Only extract services that were DENIED or PARTIALLY DENIED
- Ignore services that were PAID or APPROVED
- Extract the SPECIFIC denied amount for each service, not the total
- If multiple services were denied, create a separate entry for each
- Use the actual values from the document, not made-up values

Common denial codes:
- CO-50: Medical necessity not established
- CO-45: Charge exceeds fee schedule
- CO-96: Non-covered service
- PR-1: Deductible
- PR-2: Coinsurance
- PR-3: Co-payment
"""

    user = f"""Extract denial information from this EOB document.

Filename: {filename}

Document text:
{text[:15000]}

Return your findings as a JSON object with this structure:
{{
  "denials": [
    {{
      "control_number": "claim or control number from the document",
      "patient_name": "patient name from the document",
      "member_id": "member ID from the document",
      "service_date": "date of service (YYYY-MM-DD format)",
      "denial_code": "CARC/RARC code (e.g., CO-50)",
      "denial_reason": "explanation of why this specific service was denied",
      "denied_amount": 0.00
    }}
  ]
}}

If no denials are found, return {{"denials": []}}.

CRITICAL: Only extract information for services that were actually DENIED or PARTIALLY DENIED.
Do not extract paid or approved claims. Use the ACTUAL values from the document."""

    try:
        result = call_claude_json(
            system=system,
            user=user,
            model="claude-sonnet-4-20250514",
            max_tokens=3000,
        )

        import json
        # result.parsed contains the actual response
        denials_data = result.parsed.get("denials", [])

        return [EobDenial(**d) for d in denials_data]
    except Exception as e:
        logger.error(f"Claude extraction failed: {e}")
        return []


_ERA_SEGMENT_RE = re.compile(
    r"(?:^|[~\s])(ISA\*|GS\*HP\*|ST\*835|CLP\*|CAS\*|N1\*PR\*)",
    re.IGNORECASE,
)


def looks_like_era_text(text: str) -> bool:
    """True when the extracted text is an 835 dumped to PDF.

    We require at least one CLP segment (claim header) and one CAS segment
    (adjustment). A bare 'CO-50' mention in a narrative EOB won't trip this.
    """
    has_clp = bool(re.search(r"CLP\*", text, re.IGNORECASE))
    has_cas = bool(re.search(r"CAS\*", text, re.IGNORECASE))
    if has_clp and has_cas:
        return True
    # Allow ISA/ST*835 envelope as a strong positive even if CAS isn't reached
    # in the first chunk (rare, but cheap to detect).
    return bool(re.search(r"\b(ISA\*|ST\*835)", text[:500], re.IGNORECASE))


def era_claims_to_denials(era_text: str) -> List[EobDenial]:
    """Flatten era_parser.parse() output into the EobDenial schema."""
    from .era_parser import parse as parse_era

    denials: List[EobDenial] = []
    for claim in parse_era(era_text):
        service_date = claim.service_date_start or None
        for d in claim.denials:
            denials.append(EobDenial(
                control_number=claim.control_number or None,
                patient_name=claim.patient_name or None,
                member_id=claim.member_id or None,
                service_date=service_date,
                denial_code=d.code,
                # Pass the reason VERBATIM (empty when the 835 didn't carry
                # one). The web layer applies the CARC lookup as a fallback;
                # we must not invent a `"Denial code X"` string here, because
                # downstream code would mistake it for a payer-supplied
                # reason and skip the CARC table.
                denial_reason=d.reason,
                denied_amount=d.amount,
                payer_name=claim.payer_name or None,
                billed_amount=claim.billed or None,
                cpt=d.cpt,
                raw_snippet=d.raw_snippet or None,
                payment_date=claim.payment_date or None,
                rendering_provider=claim.rendering_provider or None,
            ))
    return denials


def parse_eob(request: EobParseRequest) -> EobParseResponse:
    """Parse a PDF and extract denial information.

    Routing:
      1. Extract embedded text (fast, free).
      2. If text looks like an 835, run deterministic ERA parser.
      3. Else fall back to LLM extraction over the embedded text.
      4. If no embedded text, OCR the pages and try the same routing.
    """
    logger.info(f"Parsing PDF: {request.filename}")

    text = extract_text_from_pdf(request.pdf)
    used_ocr = False

    if len(text) < 100:
        logger.info("Low embedded-text content, attempting OCR")
        text = ocrextract_text_from_pdf(request.pdf)
        used_ocr = True

    if not text or len(text) < 50:
        logger.warning(f"Could not extract text from {request.filename}")
        return EobParseResponse(
            denials=[],
            source=request.filename,
            confidence=0.0,
            source_type="ocr" if used_ocr else "eob",
        )

    if looks_like_era_text(text):
        logger.info(f"{request.filename}: detected 835 segments — using deterministic parser")
        denials = era_claims_to_denials(text)
        if denials:
            return EobParseResponse(
                denials=denials,
                source=request.filename,
                confidence=0.95,
                source_type="era",
                extracted_text=text,
            )
        # Fall through to LLM if segments were present but parser found nothing
        # actionable — e.g., header-only fragments or 837 mistaken for 835.
        logger.info(f"{request.filename}: ERA-shaped text yielded no claims, falling back to LLM")

    denials = extract_denials_from_eob_text(text, request.filename)
    logger.info(f"Extracted {len(denials)} denials from {request.filename}")

    return EobParseResponse(
        denials=denials,
        source=request.filename,
        confidence=0.85 if denials else 0.3,
        source_type="ocr" if used_ocr else "eob",
    )
