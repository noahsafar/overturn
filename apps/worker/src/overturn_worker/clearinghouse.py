"""Clearinghouse SFTP ingest.

Pulls 835 ERA files from a configured SFTP source and pushes them through
the parse/outcome-ingest pipeline. Two modes:

  - Production: SFTP via paramiko, per-practice credentials from the
    Practice.clearinghouseSftp{Host,User,PathEnc} columns. Processed files
    are moved to `<remote_path>/processed/` to provide idempotency.
  - Development: read 835 files from a local directory configured via
    `CLEARINGHOUSE_DEV_DIR`. Processed files move to a `processed/`
    subdirectory.

The poll loop is started by `start_poll_loop()` from the worker entrypoint.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from .config import SETTINGS
from .crypto import decrypt
from .models import Practice, SessionLocal
from .outcomes import ingest_era_outcomes

logger = logging.getLogger(__name__)

_DEFAULT_INTERVAL_S = 300


@dataclass
class IngestStats:
    files_seen: int = 0
    files_processed: int = 0
    outcomes_recorded: int = 0
    errors: int = 0


# ── Dev (local-directory) path ─────────────────────────────────────────────
def _dev_dir() -> Path:
    return Path(os.environ.get("CLEARINGHOUSE_DEV_DIR", "./artifacts/incoming-eras"))


def _ingest_local_dir() -> IngestStats:
    """Process every file in the dev directory. Move successfully-processed
    files into `processed/`, errors into `failed/`."""
    stats = IngestStats()
    src = _dev_dir()
    if not src.exists():
        return stats
    processed = src / "processed"
    failed = src / "failed"
    processed.mkdir(exist_ok=True)
    failed.mkdir(exist_ok=True)

    for f in sorted(src.iterdir()):
        if f.is_dir():
            continue
        if not f.is_file():
            continue
        stats.files_seen += 1
        try:
            era = f.read_text(encoding="utf-8", errors="replace")
            updates = ingest_era_outcomes(era)
            stats.outcomes_recorded += len(updates)
            f.rename(processed / f.name)
            stats.files_processed += 1
            logger.info("ingested %s — %d outcome update(s)", f.name, len(updates))
        except Exception as e:
            logger.exception("failed to ingest %s: %s", f.name, e)
            stats.errors += 1
            try:
                f.rename(failed / f.name)
            except OSError:
                pass
    return stats


# ── Production (SFTP) path ─────────────────────────────────────────────────
def _ingest_sftp_for_practice(practice: Practice) -> IngestStats:
    stats = IngestStats()
    if not (practice.clearinghouseSftpHost and practice.clearinghouseSftpUser
            and practice.clearinghouseSftpPathEnc):
        return stats

    try:
        import paramiko  # local import — only needed in prod paths
    except ImportError:
        logger.warning("paramiko not available; skipping SFTP for %s", practice.id)
        return stats

    # Path is decrypted JSON: {"path": "/inbox", "password": "..."} or similar.
    # Keep this flexible since clearinghouse setups vary.
    raw = decrypt(practice.clearinghouseSftpPathEnc)
    try:
        import json

        cfg = json.loads(raw)
    except Exception:
        cfg = {"path": raw}
    remote_path = cfg.get("path", "/inbox")
    password = cfg.get("password")
    private_key_pem = cfg.get("private_key")

    host, _, port_s = practice.clearinghouseSftpHost.partition(":")
    port = int(port_s or 22)

    transport = paramiko.Transport((host, port))
    try:
        if private_key_pem:
            pkey = paramiko.RSAKey.from_private_key(
                __import__("io").StringIO(private_key_pem)
            )
            transport.connect(username=practice.clearinghouseSftpUser, pkey=pkey)
        else:
            transport.connect(username=practice.clearinghouseSftpUser, password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        if sftp is None:
            return stats
        try:
            # Ensure processed/ exists
            try:
                sftp.mkdir(f"{remote_path}/processed")
            except OSError:
                pass
            for entry in sftp.listdir(remote_path):
                if entry == "processed":
                    continue
                stats.files_seen += 1
                remote_file = f"{remote_path}/{entry}"
                try:
                    with sftp.open(remote_file, "rb") as f:
                        era = f.read().decode("utf-8", errors="replace")
                    updates = ingest_era_outcomes(era)
                    stats.outcomes_recorded += len(updates)
                    sftp.rename(remote_file, f"{remote_path}/processed/{entry}")
                    stats.files_processed += 1
                except Exception as e:
                    logger.exception("sftp ingest failed for %s: %s", entry, e)
                    stats.errors += 1
        finally:
            sftp.close()
    finally:
        transport.close()
    return stats


def run_ingest_once() -> IngestStats:
    """Run a single ingest pass — dev dir + every configured SFTP practice."""
    total = IngestStats()

    # Always do dev dir if it exists (useful even in prod for ad-hoc drops)
    dev_stats = _ingest_local_dir()
    total.files_seen += dev_stats.files_seen
    total.files_processed += dev_stats.files_processed
    total.outcomes_recorded += dev_stats.outcomes_recorded
    total.errors += dev_stats.errors

    # SFTP per practice (enabled + configured)
    with SessionLocal() as s:
        practices = s.execute(
            select(Practice).where(
                Practice.clearinghouseEnabled.is_(True),
                Practice.clearinghouseSftpHost.is_not(None),
            )
        ).scalars().all()
    for p in practices:
        now = datetime.now(timezone.utc)
        err: str | None = None
        try:
            ps = _ingest_sftp_for_practice(p)
            total.files_seen += ps.files_seen
            total.files_processed += ps.files_processed
            total.outcomes_recorded += ps.outcomes_recorded
            total.errors += ps.errors
        except Exception as e:
            logger.exception("sftp loop failed for practice %s: %s", p.id, e)
            err = str(e)[:500]
            total.errors += 1
        # Record polling status for the UI to surface
        with SessionLocal() as s2:
            row = s2.get(Practice, p.id)
            if row is not None:
                row.clearinghouseLastPolledAt = now
                if err is None:
                    row.clearinghouseLastSuccessAt = now
                    row.clearinghouseLastError = None
                else:
                    row.clearinghouseLastError = err
                s2.commit()

    return total


async def start_poll_loop() -> None:
    """Async forever-loop. Runs `run_ingest_once` every poll interval."""
    interval = int(os.environ.get("CLEARINGHOUSE_POLL_INTERVAL_S", _DEFAULT_INTERVAL_S))
    logger.info("clearinghouse poll loop starting (interval=%ds)", interval)
    while True:
        try:
            stats = await asyncio.to_thread(run_ingest_once)
            if stats.files_seen:
                logger.info(
                    "ingest cycle: seen=%d processed=%d outcomes=%d errors=%d",
                    stats.files_seen, stats.files_processed,
                    stats.outcomes_recorded, stats.errors,
                )
        except Exception as e:
            logger.exception("ingest cycle errored: %s", e)
        await asyncio.sleep(interval)
