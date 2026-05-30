"""Browser portal submission.

Three modes:
  * STAGEHAND_ENV=BROWSERBASE — production. Spawns a Stagehand session and
    runs the per-payer submitter under `browser/payers/<name>.ts`. This
    project ships the JS scaffold for that path under apps/worker/browser.
  * STAGEHAND_ENV=LOCAL — local headed Playwright for debugging.
  * STAGEHAND_ENV=FAKE — talks to the bundled local fake-portal HTTP server.
    Used in CI and the e2e script so the whole pipeline runs without any
    real payer credentials.

The Python activity calls into one of these paths and returns the standard
SubmissionResult shape consumed by Temporal.
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

import httpx

from .config import SETTINGS


def _audit_dir(appeal_id: str) -> Path:
    p = Path(SETTINGS.artifacts_dir) / "audit-screenshots" / appeal_id
    p.mkdir(parents=True, exist_ok=True)
    return p


async def submit_via_portal(appeal: dict, payer: dict) -> dict:
    if SETTINGS.stagehand_env == "FAKE":
        return await _submit_via_fake_portal(appeal, payer)
    elif SETTINGS.stagehand_env == "BROWSERBASE":
        return _submit_via_stagehand(appeal, payer)
    else:  # LOCAL
        return _submit_via_stagehand(appeal, payer)


async def _submit_via_fake_portal(appeal: dict, payer: dict) -> dict:
    url = (payer.get("portal_url") or SETTINGS.fake_portal_url).rstrip("/")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{url}/submit",
            json={
                "appealId": appeal["id"],
                "claimControlNumber": appeal["claim_control_number"],
                "letter": appeal["letter"],
            },
        )
        r.raise_for_status()
        body = r.json()

    # Save an "audit screenshot" — a JSON record describing the simulated
    # session, since the fake portal has no real DOM.
    audit = _audit_dir(appeal["id"])
    (audit / "step-01-submit.json").write_text(json.dumps(body, indent=2))

    return {
        "success": True,
        "channel": "PORTAL",
        "confirmation_number": body["confirmationNumber"],
        "submitted_at": datetime.utcnow().isoformat(),
        "screenshots": [str(audit / "step-01-submit.json")],
    }


def _submit_via_stagehand(appeal: dict, payer: dict) -> dict:
    """Production / local Stagehand path.

    Spawns the TS submitter as a subprocess (pnpm exec stagehand-submit) and
    parses its JSON output. The TS side is responsible for screenshot
    capture into the audit-screenshots directory.
    """
    payload = json.dumps({"appeal": appeal, "payer": payer})
    proc = subprocess.run(
        [
            "pnpm",
            "--filter",
            "@overturn/web",
            "exec",
            "node",
            "../worker/browser/run-submitter.mjs",
        ],
        input=payload,
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "AUDIT_DIR": str(_audit_dir(appeal["id"])),
            "STAGEHAND_ENV": SETTINGS.stagehand_env,
        },
        check=False,
    )
    if proc.returncode != 0:
        return {
            "success": False,
            "channel": "PORTAL",
            "submitted_at": datetime.utcnow().isoformat(),
            "screenshots": [],
            "errorMessage": proc.stderr or "stagehand failed",
        }
    return json.loads(proc.stdout.strip().splitlines()[-1])
