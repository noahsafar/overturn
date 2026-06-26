"""Internal FastAPI — called by apps/web. Never exposed to the public internet.

Each endpoint kicks off a Temporal workflow and returns the workflow id.
The web app polls the DB for the resulting appeal row rather than polling
the workflow directly — the DB is the source of truth.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from temporalio.client import Client

from . import init  # Validate environment on startup
from .activities import llm_edit_appeal
from .config import SETTINGS
from .workflows import AppealDraftWorkflow, AppealSubmitWorkflow

logger = logging.getLogger(__name__)

app = FastAPI(title="overturn-worker-internal")


class StartDraftReq(BaseModel):
    denialId: str


class SubmitReq(BaseModel):
    appealId: str


class StatusReq(BaseModel):
    workflowId: str


class AiEditReq(BaseModel):
    appealId: str
    letter: str
    prompt: str


class EraParseReq(BaseModel):
    era: str


class IngestOutcomesReq(BaseModel):
    era: str


class ClinicalContextExtractionReq(BaseModel):
    document: str  # base64 encoded PDF
    filename: str


class EobParseReq(BaseModel):
    pdf: str  # base64 encoded PDF
    filename: str


class ScreenshotParseReq(BaseModel):
    image: str  # base64 encoded image
    filename: str


class BackfillEmbeddingsReq(BaseModel):
    payerId: str | None = None


class CorrectedClaimReq(BaseModel):
    denialId: str
    correctedCpt: str | None = None
    correctedModifier: str | None = None
    reason: str


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


async def _client() -> Client:
    return await Client.connect(
        SETTINGS.temporal_host, namespace=SETTINGS.temporal_namespace
    )


@app.post("/internal/workflows/appeal/start")
async def start_draft(req: StartDraftReq) -> dict:
    client = await _client()
    wf_id = f"appeal-draft-{req.denialId}-{uuid.uuid4().hex[:8]}"
    handle = await client.start_workflow(
        AppealDraftWorkflow.run,
        req.denialId,
        id=wf_id,
        task_queue=SETTINGS.temporal_task_queue,
    )
    return {"workflowId": wf_id, "runId": handle.result_run_id}


@app.post("/internal/workflows/appeal/submit")
async def submit_appeal(req: SubmitReq) -> dict:
    client = await _client()
    wf_id = f"appeal-submit-{req.appealId}-{uuid.uuid4().hex[:8]}"
    handle = await client.start_workflow(
        AppealSubmitWorkflow.run,
        req.appealId,
        id=wf_id,
        task_queue=SETTINGS.temporal_task_queue,
    )
    return {"workflowId": wf_id, "runId": handle.result_run_id}


@app.post("/internal/workflows/status")
async def status(req: StatusReq) -> dict:
    client = await _client()
    try:
        handle = client.get_workflow_handle(req.workflowId)
        desc = await handle.describe()
        return {"status": desc.status.name if desc.status else "UNKNOWN"}
    except Exception as e:
        raise HTTPException(404, str(e)) from e


@app.post("/internal/corrected-claim/submit")
async def corrected_claim_submit(req: CorrectedClaimReq) -> dict:
    """Generate + submit a corrected 837 for a denial caused by a billing
    error. Runs synchronously since there's no LLM in the loop."""
    try:
        from .activities import submit_corrected_claim_837

        result = await submit_corrected_claim_837(
            req.denialId,
            {
                "corrected_cpt": req.correctedCpt,
                "corrected_modifier": req.correctedModifier,
                "reason": req.reason,
            },
        )
        return result
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:
        logger.error(f"corrected-claim submit failed: {e}")
        raise HTTPException(500, str(e)) from e


@app.post("/internal/ai-edit")
async def ai_edit(req: AiEditReq) -> dict:
    """AI-powered appeal letter editing. Runs synchronously for immediate response."""
    try:
        # Import the edit function
        from .activities import llm_edit_appeal

        result = await llm_edit_appeal(req.letter, req.prompt)
        return {"letter": result}
    except Exception as e:
        logger.error(f"AI edit failed: {e}")
        raise HTTPException(500, str(e)) from e


@app.post("/internal/parse-era")
async def parse_era(req: EraParseReq) -> dict:
    """Parse ERA/835 file content and extract claims with denials."""
    try:
        from .era_parser import parse

        claims = parse(req.era)
        return {
            "claims": [
                {
                    "control_number": c.control_number,
                    "payer_name": c.payer_name,
                    "patient_name": c.patient_name,
                    "member_id": c.member_id,
                    "service_date_start": c.service_date_start,
                    "service_date_end": c.service_date_end,
                    "billed": c.billed,
                    "paid": c.paid,
                    "denied": c.denied,
                    "cpt_codes": c.cpt_codes,
                    "payment_date": c.payment_date,
                    "rendering_provider": c.rendering_provider,
                    "denials": [
                        {
                            "code": d.code,
                            "reason": d.reason,
                            "amount": d.amount,
                            "cpt": d.cpt,
                            "raw_snippet": d.raw_snippet,
                        }
                        for d in c.denials
                    ],
                }
                for c in claims
            ]
        }
    except Exception as e:
        logger.error(f"ERA parsing failed: {e}")
        raise HTTPException(500, str(e)) from e


@app.post("/internal/ingest-outcomes")
async def ingest_outcomes(req: IngestOutcomesReq) -> dict:
    """Match a new ERA against open appeals and record outcomes.

    Idempotent: an Appeal that already has an InvoiceLineItem won't get
    re-billed. An Appeal whose outcome is already terminal won't be touched.
    """
    try:
        from .outcomes import ingest_era_outcomes

        updates = ingest_era_outcomes(req.era)
        return {
            "updates": [
                {
                    "appealId": u.appeal_id,
                    "claimControlNumber": u.claim_control_number,
                    "outcome": u.outcome,
                    "recoveredAmount": u.recovered_amount,
                    "feeCents": u.fee_cents,
                    "invoiceId": u.invoice_id,
                }
                for u in updates
            ]
        }
    except Exception as e:
        logger.exception(f"outcome ingest failed: {e}")
        raise HTTPException(500, str(e)) from e


@app.post("/internal/backfill-embeddings")
async def backfill_embeddings_endpoint(req: BackfillEmbeddingsReq) -> dict:
    """Compute + persist embeddings for any PayerPolicy that doesn't have one.

    Called from the web after a bulk policy import. Pass payerId to scope.
    """
    try:
        from .retrieval import backfill_embeddings

        updated = backfill_embeddings(req.payerId)
        return {"updated": updated}
    except Exception as e:
        logger.exception(f"embedding backfill failed: {e}")
        raise HTTPException(500, str(e)) from e


@app.post("/internal/extract-clinical-context")
async def extract_clinical_context(req: ClinicalContextExtractionReq) -> dict:
    """Extract clinical context from uploaded medical documents (PDF).

    Uses AI to identify relevant clinical information for appeal drafting.
    """
    try:
        from .clinical_context import extract_clinical_context_from_pdf

        result = extract_clinical_context_from_pdf(req.document, req.filename)
        return {
            "context": result.context,
            "confidence": result.confidence,
            "sections": result.sections
        }
    except Exception as e:
        logger.exception(f"clinical context extraction failed: {e}")
        raise HTTPException(500, str(e)) from e


@app.post("/internal/parse-eob")
async def parse_eob(req: EobParseReq) -> dict:
    """Parse a denial PDF and extract structured denial information.

    Routes internally: ERA-shaped PDFs use the deterministic 835 parser;
    everything else uses OCR + LLM. The response is the same shape either way,
    plus a `source_type` hint and (for ERA-routed PDFs) `extracted_text` so the
    caller can run outcome ingestion against the same text.
    """
    try:
        from .eob_parser import parse_eob

        result = parse_eob(req)
        return {
            "denials": [
                {
                    "control_number": d.control_number,
                    "patient_name": d.patient_name,
                    "member_id": d.member_id,
                    "service_date": d.service_date,
                    "denial_code": d.denial_code,
                    "denial_reason": d.denial_reason,
                    "denied_amount": d.denied_amount,
                    "payer_name": d.payer_name,
                    "billed_amount": d.billed_amount,
                    "cpt": d.cpt,
                    "raw_snippet": d.raw_snippet,
                    "payment_date": d.payment_date,
                    "rendering_provider": d.rendering_provider,
                }
                for d in result.denials
            ],
            "source": result.source,
            "confidence": result.confidence,
            "source_type": result.source_type,
            "extracted_text": result.extracted_text,
        }
    except Exception as e:
        logger.exception(f"EOB parsing failed: {e}")
        raise HTTPException(500, str(e)) from e


@app.post("/internal/parse-screenshot")
async def parse_screenshot(req: ScreenshotParseReq) -> dict:
    """Parse screenshot/image and extract denial information.

    Supports images of payer portals, EOB documents, denial letters, etc.
    Uses Claude vision to understand and extract denial data.
    """
    try:
        from .screenshot_parser import parse_screenshot

        result = parse_screenshot(req)
        return {
            "denials": [
                {
                    "denial_code": d.denial_code,
                    "denial_reason": d.denial_reason,
                    "denied_amount": d.denied_amount,
                    "patient_info": d.patient_info,
                    "confidence": d.confidence,
                }
                for d in result.denials
            ],
            "source": result.source,
            "confidence": result.confidence,
        }
    except Exception as e:
        logger.exception(f"screenshot parsing failed: {e}")
        raise HTTPException(500, str(e)) from e
