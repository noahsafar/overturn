"""Text-embedding helper.

Two providers:
  1. OpenAI text-embedding-3-small (1536 dims) when OPENAI_API_KEY is set.
     Production path — semantic similarity is meaningful.
  2. Deterministic hash-based pseudo-embedding (also 1536 dims) when no key
     is configured. Cosine similarity then approximates token-overlap, which
     is *good enough* for the dev fallback and means retrieval works end-to-end
     without an extra paid vendor in the loop.

The column type in Postgres is `vector(1536)` so producer + DB must agree on
dimensionality. We hardcode 1536 here.

Anthropic deliberately does not offer embeddings; we don't lock to them.
Voyage / Cohere / Together would be drop-in OpenAI-compatible replacements.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import re
from typing import Iterable

import httpx

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 1536


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _tokens(text: str) -> Iterable[str]:
    # Pull out word-shaped tokens of length ≥ 3. Skip stopwords lightly so
    # the deterministic embedding clusters on meaningful terms.
    stop = {"the", "and", "for", "with", "that", "this", "shall", "will", "are", "was",
            "not", "any", "all", "must", "may", "from", "where", "when", "into", "upon"}
    for w in re.findall(r"[a-z][a-z0-9-]{2,}", text.lower()):
        if w not in stop:
            yield w


def _deterministic_embedding(text: str) -> list[float]:
    """Hash bag-of-words → 1536-dim vector → L2-normalized.

    Same text → same vector (idempotent across runs). Similar text →
    high cosine similarity because the same tokens hash into the same slots.
    """
    norm = _normalize(text)
    vec = [0.0] * EMBEDDING_DIM
    for tok in _tokens(norm):
        # Two slots per token (one for the hash, one shifted) softens
        # collisions and produces smoother gradients.
        h = hashlib.sha256(tok.encode("utf-8")).digest()
        i1 = int.from_bytes(h[:4], "big") % EMBEDDING_DIM
        i2 = int.from_bytes(h[4:8], "big") % EMBEDDING_DIM
        vec[i1] += 1.0
        vec[i2] += 0.5
    # L2 normalize so cosine similarity == dot product
    norm_len = math.sqrt(sum(x * x for x in vec))
    if norm_len == 0:
        return vec
    return [x / norm_len for x in vec]


def _openai_embedding(text: str, api_key: str) -> list[float]:
    r = httpx.post(
        "https://api.openai.com/v1/embeddings",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={"model": "text-embedding-3-small", "input": text[:8000]},
        timeout=30.0,
    )
    r.raise_for_status()
    data = r.json()
    vec = data["data"][0]["embedding"]
    if len(vec) != EMBEDDING_DIM:
        # OpenAI 3-small is 1536 by default; defend just in case.
        raise RuntimeError(f"unexpected embedding length {len(vec)}")
    return vec


def get_embedding(text: str) -> list[float]:
    """Return a 1536-dim vector for `text`. Uses OpenAI when configured,
    falls back to the deterministic hash-based embedding otherwise."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return _deterministic_embedding(text)
    try:
        return _openai_embedding(text, api_key)
    except Exception as e:  # noqa: BLE001
        logger.warning("OpenAI embedding failed, falling back to deterministic: %s", e)
        return _deterministic_embedding(text)
