"""Minimal 837 Professional corrected-claim generation.

Real-world 837 generation involves the full X12 transaction set, loop
hierarchy, and clearinghouse-specific quirks. For a corrected-claim flow
we only need to mark the claim as a replacement (frequency code 7) and
reference the original Payer Claim Control Number (PCN). That's what
this module emits — a small but valid-shape 837P fragment that a real
clearinghouse integration can drop into its full envelope.

The structure follows the standard ANSI X12 005010X222A1 layout for the
fields that matter:

  - CLM05-3 = "7"  → replacement of prior claim
  - REF*F8*<original-payer-claim-id>  → original control number reference
  - NTE*ADD*<reason>  → human-readable narrative explaining the correction

The current consumer is a stub clearinghouse submitter; the on-the-wire
formatting is exercised by tests and ready for the real integration.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class CorrectionInput:
    claim_control_number: str  # The original payer-side claim ID (REF*F8).
    practice_npi: str
    practice_name: str
    practice_tax_id: str
    patient_first: str
    patient_last: str
    patient_dob: str  # YYYYMMDD
    patient_member_id: str
    payer_name: str
    payer_id: str  # e.g. payer ID number / TPID
    service_date: str  # YYYYMMDD
    cpt_codes: list[str]
    icd_codes: list[str]
    total_charge: float
    corrected_cpt: str | None = None
    corrected_modifier: str | None = None
    correction_reason: str = "Corrected claim — see narrative."


def render_837_corrected(c: CorrectionInput) -> str:
    """Return an 837P fragment with replacement-claim semantics.

    Output is a single newline-joined block of segments terminated with
    "~". Includes only the segments that vary per claim — a real
    submitter wraps this in ISA/GS/ST envelopes and the static loops
    (1000A/1000B) for the trading partner.
    """
    now = datetime.now(timezone.utc)
    ts_date = now.strftime("%Y%m%d")
    primary_cpt = c.corrected_cpt or (c.cpt_codes[0] if c.cpt_codes else "")
    modifier = c.corrected_modifier or ""
    primary_icd = c.icd_codes[0] if c.icd_codes else ""

    # CLM05-3 = "7" → REPLACEMENT (a.k.a. corrected) claim.
    clm05 = f"OFFICE:B:7"

    lines = [
        f"BHT*0019*00*OVR{now.strftime('%H%M%S')}*{ts_date}*{now.strftime('%H%M')}*CH",
        # Billing provider (Loop 2000A / 2010AA)
        f"NM1*85*2*{c.practice_name}*****XX*{c.practice_npi}",
        f"REF*EI*{c.practice_tax_id}",
        # Subscriber / patient (we model subscriber=patient for simplicity)
        f"NM1*IL*1*{c.patient_last}*{c.patient_first}****MI*{c.patient_member_id}",
        f"DMG*D8*{c.patient_dob}*U",
        # Payer (Loop 2010BB)
        f"NM1*PR*2*{c.payer_name}*****PI*{c.payer_id}",
        # Claim (Loop 2300)
        f"CLM*{c.claim_control_number}*{c.total_charge:.2f}***{clm05}*Y*A*Y*Y",
        # Replacement reference to the original claim. F8 is the X12
        # qualifier for "Original Reference Number" — required when
        # CLM05-3 = 7.
        f"REF*F8*{c.claim_control_number}",
        f"DTP*472*D8*{c.service_date}",
        # Diagnosis
        f"HI*ABK:{primary_icd}" if primary_icd else "",
        # Narrative — why the resubmission is happening
        f"NTE*ADD*{c.correction_reason}",
        # Service line
        f"LX*1",
        f"SV1*HC:{primary_cpt}{':' + modifier if modifier else ''}*{c.total_charge:.2f}*UN*1",
        f"DTP*472*D8*{c.service_date}",
    ]
    # Drop empty lines (e.g. no diagnosis present).
    return "\n".join(f"{seg}~" for seg in lines if seg)
