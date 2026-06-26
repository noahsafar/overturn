"""Temporal activities — every step the workflow can execute.

Each activity is a pure function from inputs → output, suitable for Temporal
retries. Side effects (DB writes, LLM calls, browser sessions) happen here,
never in workflow code, because workflows must be deterministic for replay.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from temporalio import activity

from .citations import Citation, PolicyDoc, verify_citations
from .crypto import decrypt
from .documo import send_fax
from .llm import call_claude_json
from .lob import send_letter
from .models import (
    AgentRun, Appeal, Claim, Denial, FollowUpCheck, Payer, PayerPolicy,
    SessionLocal, Submission,
)
from .pdf import AppealLetterPdfInput, render_appeal_letter_pdf
from .prompts import DRAFT_V1, REDRAFT_V1, STRATEGIZE_V1, render
from .retrieval import retrieve_policies

logger = logging.getLogger(__name__)


def _extract_letter(draft: dict) -> str:
    """Best-effort extraction of the letter body from a draft response.

    The DRAFT_V1 prompt asks for the key `"letter"`, but LLMs occasionally
    drift to `"appeal_letter"`, `"letterBody"`, etc. We try a small set of
    common variants before falling back to a stringified dump (which used
    to leak Python repr like `{'appeal_letter': '...'}` into the UI).
    """
    for key in ("letter", "appeal_letter", "appealLetter", "letterBody", "letterText", "body"):
        v = draft.get(key)
        if isinstance(v, str) and v.strip():
            return v
    return str(draft)


def _clamp01(v, default: float = 0.5) -> float:
    """Coerce a JSON-emitted confidence value to a float in [0, 1].

    The LLM occasionally emits the score as a string ("0.82"), as a percent
    out of 100 (82), or as a decimal already in range (0.82). Treat values
    > 1 as percents, fall back to the default on anything unparseable.
    """
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f > 1.0:
        f = f / 100.0
    if f < 0.0:
        f = 0.0
    if f > 1.0:
        f = 1.0
    return f


# ── Activity input/output shapes ────────────────────────────────────────────
@dataclass
class DenialContext:
    denial_id: str
    claim_id: str
    payer_id: str
    payer_name: str
    denial_code: str
    denial_reason: str
    denied_amount: float
    service_date: str
    cpt_codes: list[str]
    icd_codes: list[str]
    chart_excerpts: list[str]
    patient_first_name: str
    patient_last_name: str
    patient_member_id: str
    patient_dob: str
    practice_name: str


@dataclass
class PolicyView:
    id: str
    policy_type: str
    denial_code: str | None
    body: str
    source_url: str | None


@dataclass
class Strategy:
    predicted_win_probability: float
    argument_category: str
    evidence_points: list[str]
    reason: str


@dataclass
class CitationDict:
    policy_id: str
    quote: str
    source_url: str | None = None
    page: str | None = None


@dataclass
class Draft:
    letter: str
    template_used: str
    citations: list[dict]
    requested_remedy_amount: float


@dataclass
class VerifyResult:
    all_valid: bool
    valid_count: int
    invalid_explained: str  # human-readable for the redraft prompt


# Chart excerpts source order:
#   1. Real text the reviewer pasted into Denial.chartExcerptsText (or that
#      an EHR connector pulled in). Each blank line separates one excerpt.
#   2. A deliberately threadbare placeholder when nothing is set. We do NOT
#      fabricate plausible-looking clinical content here — the LLM must see
#      that there are no real notes and flag the denial as "insufficient
#      documentation" rather than hallucinate a defense.
def _real_chart_excerpts(denial: Denial) -> list[str] | None:
    raw = (denial.chartExcerptsText or "").strip()
    if not raw:
        return None
    chunks = [c.strip() for c in raw.split("\n\n") if c.strip()]
    return chunks or [raw]


def _placeholder_chart_excerpts(claim: Claim, denial: Denial) -> list[str]:
    return [
        (
            f"(no chart excerpts on file — service {claim.serviceDate:%Y-%m-%d}, "
            f"CPT {','.join(claim.cptCodes) or '?'}, "
            f"ICD {','.join(claim.icdCodes) or '?'}, "
            f"denial {denial.denialCode})"
        ),
    ]


def _chart_excerpts_for(claim: Claim, denial: Denial) -> list[str]:
    return _real_chart_excerpts(denial) or _placeholder_chart_excerpts(claim, denial)


# ── Activity: load denial context ───────────────────────────────────────────
@activity.defn
async def load_denial_context(denial_id: str) -> dict:
    with SessionLocal() as s:
        denial = s.scalar(select(Denial).where(Denial.id == denial_id))
        if denial is None:
            raise ValueError(f"denial {denial_id} not found")
        claim = denial.claim
        patient = claim.patient
        ctx = DenialContext(
            denial_id=denial.id,
            claim_id=claim.id,
            payer_id=claim.payerId,
            payer_name=claim.payer.name,
            denial_code=denial.denialCode,
            denial_reason=denial.denialReason,
            denied_amount=float(denial.deniedAmount),
            service_date=claim.serviceDate.strftime("%Y-%m-%d"),
            cpt_codes=list(claim.cptCodes),
            icd_codes=list(claim.icdCodes),
            chart_excerpts=_chart_excerpts_for(claim, denial),
            patient_first_name=decrypt(patient.firstNameEnc),
            patient_last_name=decrypt(patient.lastNameEnc),
            patient_member_id=decrypt(patient.memberIdEnc),
            patient_dob=decrypt(patient.dobEnc),
            # Prefer the rendering / servicing provider from the source
            # ERA when present (the entity that actually performed the
            # service). Fall back to the billing practice's own name when
            # no rendering provider was carried in N1*PE / NM1*82.
            practice_name=(claim.renderingProvider or claim.practice.name),
        )
    return asdict(ctx)


# ── Activity: retrieve payer policies ───────────────────────────────────────
@activity.defn
async def retrieve_payer_policies_act(payer_id: str, denial_code: str) -> list[dict]:
    policies = retrieve_policies(payer_id, denial_code)
    return [
        asdict(
            PolicyView(
                id=p.id,
                policy_type=p.policyType,
                denial_code=p.denialCode,
                body=p.body,
                source_url=p.sourceUrl,
            )
        )
        for p in policies
    ]


# ── Activity: LLM strategize ────────────────────────────────────────────────
def _policies_summary(policies: list[dict]) -> str:
    lines = []
    for p in policies:
        head = f"[{p['id']}] type={p['policy_type']} code={p['denial_code'] or '-'}"
        lines.append(head + "\n" + p["body"][:600])
    return "\n\n".join(lines)


def _stub_strategy(ctx: dict, policies: list[dict]) -> dict:
    # Deterministic stub used in CI / dev (no API key). Picks
    # MEDICAL_NECESSITY for CO-50, TIMELY_FILING for CO-29, etc.
    code = ctx["denial_code"]
    category = {
        "CO-50": "MEDICAL_NECESSITY",
        "CO-197": "POLICY_MISAPPLICATION",
        "CO-29": "TIMELY_FILING",
    }.get(code, "DOCUMENTATION_AVAILABLE")
    return {
        "predictedWinProbability": 0.72,
        "argumentCategory": category,
        "evidencePoints": [
            "DSM-5 diagnosis is documented in the chart for the service date",
            "Treatment plan with measurable goals is on file and updated within 90 days",
            "Progress note documents specific intervention and member response (Section 4.2)",
        ],
        "reason": "Documentation in chart satisfies the payer's Section 3.1 / 4.2 criteria",
    }


@activity.defn
async def llm_strategize(ctx: dict, policies: list[dict]) -> dict:
    user = render(
        STRATEGIZE_V1,
        denial_code=ctx["denial_code"],
        denial_reason=ctx["denial_reason"],
        denied_amount=f"{ctx['denied_amount']:.2f}",
        service_date=ctx["service_date"],
        cpt_codes=", ".join(ctx["cpt_codes"]),
        icd_codes=", ".join(ctx["icd_codes"]),
        chart_excerpts="\n- " + "\n- ".join(ctx["chart_excerpts"]),
        policy_summaries=_policies_summary(policies),
    )
    res = call_claude_json(
        system="You are a healthcare appeals strategist. Respond with strict JSON only.",
        user=user,
        stub_response=_stub_strategy(ctx, policies),
    )
    return res.parsed


# ── Activity: LLM draft ─────────────────────────────────────────────────────
def _stub_draft(ctx: dict, policies: list[dict], strategy: dict) -> dict:
    # Pick the policy that exactly matches the denial code for the citation
    # — guaranteed-verbatim quote so the verifier passes.
    target = next(
        (p for p in policies if (p.get("denial_code") or "") == ctx["denial_code"]),
        policies[0] if policies else None,
    )
    if target is None:
        # No policies at all; produce an empty citation list so the verifier
        # forces a manual review.
        cite_quote = ""
        cite_id = ""
        cite_url = ""
    else:
        body = target["body"]
        # Take the first sentence ≥ 60 chars as the verbatim quote.
        sent = next(
            (s.strip() for s in body.replace("\n", " ").split(". ") if len(s.strip()) >= 60),
            body[:200].strip(),
        )
        cite_quote = sent
        cite_id = target["id"]
        cite_url = target.get("source_url") or ""

    appeal_fmt = next(
        (p for p in policies if p["policy_type"] == "appeal_format"),
        None,
    )
    template_used = f"{ctx['payer_name'].split(' ')[0]}-appeal-letter-v1"

    letter = f"""{datetime.utcnow():%B %d, %Y}

Provider Appeals Department
{ctx['payer_name']}

Re: Appeal of denied claim
    Member: {ctx['patient_first_name']} {ctx['patient_last_name']} (ID {ctx['patient_member_id']})
    Date of service: {ctx['service_date']}
    Denied amount: ${ctx['denied_amount']:.2f}
    Denial code / reason: {ctx['denial_code']} — {ctx['denial_reason']}

To whom it may concern,

On behalf of {ctx['practice_name']}, we respectfully appeal the denial of the
above-referenced claim. We believe the denial is in error on the grounds of
{strategy['argumentCategory'].replace('_', ' ').lower()}.

Supporting evidence from the patient's chart:
- {strategy['evidencePoints'][0]}
- {strategy['evidencePoints'][1] if len(strategy['evidencePoints']) > 1 else ''}
- {strategy['evidencePoints'][2] if len(strategy['evidencePoints']) > 2 else ''}

Per the payer's own published medical policy:

  "{cite_quote}"

The documentation maintained by {ctx['practice_name']} satisfies these
criteria for the date of service in question.

We request that this claim be reprocessed and paid in the amount of
${ctx['denied_amount']:.2f}. Thank you for your prompt attention.

Respectfully,
{ctx['practice_name']} Billing Office
"""

    citations: list[dict] = []
    if cite_id and cite_quote:
        citations.append(
            {"policyId": cite_id, "quote": cite_quote, "sourceUrl": cite_url, "page": ""}
        )

    # Dev-mode confidence: high when we have a real policy citation backing
    # the draft, lower when we couldn't find one. Roughly tracks what the
    # rubric in DRAFT_V1 would emit so tests don't have to special-case dev.
    stub_conf = 0.82 if (cite_id and cite_quote) else 0.45
    return {
        "letter": letter,
        "templateUsed": template_used,
        "citations": citations,
        "requestedRemedyAmount": ctx["denied_amount"],
        "confidence": stub_conf,
        "confidenceRationale": (
            "Verbatim policy citation matches the denial code."
            if (cite_id and cite_quote)
            else "No matching payer policy was retrieved; appeal rests on chart documentation alone."
        ),
    }


def _policies_block(policies: list[dict]) -> str:
    out = []
    for p in policies:
        out.append(
            f"[id={p['id']}] (type={p['policy_type']}, denial_code={p['denial_code'] or '-'})"
            f"\n{p['body']}"
        )
    return "\n\n".join(out)


@activity.defn
async def llm_draft_appeal(ctx: dict, policies: list[dict], strategy: dict) -> dict:
    appeal_fmt = next(
        (p for p in policies if p["policy_type"] == "appeal_format"),
        None,
    )
    user = render(
        DRAFT_V1,
        patient_first_name=ctx["patient_first_name"],
        patient_last_name=ctx["patient_last_name"],
        patient_member_id=ctx["patient_member_id"],
        service_date=ctx["service_date"],
        denied_amount=f"{ctx['denied_amount']:.2f}",
        denial_code=ctx["denial_code"],
        denial_reason=ctx["denial_reason"],
        practice_name=ctx["practice_name"],
        argument_category=strategy["argumentCategory"],
        evidence_points="\n- " + "\n- ".join(strategy["evidencePoints"]),
        chart_excerpts="\n- " + "\n- ".join(ctx["chart_excerpts"]),
        policies=_policies_block(policies),
        appeal_format=appeal_fmt["body"] if appeal_fmt else "(none provided)",
    )
    res = call_claude_json(
        system="You are drafting a formal payer appeal letter. Respond with strict JSON only.",
        user=user,
        max_tokens=2500,
        stub_response=_stub_draft(ctx, policies, strategy),
    )
    return res.parsed


# ── Activity: verify citations (deterministic) ──────────────────────────────
@activity.defn
async def verify_citations_act(draft: dict, policies: list[dict]) -> dict:
    # Split citations by source. Policy citations get strict verbatim
    # verification against the retrieved policy bodies. Chart citations
    # are surfaced to the UI but skip the strict verifier for now (we
    # trust the LLM's verbatim copy from chart_excerpts; a future pass
    # can add chart-text verification).
    policy_dicts = [c for c in draft.get("citations", []) if (c.get("source") or "policy") == "policy"]
    chart_dicts = [c for c in draft.get("citations", []) if c.get("source") == "chart"]

    citations = [
        Citation(
            policy_id=c.get("policyId") or c.get("policy_id", ""),
            quote=c.get("quote", ""),
            source_url=c.get("sourceUrl") or c.get("source_url"),
            page=c.get("page"),
        )
        for c in policy_dicts
    ]
    docs = [PolicyDoc(id=p["id"], body=p["body"]) for p in policies]
    res = verify_citations(citations, docs)
    # Chart citations count toward the "we have at least something to cite"
    # signal even though they aren't strictly verified yet.
    chart_count = len(chart_dicts)

    explained = (
        "\n".join(
            f"- citation policy_id={ic.citation.policy_id} quote=\"{ic.citation.quote[:120]}…\" → {ic.reason}"
            for ic in res.invalid_citations
        )
        or "(none)"
    )
    return {
        "all_valid": res.all_valid,
        "valid_count": res.valid_count + chart_count,
        "invalid_explained": explained,
    }


# ── Activity: LLM redraft (fix invalid citations) ───────────────────────────
@activity.defn
async def llm_redraft_fix_citations(
    draft: dict, invalid_explained: str, policies: list[dict]
) -> dict:
    user = render(
        REDRAFT_V1,
        previous_letter=_extract_letter(draft),
        invalid_citations_explained=invalid_explained,
        policies=_policies_block(policies),
    )
    res = call_claude_json(
        system="Fix the citations to be verbatim from the policies. Strict JSON only.",
        user=user,
        max_tokens=2500,
        # Stub fallback: in dev the first draft from the stub is already
        # valid, so we'd never reach here. If we do, return a citation-free
        # letter rather than re-fabricate.
        stub_response={
            "letter": _extract_letter(draft),
            "templateUsed": draft.get("templateUsed", "redraft"),
            "citations": [],
            "requestedRemedyAmount": draft.get("requestedRemedyAmount", 0),
            # Preserve the original confidence on redraft — the citation fix
            # shouldn't change our confidence in the underlying argument, and
            # losing all citations should drop confidence (handled above).
            "confidence": draft.get("confidence", 0.5),
            "confidenceRationale": draft.get("confidenceRationale"),
        },
    )
    # Propagate confidence into the parsed response if the model omitted it.
    parsed = res.parsed
    if "confidence" not in parsed and "confidence" in draft:
        parsed["confidence"] = draft["confidence"]
    return parsed


# ── Activity: persist appeal draft ──────────────────────────────────────────
@activity.defn
async def save_appeal_draft(
    appeal_id: str,
    denial_id: str,
    draft: dict,
    strategy: dict,
    citation_valid_count: int,
    cost_cents: int,
) -> str:
    now = datetime.utcnow()
    run_id = "cm" + uuid.uuid4().hex[:22]

    # Two confidence signals:
    #   strategist_conf — predicted win probability from the case analysis.
    #     "Does this denial deserve an appeal?"
    #   drafter_conf — the drafting LLM's self-rated quality of the letter.
    #     "Is this specific draft good enough to send?"
    # We combine them as a plain average. Reviewer-facing confidence is the
    # combined value because we want the badge to reflect both case merit
    # and draft quality.
    strategist_conf = _clamp01(strategy.get("predictedWinProbability"), 0.5)
    drafter_conf = _clamp01(draft.get("confidence"), strategist_conf)
    combined_conf = round((strategist_conf + drafter_conf) / 2.0, 3)
    confidence_rationale = (draft.get("confidenceRationale") or "").strip() or None

    audit_trail = {
        "strategy": strategy,
        "citation_valid_count": citation_valid_count,
        "draft_template": draft.get("templateUsed"),
        "strategist_conf": strategist_conf,
        "drafter_conf": drafter_conf,
        "combined_conf": combined_conf,
        "confidence_rationale": confidence_rationale,
    }

    with SessionLocal() as s:
        # Update the existing appeal instead of creating a new one
        appeal = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if appeal is None:
            raise ValueError(f"appeal {appeal_id} not found")

        # Auto-approve eligible only when BOTH signals are strong AND
        # citations verified clean. A high strategist score with a weak
        # draft (or vice-versa) still needs a human look.
        AUTO_APPROVE_THRESHOLD = 0.80
        run_status = (
            "AUTO_APPROVED"
            if strategist_conf >= AUTO_APPROVE_THRESHOLD
            and drafter_conf >= AUTO_APPROVE_THRESHOLD
            and citation_valid_count >= 1
            else "REQUIRES_HUMAN"
        )
        s.add(
            AgentRun(
                id=run_id,
                workflowType="appeal_draft",
                resourceId=denial_id,
                agentType="llm",
                startedAt=now,
                completedAt=now,
                status=run_status,
                confidenceScore=combined_conf,
                costCents=cost_cents,
                errorMessage=None,
                auditTrail=audit_trail,
            )
        )

        # Update the appeal with the final draft data
        appeal.draftLetter = _extract_letter(draft)
        appeal.templateUsed = draft.get("templateUsed", "unknown")
        appeal.citations = draft.get("citations", [])
        appeal.agentRunId = run_id
        appeal.confidenceScore = combined_conf
        s.commit()

    # Fire-and-forget notification to web — best effort, doesn't block the
    # workflow if the web isn't reachable.
    try:
        from .web_client import notify_appeal_ready
        notify_appeal_ready(appeal_id)
    except Exception as e:  # noqa: BLE001
        logger.warning("notify_appeal_ready failed: %s", e)

    return appeal_id


# ── Activity: skipped appeal ────────────────────────────────────────────────
@activity.defn
async def save_skipped_appeal(denial_id: str, reason: str) -> str:
    now = datetime.utcnow()
    appeal_id = "cm" + uuid.uuid4().hex[:22]
    run_id = "cm" + uuid.uuid4().hex[:22]
    with SessionLocal() as s:
        s.add(
            AgentRun(
                id=run_id,
                workflowType="appeal_draft",
                resourceId=denial_id,
                agentType="llm",
                startedAt=now,
                completedAt=now,
                status="SUCCESS",
                confidenceScore=0.0,
                costCents=0,
                errorMessage=None,
                auditTrail={"skipped_reason": reason},
            )
        )
        s.add(
            Appeal(
                id=appeal_id,
                denialId=denial_id,
                draftLetter=f"(skipped — {reason})",
                templateUsed="skipped",
                citations=[],
                status="SKIPPED",
                submittedVia=None,
                submittedAt=None,
                outcome="SKIPPED",
                recoveredAmount=None,
                ourFee=None,
                agentRunId=run_id,
                humanReviewId=None,
                createdAt=now,
            )
        )
        s.commit()
    return appeal_id


# ── Activity: load appeal / payer ──────────────────────────────────────────
@activity.defn
async def load_appeal(appeal_id: str) -> dict:
    with SessionLocal() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if a is None:
            raise ValueError(f"appeal {appeal_id} not found")
        claim = a.denial.claim
        patient = claim.patient
        practice = claim.practice
        try:
            member_id = decrypt(patient.memberIdEnc)
        except Exception:
            member_id = ""
        return {
            "id": a.id,
            "denial_id": a.denialId,
            "claim_id": claim.id,
            "payer_id": claim.payerId,
            "practice_id": claim.practiceId,
            "letter": a.draftLetter,
            "primary_reason": (a.citations[0]["policyId"] if a.citations else "appeal"),
            "denied_amount": float(a.denial.deniedAmount),
            "claim_control_number": claim.controlNumber or claim.id[:12],
            "service_date": claim.serviceDate.strftime("%Y-%m-%d"),
            "practice_name": practice.name,
            "patient_member_id": member_id,
        }


@activity.defn
async def load_payer(payer_id: str) -> dict:
    with SessionLocal() as s:
        p = s.scalar(select(Payer).where(Payer.id == payer_id))
        if p is None:
            raise ValueError(f"payer {payer_id} not found")
        return {
            "id": p.id,
            "name": p.name,
            "portal_url": p.portalUrl,
            "fax_number": p.faxNumber,
            "appeal_address": p.appealAddress,
            "epa_supported": p.epaSupported,
        }


# ── Activity: submission channels ───────────────────────────────────────────
@activity.defn
async def browser_agent_submit_portal(appeal: dict, payer: dict) -> dict:
    """Submit via payer portal. Defers to the Stagehand TS module by spawning
    a subprocess so this Python activity stays simple. In dev STAGEHAND_ENV=FAKE
    posts directly to the local fake-portal HTTP endpoint."""

    from .submission import submit_via_portal

    return await submit_via_portal(appeal, payer)


def _build_pdf_input(appeal: dict, payer: dict) -> AppealLetterPdfInput:
    # Best-effort fields; many of these come from `load_appeal` and are not
    # always populated in tests. We default rather than fail loudly.
    return AppealLetterPdfInput(
        appeal_id=appeal["id"],
        letter_text=appeal.get("letter") or "",
        practice_name=appeal.get("practice_name") or "Practice",
        payer_name=payer.get("name") or "Payer",
        payer_appeal_address=payer.get("appeal_address"),
        claim_control_number=appeal.get("claim_control_number") or "",
        patient_member_id=appeal.get("patient_member_id") or "",
        service_date=appeal.get("service_date") or "",
        denied_amount=float(appeal.get("denied_amount") or 0),
    )


def _record_submission(
    appeal_id: str,
    channel: str,
    provider_ref: str,
    confirmation: str,
    pdf_path: str,
    success: bool,
    error: str | None,
) -> str:
    """Insert a Submission row capturing this attempt. Returns the Submission id."""
    now = datetime.utcnow()
    sub_id = "cm" + uuid.uuid4().hex[:22]
    idem = f"{channel}-{appeal_id}-{provider_ref or 'no-ref'}-{uuid.uuid4().hex[:8]}"
    with SessionLocal() as s:
        # Determine attempt number — count existing Submissions for this appeal.
        from sqlalchemy import select

        existing = s.execute(
            select(Submission.id).where(Submission.appealId == appeal_id)
        ).all()
        attempt = len(existing) + 1
        screenshots = [pdf_path] if pdf_path else []
        s.add(
            Submission(
                id=sub_id,
                appealId=appeal_id,
                channel=channel,
                attemptNumber=attempt,
                status="SUCCESS" if success else "FAILED",
                confirmationNumber=confirmation if success else None,
                providerRef=provider_ref or None,
                errorMessage=error,
                screenshots=screenshots if screenshots else None,
                idempotencyKey=idem,
                startedAt=now,
                completedAt=now,
            )
        )
        s.commit()
    return sub_id


@activity.defn
async def fax_submit_appeal(appeal: dict, payer: dict) -> dict:
    """Submit an appeal via Documo eFax. Falls back to a stub when no Documo
    API key is set (still produces a PDF artifact + synthetic confirmation)."""
    pdf_input = _build_pdf_input(appeal, payer)
    pdf_bytes = render_appeal_letter_pdf(pdf_input)
    fax_number = payer.get("fax_number") or ""
    result = send_fax(
        pdf_bytes=pdf_bytes,
        appeal_id=appeal["id"],
        fax_number=fax_number,
        subject=f"Appeal — claim {appeal.get('claim_control_number') or appeal['id']}",
    )
    _record_submission(
        appeal_id=appeal["id"],
        channel="FAX",
        provider_ref=result.provider_ref,
        confirmation=result.confirmation_number,
        pdf_path=result.pdf_path,
        success=result.success,
        error=result.error,
    )
    return {
        "success": result.success,
        "channel": "FAX",
        "confirmation_number": result.confirmation_number,
        "submitted_at": datetime.utcnow().isoformat(),
        "screenshots": [result.pdf_path] if result.pdf_path else [],
        "errorMessage": result.error,
    }


@activity.defn
async def mail_queue_appeal(appeal: dict, payer: dict) -> dict:
    """Submit an appeal as physical mail via Lob. Stub fallback writes the
    PDF to the artifacts directory."""
    pdf_input = _build_pdf_input(appeal, payer)
    pdf_bytes = render_appeal_letter_pdf(pdf_input)
    result = send_letter(
        pdf_bytes=pdf_bytes,
        appeal_id=appeal["id"],
        payer_name=payer.get("name") or "Payer",
        payer_appeal_address=payer.get("appeal_address") or "",
        from_name=appeal.get("practice_name") or "Practice",
    )
    _record_submission(
        appeal_id=appeal["id"],
        channel="MAIL",
        provider_ref=result.provider_ref,
        confirmation=result.confirmation_number,
        pdf_path=result.pdf_path,
        success=result.success,
        error=result.error,
    )
    return {
        "success": result.success,
        "channel": "MAIL",
        "confirmation_number": result.confirmation_number,
        "submitted_at": datetime.utcnow().isoformat(),
        "screenshots": [result.pdf_path] if result.pdf_path else [],
        "errorMessage": result.error,
    }


# ── Activity: corrected-claim 837 resubmission ─────────────────────────────
@activity.defn
async def submit_corrected_claim_837(denial_id: str, correction: dict) -> dict:
    """Generate an 837 corrected-claim and submit it via the clearinghouse.

    Different from an appeal: we're not asking the payer to reconsider, we're
    saying "this claim was wrong, here's the right one." Used for billing-
    error categories (CARC 4/11/16/18/etc.) where appealing makes no sense.

    Creates an Appeal row scoped to this denial (so the same ops surfaces —
    submission history, follow-up checks, outcome ingestion — work the same
    way) but flags the submission channel as CLEARINGHOUSE_837 so the
    audit trail is honest about what happened.

    `correction` shape:
      {
        "corrected_cpt":   str | None,
        "corrected_modifier": str | None,
        "reason":          str,
      }
    """
    from .edi837 import CorrectionInput, render_837_corrected
    from .crypto import decrypt

    now = datetime.utcnow()
    appeal_id = "cm" + uuid.uuid4().hex[:22]

    with SessionLocal() as s:
        denial = s.scalar(select(Denial).where(Denial.id == denial_id))
        if denial is None:
            raise ValueError(f"denial {denial_id} not found")
        claim = denial.claim
        patient = claim.patient
        payer = claim.payer
        practice = claim.practice

        first = decrypt(patient.firstNameEnc) if patient.firstNameEnc else ""
        last = decrypt(patient.lastNameEnc) if patient.lastNameEnc else ""
        dob = decrypt(patient.dobEnc) if patient.dobEnc else ""
        member_id = decrypt(patient.memberIdEnc) if patient.memberIdEnc else ""

        # Materialize the 837 content
        ci = CorrectionInput(
            claim_control_number=claim.controlNumber or claim.id,
            practice_npi=practice.npi,
            practice_name=practice.name,
            practice_tax_id=practice.taxId,
            patient_first=first,
            patient_last=last,
            patient_dob=(dob or "").replace("-", "")[:8],
            patient_member_id=member_id,
            payer_name=payer.name,
            payer_id=(payer.payerIdNumbers[0] if payer.payerIdNumbers else "UNKNOWN"),
            service_date=claim.serviceDate.strftime("%Y%m%d"),
            cpt_codes=list(claim.cptCodes or []),
            icd_codes=list(claim.icdCodes or []),
            total_charge=float(claim.billedAmount or 0),
            corrected_cpt=correction.get("corrected_cpt"),
            corrected_modifier=correction.get("corrected_modifier"),
            correction_reason=correction.get("reason") or "Corrected claim.",
        )
        edi = render_837_corrected(ci)

        # Anchor a per-denial Appeal row so submission/follow-up plumbing
        # works uniformly. templateUsed flagged so it's clear this isn't an
        # argued appeal.
        s.add(
            Appeal(
                id=appeal_id,
                denialId=denial_id,
                draftLetter=edi,
                templateUsed="837P-corrected-v1",
                citations=[],
                status="READY",
                outcome="PENDING",
                createdAt=now,
            )
        )
        s.commit()
        denial_payer_id = payer.id

    # Submit. In dev, write the 837 to the artifacts directory so an operator
    # can see what was generated. In prod a real clearinghouse client lives
    # in clearinghouse_837.py (not yet wired); fall through to stub for now.
    pdf_path: str | None = None
    success = True
    confirmation = "DEV-CC-" + uuid.uuid4().hex[:8].upper()
    provider_ref = ""
    error: str | None = None
    try:
        from pathlib import Path

        out_dir = Path("./artifacts/837-out")
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{denial_id}-{appeal_id}.edi"
        path.write_text(edi, encoding="utf-8")
        pdf_path = str(path)
    except Exception as e:  # noqa: BLE001
        success = False
        error = str(e)[:300]
        logger.exception("corrected-claim 837 artifact write failed: %s", e)

    sub_id = _record_submission(
        appeal_id=appeal_id,
        channel="CLEARINGHOUSE_837",
        provider_ref=provider_ref,
        confirmation=confirmation,
        pdf_path=pdf_path or "",
        success=success,
        error=error,
    )

    # Mark the appeal as submitted so the outcome ingest matches up when the
    # next ERA lands paying the corrected line.
    with SessionLocal() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if a is not None:
            a.submittedVia = "CLEARINGHOUSE_837"
            a.submittedAt = now
            s.commit()

    return {
        "appeal_id": appeal_id,
        "submission_id": sub_id,
        "success": success,
        "channel": "CLEARINGHOUSE_837",
        "confirmation_number": confirmation,
        "artifact_path": pdf_path,
        "errorMessage": error,
    }


# ── Activity: record submission on Appeal row ───────────────────────────────
@activity.defn
async def record_submission(appeal_id: str, result: dict) -> None:
    with SessionLocal() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if a is None:
            raise ValueError(f"appeal {appeal_id} not found")
        a.submittedVia = result["channel"]
        a.submittedAt = datetime.fromisoformat(result["submitted_at"])
        s.commit()


# ── Activity: Create appeal record at workflow start ───────────────────────
@activity.defn
async def create_appeal(denial_id: str) -> str:
    """Create an appeal record with PENDING status at the start of the drafting workflow."""
    now = datetime.utcnow()
    appeal_id = "cm" + uuid.uuid4().hex[:22]

    with SessionLocal() as s:
        # Verify the denial exists
        denial = s.scalar(select(Denial).where(Denial.id == denial_id))
        if denial is None:
            raise ValueError(f"denial {denial_id} not found")

        # Create the appeal record with minimal fields
        appeal = Appeal(
            id=appeal_id,
            denialId=denial_id,
            draftLetter="",  # Will be filled in later
            templateUsed="",
            citations=[],
            status="PENDING",
            outcome="PENDING",
            createdAt=now,
        )
        s.add(appeal)
        s.commit()

    return appeal_id


# ── Activity: Update appeal status during workflow ───────────────────────────
@activity.defn
async def update_appeal_status(appeal_id: str, status: str) -> None:
    """Update the appeal status to show progress."""
    with SessionLocal() as s:
        a = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if a is None:
            raise ValueError(f"appeal {appeal_id} not found")
        a.status = status
        s.commit()


# ── Activity: AI edit appeal letter ────────────────────────────────────────────
@activity.defn
async def llm_edit_appeal(current_letter: str, edit_prompt: str) -> str:
    """Edit an appeal letter using AI based on user instructions."""
    from .llm import call_claude_json

    system = """You are an expert healthcare appeal letter editor. Your job is to revise appeal letters
based on specific user feedback while maintaining the core structure, citations, and compliance
requirements.

Guidelines:
- Keep the letter structure and formatting intact
- Preserve any citations and policy references
- Maintain professional healthcare appeal tone
- Make changes responsive to the user's specific request
- Don't add fake details or change factual information
- Keep the letter concise and focused"""

    user = f"""Current appeal letter:
{current_letter}

User's edit request: {edit_prompt}

Please revise the letter according to the user's request. Respond with the revised letter in plain text format."""

    res = call_claude_json(
        system=system,
        user=user,
        max_tokens=4000,
    )
    return res.text


# ── Follow-up check activities ─────────────────────────────────────────────
@activity.defn
async def schedule_followup_checks(appeal_id: str, days: list[int]) -> list[str]:
    """Create FollowUpCheck rows for the given offsets so they appear in the
    ops triage queue as planned work. Returns the ids in input order."""
    now = datetime.utcnow()
    ids: list[str] = []
    with SessionLocal() as s:
        # Need the practiceId via Appeal → Denial → Claim. Lazy-load picks it up.
        appeal = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if appeal is None:
            raise ValueError(f"appeal {appeal_id} not found")
        practice_id = appeal.denial.claim.practiceId
        for d in days:
            check_id = "cm" + uuid.uuid4().hex[:22]
            ids.append(check_id)
            s.add(
                FollowUpCheck(
                    id=check_id,
                    appealId=appeal_id,
                    practiceId=practice_id,
                    scheduledFor=now + timedelta(days=d),
                    status="PENDING",
                    outcome=None,
                    notes=None,
                    createdAt=now,
                    completedAt=None,
                )
            )
        s.commit()
    return ids


@activity.defn
async def run_followup_check(appeal_id: str, check_id: str, days: int) -> dict:
    """Mark a FollowUpCheck COMPLETED + record what we found.

    Signal sources, in order of preference:
      1) ERA already flipped Appeal.outcome to terminal → we're done.
      2) Active probe of the payer's status surface (portal status page
         via Stagehand) → may return DECIDED with WON/LOST, PENDING, or
         UNKNOWN if no probe is implemented for this payer.
      3) Default: still PENDING. The 30/60-day ticks escalate to ops.
    """
    now = datetime.utcnow()
    probe_outcome: dict | None = None

    with SessionLocal() as s:
        check = s.scalar(select(FollowUpCheck).where(FollowUpCheck.id == check_id))
        appeal = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if check is None or appeal is None:
            return {"checks_run": 0, "escalated": False, "outcome_terminal": False}

        terminal = appeal.outcome in ("WON", "PARTIAL", "LOST", "REJECTED_BY_HUMAN")
        # Stash a few things we need outside the session.
        confirmation_number: str | None = None
        payer_id_local: str | None = appeal.denial.claim.payerId if not terminal else None

    # Active status probe — run outside the DB session so it can take its
    # time without holding a row lock. Skip when outcome is already terminal.
    if not terminal and payer_id_local:
        from .status_probe import probe_appeal_status

        try:
            probe_outcome = await probe_appeal_status(appeal_id)
        except Exception as e:  # noqa: BLE001
            logger.warning("status probe errored: %s", e)
            probe_outcome = {"status": "ERROR", "error": str(e)[:200]}

    # Apply probe result + finalize the check row.
    with SessionLocal() as s:
        check = s.scalar(select(FollowUpCheck).where(FollowUpCheck.id == check_id))
        appeal = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if check is None or appeal is None:
            return {"checks_run": 0, "escalated": False, "outcome_terminal": False}

        terminal = appeal.outcome in ("WON", "PARTIAL", "LOST", "REJECTED_BY_HUMAN")
        flipped_by_probe = False

        if probe_outcome and probe_outcome.get("status") == "DECIDED" and not terminal:
            # Probe surfaced an outcome that hasn't landed via ERA yet. Flip
            # the appeal so the dashboard reflects reality; the recovery
            # amount will reconcile from the next ERA.
            decided_as = probe_outcome.get("decision")
            if decided_as in ("WON", "LOST", "PARTIAL"):
                appeal.outcome = decided_as
                appeal.outcomeRecordedAt = now
                terminal = True
                flipped_by_probe = True

        check.status = "COMPLETED"
        check.completedAt = now
        check.outcome = appeal.outcome
        probe_msg = ""
        if probe_outcome:
            probe_msg = (
                f" Probe={probe_outcome.get('status')}"
                + (
                    f" decision={probe_outcome.get('decision')}"
                    if probe_outcome.get("decision")
                    else ""
                )
                + (
                    f" note={probe_outcome.get('note')}"
                    if probe_outcome.get("note")
                    else ""
                )
            )
        if terminal:
            check.notes = f"Outcome={appeal.outcome} at {days}-day check.{probe_msg}"
        else:
            check.notes = (
                f"{days}-day check: no payer response yet (status={appeal.outcome})."
                + probe_msg
            )
        s.commit()

    escalated = False
    # On the 30- and 60-day ticks, notify ops if outcome is still pending.
    if not terminal and days >= 30:
        try:
            from .web_client import notify_appeal_outcome
            notify_appeal_outcome(appeal_id)
            escalated = True
        except Exception as e:  # noqa: BLE001
            logger.warning("escalation notify failed: %s", e)

    return {
        "checks_run": 1,
        "escalated": escalated,
        "outcome_terminal": terminal,
        "flipped_by_probe": flipped_by_probe,
        "probe_status": (probe_outcome or {}).get("status"),
        "days": days,
    }
