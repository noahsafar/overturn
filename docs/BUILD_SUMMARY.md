# Build Summary

Current state of the codebase. Pair with `planning/DEV SPEC.md` (Phase 1 spec)
and `planning/MASTER PLAN.md` (12-month strategy + roadmap).

## What's built — Phase 1 + extensions

### Web app (`apps/web/`)
- Next.js 15 dashboard with sidebar nav (Home / Dashboard / Denials / Upload /
  Invoices / Reports / Payers / Members / Audit log + Ops console for superusers).
- All 8 Phase-1 API routes from the spec, plus ~15 more (invoices, audit,
  invitations, practice settings, payer-credentials, reports, webhooks,
  admin/policies, patients/delete, denials/chart, internal/notify).
- Central `apiHandler` wraps every route: authn → role check → rate limit →
  zod validation → audit recording → typed error mapping → Sentry capture.
- Onboarding wizard at `/onboarding` (multi-step) + middleware that bounces
  un-onboarded users into it.
- Member invitations: `/settings/members`, invite form, accept page at
  `/invite/[token]`, token-based acceptance.
- Per-(practice, payer) credential vault at `/settings/payers/[id]`, AES-256-GCM
  encrypted columns.
- Per-denial clinical-context form (the chart-excerpt textarea the LLM cites from).
- Per-denial filing-deadline display + submit blocker past deadline.
- Invoices list + detail + "Send invoice" button + Stripe webhook handler +
  stub-Stripe page for dev demos.
- Reports page + 3 CSV exports (recoveries, outstanding, invoices).
- Audit-log page (admin-only) + per-appeal activity timeline.
- Per-appeal submission audit trail (channels, confirmation, screenshots).
- Security: CSP / HSTS / X-Frame-Options / Permissions-Policy headers,
  in-memory rate limiter (120/min/user/route default; higher per-route).
- Sentry init helper with PHI-scrub `beforeSend` filter (no-op when DSN absent).
- Overturn-internal ops console at `/admin`:
  - Fleet overview (cross-tenant rollups)
  - Practices list + per-practice drill-down
  - Ops triage queue (failed submissions, errored agent runs, overdue follow-ups, skipped appeals)
  - Agent runs view (hallucination redraft rate, human review rate, avg draft time)
  - Integration health page
  - Bulk payer-policy import endpoint at `/api/admin/policies`

### Worker (`apps/worker/`)
- Python FastAPI + Temporal worker + fake-portal + clearinghouse SFTP poller,
  all started by `python -m overturn_worker.dev`.
- SQLAlchemy mirror of the Prisma schema (bound to PG enums for ClaimStatus etc).
- Workflows:
  - `AppealDraftWorkflow` — full strategize → draft → verify → redraft → save chain.
  - `AppealSubmitWorkflow` — portal / fax / mail + records Submission rows +
    starts FollowUpCheckWorkflow as a child workflow.
  - `FollowUpCheckWorkflow` — real 14/30/60 day cadence; writes `FollowUpCheck`
    rows, escalates to ops via `/api/internal/notify` when outcome still
    pending at the 30/60-day mark.
- Activities (20):
  - load context, retrieve policies, strategize, draft, verify citations,
    redraft, save / skip / create / update_status, load appeal/payer,
    portal/fax/mail submitters, record submission, schedule + run follow-up checks,
    AI-edit appeal.
- Anthropic Claude client (real key works; deterministic stub fallback).
- LLM wrapper traces every call via Langfuse when `LANGFUSE_PUBLIC_KEY` is set
  (PHI-scrubbed; no-op otherwise).
- Citation verifier (deterministic, cross-validated against the TS twin).
- PDF rendering (reportlab) for fax + mail submissions.
- Documo eFax client + Lob mail-house client (env-gated stubs).
- pyx12 ERA parser with simple-format fallback.
- Outcome ingestion (`outcomes.py`): matches incoming 835s by `controlNumber`,
  flips Appeal outcome, creates `InvoiceLineItem` on monthly DRAFT `Invoice`.
- Clearinghouse poller (`clearinghouse.py`): paramiko in prod, local dir in dev.
  Configurable `CHARTHOUSE_POLL_INTERVAL_S`.
- Per-(practice, payer) credentials decrypted via `payer_credentials.py` and
  passed into the Stagehand subprocess.
- Embedding helper (`embeddings.py`): OpenAI when configured, deterministic
  hash-based fallback for dev (1536-dim, L2-normalized).
- Retrieval (`retrieval.py`): exact denial-code → appeal_format → pgvector
  cosine-similarity → keyword fallback. `backfill_embeddings()` exposed at
  `/internal/backfill-embeddings`.
- Web→worker client (`web_client.py`): fires `appeal.ready` and
  `appeal.outcome` notifications to web after workflow events.

### Browser submitter (`apps/worker/browser/`)
- Stagehand TypeScript scaffold with BCBS submitter under `payers/bcbs.ts`.
- Uses deterministic Playwright selectors as primary, `page.act()` as
  fallback. Reads decrypted PayerCredential.

### Schema (`packages/db/`)
- 17 Prisma models: Practice, User, Patient, Payer, PayerPolicy, PayerCredential,
  Claim, Denial, Appeal, AgentRun, HumanReview, Submission, FollowUpCheck,
  Invoice, InvoiceLineItem, AuditEvent, Notification, Invitation.
- AES-256-GCM envelope encryption for PHI (firstName, lastName, dob, memberId,
  payer username/password/MFA, SFTP path).
- Idempotent realistic seed (`prisma/seed.ts`): 6 patients, 12 claims across
  mixed states (unworked / drafting / ready / submitted / won / lost / skipped),
  with real chart excerpts + control numbers, plus 2 WON appeals rolled into
  a DRAFT invoice.
- PHI key rotation script: `packages/db/scripts/rotate-phi-key.mjs`.

### Infra
- `infra/docker/`: postgres+pgvector, Temporal, Temporal UI.
- `infra/terraform/`: VPC, S3 (object-locked audit + artifacts), RDS Postgres,
  Secrets Manager (PHI_ENC_KEY + Anthropic + Stripe + internal secrets),
  ECR (web + worker), ECS Fargate cluster + task def + service, IAM
  least-privilege (execution + task roles), CloudWatch log group, CloudTrail
  with object-locked delivery, WAF Web ACL (rate limit + AWS managed rules).
- `.github/workflows/ci.yml`: lint / typecheck / test for TS + Python; Postgres
  service + Prisma push so integration tests run in CI.

### Tests
- **27 Python tests pass** (citations, ERA parser, crypto, pipeline, outcomes,
  submissions, clearinghouse, PDF rendering, full-loop e2e).
- **16 TypeScript tests pass** (api handler, stripe stub, CSV serializer,
  rate-limit, db crypto, shared citations, prompts).

## What's stubbed (production needs real keys + BAAs)

Every external integration has a stub fallback that exercises the same code
paths. When you plug in real keys, the stub disappears and the real call
happens. None require code changes — just env vars.

| Integration | Env var(s) | Stub behaviour |
|---|---|---|
| Anthropic Claude | `ANTHROPIC_API_KEY` (+ optional `ZAI_ENDPOINT`) | Canned deterministic JSON response |
| Clerk auth | `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | DEV_AUTH stub using seeded dev_user |
| Stripe | `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`) | Generates `cus_stub_*` / `in_stub_*` IDs; stub Stripe page at `/stub-stripe` |
| Documo (eFax) | `DOCUMO_API_KEY` | Writes PDF to artifacts/, synthesizes confirmation |
| Lob (mail) | `LOB_API_KEY` | Writes PDF to artifacts/, synthesizes letter ID |
| Resend (email) | `RESEND_API_KEY` | Logs the message; Notification row marked SENT |
| Browserbase / Stagehand | `BROWSERBASE_API_KEY` + `STAGEHAND_ENV` | Talks to the bundled fake-portal HTTP server |
| Clearinghouse SFTP | per-practice in `Practice.clearinghouseSftp*` | Reads local directory `artifacts/incoming-eras/` |
| OpenAI embeddings | `OPENAI_API_KEY` | Deterministic hash-based 1536-dim vector |
| Sentry | `SENTRY_DSN` | No-op |
| Langfuse | `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` | No-op |
| Overturn admin allowlist | `OVERTURN_ADMIN_EMAILS` | Dev fallback: seeded `dev_user` is superuser |

## What's deliberately out of scope (Phase 2-3 per master plan)

These are mentioned in the master plan but not yet implemented:

- Voice agents (Vapi / Retell) for status calls and IVR follow-up — Phase 2
- Prior authorization workflow — Phase 2/3
- Eligibility & benefits verification workflow — Phase 3
- Credentialing follow-up workflow — year 2
- EHR connectors (Athena / DrChrono / eCW / Kareo) — Phase 2/3
- Real-clearinghouse 837/835 (Availity / Change / Waystar) — replaces the
  SFTP poller stub
- OCR for faxed / scanned EOBs — Phase 2
- Impersonation in the ops console — deferred until customer #5+ (security risk)
- Force-terminate / manual-resubmit write actions in ops console — deferred
- SOC 2 Type 1 prep — month 6 deliverable per roadmap

## What still needs your input

All paperwork — code can't help with these:

- Sign BAAs with AWS, Anthropic, Clerk, Stripe, Documo, Lob, Resend, Neon/RDS
- Healthcare-specialized attorney to draft the pilot agreement
- A real pilot practice (1 design partner)
- Real payer portal credentials for that practice's payers
- Real ERA samples from their clearinghouse to validate the parser

## Running it

```bash
# 1. Bring up Postgres + Temporal
docker compose -f infra/docker/docker-compose.dev.yml up -d

# 2. Install JS deps + sync schema + seed realistic data
pnpm install
DATABASE_URL=postgresql://overturn:overturn@localhost:5433/overturn \
  pnpm --filter @overturn/db exec prisma db push --accept-data-loss
DATABASE_URL=postgresql://overturn:overturn@localhost:5433/overturn \
  PHI_ENC_KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')" \
  pnpm --filter @overturn/db seed

# 3. Install Python worker
cd apps/worker
uv venv && source .venv/bin/activate
uv pip install -e ".[dev,era]"

# 4. Start worker (FastAPI + Temporal worker + fake-portal + ingest loop)
DATABASE_URL=postgresql://overturn:overturn@localhost:5433/overturn \
  PHI_ENC_KEY="<your-key>" \
  python -m overturn_worker.dev

# 5. In a second terminal, start the web app
cd apps/web
DATABASE_URL=postgresql://overturn:overturn@localhost:5433/overturn pnpm dev
# → http://localhost:3000
# → admin at /admin (dev_user is superuser by default)
```

## Reference
- `planning/DEV SPEC.md` — Phase 1 MVP spec (what this implements)
- `planning/MASTER PLAN.md` — broader strategy, 12-month roadmap
- `production-wiring.md` — what to do before any real PHI hits this system
- `payer-runbooks/bcbs.md` — first payer playbook
