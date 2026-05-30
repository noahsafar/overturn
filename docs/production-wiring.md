# Production Wiring — checklist before real PHI hits this system

The dev scaffold runs end-to-end with synthetic data and deterministic
stubs. Production requires the items below. None can be done by code alone.

## Vendor BAAs (Business Associate Agreements)

- [ ] AWS — request via AWS Artifact, restrict usage to HIPAA-eligible services
- [ ] Anthropic — request Zero-Data-Retention endpoint + BAA
- [ ] Clerk — switch to HIPAA tier, sign BAA, rotate publishable + secret keys
- [ ] Neon (or Supabase, or RDS) — HIPAA plan, sign BAA
- [ ] Browserbase — HIPAA tier + BAA, or self-host Playwright on HIPAA infra
- [ ] eFax provider (Documo / Concord / Sfax) — HIPAA tier + BAA
- [ ] Langfuse — self-host in the HIPAA AWS account (or run with PHI redaction)
- [ ] Sentry — enable HIPAA features, scrub PII before ingest
- [ ] Vapi / Retell (Phase 2 voice) — HIPAA tier + BAA

## Secrets

Move every env var marked secret in `.env.example` into AWS Secrets Manager
with rotation policies:

- `PHI_ENC_KEY` — quarterly rotation, re-encrypt job at
  `packages/db/scripts/rotate-phi-key.mjs` (run with `--dry-run` first)
- `ANTHROPIC_API_KEY`
- `CLERK_SECRET_KEY`
- `BROWSERBASE_API_KEY`
- Database URLs (rotate via Secrets Manager managed credentials)
- Per-customer payer-portal credentials — one secret per (practice, payer)

## Network

- [ ] VPC with private subnets for ECS Fargate workers
- [ ] RDS in private subnets only, no public endpoint
- [ ] VPC endpoints for S3 + Secrets Manager + ECR (no traffic across public internet)
- [ ] WAF in front of Vercel (or front the web app with CloudFront + WAF)
- [ ] CloudTrail + VPC flow logs to object-locked S3

## Auth & access

- [ ] Enable Clerk MFA enforcement for OWNER + ADMIN roles
- [ ] Audit log every PHI read/write — `AgentRun.auditTrail` is the seed, expand
- [ ] Quarterly access review

## Data lifecycle

- [ ] Retention policy per customer (default 7 years for billing-related PHI)
- [ ] Right-to-delete workflow that respects audit-log immutability
- [ ] Backups: RDS automated + cross-region snapshot, S3 versioning + object lock

## Compliance program

- [ ] SOC 2 Type 1 prep via Vanta/Drata (month 6)
- [ ] Healthcare-specialized attorney for customer BAA template + state AI-disclosure
- [ ] Incident response runbook (notification windows: 60 days to HHS, contractual to customers)
