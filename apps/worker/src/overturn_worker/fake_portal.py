"""A minimal FastAPI server that pretends to be a payer's appeals portal.

The submitter (Stagehand in prod, direct HTTP in FAKE mode) posts an appeal
letter to `/submit` and gets back a confirmation number. This is what makes
the full pipeline runnable in CI: real Stagehand browser flow against the
fake portal is the closest e2e analogue to the real thing, and the direct
HTTP path used in pure unit tests is faster still.
"""

from __future__ import annotations

import hashlib
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="fake-payer-portal")


class SubmitReq(BaseModel):
    appealId: str
    claimControlNumber: str
    letter: str


_INBOX: list[dict] = []


@app.get("/fake-portal")
async def root() -> dict:
    return {
        "name": "Fake BCBS Provider Portal",
        "inbox": len(_INBOX),
        "submitted": [s["confirmationNumber"] for s in _INBOX[-5:]],
    }


@app.post("/fake-portal/submit")
async def submit(req: SubmitReq) -> dict:
    if len(req.letter) < 100:
        raise HTTPException(400, "letter too short — portal rejected")
    h = hashlib.sha256((req.appealId + req.letter).encode()).hexdigest()[:10].upper()
    confirmation = f"BCBS-AP-{h}"
    record = {
        "confirmationNumber": confirmation,
        "appealId": req.appealId,
        "claimControlNumber": req.claimControlNumber,
        "receivedAt": datetime.utcnow().isoformat(),
        "letterLength": len(req.letter),
    }
    _INBOX.append(record)
    return record


@app.get("/fake-portal/inbox")
async def inbox() -> list[dict]:
    return _INBOX
