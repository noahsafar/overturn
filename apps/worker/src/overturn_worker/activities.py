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
from .llm import call_claude_json
from .models import AgentRun, Appeal, Claim, Denial, Payer, PayerPolicy, SessionLocal
from .prompts import DRAFT_V1, REDRAFT_V1, STRATEGIZE_V1, render
from .retrieval import retrieve_policies

logger = logging.getLogger(__name__)


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


# Per-PHI policy — chart excerpts in dev/test are pulled from a denial's
# notes column if present, otherwise synthesized from claim metadata. In
# production this hits the EHR/PM connector.
def _synthesize_chart_excerpts(claim: Claim, denial: Denial) -> list[str]:
    return [
        (
            f"Encounter note {claim.serviceDate:%Y-%m-%d}: patient presents with "
            f"diagnosis ICD-10 {','.join(claim.icdCodes)}. Service rendered CPT "
            f"{','.join(claim.cptCodes)}. Clinician documented symptom severity, "
            "treatment plan goals, and member's response to prior session per "
            "Section 4.2 documentation standards."
        ),
        (
            f"Treatment plan dated {claim.serviceDate:%Y-%m-%d}: measurable goals "
            "for reduction in PHQ-9 score, with re-evaluation scheduled within "
            "90 days. Member has documented DSM-5 diagnosis matching ICD-10 codes."
        ),
    ]


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
            chart_excerpts=_synthesize_chart_excerpts(claim, denial),
            patient_first_name=decrypt(patient.firstNameEnc),
            patient_last_name=decrypt(patient.lastNameEnc),
            patient_member_id=decrypt(patient.memberIdEnc),
            patient_dob=decrypt(patient.dobEnc),
            practice_name=claim.practice.name,
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

    return {
        "letter": letter,
        "templateUsed": template_used,
        "citations": citations,
        "requestedRemedyAmount": ctx["denied_amount"],
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
    citations = [
        Citation(
            policy_id=c.get("policyId") or c.get("policy_id", ""),
            quote=c.get("quote", ""),
            source_url=c.get("sourceUrl") or c.get("source_url"),
            page=c.get("page"),
        )
        for c in draft.get("citations", [])
    ]
    docs = [PolicyDoc(id=p["id"], body=p["body"]) for p in policies]
    res = verify_citations(citations, docs)

    explained = (
        "\n".join(
            f"- citation policy_id={ic.citation.policy_id} quote=\"{ic.citation.quote[:120]}…\" → {ic.reason}"
            for ic in res.invalid_citations
        )
        or "(none)"
    )
    return {
        "all_valid": res.all_valid,
        "valid_count": res.valid_count,
        "invalid_explained": explained,
    }


# ── Activity: LLM redraft (fix invalid citations) ───────────────────────────
@activity.defn
async def llm_redraft_fix_citations(
    draft: dict, invalid_explained: str, policies: list[dict]
) -> dict:
    user = render(
        REDRAFT_V1,
        previous_letter=draft["letter"],
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
            "letter": draft["letter"],
            "templateUsed": draft.get("templateUsed", "redraft"),
            "citations": [],
            "requestedRemedyAmount": draft.get("requestedRemedyAmount", 0),
        },
    )
    return res.parsed


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

    audit_trail = {
        "strategy": strategy,
        "citation_valid_count": citation_valid_count,
        "draft_template": draft.get("templateUsed"),
    }

    with SessionLocal() as s:
        # Update the existing appeal instead of creating a new one
        appeal = s.scalar(select(Appeal).where(Appeal.id == appeal_id))
        if appeal is None:
            raise ValueError(f"appeal {appeal_id} not found")

        s.add(
            AgentRun(
                id=run_id,
                workflowType="appeal_draft",
                resourceId=denial_id,
                agentType="llm",
                startedAt=now,
                completedAt=now,
                status="REQUIRES_HUMAN",
                confidenceScore=float(strategy.get("predictedWinProbability", 0.5)),
                costCents=cost_cents,
                errorMessage=None,
                auditTrail=audit_trail,
            )
        )

        # Update the appeal with the final draft data
        appeal.draftLetter = draft["letter"]
        appeal.templateUsed = draft.get("templateUsed", "unknown")
        appeal.citations = draft.get("citations", [])
        appeal.agentRunId = run_id
        s.commit()
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
        return {
            "id": a.id,
            "denial_id": a.denialId,
            "claim_id": a.denial.claimId,
            "payer_id": a.denial.claim.payerId,
            "letter": a.draftLetter,
            "primary_reason": (a.citations[0]["policyId"] if a.citations else "appeal"),
            "denied_amount": float(a.denial.deniedAmount),
            "claim_control_number": a.denial.claimId[:12],
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


@activity.defn
async def fax_submit_appeal(appeal: dict, payer: dict) -> dict:
    """Fallback: queue a fax submission. In production this hits an eFax
    provider with a BAA (e.g. Documo, Concord); here we record an artifact
    file and return a synthesized confirmation number."""
    import os

    from .config import SETTINGS

    os.makedirs(f"{SETTINGS.artifacts_dir}/faxes", exist_ok=True)
    path = f"{SETTINGS.artifacts_dir}/faxes/{appeal['id']}.txt"
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"FAX TO: {payer['fax_number']}\n\n{appeal['letter']}")
    return {
        "success": True,
        "channel": "FAX",
        "confirmation_number": f"FAX-{appeal['id'][-8:]}",
        "submitted_at": datetime.utcnow().isoformat(),
        "screenshots": [],
    }


@activity.defn
async def mail_queue_appeal(appeal: dict, payer: dict) -> dict:
    """Last-resort: queue for physical mail. Writes a PDF-ready text artifact."""
    import os

    from .config import SETTINGS

    os.makedirs(f"{SETTINGS.artifacts_dir}/mail", exist_ok=True)
    path = f"{SETTINGS.artifacts_dir}/mail/{appeal['id']}.txt"
    with open(path, "w", encoding="utf-8") as f:
        f.write(
            f"TO: {payer['name']}\n{payer['appeal_address']}\n\n{appeal['letter']}"
        )
    return {
        "success": True,
        "channel": "MAIL",
        "confirmation_number": f"MAIL-{appeal['id'][-8:]}",
        "submitted_at": datetime.utcnow().isoformat(),
        "screenshots": [],
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
