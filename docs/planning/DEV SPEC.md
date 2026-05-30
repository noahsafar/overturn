# DEV SPEC — Phase 1 MVP

## Build Reference (Keep Open While Coding)

This is the lean, code-first spec for the first 8 weeks of building. Pair with `MASTER_PLAN.md` for context.

-----

## What You’re Building in Phase 1

**One sentence:** A web app where a billing manager uploads a denied claim, an AI agent drafts a payer-specific appeal letter with verified citations, and (after human review) submits it via the payer’s portal — then tracks the outcome.

**Out of scope:** voice calls, multi-payer at scale, eligibility, PA, status checks, multi-tenant.

-----

## Repo Structure (Monorepo, pnpm + Turborepo)

```
claimwell/
├── apps/
│   ├── web/                  # Next.js 15 customer dashboard
│   └── worker/               # Python FastAPI + Temporal worker
├── packages/
│   ├── db/                   # Prisma schema + migrations
│   ├── shared/               # TS types shared between web and worker
│   └── prompts/              # LLM prompt templates (versioned)
├── infra/
│   ├── terraform/            # AWS infra-as-code
│   └── docker/               # Dockerfiles
├── docs/
│   └── payer-runbooks/       # Markdown per-payer playbooks
└── scripts/
```

-----

## Stack Decisions (Locked for Phase 1)

|Layer              |Choice                                                                       |
|-------------------|-----------------------------------------------------------------------------|
|Web framework      |Next.js 15 (App Router) + React + Tailwind + shadcn/ui                       |
|Auth               |Clerk (HIPAA tier — sign BAA)                                                |
|Backend (workflows)|Python 3.12 + FastAPI + Temporal Python SDK                                  |
|DB                 |Postgres via Neon (HIPAA tier)                                               |
|ORM                |Prisma (web side) + SQLAlchemy (worker side) on same schema                  |
|LLM                |Anthropic Claude (Opus for drafting, Haiku for classification) — ZDR endpoint|
|Browser agent      |Stagehand (wraps Playwright with LLM-driven steering)                        |
|Storage            |S3 (private bucket, AES-256, BAA with AWS)                                   |
|Observability      |Sentry + Langfuse (LLM traces)                                               |
|Hosting            |Vercel (web) + AWS ECS Fargate (worker, HIPAA-eligible)                      |
|CI                 |GitHub Actions                                                               |

-----

## Database Schema (Prisma, Phase 1 Minimal)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Practice {
  id           String     @id @default(cuid())
  name         String
  npi          String     @unique
  taxId        String
  specialty    String
  createdAt    DateTime   @default(now())
  patients     Patient[]
  claims       Claim[]
  users        User[]
}

model User {
  id           String     @id @default(cuid())
  clerkId      String     @unique
  email        String
  practiceId   String
  practice     Practice   @relation(fields: [practiceId], references: [id])
  role         UserRole   @default(STAFF)
  createdAt    DateTime   @default(now())
}

enum UserRole {
  OWNER
  ADMIN
  STAFF
}

model Patient {
  id             String   @id @default(cuid())
  practiceId     String
  practice       Practice @relation(fields: [practiceId], references: [id])
  externalId     String   // ID in their EHR
  // PHI: encrypted at app layer before write
  firstNameEnc   Bytes
  lastNameEnc    Bytes
  dobEnc         Bytes
  memberIdEnc    Bytes
  insurancePayerId String?
  payer          Payer?   @relation(fields: [insurancePayerId], references: [id])
  claims         Claim[]
  createdAt      DateTime @default(now())

  @@unique([practiceId, externalId])
}

model Payer {
  id              String   @id @default(cuid())
  name            String
  payerIdNumbers  String[]
  portalUrl       String?
  ivrPhone        String?
  faxNumber       String?
  appealAddress   String?
  epaSupported    Boolean  @default(false)
  patients        Patient[]
  claims          Claim[]
  policies        PayerPolicy[]
}

model PayerPolicy {
  id           String   @id @default(cuid())
  payerId      String
  payer        Payer    @relation(fields: [payerId], references: [id])
  policyType   String   // "denial_reason" | "appeal_format" | "pa_criteria"
  denialCode   String?  // CARC/RARC code if applicable
  effectiveDate DateTime
  body         String   @db.Text
  sourceUrl    String?
  embedding    Unsupported("vector(1536)")?
  scrapedAt    DateTime @default(now())

  @@index([payerId, denialCode])
}

model Claim {
  id              String       @id @default(cuid())
  practiceId      String
  practice        Practice     @relation(fields: [practiceId], references: [id])
  patientId       String
  patient         Patient      @relation(fields: [patientId], references: [id])
  payerId         String
  payer           Payer        @relation(fields: [payerId], references: [id])
  serviceDate     DateTime
  cptCodes        String[]
  icdCodes        String[]
  billedAmount    Decimal      @db.Decimal(10, 2)
  status          ClaimStatus  @default(SUBMITTED)
  submittedAt     DateTime
  denials         Denial[]
  createdAt       DateTime     @default(now())

  @@index([practiceId, status])
}

enum ClaimStatus {
  SUBMITTED
  PAID
  DENIED
  APPEALED
  PARTIALLY_PAID
  WRITE_OFF
}

model Denial {
  id              String       @id @default(cuid())
  claimId         String
  claim           Claim        @relation(fields: [claimId], references: [id])
  denialCode      String       // CARC/RARC
  denialReason    String       @db.Text
  deniedAmount    Decimal      @db.Decimal(10, 2)
  eraRawText      String       @db.Text
  receivedAt      DateTime
  appeals         Appeal[]
  createdAt       DateTime     @default(now())

  @@index([denialCode])
}

model Appeal {
  id                  String        @id @default(cuid())
  denialId            String
  denial              Denial        @relation(fields: [denialId], references: [id])
  draftLetter         String        @db.Text
  templateUsed        String
  citations           Json          // [{policy_id, quote, page}]
  submittedVia        SubmissionChannel?
  submittedAt         DateTime?
  outcome             AppealOutcome @default(PENDING)
  recoveredAmount     Decimal?      @db.Decimal(10, 2)
  ourFee              Decimal?      @db.Decimal(10, 2)
  agentRunId          String?
  agentRun            AgentRun?     @relation(fields: [agentRunId], references: [id])
  humanReviewId       String?
  humanReview         HumanReview?  @relation(fields: [humanReviewId], references: [id])
  createdAt           DateTime      @default(now())

  @@index([outcome])
}

enum SubmissionChannel {
  PORTAL
  FAX
  MAIL
  EPA_API
}

enum AppealOutcome {
  PENDING
  WON
  LOST
  PARTIAL
  REJECTED_BY_HUMAN
  SKIPPED
}

model AgentRun {
  id              String     @id @default(cuid())
  workflowType    String     // "appeal_draft" | "portal_submit" | ...
  resourceId      String     // denialId or appealId
  agentType       String     // "llm" | "browser" | "voice"
  startedAt       DateTime   @default(now())
  completedAt     DateTime?
  status          RunStatus  @default(RUNNING)
  confidenceScore Float?
  costCents       Int?
  errorMessage    String?
  auditTrail      Json
  appeals         Appeal[]
}

enum RunStatus {
  RUNNING
  SUCCESS
  FAILED
  REQUIRES_HUMAN
}

model HumanReview {
  id              String   @id @default(cuid())
  reviewerId      String
  decision        ReviewDecision
  reviewedAt      DateTime @default(now())
  editsMade       String?  @db.Text
  notes           String?  @db.Text
  appeals         Appeal[]
}

enum ReviewDecision {
  APPROVED
  REJECTED
  EDITED_AND_APPROVED
}
```

-----

## API Routes (Phase 1)

### Web App (Next.js Server Actions / API routes)

```
POST   /api/claims/upload          # CSV upload of claims + EOBs
GET    /api/denials                # List denials needing work
GET    /api/denials/:id            # Detail view
POST   /api/denials/:id/start-appeal   # Trigger appeal workflow
GET    /api/appeals/:id            # View draft + review
POST   /api/appeals/:id/approve    # Human approves draft
POST   /api/appeals/:id/edit       # Human edits draft
POST   /api/appeals/:id/reject     # Human rejects
GET    /api/dashboard/metrics      # $ recovered, win rate, etc.
```

### Worker (Python FastAPI — internal)

```
POST   /internal/workflows/appeal/start    # Triggered by web on appeal start
GET    /internal/workflows/:id/status      # Polled by web for status
POST   /internal/workflows/appeal/submit   # Triggered after human approval
```

-----

## Temporal Workflows (Phase 1)

### `AppealDraftWorkflow`

```python
@workflow.defn
class AppealDraftWorkflow:
    @workflow.run
    async def run(self, denial_id: str) -> str:  # returns appeal_id
        # Step 1: Load context
        ctx = await workflow.execute_activity(
            load_denial_context,
            denial_id,
            start_to_close_timeout=timedelta(seconds=30),
        )

        # Step 2: Retrieve relevant payer policies (RAG)
        policies = await workflow.execute_activity(
            retrieve_payer_policies,
            args=[ctx.payer_id, ctx.denial_code],
            start_to_close_timeout=timedelta(seconds=20),
        )

        # Step 3: Strategize (LLM)
        strategy = await workflow.execute_activity(
            llm_strategize,
            args=[ctx, policies],
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        if strategy.predicted_win_probability < 0.4:
            return await workflow.execute_activity(
                save_skipped_appeal, args=[denial_id, strategy.reason]
            )

        # Step 4: Draft appeal (LLM)
        draft = await workflow.execute_activity(
            llm_draft_appeal,
            args=[ctx, policies, strategy],
            start_to_close_timeout=timedelta(seconds=120),
        )

        # Step 5: Verify every citation against retrieved policies
        verified = await workflow.execute_activity(
            verify_citations,
            args=[draft, policies],
            start_to_close_timeout=timedelta(seconds=30),
        )

        if not verified.all_valid:
            # Redraft with explicit instruction to fix
            draft = await workflow.execute_activity(
                llm_redraft_fix_citations,
                args=[draft, verified.invalid_citations, policies],
            )

        # Step 6: Persist appeal, return for human review
        appeal_id = await workflow.execute_activity(
            save_appeal_draft, args=[denial_id, draft, strategy]
        )
        return appeal_id
```

### `AppealSubmitWorkflow` (triggered after human approval)

```python
@workflow.defn
class AppealSubmitWorkflow:
    @workflow.run
    async def run(self, appeal_id: str) -> SubmissionResult:
        appeal = await workflow.execute_activity(load_appeal, appeal_id)
        payer = await workflow.execute_activity(load_payer, appeal.payer_id)

        # Choose channel
        if payer.portal_url:
            result = await workflow.execute_activity(
                browser_agent_submit_portal,
                args=[appeal, payer],
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=RetryPolicy(maximum_attempts=2),
                heartbeat_timeout=timedelta(seconds=60),
            )
        elif payer.fax_number:
            result = await workflow.execute_activity(
                fax_submit_appeal,
                args=[appeal, payer],
            )
        else:
            result = await workflow.execute_activity(
                mail_queue_appeal, args=[appeal, payer]
            )

        # Schedule a status check in 14 days
        await workflow.start_child_workflow(
            FollowUpCheckWorkflow,
            args=[appeal_id, result.confirmation_number],
            id=f"followup-{appeal_id}",
            task_queue="follow-up-tasks",
        )

        return result
```

-----

## LLM Prompts (Critical — Get These Right)

### `llm_strategize` System Prompt (sketch)

```
You are an expert healthcare appeals strategist with 20 years of experience
fighting insurance denials. You are analyzing a denied claim to decide
whether to appeal and what argument to make.

Context provided:
- The denial code (CARC/RARC) and the payer's stated reason
- The patient's chart excerpts relevant to the service date
- The CPT and ICD codes billed
- Relevant payer medical policy documents
- Historical outcomes for this payer + denial_code combination

Your job:
1. Decide if there is a legitimate appeal argument (predicted_win_probability 0-1)
2. Choose the primary argument category:
   - MEDICAL_NECESSITY
   - CODING_ERROR (payer error)
   - DOCUMENTATION_AVAILABLE (we have records they didn't see)
   - POLICY_MISAPPLICATION
   - TIMELY_FILING (we filed in time)
   - NOT_APPEALABLE (do not pursue)
3. Identify the 2-3 strongest evidence points from the chart

Output strict JSON. Do not hallucinate chart contents — only reference what
appears in the provided excerpts.
```

### `llm_draft_appeal` Rules

- NEVER invent clinical facts not in the chart
- EVERY policy citation must include exact quote + source_url + page
- Use the payer’s preferred appeal letter format (from template library)
- First paragraph: claim number, patient, service date, denied amount, your position
- Body: argument, evidence, citations
- Closing: requested remedy (“we request reprocessing and payment of $X”)
- Tone: respectful, professional, factual — never adversarial

### `verify_citations` is NOT an LLM call

This is deterministic. For every citation in the draft:

1. Find the cited policy document
1. Check the quote appears verbatim (or with minor formatting variance) in the doc
1. If not found → flag as invalid citation
1. If found → mark valid

This single deterministic check kills the worst hallucination risk.

-----

## Browser Agent (Stagehand) Example

```typescript
// apps/worker/browser/payerPortalSubmit.ts
import { Stagehand } from "@browserbasehq/stagehand";

export async function submitAppealViaPortal({
  payer,
  appeal,
  credentials,
}: SubmitArgs): Promise<SubmissionResult> {
  const stagehand = new Stagehand({
    env: "BROWSERBASE", // or "LOCAL" for dev
    apiKey: process.env.BROWSERBASE_API_KEY,
    headless: true,
  });
  await stagehand.init();
  const page = stagehand.page;

  try {
    await page.goto(payer.portalUrl);
    await page.act("log in with the provided credentials");
    await page.act("navigate to the claim appeals section");
    await page.act(
      `search for claim number ${appeal.claim.controlNumber}`
    );
    await page.act("click the 'file appeal' button for that claim");
    await page.act(
      `select the appeal reason that best matches: ${appeal.primaryReason}`
    );
    await page.act(`paste this appeal text into the narrative field: ${appeal.draftLetter}`);
    await page.act("upload the supporting documents from the local files");
    // ... upload steps ...
    await page.act("review the submission and click submit");
    const confirmation = await page.extract({
      instruction: "extract the confirmation number from the page",
      schema: z.object({ confirmationNumber: z.string() }),
    });

    return {
      success: true,
      confirmationNumber: confirmation.confirmationNumber,
      submittedAt: new Date(),
    };
  } catch (err) {
    // Capture screenshot for audit + debugging
    const screenshot = await page.screenshot();
    await uploadAuditScreenshot(appeal.id, screenshot);
    throw err;
  } finally {
    await stagehand.close();
  }
}
```

**Key practices:**

- Always run with screenshots saved at every step → audit trail + debugging gold
- Wrap every `act()` in retry-with-backoff at the workflow level (Temporal)
- Per-payer specific submitters in `/browser/payers/<name>.ts` — eventually replace generic `act()` with deterministic Playwright selectors for stability

-----

## Phase 1 Week-by-Week

|Week|Goal                    |Concrete deliverable                                                                                          |
|----|------------------------|--------------------------------------------------------------------------------------------------------------|
|1   |Manual run-through      |You personally appeal one denial end-to-end manually. Document every step.                                    |
|2   |Repo skeleton           |Monorepo set up, Prisma schema deployed, Clerk auth working, “hello world” dashboard                          |
|3   |Denial ingestion        |CSV upload route working, parses ERA, populates Claim + Denial rows                                           |
|4   |Policy retrieval        |Manually load 50 BCBS policies into PayerPolicy table. Build embeddings. Retrieval working.                   |
|5   |Appeal drafter          |`llm_draft_appeal` activity produces real draft. Citation verifier deterministic check.                       |
|6   |Human review UI         |Reviewer sees draft, can approve/edit/reject. Approved drafts saved.                                          |
|7   |Browser submission      |Stagehand bot submits to ONE payer portal (BCBS or whichever your design partner uses). Confirmation captured.|
|8   |First real customer live|Onboard pilot #1. First real appeal submitted by the system. Champagne.                                       |

-----

## What Could Trip You Up

1. **EOB/ERA parsing** — ERAs are 835 EDI format, not friendly. Use a library like [pyx12](https://pypi.org/project/pyx12/) or pay a clearinghouse to give you JSON. Don’t write the parser yourself.
1. **PHI in LLM logs** — Langfuse traces will leak PHI if you’re not careful. Either redact before logging, or self-host Langfuse in your HIPAA AWS account.
1. **Browser automation breaking** — Payer portals change UIs. Build for it: confidence threshold per step, failure screenshot, alert to ops, fallback to fax.
1. **State-specific AI disclosure laws** — Some states (CA, CO) require AI callers to disclose they’re AI. Build the disclosure into your voice agent from day 1.
1. **Per-payer credentials management** — You’ll be storing dozens of practice logins to payer portals. Use AWS Secrets Manager, never plaintext.
1. **Idempotency** — If a Temporal activity retries, you must not submit the same appeal twice. Every submission gets a unique idempotency key.
1. **Audit log granularity** — When you eventually get an audit (HHS, payer complaint, customer dispute), you need to reconstruct exactly what the agent saw and did at every step. Log inputs + outputs + intermediate reasoning of every LLM call.

-----

## Day-1 Checklist

- [ ] Buy domain
- [ ] Form Delaware C-Corp (Stripe Atlas)
- [ ] Open AWS account, enable HIPAA-eligible services, request BAA from AWS
- [ ] Open Anthropic API account, request ZDR + BAA
- [ ] Set up GitHub org, Linear, Slack, 1Password
- [ ] Healthcare lawyer engaged for BAA template
- [ ] Bootstrap monorepo with Turborepo
- [ ] Stand up dev Postgres on Neon
- [ ] Run through a manual appeal on a friend-of-a-friend practice (no PHI yet — synthetic claim)
- [ ] Write down 30 questions to ask your first pilot prospect

-----

*This document evolves. Update as you ship.*