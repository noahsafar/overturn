"""Decrypted-credential accessor for the worker side.

The Stagehand portal submitter needs the practice's payer-portal username,
password, and optional MFA secret. These are stored encrypted at rest in
PayerCredential.{usernameEnc,passwordEnc,mfaSecretEnc}. This module is the
sole point at which they are decrypted — keep auditability tight.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select

from .crypto import decrypt
from .models import PayerCredential, SessionLocal

logger = logging.getLogger(__name__)


@dataclass
class PortalCredentials:
    username: str
    password: str
    mfa_secret: str | None
    config: dict | None


def load_portal_credentials(practice_id: str, payer_id: str) -> PortalCredentials | None:
    """Return decrypted PORTAL credentials for (practice, payer), or None if
    none stored. Raises ValueError on decryption errors so the workflow
    aborts loudly rather than silently submitting unauthenticated."""
    with SessionLocal() as s:
        row = s.scalar(
            select(PayerCredential).where(
                PayerCredential.practiceId == practice_id,
                PayerCredential.payerId == payer_id,
                PayerCredential.credentialType == "PORTAL",
            )
        )
        if row is None:
            return None
        try:
            username = decrypt(row.usernameEnc)
            password = decrypt(row.passwordEnc)
            mfa = decrypt(row.mfaSecretEnc) if row.mfaSecretEnc else None
        except Exception as e:
            raise ValueError(
                f"failed to decrypt payer credentials for {practice_id}/{payer_id}: {e}"
            ) from e
        return PortalCredentials(
            username=username,
            password=password,
            mfa_secret=mfa,
            config=row.configJson,
        )
