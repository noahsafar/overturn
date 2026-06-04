# Clinical context extraction from medical documents
import base64
import logging
from typing import List, Dict, Any
from fastapi import HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ClinicalContextExtractionReq(BaseModel):
    document: str  # base64 encoded PDF
    filename: str


class ClinicalContextExtractionRes(BaseModel):
    context: str
    confidence: float
    sections: List[Dict[str, str]]


def extract_clinical_context_from_pdf(pdf_base64: str, filename: str) -> ClinicalContextExtractionRes:
    """
    Extract clinical context from medical documents (PDF).

    This function:
    1. Decodes the base64 PDF
    2. Extracts text content
    3. Uses AI to identify relevant clinical information
    4. Returns structured clinical context for appeal drafting
    """
    try:
        import io
        import PyPDF2
        from .llm import call_claude_json

        # Decode base64 PDF
        pdf_bytes = base64.b64decode(pdf_base64)
        pdf_file = io.BytesIO(pdf_bytes)

        # Extract text from PDF
        text_content = ""
        try:
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            for page in pdf_reader.pages:
                text_content += page.extract_text() + "\n"
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            # Fallback: return minimal context
            return ClinicalContextExtractionRes(
                context="CLINICAL CONTEXT FROM UPLOADED DOCUMENT\n\nUnable to extract text from PDF. Please ensure the document is a valid PDF file and try again.",
                confidence=0.0,
                sections=[]
            )

        if not text_content.strip():
            return ClinicalContextExtractionRes(
                context="CLINICAL CONTEXT FROM UPLOADED DOCUMENT\n\nNo text content found in PDF. The document may be image-based or encrypted.",
                confidence=0.0,
                sections=[]
            )

        # Use AI to extract relevant clinical context
        try:
            system = "You are a medical documentation expert specializing in extracting clinical information for insurance appeals."
            user = f"""Extract and organize the clinical context from this medical document. Focus on:

1. Primary complaint/patient presentation
2. Functional limitations and impairments
3. Treatment plan and interventions provided
4. Progress toward goals and outcomes
5. Any additional relevant clinical information

Document content:
{text_content[:8000]}

Return your response as structured text (not JSON) with clear sections for each topic above. Ignore any headers/footers and focus on substantive clinical information."""

            result = call_claude_json(
                system=system,
                user=user,
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                stub_response={
                    "parsed": {
                        "context": f"CLINICAL CONTEXT FROM UPLOADED DOCUMENT\n\nExtracted from {filename}\n\n{text_content[:500]}"
                    },
                    "text": f"CLINICAL CONTEXT FROM UPLOADED DOCUMENT\n\nExtracted from {filename}\n\n{text_content[:500]}"
                }
            )

            extracted_context = result.text

            # Structure the context into sections
            sections = _structure_into_sections(extracted_context)

            return ClinicalContextExtractionRes(
                context=extracted_context,
                confidence=0.85,  # High confidence when AI extraction succeeds
                sections=sections
            )

        except Exception as e:
            logger.error(f"AI extraction failed: {e}")
            # Fallback: return raw extracted text
            return ClinicalContextExtractionRes(
                context=f"CLINICAL CONTEXT FROM UPLOADED DOCUMENT ({filename})\n\n{text_content[:3000]}",
                confidence=0.5,  # Medium confidence with raw text
                sections=[]
            )

    except Exception as e:
        logger.error(f"Clinical context extraction failed: {e}")
        raise HTTPException(500, f"Failed to extract clinical context: {str(e)}")


def _structure_into_sections(text: str) -> List[Dict[str, str]]:
    """Structure extracted text into logical sections."""
    sections = []
    current_section = "Overview"
    current_content = []

    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Detect section headers (all caps or ends with colon)
        if line.isupper() or line.endswith(':'):
            if current_content:
                sections.append({
                    "title": current_section,
                    "content": '\n'.join(current_content)
                })
            current_section = line.rstrip(':')
            current_content = []
        else:
            current_content.append(line)

    if current_content:
        sections.append({
            "title": current_section,
            "content": '\n'.join(current_content)
        })

    return sections
