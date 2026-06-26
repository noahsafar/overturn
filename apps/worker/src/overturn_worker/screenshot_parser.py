# Screenshot/Image Parser for Denials
#
# Extracts denial information from screenshots of:
# - Payer portal denial screens
# - EOB images
# - Denial letters
# - Mobile photos of denial documents
#
# Uses Claude's vision capabilities to understand the image content
# and extract structured denial information.

import base64
import io
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ScreenshotDenial(BaseModel):
    """Single denial extracted from a screenshot."""
    denial_code: str
    denial_reason: str
    denied_amount: Optional[float] = None
    patient_info: Optional[str] = None
    confidence: float = 0.8


class ScreenshotParseRequest(BaseModel):
    """Request to parse a screenshot image."""
    image: str  # base64 encoded image
    filename: str


class ScreenshotParseResponse(BaseModel):
    """Response from screenshot parsing."""
    denials: List[ScreenshotDenial]
    source: str
    confidence: float


def extract_denials_from_image(image_base64: str, filename: str) -> List[ScreenshotDenial]:
    """Use Claude vision to extract denial information from an image."""
    from .config import SETTINGS

    if not SETTINGS.anthropic_api_key:
        logger.warning("No Anthropic API key - returning stub response")
        return []

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=SETTINGS.anthropic_api_key)

        # Decode base64 to get image bytes for media type detection
        image_bytes = base64.b64decode(image_base64)

        # Detect image type from bytes
        image_type = "image/png"
        if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            image_type = "image/png"
        elif image_bytes[:2] == b'\xff\xd8':
            image_type = "image/jpeg"
        elif image_bytes[:6] in (b'GIF87a', b'GIF89a'):
            image_type = "image/gif"
        elif image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
            image_type = "image/webp"

        system_prompt = """You are an expert at extracting healthcare denial information from screenshots and images.

Your task is to identify and extract denial information from images of:
- Insurance payer portal screens showing claim denials
- Explanation of Benefits (EOB) documents
- Denial letters
- Any other healthcare payment documentation

Look for:
- Denial codes (CARC/RARC codes like CO-50, CO-45, PR-1, etc.)
- Denial reasons (explanations of why claims were denied)
- Denied amounts (dollar amounts that were denied)
- Patient information (names, member IDs, dates of service)

Denial code examples:
- CO-50: Medical necessity not established
- CO-45: Charge exceeds fee schedule/maximum allowable
- CO-96: Non-covered service
- PR-1: Deductible
- PR-2: Coinsurance
- PR-3: Co-payment
And other CARC/RARC codes

IMPORTANT: Only extract information for services that were DENIED or PARTIALLY DENIED.
Ignore approved or fully-paid claims."""

        user_prompt = f"""Extract denial information from this image: {filename}

If you see denial information, return it as JSON:

{{
  "denials": [
    {{
      "denial_code": "CARC/RARC code if visible (e.g., CO-50)",
      "denial_reason": "explanation of the denial",
      "denied_amount": 0.00,
      "patient_info": "any patient identification visible",
      "confidence": 0.8
    }}
  ]
}}

If NO denial information is visible (only approved/paid claims, or the image doesn't show denial details), return:
{{"denials": []}}

Be precise with codes - only report actual CARC/RARC codes you can see."""

        message = {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": image_type,
                        "data": image_base64
                    }
                },
                {
                    "type": "text",
                    "text": user_prompt
                }
            ]
        }

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=system_prompt,
            messages=[message],
            extra_headers={
                "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15,max-tokens-3-5-sonnet-2024-07-15"
            } if SETTINGS.use_zdr else {}
        )

        # Extract the response text
        response_text = response.content[0].text

        # Parse JSON from response
        import json
        import re

        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group(0))
            denials_data = parsed.get("denials", [])
        else:
            logger.warning(f"Could not parse JSON from vision response: {response_text[:200]}")
            denials_data = []

        denials = []
        for d in denials_data:
            try:
                denials.append(ScreenshotDenial(**d))
            except Exception as e:
                logger.warning(f"Invalid denial data: {e}")

        logger.info(f"Extracted {len(denials)} denials from screenshot")
        return denials

    except ImportError:
        logger.warning("Anthropic SDK not available")
        return []
    except Exception as e:
        logger.error(f"Vision extraction failed: {e}")
        return []


def parse_screenshot(request: ScreenshotParseRequest) -> ScreenshotParseResponse:
    """Parse a screenshot image and extract denial information."""
    logger.info(f"Parsing screenshot: {request.filename}")

    denials = extract_denials_from_image(request.image, request.filename)

    return ScreenshotParseResponse(
        denials=denials,
        source=request.filename,
        confidence=sum(d.confidence for d in denials) / len(denials) if denials else 0.0
    )
