# Overturn — Phase 1 MVP scaffold

A working scaffold of the Phase 1 MVP from `../DEV SPEC.md`: a web app where a
billing manager uploads a denied claim, an AI agent drafts a payer-specific
appeal with verified citations, a human reviews it, and the system submits it
via the payer's portal.

This repo is runnable locally with **synthetic data and no external API keys**
required. Every external dependency (Clerk, Anthropic, Browserbase, S3) has a
deterministic dev-mode fallback so the end-to-end pipeline can be exercised
before BAAs are signed.

## Quick start

```bash
# 1. Bring up postgres+pgvector and Temporal
docker compose -f infra/docker/docker-compose.dev.yml up -d

# 2. Install JS deps
pnpm install

# 3. Set env
cp .env.example .env
# Generate a PHI encryption key:
node -e "console.log('PHI_ENC_KEY=' + require('crypto').randomBytes(32).toString('base64'))" >> .env

# 4. Migrate + seed
pnpm db:migrate
pnpm db:seed

# 5. Worker (Python)
cd apps/worker
uv venv && source .venv/bin/activate
uv pip install -e .
python -m overturn_worker.dev   # starts FastAPI + Temporal worker

# 6. Web (in a second terminal)
cd apps/web
pnpm dev
# open http://localhost:3000

# 7. End-to-end smoke test
pnpm e2e
```

## Layout

```
apps/
  web/                  Next.js 15 dashboard
  worker/               FastAPI + Temporal worker (Python)
packages/
  db/                   Prisma schema + migrations + seed
  shared/               Shared TS types and crypto helpers
  prompts/              Versioned LLM prompts (TS + JSON)
infra/
  docker/               Local docker-compose + Dockerfiles
  terraform/            AWS scaffold (ECS, RDS, S3, Secrets Manager)
docs/
  payer-runbooks/       One markdown file per payer (denial codes, portal URLs)
scripts/
  run-e2e.mjs           Full synthetic pipeline
```

## Production wiring

See `docs/production-wiring.md` — checklist of BAAs, env vars, and steps
required before any real PHI hits this system.
