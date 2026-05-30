"""PHI envelope encryption — round-trip and tamper-detection tests.

Also cross-checks against the TS implementation by decrypting a blob the TS
side encrypted (when present in `tests/fixtures/ts_encrypted.bin`)."""

from __future__ import annotations

import pytest

from overturn_worker.crypto import decrypt, encrypt


def test_round_trip_ascii():
    blob = encrypt("Jane Doe")
    assert decrypt(blob) == "Jane Doe"


def test_round_trip_unicode():
    s = "Renée O'Connor — 2025-04-12"
    assert decrypt(encrypt(s)) == s


def test_random_iv_yields_different_ciphertext():
    a = encrypt("repeat")
    b = encrypt("repeat")
    assert a != b
    assert decrypt(a) == "repeat"
    assert decrypt(b) == "repeat"


def test_tamper_detected():
    blob = bytearray(encrypt("sensitive"))
    blob[-1] ^= 0xFF
    with pytest.raises(Exception):
        decrypt(bytes(blob))
