"""Documo eFax client + dev-stub.

Documo is the BAA-friendly eFax provider we use to deliver appeal letters
to payer fax numbers. Real API path: https://api.documo.com/v1/faxes.

When DOCUMO_API_KEY is unset we write the PDF to the artifacts directory
and synthesize a confirmation number so the rest of the submission flow
works in dev / CI.
"""

from __future__ import annotations

import base64
import logging
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

import httpx

from .config import SETTINGS

logger = logging.getLogger(__name__)


@dataclass
class FaxResult:
    success: bool
    provider_ref: str  # Documo fax id (or stub id)
    confirmation_number: str
    pdf_path: str
    error: str | None = None


def _stub_send(pdf_bytes: bytes, appeal_id: str, fax_number: str) -> FaxResult:
    artifacts = Path(SETTINGS.artifacts_dir) / "faxes"
    artifacts.mkdir(parents=True, exist_ok=True)
    pdf_path = artifacts / f"{appeal_id}.pdf"
    pdf_path.write_bytes(pdf_bytes)
    meta = artifacts / f"{appeal_id}.json"
    meta.write_text(
        f'{{"to": "{fax_number}", "appealId": "{appeal_id}", "mode": "stub"}}'
    )
    stub_id = f"documo_stub_{uuid.uuid4().hex[:12]}"
    return FaxResult(
        success=True,
        provider_ref=stub_id,
        confirmation_number=f"FAX-{stub_id[-8:].upper()}",
        pdf_path=str(pdf_path),
        error=None,
    )


def send_fax(*, pdf_bytes: bytes, appeal_id: str, fax_number: str, subject: str) -> FaxResult:
    """Send a fax via Documo. Falls back to a deterministic stub when no
    API key is configured."""
    api_key = os.environ.get("DOCUMO_API_KEY")
    base = os.environ.get("DOCUMO_API_BASE", "https://api.documo.com/v1")
    if not api_key:
        logger.info("Documo stub used (no API key)")
        return _stub_send(pdf_bytes, appeal_id, fax_number)

    payload = {
        "faxNumber": fax_number,
        "subject": subject,
        "attachments": [
            {
                "filename": f"appeal-{appeal_id}.pdf",
                "data": base64.b64encode(pdf_bytes).decode("ascii"),
            }
        ],
    }
    try:
        r = httpx.post(
            f"{base.rstrip('/')}/faxes",
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )
        r.raise_for_status()
        body = r.json()
    except httpx.HTTPStatusError as e:
        return FaxResult(
            success=False,
            provider_ref="",
            confirmation_number="",
            pdf_path="",
            error=f"documo HTTP {e.response.status_code}: {e.response.text[:300]}",
        )
    except httpx.RequestError as e:
        return FaxResult(
            success=False,
            provider_ref="",
            confirmation_number="",
            pdf_path="",
            error=f"documo request failed: {e}",
        )

    return FaxResult(
        success=True,
        provider_ref=body.get("id", ""),
        confirmation_number=body.get("confirmationNumber") or body.get("id", ""),
        pdf_path="",
        error=None,
    )
