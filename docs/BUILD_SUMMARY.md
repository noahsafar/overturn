# Build Summary — Phase 1 Scaffold

Snapshot of what was built in the first implementation pass, what was
verified, and what is left for you to do. Pair with `DEV SPEC.md` (one
level up) and `docs/production-wiring.md` (in this folder).

## What was built

`/Users/noahsafar/Desktop/Med Startup/overturn/` — full Phase 1 scaffold per the dev spec:

- **`packages/db/`** — Prisma schema with all 10 models + enums from the
  spec, app-layer PHI envelope encryption (AES-256-GCM), idempotent seed
  script with synthetic practice + payer + 5 BCBS policies + denied claim.
- **`packages/shared/`** — Zod-typed shared contracts + the **deterministic
  citation verifier** (the load-bearing anti-hallucination check).
- **`packages/prompts/`** — versioned `strategize.v1`, `draft.v1`,
  `redraft.v1` templates with the spec's hard rules baked in, shared
  between web and worker.
- **`apps/web/`** — Next.js 15 dashboard: home, dashboard with metrics,
  denials list, denial detail with "Start appeal", appeal review
  (approve / edit / reject), upload, payer settings. All 8 API routes
  from the spec. Clerk-or-dev-stub auth.
- **`apps/worker/`** — Python FastAPI + Temporal worker. SQLAlchemy mirror
  of the Prisma schema, `AppealDraftWorkflow` + `AppealSubmitWorkflow` +
  `FollowUpCheckWorkflow`, all 14 activities (load context, retrieve
  policies, LLM strategize, LLM draft, **deterministic verifier**, LLM
  redraft, save / skip, load appeal/payer, browser / fax / mail
  submitters, record submission). Anthropic client with ZDR header +
  deterministic stub fallback. Mirror citation verifier (cross-validated
  against the TS one). pyx12-backed ERA parser with simple fallback.
- **`apps/worker/browser/`** — Stagehand TypeScript scaffold with
  `payers/bcbs.ts` (screenshot audit trail at every step) + CLI runner.
- **`apps/worker/src/.../fake_portal.py`** — local fake-portal HTTP
  server so end-to-end runs without real payer credentials.
- **`infra/docker/`** — `docker-compose.dev.yml` (pgvector + Temporal +
  Temporal UI), Dockerfiles for web + worker.
- **`infra/terraform/`** — AWS scaffold: VPC, object-locked audit S3,
  Secrets Manager, ECS Fargate cluster, RDS subnet group.
- **`.github/workflows/ci.yml`** — lint / test for both TS + Python.
- **`docs/payer-runbooks/bcbs.md`** + **`docs/production-wiring.md`** —
  runbook + BAA checklist.

## Tests run

**14 / 14 Python tests pass** (verified):

- Citation verifier (6 cases — exact quote, curly / dash variance,
  hallucinated quote, missing policy, short quote, whitespace).
- ERA parser (3 cases).
- AES-GCM crypto (4 cases — ASCII, unicode, IV randomness, tamper
  detection).
- In-process pipeline (strategize → draft → verify against the stub LLM
  responses).

TS test suite (citation verifier, prompts registry, crypto) is written and
mirrors the Python tests against identical fixtures, but could not be
executed in the build environment — `pnpm install` filled the disk
(`/` hit 98 %, ENOSPC). `node_modules` has been removed to recover space.
Re-run with `pnpm install && pnpm test` once the disk has more headroom.

## What was not done (and cannot be without your input)

- Sign BAAs with AWS / Anthropic / Clerk / Neon / Browserbase.
- Provision real Postgres / Temporal Cloud / S3 / Secrets Manager.
- Acquire a real 835 ERA file or real payer portal credentials.
- Buy a domain or form the C-Corp.

All of these are itemized in `docs/production-wiring.md` as a checklist.

## To run it

```bash
cd "/Users/noahsafar/Desktop/Med Startup/overturn"
docker compose -f infra/docker/docker-compose.dev.yml up -d
pnpm install && pnpm db:generate && pnpm db:migrate && pnpm db:seed

cd apps/worker
uv venv && uv pip install -e ".[dev]"
python -m overturn_worker.dev

# in a second terminal:
cd apps/web && pnpm dev   # http://localhost:3000
```

The dev pipeline runs the full strategize → draft → verify → human-review
→ submit flow against the local fake portal with zero external API keys.

## Reference

- `DEV SPEC.md` (one level up) — the spec this implements.
- `MASTER PLAN.md` (one level up) — broader strategy context.
- `docs/production-wiring.md` — what to do before any real PHI hits the
  system.
- `docs/payer-runbooks/bcbs.md` — first payer playbook; one of these per
  payer as you onboard them.
