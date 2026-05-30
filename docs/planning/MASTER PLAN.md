# MASTER PLAN

## The AI Back-Office Layer for Healthcare Providers

*A complete strategy, market analysis, and build plan for an AI-agent startup that replaces the human payer-side back-office for medical practices.*

Working name: **Claimwell** (placeholder — see “Naming” section)

-----

## Table of Contents

1. The One-Sentence Pitch
1. Why This Idea (Research Summary)
1. The Idea in Detail
1. Target Customer & Wedge
1. Pricing & Unit Economics
1. Go-to-Market: First 90 Days
1. Competitive Landscape
1. Defensibility & Moat
1. Risks & How to Kill Them
1. Y Combinator Application Strategy
1. The Software — Architecture
1. The Software — Build Plan (Phases 0–3)
1. Tech Stack & Tools
1. Data Model
1. The Agent Loop (Pseudocode)
1. Compliance, Security, HIPAA
1. Metrics That Matter
1. 12-Month Roadmap
1. Naming, Domain, Brand
1. Appendix: Research Citations

-----

## 1. The One-Sentence Pitch

**We’re the AI back office for medical practices. Fire your billing company — our agents call insurers, file appeals, submit prior auths, and chase claims 24/7, and we only get paid when you do.**

-----

## 2. Why This Idea (Research Summary)

### 2.1 The Pain (Horizontal, Massive, Unsolved)

|Problem                   |Annual Cost (US)                     |Source                |
|--------------------------|-------------------------------------|----------------------|
|Admin excess in healthcare|~$276B savings potential             |Commonwealth Fund 2023|
|Initial claim denials     |~$262B claims denied + ~$25.7B rework|PMC 2024              |
|Revenue cycle inefficiency|~$260B                               |Etactics 2024         |
|Prior authorization       |~$35B admin / ~$93B all-in           |AMA, CMS              |
|Coding errors             |~$36B                                |Bluebrix 2024         |
|EHR interoperability      |~$30B avoidable                      |Medidata              |
|Credentialing delays      |$122K/provider lost revenue (avg)    |Sutherland Global     |
|Patient no-shows          |~$150B                               |ModuleMD              |

**Denial rates rose from 6.2% (2019) to 11.65% (2025) — a 52% increase.** The problem is getting worse, not better, because payer rules are growing more complex and provider billing staff can’t keep up.

**Per-physician burden:** ~700 hours/year and ~$34K/year just on prior authorization (CMS). Each manual appeal costs ~$57. A mid-size hospital with a 12% denial rate processes 12,000 denials = $600K/year in processing alone, not counting denied revenue.

### 2.2 The Money (VCs Are Pouring In)

- AI-enabled digital health took **62% of all H1 2025 VC dollars** (~$4B of $6.4B)
- AI startups raised **83% more per round** than non-AI peers
- Non-clinical workflow + clinical workflow took the top 2 funded categories (~$1.9B each in H1)
- **9 of 11 mega-deals ($100M+) went to AI startups**

**Recent comparable rounds (proof the category is hot):**

- Abridge: $550M raised in 2025, $5.3B valuation, ~$117M ARR (ambient scribe)
- Ambience: $243M Series C, $1.3B valuation (clinical workflow OS)
- OpenEvidence: $210M at $3.5B, ~$50M ARR growing 30% MoM (clinician search)
- Innovaccer: $275M Series F (data infra)
- Commure: $200M (back-office RCM)
- Tennr: $101M Series C (referral/intake workflows)
- Hippocratic AI: $141M Series B (voice agents)
- Corti: $80M Series C, $605M valuation (claims appeals AI)
- **LunaBill (YC F25):** $764K ARR in 4 months from zero — direct proof the AI-voice-for-billing wedge works

### 2.3 Y Combinator’s Stated Thesis (Summer 2026 RFS)

YC literally just published their request-for-startups list and called out **“Healthcare administration”** by name. Their thesis: *replace services, not software*. Sell labor outcomes, not SaaS seats. That’s exactly what this is.

### 2.4 What’s Crowded vs. Green

**🔴 Crowded — don’t enter:**

- Ambient AI scribes (Abridge, Ambience, Nabla, Freed, Suki, Nuance DAX, Epic shipping native in 2026)
- Generic chat-based clinical decision support
- Single-specialty SaaS plays

**🟡 Some traction, room for a sharper wedge:**

- Pure prior-auth automation (Cohere Health, Surescripts, ClaimGlide YC W26)
- Pure denial appeals (Corti, Aegis YC X25, Waystar)
- Pure intake/referrals (Tennr)

**🟢 Green / underbuilt:**

- The **unified back-office layer** — one platform doing ALL payer-side workflows for a practice. Every existing competitor is one-workflow-deep. None is the horizontal platform.

-----

## 3. The Idea in Detail

### 3.1 What It Is

A single platform whose AI agents handle every payer-facing back-office workflow for a medical practice, end-to-end. The provider doesn’t license software — they fire (or never hire) their billing/RCM team and we charge per outcome.

### 3.2 The Five Core Workflows (In Order of Build Priority)

|#|Workflow                               |What the Agent Does                                                                                                                                         |Where the Money Comes From                                                    |
|-|---------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
|1|**Denial follow-up & appeals**         |Reads ERA/EOB, classifies denial reason, drafts payer-specific appeal letter with citations from clinical notes, submits via portal/fax, follows up by phone|Recovered denied revenue (avg 50–65% overturn rate today, AI can push to 75%+)|
|2|**Claim status calls**                 |Calls payer IVRs, navigates menus, talks to reps, extracts status, updates EHR/PM                                                                           |Faster cash collection, fewer aged AR days                                    |
|3|**Prior authorization**                |Detects PA need from order, gathers clinical documentation, submits via portal/fax/ePA API, monitors status                                                 |Faster patient care, fewer abandoned procedures                               |
|4|**Eligibility & benefits verification**|Pre-visit eligibility check across all patients, copay/deductible lookup, flags coverage issues                                                             |Prevents the denials at the source                                            |
|5|**Credentialing follow-up**            |Calls payers to chase enrollment status, submits re-credentialing paperwork                                                                                 |Reduces 60–90 day average to 30 days                                          |

### 3.3 Why This Shape Wins

1. **Horizontal by construction** — every specialty, every practice size needs all five. Not bound to dermatology or psychiatry or any vertical.
1. **The wedge is voice + browser, not chat** — proven by LunaBill ($764K ARR in 4 months), Tennr, Attuned Intelligence. The unit economics work.
1. **Outcomes-based pricing aligns incentives perfectly** — when your interests match your customer’s, sales cycles compress.
1. **The competitive set is fragmented** — each competitor owns one slice. You can sell #1 then expand into #2–5 with the same customer using the same infrastructure.
1. **Defensible because integrations compound** — every new payer portal navigated, every new IVR mapped, every new appeal template is a permanent asset.

-----

## 4. Target Customer & Wedge

### 4.1 Who You’re Selling To (First)

**Primary ICP: Independent specialty practices, 5–50 providers, that currently outsource billing to a third-party billing company.**

Why this slice:

- They feel the pain acutely (billing companies charge 4–8% of collections)
- No procurement gauntlet, no IT review board
- Decision-maker is usually the practice manager or owner-physician
- They can switch in 30 days vs. 12-month hospital procurement cycle
- Epic isn’t a competitor here — these practices are on Athena, eClinicalWorks, Kareo, AdvancedMD, DrChrono

**Specialty priority order** (highest pain per dollar):

1. Behavioral health / psychiatry (notoriously denial-heavy, low billing-team density)
1. Physical therapy (high volume, low ticket, denial-heavy)
1. Dermatology (high-volume claims, surgical mix)
1. Ortho (mid-sized practices, surgical claims)
1. GI / endoscopy
1. Avoid first: oncology (too high-stakes for first deployments), primary care (margins too thin)

### 4.2 The Wedge: Denial Appeals First

Start with workflow #1 only. Reasons:

- Highest dollar-per-call leverage (a single appeal can recover $500–$10K)
- You can prove ROI in week 1
- Practices already accept that some denials go unworked — you’re capturing pure margin they thought they’d lost
- It’s a backstop, not a replacement — easier to sell as “we’ll work the denials your billing team is too busy to handle”

Then expand: month 4 add status calls, month 7 add eligibility, month 10 add PA, year 2 add credentialing.

-----

## 5. Pricing & Unit Economics

### 5.1 Pricing Model

**Recommended: percentage of recovered revenue, no monthly minimum.**

- Denial appeals: **25% of recovered denied claims** (typical billing companies charge 4–8% of total collections; you charge 25% of money they couldn’t recover at all)
- Status calls: **$2–4 per completed call** (replaces a human at ~$15–25/call)
- Eligibility checks: **$0.50–1.00 per verified patient** (commodity, volume play)
- Prior auths: **$25–50 per completed PA** (vs. $34K/year/provider currently)

### 5.2 Unit Economics (Per Customer)

Mid-size practice example, 20 providers:

- Claim volume: ~50,000 claims/year
- Denial rate: 12% = 6,000 denials/year
- Avg denied claim value: $400
- Currently recovered (manual): 40% × 6,000 × $400 = $960,000
- With AI: 75% × 6,000 × $400 = $1,800,000
- **Incremental recovery: $840,000/year**
- **Your fee at 25%: $210,000/year ARR per customer**

Your cost per appeal:

- LLM tokens + voice minutes + browser automation: ~$3–5 per appeal
- Per customer: 6,000 × $4 = $24,000/year
- **Gross margin: ~88%**

100 customers = **$21M ARR at 88% margin**. That’s a default-alive Series A scenario.

### 5.3 The Pricing Hack That Makes Sales Frictionless

Charge nothing upfront. No setup fee. No monthly minimum. You only earn when you recover money the practice had already written off. This makes every sales call a no-brainer — there is literally no downside risk to the customer. Hospitals will object that they need contracts, but independent practices will sign in one meeting.

-----

## 6. Go-to-Market: First 90 Days

### Days 1–14: Pick the Beachhead

- Choose ONE specialty (recommend behavioral health or PT)
- Pick ONE EHR/PM to integrate first (recommend Athena or DrChrono — they have open APIs)
- Build a list of 200 target practices in 2–3 metros via Definitive Healthcare / Carevoyance / public Medicare provider data

### Days 15–45: Land 3 Free Pilots

- Cold outreach by founder, no SDRs. Email + LinkedIn DM + in-person if local.
- Pitch: “We work your denied claims for free for 60 days. If we recover anything, you pay 25% of recoveries only. If we recover nothing, you pay nothing.”
- Goal: **3 pilots signed by day 45**
- Each pilot signs a simple 2-page agreement (template in `/legal/pilot-agreement.md` — to be drafted with a healthcare-specialized lawyer, not a generic startup lawyer)

### Days 46–90: Prove ROI, Convert, Reference-Sell

- Run agents in shadow mode first: agent drafts appeal, human approves, then submits
- Track every recovery in a public dashboard the customer can see
- Convert pilots to paid by day 75
- Get a written case study with dollar figures from each
- Use those 3 case studies as ammo for next 20 customers

### Days 91+: Scale

- Hire a Head of Operations (former biller from a top RCM company)
- Add 1 specialty per quarter
- Start adding workflows #2 and #3
- Begin YC application for next batch

-----

## 7. Competitive Landscape

### Direct Competitors (Vertical, Single-Workflow)

|Company            |Funding        |Wedge                  |Their Weakness                |Your Edge                 |
|-------------------|---------------|-----------------------|------------------------------|--------------------------|
|Tennr              |$101M Series C |Referrals/intake       |Doesn’t do appeals or PA      |Broader workflow set      |
|Cohere Health      |$50M+          |Payer-side PA          |Sells to payers, not providers|Provider-aligned incentive|
|Corti              |$80M, $605M val|Claims appeals AI      |Enterprise-only               |Small practice ICP        |
|LunaBill (YC F25)  |$764K ARR      |Voice for billing calls|One workflow, just launched   |Bundle workflows          |
|Aegis (YC X25)     |Seed           |Denial appeals only    |Single-workflow               |Same wedge, then expand   |
|ClaimGlide (YC W26)|Seed           |PA-only                |Single-workflow               |Same — bundle             |
|WorkDone (YC X25)  |Seed           |RCM compliance         |Different angle               |Different ICP             |
|Waystar / Change   |Public         |Full RCM platform      |Not AI-native, enterprise     |AI-native, fast iteration |

**Strategic insight:** Three YC companies in the last 3 batches are attacking adjacent slices of this problem. **This validates the space and proves YC is hungry for this exact thesis.** You’re not competing against them so much as racing them to be the platform that emerges from the category.

### Indirect Competitors

- Billing companies (R1, Conifer, Ensemble) — slow, expensive, human-only
- Generic RCM platforms (Waystar, Availity) — payer-side, not provider-side
- Epic / Athena building native — slow, enterprise-only, not focused on independents

-----

## 8. Defensibility & Moat

Software alone is not defensible. The moat is built from four compounding assets:

1. **Payer-specific knowledge graph** — every appeal template, denial code mapping, IVR phone tree, portal automation. Grows with usage and never gets weaker.
1. **Outcome data** — which appeal arguments win for which payers for which denial codes. Closed-loop reinforcement from real outcomes you uniquely have.
1. **Customer switching cost** — once you’re embedded in their PM/EHR and handling 6 workflows, ripping you out means rebuilding a billing department.
1. **Outcomes-based contracts** — competitors selling per-seat SaaS can’t match your pricing without burning their P&L.

-----

## 9. Risks & How to Kill Them

|Risk                                                     |How to Mitigate                                                                                                                                                                               |
|---------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|Payers detect and block AI callers                       |Use voice-cloned natural speech with realistic latency, randomize call timing, fall back to human-supervised mode. Long-term, push payers to ePA API adoption (CMS mandate already in motion).|
|Hallucinations cause a denied appeal to cite wrong policy|Every appeal cites verifiable sources from the patient’s chart + payer policy library. Human review gate for first 60 days per customer. Confidence scoring + escalation rules.               |
|Epic/Athena ships native version                         |Stay on independent practices (smaller EHRs, no Epic). Move faster. Win on outcomes-pricing they can’t match.                                                                                 |
|HIPAA breach                                             |SOC 2 from day 1, BAA template ready, encryption at rest and in transit, no PHI in LLM training, audit logs.                                                                                  |
|One large customer churns and tanks revenue              |No customer >15% of ARR until $5M ARR. Diversify across specialties.                                                                                                                          |
|Tennr/Commure raise massive Series B and outspend you    |They’re enterprise-focused, slow, and have legacy customers. Independents are still wide open.                                                                                                |
|Founder doesn’t have healthcare domain expertise         |Hire a former RCM director as employee #3 or co-founder. Visit 50 practices in first 6 months.                                                                                                |

-----

## 10. Y Combinator Application Strategy

### What YC Will Care About

YC looks for: massive problem, sharp wedge, monomaniacal founders, traction.

**Your pitch fits their framework perfectly:**

- RFS-aligned: “Healthcare administration” is named in Summer 2026 RFS
- Service-replacement: matches Gustaf Alströmer’s thesis exactly
- Revenue model is outcome-based, hard to misunderstand
- Three peer YC companies already validate the space

### What to Build BEFORE Applying

- Working product that processes ≥1 real denial end-to-end
- Ideally: 1 paying customer or 1 LOI with recovered-dollar proof
- If pre-revenue: video demo of agent successfully calling a payer (sandbox env) and getting status

### The One-Liner (Use This in the Application)

> *“We’re the AI back-office for medical practices. Our agents call insurance companies, submit appeals, and chase claims so practices don’t have to hire billing teams. We charge a percentage of recovered revenue — practices pay nothing if we don’t win.”*

### Killer Stats to Include

- US providers lose $262B/year to denied claims
- Average appeal costs $57 of manual labor
- Our agent appeals cost <$5 and have higher success rates
- [Your traction numbers here]

-----

## 11. The Software — Architecture

### 11.1 High-Level System

```
┌─────────────────────────────────────────────────────────────┐
│                     CUSTOMER (Practice)                      │
│  EHR/PM (Athena, DrChrono, eCW, Kareo)  ─── 837/835 files   │
└────────────────────────────┬────────────────────────────────┘
                             │
                  ┌──────────┴──────────┐
                  │   Integration Layer  │
                  │  • EHR connectors    │
                  │  • Clearinghouse     │
                  │  • SFTP/FHIR/HL7     │
                  └──────────┬──────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │           ORCHESTRATION CORE             │
        │  • Workflow engine (Temporal)            │
        │  • Agent router                          │
        │  • Human-in-loop queue                   │
        │  • Audit logger                          │
        └─┬────────┬────────┬─────────┬────────────┘
          │        │        │         │
   ┌──────▼──┐ ┌──▼────┐ ┌─▼────┐ ┌──▼────────┐
   │ Browser │ │ Voice │ │ Doc  │ │ Reasoning │
   │ Agents  │ │ Agents│ │ Gen  │ │ (LLM)     │
   │(Stagehand│ │(Vapi/ │ │      │ │ Claude/   │
   │/Playw't)│ │Retell)│ │      │ │ GPT)      │
   └────┬────┘ └───┬───┘ └──┬───┘ └─────┬─────┘
        │          │        │           │
        └──────────┴────────┴───────────┘
                   │
        ┌──────────▼──────────┐
        │  PAYER UNIVERSE     │
        │  • 1000+ portals    │
        │  • IVR systems      │
        │  • Fax/mail         │
        │  • ePA APIs         │
        │  • Clearinghouses   │
        └─────────────────────┘
```

### 11.2 Key Components

**a) Integration Layer**

- EHR/PM connectors (Athena API, DrChrono API, eCW SFTP, Kareo)
- Clearinghouse (Change Healthcare / Availity / Waystar) for 837/835 files
- FHIR R4 support where available

**b) Workflow Orchestrator** (Temporal.io)

- Long-running workflows survive process crashes
- Continue-as-new for batch processing thousands of claims
- Activity retries, timeouts, idempotency

**c) Agent Workers (Specialized)**

- Browser workers (headless Chrome + Playwright/Stagehand) for portals — 8 concurrent per worker, 10GB RAM
- Voice workers (Vapi or Retell AI) for IVR/rep calls
- LLM workers (lightweight, 100 concurrent) for reasoning, drafting, classification
- GPU workers (on-demand, scale to zero) for OCR of faxed EOBs

**d) Knowledge Graph**

- Payer rules database (denial codes, appeal templates, portal URLs, IVR maps)
- Per-customer learned preferences (which arguments win for which payer)
- Versioned — payer rules change quarterly

**e) Human-in-Loop Queue**

- Confidence-scored escalations
- Faster than fully manual, slower than fully autonomous
- Critical for the first 60 days of each customer

**f) Compliance Layer**

- All PHI encrypted at rest (AES-256) and in transit (TLS 1.3)
- No PHI in LLM training pipelines
- Audit log of every action (immutable, append-only)
- BAA with every vendor that touches PHI

-----

## 12. The Software — Build Plan (Phases 0–3)

### Phase 0: Pre-product (Weeks 1–2)

Goal: validate one workflow on one real payer manually before any code.

- Use a fake but realistic test claim
- Manually call BCBS or UHC for a denial appeal end-to-end
- Document every step, every screen, every IVR menu
- This becomes the spec for Phase 1

### Phase 1: MVP — Single Workflow, Single Payer (Weeks 3–10)

**Goal: process a real denial appeal end-to-end with human approval, for 1 customer.**

What to build:

- Customer dashboard (Next.js + Tailwind) — login, claim list, denial queue, approval workflow
- EHR ingestion (start with manual CSV upload, then 1 API integration)
- Denial classifier (Claude/GPT, classifies ERA/EOB reason codes)
- Appeal letter generator (LLM with retrieval over payer policy library)
- Portal submission (Playwright/Stagehand bot for ONE payer’s portal)
- Human approval gate (every appeal reviewed by you before submission)
- Audit log

**Out of scope for Phase 1:**

- Voice calls
- Multi-payer
- Multi-customer
- PA, eligibility, status — only appeals

### Phase 2: Expand — Multi-Payer, Voice, 5 Customers (Months 3–6)

- Add voice agent (Vapi) for status follow-ups on submitted appeals
- Add 5 more payers (BCBS regional, UHC, Aetna, Cigna, Humana, Medicare)
- Reduce human-approval to spot-check (sample 10% instead of 100%)
- Onboard customers 2–5
- Add Temporal for workflow durability
- Add SOC 2 prep

### Phase 3: Platform — Multi-Workflow, 20+ Customers (Months 7–12)

- Add workflow #2: status calls (highest volume, easiest agent)
- Add workflow #3: eligibility verification
- Add 20+ payers
- Add multi-tenant architecture, per-customer isolation
- Hire engineers #2 and #3
- SOC 2 Type 1 complete

-----

## 13. Tech Stack & Tools

### Recommended Stack

|Layer          |Choice                                                                 |Why                                                             |
|---------------|-----------------------------------------------------------------------|----------------------------------------------------------------|
|Frontend       |Next.js 15 + React + Tailwind + shadcn/ui                              |Fast, recruitable, AI-friendly                                  |
|Backend API    |FastAPI (Python) or Hono (TypeScript)                                  |FastAPI if your team is Python-heavy (LLM ecosystem); Hono if TS|
|Database       |Postgres (Neon or Supabase)                                            |Standard, durable, easy                                         |
|Workflow Engine|Temporal.io                                                            |Durable workflows for long-running multi-step jobs              |
|Browser Agents |Playwright + Stagehand or Browserbase                                  |Stagehand wraps Playwright with LLM-driven steering             |
|Voice Agents   |Vapi or Retell AI                                                      |Best-in-class voice infra; Vapi has good telephony              |
|LLMs           |Claude (Anthropic) for reasoning/drafting, GPT-4o or Gemini as fallback|Use Claude Opus for appeals drafting, Haiku for classification  |
|OCR            |Reducto or LandingAI                                                   |For faxed/scanned EOBs                                          |
|Auth           |Clerk or WorkOS                                                        |WorkOS if you’ll have enterprise customers                      |
|Observability  |Sentry + Datadog + Langfuse                                            |Langfuse for LLM tracing                                        |
|Hosting        |AWS (HIPAA-eligible services only) — sign BAA                          |Required for HIPAA compliance                                   |
|Queue / cache  |Redis (ElastiCache)                                                    |Standard                                                        |
|File storage   |S3 with object lock                                                    |For PDFs, faxes, EOBs                                           |

### What NOT to Use

- No client-side LLM calls (PHI risk)
- No SQLite or local file storage in production (HIPAA)
- No generic chatbot frameworks — build agents purpose-built
- No “AutoGPT-style” recursive agents — too unpredictable for regulated workflows. Use deterministic state machines with LLM-in-the-loop for specific steps.

-----

## 14. Data Model

Core entities (simplified):

```
Practice
  id, name, ehr_type, primary_specialty, npi, tax_id, created_at

Provider (belongs to Practice)
  id, practice_id, npi, name, credentials, specialty

Patient (belongs to Practice)
  id, practice_id, external_id, insurance_ids[], encrypted_demographics

Claim
  id, practice_id, patient_id, provider_id, payer_id,
  service_date, cpt_codes[], icd_codes[], billed_amount,
  status (submitted/paid/denied/appealed), submitted_at

Denial (belongs to Claim)
  id, claim_id, denial_code, denial_reason, denied_amount,
  era_raw_text, received_at, appeal_status

Appeal (belongs to Denial)
  id, denial_id, drafted_letter, payer_specific_template_used,
  citations[], submitted_via (portal/fax/mail),
  submitted_at, outcome (pending/won/lost/partial),
  recovered_amount, our_fee

Payer
  id, name, payer_id_numbers[], state_coverage[],
  portal_url, ivr_phone, fax_number,
  appeal_address, epa_supported (bool)

PayerPolicy (versioned)
  id, payer_id, policy_type (denial_reason / pa_criteria / appeal_format),
  effective_date, body_text, source_url, scraped_at

AgentRun (every agent execution)
  id, workflow_type, claim_id_or_denial_id, agent_type,
  started_at, completed_at, status, confidence_score,
  cost_cents, error_message, audit_trail_json

HumanReview
  id, agent_run_id, reviewer_id, decision (approved/rejected/edited),
  reviewed_at, edits_made
```

Indexes that will matter: `claim(practice_id, status)`, `denial(payer_id, denial_code)`, `appeal(outcome, payer_id)` — the last one powers your closed-loop learning.

-----

## 15. The Agent Loop (Pseudocode)

Generic structure for any workflow agent:

```python
# Pseudocode for appeal agent

@workflow.defn
class AppealWorkflow:
    @workflow.run
    async def run(self, denial_id: str) -> AppealResult:
        # 1. Fetch context
        denial = await activity.execute(fetch_denial, denial_id)
        claim = await activity.execute(fetch_claim, denial.claim_id)
        patient_chart = await activity.execute(
            fetch_chart_excerpts, claim.patient_id, claim.service_date
        )
        payer_policies = await activity.execute(
            retrieve_payer_policies, claim.payer_id, denial.denial_code
        )

        # 2. Classify & strategize (LLM)
        strategy = await activity.execute(
            llm_strategize_appeal,
            denial=denial,
            claim=claim,
            payer_policies=payer_policies,
            historical_wins=await fetch_winning_appeals(
                claim.payer_id, denial.denial_code
            )
        )

        if strategy.predicted_win_probability < 0.4:
            return AppealResult(status="skipped", reason="low_win_probability")

        # 3. Draft appeal (LLM with retrieval)
        draft = await activity.execute(
            llm_draft_appeal,
            strategy=strategy,
            patient_chart=patient_chart,
            payer_policies=payer_policies,
            template=payer_policies.appeal_template
        )

        # 4. Verify citations (deterministic checker)
        verification = await activity.execute(verify_citations, draft)
        if not verification.all_valid:
            draft = await activity.execute(
                llm_redraft_with_citations,
                draft=draft,
                invalid_citations=verification.invalid
            )

        # 5. Human review gate (during ramp period)
        if claim.practice.requires_human_approval:
            approval = await workflow.wait_for_human_review(
                draft, timeout=timedelta(hours=24)
            )
            if approval.rejected:
                return AppealResult(status="rejected_by_human")
            draft = approval.final_version

        # 6. Submit via the right channel
        if payer.portal_url:
            submission = await activity.execute(
                browser_agent_submit_via_portal,
                payer=payer, draft=draft, patient=patient
            )
        elif payer.epa_supported:
            submission = await activity.execute(
                api_submit_appeal, payer=payer, draft=draft
            )
        else:
            submission = await activity.execute(
                fax_submit_appeal, payer=payer, draft=draft
            )

        # 7. Schedule follow-up calls
        await workflow.start_child_workflow(
            FollowUpWorkflow,
            args=[submission.confirmation_number],
            delay=timedelta(days=14)
        )

        return AppealResult(
            status="submitted",
            submission_id=submission.confirmation_number,
            submitted_at=submission.timestamp
        )
```

Key principles in this loop:

1. **Deterministic state machine, LLM-in-the-loop** — not recursive autonomous agents
1. **Every step is a Temporal activity** — retries and durability for free
1. **Confidence scoring + human gate** — early customers get reviewed appeals
1. **Citation verification** — never submit hallucinated policy references
1. **Closed-loop learning** — outcomes feed back into the strategy model

-----

## 16. Compliance, Security, HIPAA

### Non-Negotiable from Day 1

- Sign a Business Associate Agreement (BAA) with EVERY vendor touching PHI (AWS, Anthropic, OpenAI, Vapi, Temporal Cloud, etc.) — most have HIPAA-compliant tiers; **never use a service without a BAA**
- Encrypt PHI at rest (AES-256) and in transit (TLS 1.3)
- No PHI in LLM training data — use no-retention API endpoints (Anthropic offers ZDR, OpenAI offers via API)
- Audit log every action that touches PHI — immutable, append-only
- Principle of least privilege — each microservice gets minimum DB access
- MFA mandatory for all employee access

### SOC 2 Timeline

- Month 6: start Type 1 prep with Vanta/Drata
- Month 9: Type 1 audit complete
- Month 18: Type 2 audit (requires 6 months of evidence)

### HITRUST

- Not required for independent practices
- Will be required if you sell to hospitals — defer until Series A

### Legal

- Hire a healthcare-specialized attorney (not generic startup counsel) for:
  - BAA templates
  - Customer contracts with outcomes-based pricing
  - State telemarketing/AI-disclosure compliance (varies by state — some require disclosure that the caller is an AI)
  - Payer terms of service review for portal automation (gray area)

-----

## 17. Metrics That Matter

### Customer-facing (the only metrics that matter to the practice)

- **$ recovered** — total dollars recovered from denied claims
- **Win rate** — % of submitted appeals that result in payment
- **Days to recovery** — submission to payment
- **% claims worked** — coverage rate of incoming denials

### Internal Ops

- **Cost per appeal** — LLM + voice + browser cost (target <$5)
- **Time per appeal** — submission turnaround (target <24 hrs)
- **Human-review rate** — % needing human gate (target <10% by month 6)
- **Hallucination rate** — % of appeals with bad citations (target <0.1%)

### Business

- **ARR** — at outcome-based pricing, count contracted recurring fees
- **Gross margin** — target 80%+ at scale
- **NRR** — net revenue retention from customers expanding to new workflows
- **CAC payback** — target <6 months given founder-led sales

-----

## 18. 12-Month Roadmap

|Month|Engineering                            |GTM                       |Compliance            |Funding               |
|-----|---------------------------------------|--------------------------|----------------------|----------------------|
|1    |Manual run-through, dashboard wireframe|Build prospect list of 200|BAA templates         |Bootstrap             |
|2    |MVP: 1 payer, 1 workflow               |First outreach campaign   |Pick attorney         |Bootstrap             |
|3    |First customer live                    |3 pilots signed           |AWS BAA, Anthropic ZDR|Bootstrap             |
|4    |5 payers, voice agent v1               |Convert pilots to paid    |SOC 2 prep starts     |Apply to YC           |
|5    |Customers 2–5 onboarded                |Case studies written      |—                     |Pre-seed if needed    |
|6    |Add status calls workflow              |Reach 8 customers         |SOC 2 Type 1 begin    |YC interview          |
|7    |Add eligibility workflow               |Reach 12 customers        |—                     |YC batch (if accepted)|
|8    |20+ payers covered                     |Reach 18 customers        |SOC 2 Type 1 done     |—                     |
|9    |Multi-tenant hardening                 |$1M ARR milestone         |—                     |Demo Day prep         |
|10   |Add prior auth workflow                |Reach 25 customers        |—                     |Demo Day              |
|11   |Specialty #2 launch                    |$2M ARR                   |—                     |Seed round            |
|12   |Platform stable, hire eng #4           |$3M ARR, 35+ customers    |SOC 2 Type 2 begin    |Series A prep         |

-----

## 19. Naming, Domain, Brand

### Naming Criteria

- Short (2 syllables ideal)
- Not specialty-specific
- .com available (or .ai if not)
- Conveys outcome (paid, won, recovered) not process (billing, RCM, claims)

### Candidates

|Name       |Vibe                 |Domain check (you must verify)|
|-----------|---------------------|------------------------------|
|Claimwell  |Outcome-oriented     |Check claimwell.com / .ai     |
|Settled    |Past-tense outcome   |Check settled.ai              |
|Recoup     |Recovery, monetary   |Likely taken                  |
|Greenlight |Approval signal      |Likely taken                  |
|Backbill   |Back-office + billing|Available                     |
|Paid       |Ultimate outcome     |.com unavailable; .ai maybe   |
|Approvr    |PA-themed, too narrow|—                             |
|Conduit    |Infra metaphor       |Often taken                   |
|Paystream  |Cash flow metaphor   |Check                         |
|**Settled**|Strong               |Recommend checking first      |

(Do a quick `whois` and trademark search on USPTO before locking anything in.)

### Brand Positioning

> *Calm, competent, no-jargon. We do the boring work so doctors don’t have to. Visual identity: clean, professional, navy/white, zero “AI” cliché imagery.*

-----

## 20. Appendix: Research Citations

### Pain & Market Sizing

- Commonwealth Fund 2023 — High US Health Care Spending
- PMC 2024 — Claim denial cost study
- CMS — Electronic Prior Authorization overview
- AMA — Prior authorization myths
- HFMA Q2 2025 — Healthcare AI and RCM Survey
- AHA — Hospital administrative burden estimates

### Funding & Comparable Companies

- Rock Health H1 2025 + Q3 2025 reports
- Sacra research — Abridge, OpenEvidence, Commure, Freed reports
- Menlo Ventures — 2025 State of AI in Healthcare
- PitchBook Q4 2025 — AI Scribes analyst note
- William Blair — AI in RCM market report
- Crunchbase — AI healthcare funding 2025

### YC & Startup Landscape

- YC Summer 2026 RFS (Gustaf Alströmer on services-replacement)
- YC Fall 2025 RFS (Harj Taggar on retraining + 6 categories)
- YC company directories — Healthcare IT, Digital Health, Healthcare Services
- AllHealthTech YC F25 / S25 coverage

### Specific Comparables to Study

- Tennr — workflow expansion playbook
- LunaBill (YC F25) — early-stage AI-voice-for-billing traction
- Aegis (YC X25) — appeals automation positioning
- ClaimGlide (YC W26) — PA wedge
- Corti — claims appeals enterprise model
- Cohere Health — payer-side PA at scale
- Surescripts — ePA adoption stats

-----

*End of master plan. This is a living document — edit as you learn.*