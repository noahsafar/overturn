"""Lob mail-house client + dev-stub.

Lob prints + mails physical letters via their API (https://api.lob.com).
Used for payers that accept appeals by mail only. Falls back to writing the
PDF to a local artifacts directory when no API key is configured.
"""

from __future__ import annotations

import base64
import logging
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from .config import SETTINGS

logger = logging.getLogger(__name__)


@dataclass
class MailResult:
    success: bool
    provider_ref: str  # Lob letter id (or stub id)
    confirmation_number: str
    pdf_path: str
    expected_delivery_date: str | None = None
    error: str | None = None


def _parse_address(addr: str) -> dict[str, str]:
    """Best-effort parse of a free-form US address. Lob requires line1, city,
    state, postal — when we can't extract them cleanly the request will fail
    in production and the stub keeps going with whatever we got."""
    parts = [p.strip() for p in addr.split(",")]
    out: dict[str, str] = {"address_line1": "", "address_city": "", "address_state": "", "address_zip": ""}
    if len(parts) >= 1:
        out["address_line1"] = parts[0]
    if len(parts) >= 2:
        out["address_city"] = parts[1]
    if len(parts) >= 3:
        # "ST 00000" or "ST" + "00000"
        sp = parts[2].split()
        if sp:
            out["address_state"] = sp[0]
            if len(sp) > 1:
                out["address_zip"] = sp[1]
    return out


def _stub_send(
    pdf_bytes: bytes, appeal_id: str, payer_name: str, to_addr: str, from_name: str
) -> MailResult:
    artifacts = Path(SETTINGS.artifacts_dir) / "mail"
    artifacts.mkdir(parents=True, exist_ok=True)
    pdf_path = artifacts / f"{appeal_id}.pdf"
    pdf_path.write_bytes(pdf_bytes)
    meta = artifacts / f"{appeal_id}.json"
    meta.write_text(
        f'{{"to_name": "{payer_name}", "to_address": "{to_addr}", '
        f'"from_name": "{from_name}", "appealId": "{appeal_id}", "mode": "stub"}}'
    )
    stub_id = f"ltr_stub_{uuid.uuid4().hex[:12]}"
    return MailResult(
        success=True,
        provider_ref=stub_id,
        confirmation_number=f"MAIL-{stub_id[-8:].upper()}",
        pdf_path=str(pdf_path),
        expected_delivery_date=None,
        error=None,
    )


def send_letter(
    *,
    pdf_bytes: bytes,
    appeal_id: str,
    payer_name: str,
    payer_appeal_address: str,
    from_name: str,
) -> MailResult:
    api_key = os.environ.get("LOB_API_KEY")
    base = os.environ.get("LOB_API_BASE", "https://api.lob.com/v1")
    if not api_key:
        logger.info("Lob stub used (no API key)")
        return _stub_send(pdf_bytes, appeal_id, payer_name, payer_appeal_address, from_name)

    # Lob expects multipart form data with a `file` field for the PDF.
    to_addr = _parse_address(payer_appeal_address)
    data: dict[str, Any] = {
        "description": f"Appeal {appeal_id}",
        "to[name]": payer_name,
        **{f"to[{k}]": v for k, v in to_addr.items()},
        "from[name]": from_name,
        # NB: from address must be set on the Lob dashboard or here in prod.
        "color": "false",
        "double_sided": "false",
    }
    files = {"file": (f"appeal-{appeal_id}.pdf", pdf_bytes, "application/pdf")}
    try:
        r = httpx.post(
            f"{base.rstrip('/')}/letters",
            data=data,
            files=files,
            auth=(api_key, ""),
            timeout=60.0,
        )
        r.raise_for_status()
        body = r.json()
    except httpx.HTTPStatusError as e:
        return MailResult(
            success=False,
            provider_ref="",
            confirmation_number="",
            pdf_path="",
            error=f"lob HTTP {e.response.status_code}: {e.response.text[:300]}",
        )
    except httpx.RequestError as e:
        return MailResult(
            success=False,
            provider_ref="",
            confirmation_number="",
            pdf_path="",
            error=f"lob request failed: {e}",
        )

    return MailResult(
        success=True,
        provider_ref=body.get("id", ""),
        confirmation_number=body.get("id", ""),
        pdf_path="",
        expected_delivery_date=body.get("expected_delivery_date"),
        error=None,
    )
