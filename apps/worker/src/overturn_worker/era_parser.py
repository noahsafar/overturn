"""ERA (835) deterministic parser.

Uses proper EDI parsing rules for structured 835 files.
No AI needed - ERA format is highly structured and deterministic.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class EraDenial:
    code: str
    reason: str
    amount: float
    claim_group: str  # Which claim this belongs to
    # CPT/HCPCS code from the enclosing SVC segment. None for claim-level CAS
    # (e.g., sequestration adjustments before any SVC).
    cpt: Optional[str] = None
    # The original segments from the 835 that produced this denial: the
    # parent CLP + the SVC in scope (if any) + the CAS line itself. Stored
    # verbatim (with `~` segment terminators) so the UI shows the real ERA
    # context, not a synthesized fragment.
    raw_snippet: str = ""


@dataclass
class EraClaim:
    control_number: str
    payer_name: str
    patient_name: str
    member_id: str
    service_date_start: str
    service_date_end: str
    billed: float
    paid: float
    denied: float
    claim_status: str
    denials: List[EraDenial] = field(default_factory=list)
    # Unique CPT/HCPCS codes seen across SVC segments for this claim.
    cpt_codes: List[str] = field(default_factory=list)
    # The 835's effective payment date (YYYY-MM-DD). Sourced from DTM*405
    # (Production date) or BPR16 (Effective date). Empty when the file
    # carried neither. Used as Denial.receivedAt — what the payer issued,
    # not when we ingested it.
    payment_date: str = ""
    # Rendering / servicing provider, from N1*PE at the transaction-set
    # level (or NM1*82 at the claim level when present). Used in the
    # appeal letter as the entity that performed the service.
    rendering_provider: str = ""


def parse_era_835(era: str) -> List[EraClaim]:
    """
    Parse ERA/835 file deterministically using EDI structure rules.

    Handles:
    - N1*PR segments: Payer information
    - CLP segments: Claim header
    - CAS segments: Denial adjustments
    - NM1*QC segments: Patient information
    - DTM*232/233: Service date range
    - REF*TJ: Member ID
    - ST*835: Transaction sets
    - SE*xxxx: Segment separators

    Returns list of claims with all denials.
    """
    claims: List[EraClaim] = []

    # Split into transaction sets (ST*835 ... SE*xxxx)
    # Handle: ST*835*0001 and ST*835*0002 etc.
    transaction_sets = re.split(r'ST\s*\*835\*\d+', era, re.IGNORECASE)

    for transaction_set in transaction_sets:
        if not transaction_set.strip():
            continue

        # Remove the closing SE segment
        transaction_set = re.sub(r'SE\s*\*\d+', '', transaction_set, flags=re.IGNORECASE)

        # Parse segments within this transaction set. The 835 spec uses `~` as
        # the segment terminator, but some informal text exports (and PDFs of
        # 835s) drop the `~` and rely on newlines. Accept either.
        segments = []
        for seg in re.split(r'[~\r\n]+', transaction_set):
            seg = seg.strip()
            if not seg:
                continue
            segments.append(seg)

        # Process segments sequentially to build claims
        current_claim = None
        current_payer = "Unknown Payer"
        current_rendering_provider = ""
        # Payment / effective date for this transaction set. Set when we see
        # DTM*405 (Production date) or BPR16 (Effective date), and stamped
        # onto every claim parsed from this set.
        current_payment_date = _payment_date_from_segments(segments)
        segment_index = 0

        while segment_index < len(segments):
            segment = segments[segment_index]
            parts = segment.split('*')
            tag = parts[0] if parts else ''

            # Extract payer name from N1*PR / rendering provider from N1*PE
            if tag == 'N1' and len(parts) >= 3:
                entity_identifier = parts[1]
                if entity_identifier == 'PR' and len(parts) >= 3:
                    current_payer = parts[2].strip()
                    logger.debug(f"Found payer: {current_payer}")
                elif entity_identifier == 'PE' and len(parts) >= 3:
                    # N1*PE = Payee — typically the servicing provider /
                    # billing entity that performed the work. Used in the
                    # appeal letter so we don't conflate "who did the
                    # service" with "who's submitting the appeal".
                    current_rendering_provider = parts[2].strip()
                    logger.debug(f"Found rendering provider: {current_rendering_provider}")

            # Extract claim information from CLP segment
            elif tag == 'CLP' and len(parts) >= 5:
                # CLP*ControlNumber*ClaimStatus*BilledAmount*PaidAmount*...
                control_number = parts[1]
                claim_status = parts[2]
                try:
                    billed_amount = float(parts[3]) if parts[3] else 0.0
                    paid_amount = float(parts[4]) if parts[4] else 0.0
                except ValueError:
                    billed_amount = 0.0
                    paid_amount = 0.0

                # Denied claim statuses per 005010X221: 2, 3, 4, 22 (corrected
                # to denied), 23 (forwarded), 25 (predetermination). Treat
                # 1 (processed as primary) as paid unless CAS amounts say otherwise.
                is_denied = claim_status in ['1', '2', '3', '4', '22']

                if is_denied:
                    current_claim = EraClaim(
                        control_number=control_number,
                        payer_name=current_payer,
                        patient_name="",
                        member_id="",
                        service_date_start="",
                        service_date_end="",
                        billed=billed_amount,
                        paid=paid_amount,
                        denied=0.0,
                        claim_status=claim_status,
                        denials=[],
                        payment_date=current_payment_date,
                        rendering_provider=current_rendering_provider,
                    )

                    current_claim = parse_claim_context(
                        segments,
                        segment_index + 1,
                        current_claim,
                        current_payer,
                        clp_segment_text=segment + "~",
                    )

                    if current_claim and current_claim.denials:
                        claims.append(current_claim)

                current_claim = None

            # Single unconditional advance — every branch above only reads
            # the current segment; the N1 branch used to miss this and could
            # infinite-loop on any 835 that started with a payer header.
            segment_index += 1

    return claims


def _yyyymmdd_to_iso(date_value: str) -> str:
    """Convert an 835 CCYYMMDD date string to YYYY-MM-DD. Empty when invalid."""
    if len(date_value) == 8 and date_value.isdigit():
        return f"{date_value[0:4]}-{date_value[4:6]}-{date_value[6:8]}"
    return ""


def _payment_date_from_segments(segments: List[str]) -> str:
    """Find the 835's effective payment date in a transaction set.

    Prefers DTM*405 (Production date — the date the 835 was produced by the
    payer) and falls back to BPR16 (payment effective date). Returns the
    date as YYYY-MM-DD, or "" when neither is present/valid.
    """
    for segment in segments:
        parts = segment.split('*')
        if not parts:
            continue
        tag = parts[0]
        if tag == 'DTM' and len(parts) >= 3 and parts[1] == '405':
            iso = _yyyymmdd_to_iso(parts[2])
            if iso:
                return iso
    # Fallback: BPR16 (16 fields after the segment name → index 16)
    for segment in segments:
        parts = segment.split('*')
        if parts and parts[0] == 'BPR' and len(parts) >= 17:
            iso = _yyyymmdd_to_iso(parts[16])
            if iso:
                return iso
    return ""


def _extract_cpt_from_svc(parts: List[str]) -> Optional[str]:
    """Pull the CPT/HCPCS code out of an SVC composite element.

    SVC element 1 is a composite: `Qualifier>Code>Modifier>Modifier...`. Common
    qualifiers: HC (HCPCS/CPT), AD (dental), NU (revenue), N4 (NDC). We return
    the bare procedure code regardless of qualifier; the consumer cares about
    the code, not the namespace.
    """
    if len(parts) < 2 or not parts[1]:
        return None
    pieces = parts[1].split('>')
    if len(pieces) >= 2 and pieces[1].strip():
        return pieces[1].strip()
    return None


def parse_claim_context(
    segments: List[str],
    start_index: int,
    claim: EraClaim,
    payer_name: str,
    clp_segment_text: str = "",
) -> Optional[EraClaim]:
    """
    Parse claim context segments following a CLP segment.

    Looks ahead for:
    - NM1*QC / NM1*IL: Patient name (+ member ID from IL)
    - REF*TJ: Member ID fallback
    - DTM*232 / DTM*233: Service date range
    - SVC: Service line — captures CPT, scopes subsequent CAS until the next SVC
    - CAS: Adjustment / denial reason — attributed to the current SVC if any

    Returns the populated claim or None if no denials were parsed.
    """
    index = start_index
    current_svc_text = ""
    current_cpt: Optional[str] = None
    cpt_codes_seen: List[str] = []

    while index < len(segments):
        segment = segments[index]
        parts = segment.split('*')
        tag = parts[0] if parts else ''

        # Stop at next CLP or end of transaction set
        if tag == 'CLP':
            break

        # SVC introduces a new service line. CAS that follows attributes to it.
        elif tag == 'SVC':
            current_svc_text = segment + "~"
            current_cpt = _extract_cpt_from_svc(parts)
            if current_cpt and current_cpt not in cpt_codes_seen:
                cpt_codes_seen.append(current_cpt)

        # Extract patient name from NM1. NM1*QC (Patient) is the authoritative
        # source when present, but many payers only emit NM1*IL (Insured) when
        # the patient IS the subscriber — fall back to IL in that case.
        elif tag == 'NM1' and len(parts) >= 5:
            entity_type = parts[1]
            if entity_type == 'QC':
                # NM1*QC*1*Last*First*MI*SSN — QC is authoritative, always wins.
                last_name = parts[3].strip() if parts[3] else ""
                first_name = parts[4].strip() if parts[4] else ""
                claim.patient_name = f"{first_name} {last_name}".strip()
            elif entity_type == 'IL' and not claim.patient_name:
                # NM1*IL*1*Last*First*Middle***IDQual*MemberId
                last_name = parts[3].strip() if parts[3] else ""
                first_name = parts[4].strip() if parts[4] else ""
                claim.patient_name = f"{first_name} {last_name}".strip()
                # Also harvest member ID if the qualifier slot says so.
                # MI=Member ID, II=Standard Unique Health ID, 34=SSN.
                if (
                    not claim.member_id
                    and len(parts) >= 10
                    and parts[8] in ("MI", "II", "34")
                ):
                    claim.member_id = parts[9].strip()

        # Extract member ID from REF*TJ
        elif tag == 'REF' and len(parts) >= 3:
            qualifier = parts[1]
            if qualifier == 'TJ' and len(parts) >= 3 and not claim.member_id:
                claim.member_id = parts[2].strip()

        # Extract service dates from DTM*232/233
        elif tag == 'DTM' and len(parts) >= 3:
            qualifier = parts[1]
            date_value = parts[2]

            try:
                # DTM format: YYYYMMDD
                if len(date_value) == 8 and date_value.isdigit():
                    year = date_value[0:4]
                    month = date_value[4:6]
                    day = date_value[6:8]
                    formatted_date = f"{year}-{month}-{day}"

                    if qualifier == '232':  # Service date start
                        claim.service_date_start = formatted_date
                    elif qualifier == '233':  # Service date end
                        claim.service_date_end = formatted_date
            except (ValueError, IndexError):
                pass  # Skip invalid dates

        # Extract denial adjustments from CAS segments
        elif tag == 'CAS':
            # CAS*Group*Code*Amount*Units*Code*Amount...
            # Handle both: CAS*CO*26*22216*0 and CAS*CO-50*50016*0

            group = parts[1] if len(parts) > 1 else ""
            cas_text = segment + "~"
            # Compose the verbatim snippet: CLP + (SVC if in scope) + CAS.
            snippet_parts = [s for s in (clp_segment_text, current_svc_text, cas_text) if s]
            snippet = "\n".join(snippet_parts)

            # Check if code is already in group (e.g., "CO-50")
            if group and '-' in group:
                # Format: CAS*CO-50*50016*0
                full_code = group
                try:
                    amount = float(parts[2]) if len(parts) > 2 else 0.0
                except ValueError:
                    amount = 0.0

                claim.denials.append(EraDenial(
                    code=full_code,
                    reason="",
                    amount=amount,
                    claim_group=claim.control_number,
                    cpt=current_cpt,
                    raw_snippet=snippet,
                ))
                claim.denied += amount

            else:
                # Format: CAS*CO*50*50016*0
                i = 2
                while i + 1 < len(parts):
                    code = parts[i]
                    try:
                        amount = float(parts[i + 1])
                    except ValueError:
                        amount = 0.0

                    if code:
                        full_code = f"{group}-{code}"
                        claim.denials.append(EraDenial(
                            code=full_code,
                            reason="",
                            amount=amount,
                            cpt=current_cpt,
                            raw_snippet=snippet,
                            claim_group=claim.control_number
                        ))
                        claim.denied += amount
                    i += 3  # Skip units field

        index += 1

    claim.cpt_codes = cpt_codes_seen
    return claim if claim.denials else None


def parse(era: str) -> List[EraClaim]:
    """
    Parse ERA/835 file deterministically.

    For structured inputs like ERA/835, use deterministic parsing.
    Only use AI for semi-structured/unstructured inputs (PDFs, screenshots).
    """
    logger.info(f"Parsing ERA file deterministically ({len(era)} chars)")

    # Try to detect if this is a real 835 file
    has_835_structure = (
        'ISA*' in era[:200] or  # EDI interchange control header
        'GS*HP*' in era[:200] or  # Functional group header
        'ST*835' in era  # Transaction set header
    )

    if has_835_structure:
        # Real 835 format - use proper EDI parsing
        return parse_era_835(era)
    else:
        # Simple text format - use basic parsing
        return parse_simple_era(era)


def parse_simple_era(era: str) -> List[EraClaim]:
    """
    Fallback parser for simple text-based ERA-like files.

    Uses regex patterns to extract common ERA elements.
    Less reliable than proper 835 parsing but works for basic formats.
    """
    claims: List[EraClaim] = []

    # Find CLP segments (claims). Character classes exclude `~` (segment
    # terminator) and whitespace so a group can't bleed into the next segment.
    clp_pattern = re.compile(r'CLP\*([^*~\s]+)\*(\d+)\*([^*~\s]+)\*([^*~\s]+)', re.IGNORECASE)
    denials_pattern = re.compile(r'CAS\*([^*~\s]+)\*([^*~\s]+)\*([^*~\s]+)', re.IGNORECASE)
    nm1_pattern = re.compile(r'NM1\*QC\*\d+\*([^*~]+)\*([^*~]+)', re.IGNORECASE)
    dtm_pattern = re.compile(r'DTM\*232\*(\d{8})', re.IGNORECASE)
    dtm_end_pattern = re.compile(r'DTM\*233\*(\d{8})', re.IGNORECASE)
    ref_pattern = re.compile(r'REF\*TJ\*([^*~]+)', re.IGNORECASE)
    payer_pattern = re.compile(r'N1\*PR\*([^*~]+)', re.IGNORECASE)

    for clp_match in clp_pattern.finditer(era):
        control_number = clp_match.group(1)
        billed_amount = float(clp_match.group(3))
        paid_amount = float(clp_match.group(4)) if clp_match.group(4) else 0.0

        # Find surrounding context for this claim
        context_start = clp_match.start()
        context_end = clp_match.end() + 500  # Look ahead 500 chars
        context = era[context_start:context_end]

        # Extract payer
        payer_match = payer_pattern.search(era[:context_start])
        payer_name = payer_match.group(1) if payer_match else "Unknown Payer"

        # Extract patient name
        nm1_match = nm1_pattern.search(context)
        patient_name = ""
        if nm1_match:
            first_name = nm1_match.group(1)  # Group 1 is first name
            last_name = nm1_match.group(2)   # Group 2 is last name
            patient_name = f"{first_name} {last_name}".strip()

        # Extract member ID
        ref_match = ref_pattern.search(context)
        member_id = ref_match.group(1) if ref_match else ""

        # Extract service dates
        service_date_start = None
        service_date_end = None
        dtm_match = dtm_pattern.search(context)
        if dtm_match:
            try:
                date_val = dtm_match.group(1)
                if len(date_val) == 8 and date_val.isdigit():
                    service_date_start = f"{date_val[0:4]}-{date_val[4:6]}-{date_val[6:8]}"
            except (ValueError, IndexError):
                pass

        dtm_end_match = dtm_end_pattern.search(context)
        if dtm_end_match:
            try:
                date_val = dtm_end_match.group(1)
                if len(date_val) == 8 and date_val.isdigit():
                    service_date_end = f"{date_val[0:4]}-{date_val[4:6]}-{date_val[6:8]}"
            except (ValueError, IndexError):
                pass

        # Find all CAS segments for this claim
        denials = []
        denied_total = 0.0

        # Search in broader context for CAS segments
        broader_context = era[max(0, context_start-200):min(len(era), context_end+200)]

        for cas_match in denials_pattern.finditer(broader_context):
            group = cas_match.group(1)
            code = cas_match.group(2)
            amount = float(cas_match.group(3)) if cas_match.group(3) else 0.0

            if code and amount > 0:
                full_code = f"{group}-{code}"
                denials.append(EraDenial(
                    code=full_code,
                    reason="",
                    amount=amount,
                    claim_group=control_number
                ))
                denied_total += amount

        if denials:
            claim = EraClaim(
                control_number=control_number,
                payer_name=payer_name,
                patient_name=patient_name,
                member_id=member_id,
                service_date_start=service_date_start,
                service_date_end=service_date_end,
                billed=billed_amount,
                paid=paid_amount,
                denied=denied_total,
                claim_status="4",  # Assume denied if we have denials
                denials=denials
            )
            claims.append(claim)

    return claims


# Keep the old parse_simple function name for backward compatibility
parse_simple = parse_simple_era
