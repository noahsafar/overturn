"""PHI envelope decryption — mirror of `packages/db/src/crypto.ts`.

The web app and the worker both read the same Bytes columns from Postgres.
This module decrypts them using the same format ([12B IV][16B tag][CT]) so
patient context can be loaded for LLM prompts without round-tripping through
the web app.
"""

from __future__ import annotations

import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import SETTINGS

_IV_LEN = 12
_TAG_LEN = 16


def _key() -> bytes:
    raw = SETTINGS.phi_enc_key_b64 or os.environ.get("PHI_ENC_KEY")
    if not raw:
        # Dev fallback — deterministic 32-byte key matching crypto.ts dev mode.
        # NEVER used in production: the FastAPI app refuses to start without
        # PHI_ENC_KEY when NODE_ENV/ENV is set to production.
        return bytes([7] * 32)
    k = base64.b64decode(raw)
    if len(k) != 32:
        raise RuntimeError("PHI_ENC_KEY must decode to 32 bytes")
    return k


def decrypt(blob: bytes | memoryview) -> str:
    b = bytes(blob)
    if len(b) < _IV_LEN + _TAG_LEN:
        raise ValueError("PHI blob too short")
    iv = b[:_IV_LEN]
    # cryptography's AESGCM takes IV + ct||tag, while our blob is iv||tag||ct,
    # so reassemble into the layout the lib expects.
    tag = b[_IV_LEN : _IV_LEN + _TAG_LEN]
    ct = b[_IV_LEN + _TAG_LEN :]
    aes = AESGCM(_key())
    return aes.decrypt(iv, ct + tag, None).decode("utf-8")


def encrypt(plaintext: str) -> bytes:
    """Symmetric helper, mainly for tests."""
    iv = os.urandom(_IV_LEN)
    aes = AESGCM(_key())
    ct_and_tag = aes.encrypt(iv, plaintext.encode("utf-8"), None)
    # AESGCM appends tag at end; rearrange into our iv||tag||ct format.
    ct, tag = ct_and_tag[:-_TAG_LEN], ct_and_tag[-_TAG_LEN:]
    return iv + tag + ct
