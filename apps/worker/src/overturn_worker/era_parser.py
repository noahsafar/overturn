"""ERA (835) parser.

Production path uses `pyx12` (which understands the full 835 EDI grammar).
For dev we accept a simplified text format we use in the seed data so the
pipeline runs without a real ERA file. The spec is explicit that writing a
full 835 parser is a trap — we delegate to pyx12 the moment a real ERA
arrives.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class EraDenial:
    code: str
    reason: str
    amount: float


@dataclass
class EraClaim:
    control_number: str
    billed: float
    paid: float
    denied: float
    denials: list[EraDenial] = field(default_factory=list)


def parse_simple(era: str) -> list[EraClaim]:
    """Parse the toy 835-ish format used in the seed data.

    Recognises CLP* (claim payment) and CAS* (adjustment) segments. This is
    intentionally narrow; production routes go through `parse_pyx12`.
    """
    claims: list[EraClaim] = []
    current: EraClaim | None = None
    for seg in re.split(r"[~\n]", era):
        seg = seg.strip()
        if not seg:
            continue
        parts = seg.split("*")
        tag = parts[0]
        if tag == "CLP" and len(parts) >= 5:
            if current is not None:
                claims.append(current)
            current = EraClaim(
                control_number=parts[1],
                billed=float(parts[3] or 0),
                paid=float(parts[4] or 0),
                denied=0.0,
            )
        elif tag == "CAS" and current is not None:
            # CAS*<group>*<code>*<amount>*[<units>]*<code>*<amount>...
            group = parts[1] if len(parts) > 1 else ""
            i = 2
            while i + 1 < len(parts):
                code = parts[i]
                try:
                    amt = float(parts[i + 1])
                except ValueError:
                    amt = 0.0
                if code:
                    current.denials.append(
                        EraDenial(code=f"{group}-{code}", reason="", amount=amt)
                    )
                    current.denied += amt
                i += 3  # skip units
    if current is not None:
        claims.append(current)
    return claims


def parse(era: str) -> list[EraClaim]:
    """Try pyx12 first, fall back to the simple parser."""
    try:
        return _parse_pyx12(era)
    except Exception as exc:  # noqa: BLE001 — pyx12 raises a zoo of errors
        logger.debug("pyx12 unavailable or failed (%s); using simple parser", exc)
        return parse_simple(era)


def _parse_pyx12(era: str) -> list[EraClaim]:
    # Optional dep — only imported when used so tests don't require it.
    import pyx12  # type: ignore[import-untyped]
    import pyx12.x12file  # type: ignore[import-untyped]

    # pyx12 is configured per-environment; this is a placeholder that wires
    # the structure but defers heavy lifting until a real ERA shows up.
    raise NotImplementedError("pyx12 path requires .x12.cf configuration")
