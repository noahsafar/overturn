"""Centralized config — every env var the worker reads passes through here.

Keep this file tight: the worker has to be ready to drop into a HIPAA-eligible
runtime (ECS Fargate) and read its secrets from AWS Secrets Manager, so we
never want config sprawl.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    anthropic_api_key: str | None
    anthropic_zdr: bool
    anthropic_model_draft: str
    anthropic_model_classify: str
    zai_endpoint: str
    temporal_host: str
    temporal_namespace: str
    temporal_task_queue: str
    phi_enc_key_b64: str | None
    stagehand_env: str  # "BROWSERBASE" | "LOCAL" | "FAKE"
    fake_portal_url: str
    artifacts_dir: str


def load() -> Settings:
    return Settings(
        database_url=os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://overturn:overturn@localhost:5432/overturn",
        ),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY") or None,
        anthropic_zdr=os.environ.get("ANTHROPIC_ZDR", "true").lower() == "true",
        anthropic_model_draft=os.environ.get(
            "ANTHROPIC_MODEL_DRAFT", "claude-opus-4-7"
        ),
        anthropic_model_classify=os.environ.get(
            "ANTHROPIC_MODEL_CLASSIFY", "claude-haiku-4-5-20251001"
        ),
        zai_endpoint=os.environ.get("ZAI_ENDPOINT", "https://api.z.ai/api/anthropic/v1/messages"),
        temporal_host=os.environ.get("TEMPORAL_HOST", "localhost:7233"),
        temporal_namespace=os.environ.get("TEMPORAL_NAMESPACE", "default"),
        temporal_task_queue=os.environ.get("TEMPORAL_TASK_QUEUE", "appeals"),
        phi_enc_key_b64=os.environ.get("PHI_ENC_KEY") or None,
        stagehand_env=os.environ.get("STAGEHAND_ENV", "FAKE"),
        fake_portal_url=os.environ.get(
            "FAKE_PORTAL_URL", "http://localhost:4555/fake-portal"
        ),
        artifacts_dir=os.environ.get("ARTIFACTS_DIR", "./artifacts"),
    )


SETTINGS = load()
