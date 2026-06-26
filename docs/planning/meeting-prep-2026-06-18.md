# Meeting Prep — Market, Wedge, EHR Reality & Denial Process

*Prepared 2026-06-18. Covers the three asks: (1) market/landscape + where Overturn falls + who's funded by whom, (2) the EHR-format-fragmentation concern, (3) exactly how practices handle denials. Where useful, this also states what Overturn actually does **today in code** (not just the plan), since that's what you can defend in the room.*

**Confidence tags:** [confirmed] = primary source / official report; [estimate] = vendor or analyst figure; [conflicting] = sources disagree, noted inline.

---

## 0. The 30-second version (say this first)

- The macro is all moving our way: denial rates up (~10% → ~11.8% initial), RCM is the **most VC-active category in all of health IT in 2025**, AI took **>50% of all digital-health dollars in 2025**, and "non-clinical workflow" (where billing/denials lives) is co-leading every funding report. [confirmed]
- The field is **bifurcated**: the hospital/enterprise end is saturated and well-capitalized (Waystar, Commure $7B, AKASA, SmarterDx, Cohere). The small-practice end is filling fast — but almost entirely with **"fire your biller / full-cycle AI billing company"** plays. [confirmed]
- **Our exact wedge is still open:** *appeals-only, contingency-priced, sits-on-top-of-the-existing-biller, for 5–50-provider non-Epic specialty practices.* The single closest competitor (Aegis, YC X25) blurs across hospitals + billing firms + payers and has no stated contingency or SMB-EHR focus.
- On the advisor's EHR concern: she's **half right, but about the wrong layer.** The denial *financial* data (835 / CARC / RARC) is HIPAA-standardized and rides through clearinghouses; the *clinical chart* data is the genuinely fragmented part. **Our architecture already sidesteps EHR integration entirely** — we ingest the standardized 835 + CSV + PDF/EOB and take clinical context by upload. There is zero EHR-connector code, and we don't need any to work.

---

## 1. Market / Landscape — and Where We Fall

### 1.1 The problem is large and getting worse

| Metric | Figure | Source / note |
|---|---|---|
| Initial (first-pass) denial rate | **11.8% in 2024**, up from ~10.2% a few years earlier | Becker's/MDaudit consensus number, recycled across 2025–26 vendor reports [confirmed-as-consensus] |
| Providers reporting >10% denial rates | **30% (2022) → 38% (2024) → 41% (2025)** | Experian *State of Claims 2025* [confirmed survey] |
| ACA in-network denial rate (KFF) | **19% in-network / 37% out-of-network (2024)**, flat vs 2023 | KFF, the authoritative payer-side dataset [confirmed] |
| Share of denied claims that are appealed | **<1%** (ACA marketplace) | KFF 2024 [confirmed] |
| Admin cost to work one denial | **$57.23 (2023)**, up from $43.84 (2022) | Premier, Inc. — the freshest hard number [confirmed] |
| Older rework-cost range still quoted | **$25–$181/claim** | AHIMA — but this traces to **2017–2019** data; use Premier's $57 as the defensible anchor [conflicting/dated] |
| Annual US spend reworking denials | **$19.7B (AHA) – $25.7B (Premier)** | cite both with attribution [conflicting scope] |
| Denials never reworked | **35–65%** | MGMA / AHIMA [estimate] |

**The narrative that lands:** fewer than 1% of denied claims are ever appealed, yet appeals win a majority of the time — **66% of internal appeals are upheld (so ~34% overturned at first internal level), 80.7% of Medicare Advantage prior-auth appeals are overturned, and external/IRO overturn rates rose from 38% (2019) to ~53% (2025)** (JAMA, April 2026). The recoverable revenue is being abandoned for lack of labor, not because the denials were justified. [confirmed]

> Be precise on overturn rates — they differ by stage: ~34–44% at internal insurer appeal (KFF) vs ~53% and rising at external/IRO review (JAMA) vs 57% for MA (Health Affairs). Don't conflate them.

**RCM market size:** estimates span ~6x by scope. Defensible framing: **US RCM ~$65–73B (2025–26)**; "claims & denial management" is repeatedly called the dominant function-segment, and physician-office/ASC is the fastest-growing provider segment — directly our target. [estimate]

### 1.2 The money is pouring in — and into our category specifically

- **2025: US digital health raised $14.2B**, +35% YoY, highest since 2022 — driven by fewer, larger deals. [confirmed, Rock Health]
- **AI-enabled companies took 54% of 2025 funding (up from 37% in 2024)**; in H1 2025 AI hit 62% for the first time. AI rounds carry a deal-size premium (up to 61% at Series C). [confirmed]
- **Q1 2026: $4B across 110 deals** — strongest Q1 since the pandemic; ~60% of dollars from ~12 mega-deals. [confirmed]
- **Menlo Ventures (Oct 2025):** healthcare AI spend hit **$1.4B in 2025 (3x 2024)**. **Coding & billing automation = $450M**, the second-largest AI category (after ambient scribes), explicitly framed as "recovers revenue lost to coding errors and denials." **Prior auth growing +10x YoY.** Their cleanest pitch stat: *"front-office RCM admin services total $98B/year, of which software is only 3%."* [confirmed, primary report]
- **Edgemont Partners (HCIT banker, year-end 2025):** *"RCM was the most active sector in all of HCIT in 2025 for both M&A and VC"* — VCs specifically chasing AI, prior auth, ambient, and **denials**. [confirmed, qualitative]
- **Regulatory tailwind:** CMS Interoperability & Prior Auth Final Rule speeds approvals; 2025 CMS rule requires MA denials be reviewed by a clinician (not algorithm alone); several states passing anti-AI-denial laws. Structurally favorable to denials/PA automation. [confirmed]

### 1.3 Who is funding whom (the map to drop in the room)

**Provider-side RCM platforms (full-cycle — adjacent, not our exact wedge):**
- **Candid Health** — $99.5M total; **$52.5M Series C (Feb 2025, led by Oak HC/FT)**. Clean-claim infrastructure for tech-forward groups.
- **Adonis** — ~$95M total; **$40M Series C (Mar 2026, led by Quadrille Capital, + General Catalyst)**; earlier Series A led by **General Catalyst**. RCM orchestration, moving upmarket toward health systems (Mount Sinai).
- **Commure** — ~$1.9B raised; **$70M at a $7B post-money valuation (May 2026, General Catalyst, Sequoia, Morgan Stanley)**. Enterprise health-system platform.
- **Thoughtful AI** — $20M Series A (Drive Capital). RCM agents incl. a denials agent.

**Closest to us (denials/appeals or small-practice billing):**
- **Aegis (YC X25)** — *our closest direct analog.* AI agents that detect denials, draft cited appeal letters, submit via portals. **But** targets "providers, hospitals, AND billing firms," no stated contingency or non-Epic-SMB focus. Tiny team (3 CMU founders), undisclosed seed, backers incl. YC, Rebel Fund, Sequoia Scout, Mana, Maiora. **~1 year ahead of us — watch closely.**
- **Taxo (YC S24)** — billing & coding AI, explicitly planning to expand into claim denials + patient letters. Physician founder.
- **Taiga (YC P2026)** — AI-native billing for small practices, "fight every denial," founders grew up in their parents' practices. **Most ICP-aligned new entrant — but full-cycle billing, not appeals-only.**
- **Quill Bills (YC S23)** — AI billing agency for private practices; **$3.2M (Mar 2026)**; "fight every denial," charges below the 2–10% biller fee.
- **Clearest Health (YC S23)** — AI recovery for independent practices' **out-of-network / No Surprises Act IDR** disputes. Very close adjacent, but OON/IDR-only, not in-network denial appeals.
- **Overdrive Health (YC W26)** — full-stack billing co. that **acquires billing companies** and injects AI (EMS wedge). Roll-up model = a structural threat to per-claim economics.
- **LunaBill (YC F25)** — AI **voice** callers for billing teams; $764K contracted ARR. *This is our Phase-2 (status calls), not our appeals wedge,* and they sell to enterprise/health systems.
- **Rivet Health** — incumbent SMB denial-management **software** (~$28M raised). Note: **explicitly markets "no percentage-based collections fees"** — i.e., the anti-contingency position. We should pre-empt this: contingency = no-risk to the practice, not a tax.

**Payer-side / not competitors:** Cohere Health (~$200M, payer prior auth — literally the other side of the table); Anomaly ($34M, payer-behavior analytics).

**Enterprise/hospital appeals (saturated):** Waystar (public, $1.1B rev, AltitudeAI generative appeal drafting), SmarterDx (acquired by New Mountain), AKASA (Epic/Cerner shops), Aspirion, R1.

**VC pattern to name-drop:** General Catalyst is the most repeat provider-RCM backer (Adonis, Commure). a16z + Lightspeed tag-team healthcare-AI workflow (Tennr, Abridge). **Foundation Capital is in Tennr** — relevant given our own investor conversations. Crucially: **no major VC has yet anchored a provider-side, outcomes-priced, denials-appeal pure-play.** The closest provider plays are full-stack RCM (Candid, Adonis); the denials-appeal specialists (Claimable, Counterforce) are **patient-facing B2C**, not provider-side. That gap is our positioning.

### 1.4 The YC angle (if it comes up)

YC's current RFS (Summer 2025 → Summer 2026, Gustaf Alströmer) explicitly calls for **"AI-native companies that don't sell software — they sell the service... they just do the work,"** and names **"Healthcare administration"** as a target. *"Replace the service, sell the outcome"* is a near-exact description of our contingency model. YC has funded an RCM/billing/denials startup **every batch since S24** (Taxo, Guardian AI, Chorrie, Ember Copilot, Claim Health, Avelis, LunaBill, Overdrive, Taiga, Ruma, ClaimGlide). The lane is **validated but not yet owned** in our exact wedge.

### 1.5 Where Overturn falls — the one-paragraph positioning

No competitor combines all four of our pillars: **(1)** appeals-first wedge (not full RCM, not PA-first, not voice-first); **(2)** verified, payer-specific citations in the drafted letter; **(3)** contingency / % of recovered revenue; **(4)** 5–50-provider independent specialty practices on non-Epic EHRs. The enterprise end is closed; the SMB end is crowding with *rip-and-replace billing companies*. Our defensible white space is the **lightweight, appeals-only overlay that sits on top of the practice's existing biller and only gets paid when it recovers money.** Risks to name honestly: Aegis is the same idea and ahead; the full-cycle players (Taiga/Quill/Overdrive) capture the appeal as a *feature*, so we must win the practice before they hand the whole cycle away; and some SMBs resist contingency (Rivet's positioning).

---

## 2. The EHR-Format Concern — "smaller practices, EHRs have different formats, hard to automate"

### 2.1 She's half right — but the hardness is in a different layer

Split the problem in two:

| Layer | Fragmentation reality | Hardness | Our approach |
|---|---|---|---|
| **Denial / financial data** (what was denied & why) | **Strongly standardized** — 835 + CARC/RARC are HIPAA-mandated national standards | Low–moderate. Real variation is in *which* codes a payer picks (a bounded, documented problem), **payer-by-payer, not EHR-by-EHR** | Ingest the standardized **835 from a clearinghouse**, + CSV, + PDF/EOB OCR |
| **Clinical / chart data** (what proves the appeal) | **Genuinely fragmented** across dozens of EHR templates; FHIR thin on narrative notes | High for deep auto-extraction | **Meet the data where it is** — manual upload / paste of chart excerpts, OCR, FHIR where available |

**Key facts to deploy:**
- X12 **837 (claim), 835 (remittance/denial), 277 (status), 270/271 (eligibility)** are HIPAA-mandated. The 835 "replaces payer-specific formats with a consistent structure you can automate." **CARC** (~358 codes) and **RARC** (CMS-maintained) are **national code sets**; HIPAA *prohibits* payers from using proprietary codes to explain adjustments. [confirmed]
- The nuance (CAQH CORE 360 Rule): the standard doesn't dictate *which* CARC/RARC a plan selects, so combinations vary by payer — a real but **bounded** normalization problem, and it's a **payer** problem, not an **EHR** problem. [confirmed]
- **Clearinghouses already collapse the EHR/payer matrix into one feed.** Availity reaches 95%+ of US payers; Office Ally 5,000–6,000+ payer IDs; Waystar has 200+ EHR integrations and ingests 835s. You can subscribe to an **835-only feed** regardless of which of the dozens of EHRs a practice runs. [confirmed]
- Where the standard genuinely breaks: **paper/PDF/faxed EOBs** (common from Medicaid MCOs and workers' comp), payer-proprietary EOB text, and **clinical note formats** (the unstructured part). That's the real fragmentation — and it's exactly the clinical layer, which we handle by upload + OCR, not by EHR API. [confirmed]
- The ambulatory EHR market really is fragmented (top 3 vendors ~40% share, long tail of dozens) — so trying to build per-EHR integrations *would* be the combinatorial nightmare she's warning about. The answer is to **not do that.** [estimate, KLAS-derived]

### 2.2 What Overturn actually does today (this is the strong answer)

From the actual code, not the plan:
- **There is zero EHR-connector code.** No Athena/DrChrono/eCW/Epic/Cerner integration exists anywhere in the app. We deliberately don't depend on it.
- We ingest via **three real, file/standards-based paths**: a **real hand-written 835/EDI parser** (`era_parser.py`, ~513 lines, parses CLP/CAS/SVC/NM1/DTM segments — tested against 10 realistic ERAs covering Medicare/Aetna/Cigna/UHC/Humana/Anthem/Kaiser/workers-comp/Molina scenarios), a **CSV upload** path, and a **PDF/image EOB** path with OCR + Claude-vision fallback. A **clearinghouse SFTP poller** (real paramiko) pulls 835s automatically.
- **Clinical context (the chart excerpts the LLM cites) is entered/uploaded manually** — by design, not pulled from an EHR.

So the honest, confident line is: **"EHR fragmentation is something we designed around, not something we have to solve. We ride the HIPAA-standardized 835 plus flexible upload; we don't touch EHR APIs and don't need to. The genuinely hard, defensible work is payer-specific denial-semantics normalization and clinical-evidence handling — not EHR plumbing."**

> One internal note worth reconciling before any real PHI: the LLM client currently defaults to a **Z.ai proxy endpoint**, which conflicts with the Anthropic-BAA framing in our docs. Flag it.

---

## 3. Exactly How Practices Handle Denials (the workflow we're automating)

Narrate it as a pipeline — this shows we understand the customer cold.

### 3.1 Two different "no" events (billers treat them as separate worlds)
- **Front-end rejection** — fails a format/validation check at the **clearinghouse or payer intake, before adjudication.** No ERA, **no CARC/RARC, no appeal clock.** Just fix and re-transmit.
- **Adjudicated denial** — the payer *processed* and declined to pay. Returns codes on a remittance, is a "denial of record," and **starts the timely-filing-for-appeal clock.**

### 3.2 The step-by-step
1. **Arrival** — as an **ERA/835** (electronic) or **paper EOB**. The 835 carries, at claim and line level: a **Group Code** (CO contractual / PR patient / OA other / PI payer-initiated), one or more **CARCs** (why), and **RARCs** (supplemental). *Group + CARC + RARC is the instruction set the biller reads.*
2. **Posting/reconciliation** — payments + adjustments posted to the PM system (auto-post from 835, or manual from paper); denied/zero-paid lines flagged into a **work queue**.
3. **Triage** — *not* FIFO. Prioritized by **timely-filing deadline** (the hard constraint) → **dollar value** → **denial reason/fixability**. A common practitioner model is **four lanes**, each denial assigned to exactly one: (A) corrected claim, (B) send documentation, (C) reconsideration, (D) formal appeal.
4. **Root-cause analysis** — read the codes to find *why* (eligibility, coding, medical necessity, authorization, timely filing, duplicate, bundling). The cause picks the cheapest correct path.

### 3.3 The distinctions practitioners make
- **Rejection vs denial** (above).
- **Soft denial** (temporary/correctable — missing info, modifier, docs → corrected claim) vs **hard denial** (medical necessity, expired timely filing, non-covered → needs a real appeal).
- **Path escalation, only as far as needed:** corrected-claim/resubmit (billing errors) → **reconsideration** (informal re-review, ~30–60 days) → **formal appeal** (full packet) → **peer-to-peer** (clinician-to-clinician call, for medical-necessity/PA — costs the *physician's* time).
- **Levels of appeal:** Medicare FFS has **5 levels** (redetermination 120 days → QIC reconsideration 180 days → ALJ 60 days → Council → federal court, 2026 threshold $1,960). Medicare Advantage: plan reconsideration within **65 days**, auto-forwarded to an Independent Review Entity if upheld. Commercial/ERISA: usually two internal levels + external IRO review.

### 3.4 The appeal packet & submission
- **Timely-filing windows vary by payer/plan** (the reason the manual "look up this payer's rule" step is so costly): Medicare 12 months to file initially, 120 days to appeal; Medicaid often 90/180 days; commercial appeal windows commonly 60–180 days (Aetna ~120, Cigna 90–180, UHC 90–180, Humana 90).
- **Packet contents:** appeal/reconsideration letter, corrected claim if needed, medical records, **proof of timely filing** (key for CO-29 fights), and **citation of the specific payer policy / LCD-NCD medical-necessity criteria** the claim meets.
- **Submission is highly varied and manual** — payer portal, fax, mail, or clearinghouse, each payer dictating its own method and forms.
- **Follow-up** — track in the PM system, monitor aging A/R (30/60/90/120+), call payers for status, escalate to the next level. Open-ended and labor-intensive.

### 3.5 Where the time/money/pain goes
- **~$57 admin cost per denial** (Premier 2023); appeals are among the most resource-intensive RCM functions (MGMA).
- **43% of organizations report insufficient claims-ops staffing.** At small practices this falls on **one in-house biller, the office manager, or an outsourced billing company** — no dedicated denials specialist — so they work only the highest-dollar denials and abandon the rest.
- **<1% of denials get appealed, but 66–81% of appeals win.** That abandoned, winnable, high-dollar work is exactly what an AI agent automates — and it's pure found money for the practice.
- Most labor-intensive/error-prone steps: (1) interpreting CARC/RARC + payer policy for true root cause; (2) looking up the payer's specific deadline/channel/form; (3) assembling records + writing the medical-necessity argument; (4) the follow-up/status-call loop.

### 3.6 Top denial codes — easy fix vs real appeal

| Code | Meaning | Path |
|---|---|---|
| **CO-45** | Charge exceeds contracted amount | Usually a **write-off — not worked** |
| **CO-16** (+M51) | Missing/invalid info | **Easy fix → corrected claim** |
| **CO-4** | Missing/incorrect modifier | **Easy fix → corrected claim** |
| **CO-22 / CO-27** | COB / coverage terminated | Verify eligibility, rebill / COB |
| **CO-29** | Timely filing exceeded | Appeal **only with proof of timely filing** |
| **CO-97** | Bundled into another service | Review bundling/modifier; appeal |
| **CARC 50 (+N115)** | Not medically necessary (per LCD) | **Real appeal — clinical argument + policy citation** |
| **CO-197/198** | No prior auth / referral | Appeal w/ auth proof or retro-auth |

Reason mix (ACA 2024, KFF): other/unspecified 36%, **administrative 25%**, excluded service 13%, **prior auth/referral 9%**, **medical necessity 5%**. The plurality is administrative and fixable; the smaller medical-necessity slice is the hard, high-value appeal work — and the **average medical-necessity denied amount hit ~$450 in 2025 (+70% YoY)**, so the high-effort denials are also the high-dollar ones. That's the sweet spot for automated appeal generation.

### 3.7 What Overturn actually does against this workflow (today, in code)
- **Ingestion → denial detected:** 835 parser / CSV / PDF-EOB → real CARC lookup + priority scoring (mirrors the triage step).
- **The agent loop is real:** a Temporal workflow runs **load context → retrieve payer policies → strategize → draft → verify citations → (redraft if needed) → ready**. The LLM call is a real Claude call with a deterministic stub fallback.
- **The differentiated IP is the citation verifier** — deterministic code (Python + a cross-checked TypeScript twin) that requires every cited quote to appear **verbatim** in a policy in the retrieval set (≥20 chars, normalized). That's a real anti-hallucination story, not theater.
- **Submission:** real Documo (fax) and Lob (mail) clients; portal submission via Stagehand/Playwright. **Be precise on payers:** *BCBS is wired end-to-end (runbook + 6 seeded policies + submitter); five more payers (Aetna, Cigna, Humana, Medicare, UHC) have runbooks and submitter code written but not yet activated — pending a design partner's portal credentials.* (Don't say "6 payers supported.")
- **The revenue loop is real:** incoming 835 outcomes are matched, the appeal is flipped WON/PARTIAL/LOST, and a line item is added to a monthly draft invoice — i.e., contingency billing is implemented.

---

## 4. Quick answers if pushed

- **"Isn't this crowded?"** Crowded at the enterprise end and crowding at the SMB end — but with *full-RCM-replacement* models. Standalone appeals + verified citations + contingency + tiny non-Epic specialty practices is occupied only loosely (Aegis, broader/less focused) and partially (Clearest, OON-only). Speed + the "sit on top of your biller, paid only when we recover" wedge is the differentiator.
- **"What about EHR fragmentation?"** Designed around it — we ride the 835 standard + upload, no EHR API dependency exists or is needed. The hard part is payer-policy normalization, which is our moat, not a blocker.
- **"How real is the product?"** Core pipeline is genuinely built and deterministic with tests (835 parser, strategize→draft→verify→redraft workflow, verbatim citation verifier, outcomes→invoice loop). External integrations are real clients with env-gated stubs — keys + BAAs away from live. One payer live end-to-end, five more coded.
- **"What's the biggest risk?"** Aegis is ~a year ahead on the same idea; and the full-cycle billing players can swallow appeals as a feature. We win by being the fastest, lowest-friction, no-risk overlay and getting design-partner proof (recovered dollars) before they do.

---

## Sources

**Market size & denials**
- KFF — Claims Denials and Appeals in ACA Marketplace Plans in 2023 / 2024 — https://www.kff.org/private-insurance/claims-denials-and-appeals-in-aca-marketplace-plans-in-2023 ; https://www.kff.org/patient-consumer-protections/claims-denials-and-appeals-in-aca-marketplace-plans-in-2024
- KFF — Medicare Advantage prior-auth determinations 2024 (80.7% of appeals overturned) — https://www.kff.org/medicare/medicare-advantage-insurers-made-nearly-53-million-prior-authorization-determinations-in-2024/
- Healthcare Dive — JAMA NY external-review study, overturn 38%→53% — https://www.healthcaredive.com/news/insurance-denials-overturned-appeal-new-york-study-JAMA/817490
- Experian Health — State of Claims 2025 — https://www.experian.com/blogs/healthcare/state-of-claims-2025/
- Aptarro — US Healthcare Denial Rate Statistics 2026 — https://www.aptarro.com/insights/us-healthcare-denial-rates-reimbursement-statistics
- Journal of AHIMA — Claims Denials: rework-cost provenance — https://journal.ahima.org/page/claims-denials-a-step-by-step-approach-to-resolution
- HFMA — Redesigning denials management in the OBBBA era — https://www.hfma.org/revenue-cycle/redesigning-denials-management-in-the-obbba-era/
- StatMedical / Fierce Healthcare — medical-necessity avg denial ~$450, +70% — https://www.statmedical.net/understanding-the-top-10-claim-denials-in-2025-and-how-to-prevent-them ; https://www.fiercehealthcare.com/finance/payer-audits-denial-amounts-rise-again-2025-vendor-data-show
- Precedence Research — US RCM market — https://www.precedenceresearch.com/us-revenue-cycle-management-market

**Funding environment**
- Rock Health — 2025 year-end & H1 2025 overviews — https://rockhealth.com/insights/2025-year-end-digital-health-funding-overview-a-tale-of-two-markets ; https://rockhealth.com/insights/h1-2025-market-overview-proof-in-the-pudding
- Healthcare Dive / Fierce — 2025 + Q1 2026 funding — https://www.healthcaredive.com/news/digital-health-funding-2025-boosted-ai-rock-health/809449 ; https://www.fiercehealthcare.com/digital-health/digital-health-startups-raked-4b-q1-12-megadeals-driving-investment-rock-health
- Menlo Ventures — 2025: The State of AI in Healthcare — https://menlovc.com/perspective/2025-the-state-of-ai-in-healthcare
- Edgemont Partners — RCM leads HCIT M&A and VC 2025 — https://www.linkedin.com/posts/edgemont_the-revenue-cycle-management-rcm-sector-activity-7417552934152044544-6GoO

**Competitors / rounds**
- Aegis (YC) — https://www.ycombinator.com/companies/aegis
- ClaimGlide (YC W26) — https://www.ycombinator.com/companies/claimglide
- LunaBill (YC F25) — https://www.ycombinator.com/companies/lunabill
- Tennr $101M Series C / $605M — https://www.mobihealthnews.com/news/tennr-raises-101m-automate-referrals-hits-605m-valuation
- Cohere Health $90M / $200M total — https://www.coherehealth.com/news/cohere-health-90m-series-c-ai-platform-expansion
- Commure $70M / $7B val — https://sacra.com/c/commure
- Adonis $40M Series C — https://www.prnewswire.com/news-releases/adonis-raises-40m-series-c-to-equip-healthcare-providers-with-aidriven-revenue-cycle-operations-302722199.html
- Candid Health $52.5M Series C — https://www.oakhcft.com/news/candid-health-raises-52-5-million-series-c
- Quill Bills $3.2M — https://quillbills.com/blog/quill-raises-3m.html
- Clearest Health (YC S23) — https://www.ycombinator.com/companies/clearest-health
- Taiga (YC) — https://www.ycombinator.com/companies/industry/healthcare
- Overdrive Health (YC W26) — https://www.ycombinator.com/companies/overdrive-health
- Waystar Denial + Appeal Management / AltitudeAI — https://www.waystar.com/our-platform/denial-prevention-recovery/denial-appeal-management
- Rivet Health — denials, no percentage fees — https://www.rivethealth.com/denials-resolve
- YC Requests for Startups — https://www.ycombinator.com/rfs

**EHR / standards**
- CAQH CORE 360 Rule (CARC/RARC non-uniform use) — https://www.caqh.org/hubfs/CARCsRARCs_835_Rule.pdf
- X12 CARC / RARC code lists — https://x12.org/codes/claim-adjustment-reason-codes ; https://x12.org/codes/remittance-advice-remark-codes
- CMS Pub 100-04 (proprietary codes barred; CORE 360 mandate) — https://www.cms.gov/files/document/R13481cp.pdf
- ONC Cures Act final rule (FHIR US Core/SMART/Bulk) — https://www.federalregister.gov/documents/2019/03/04/2019-02224/
- Real-world Bulk FHIR performance gap (PMC) — https://pmc.ncbi.nlm.nih.gov/articles/PMC10593080
- eClinicalWorks API contracted-access limits — https://6b.health/insight/eclinicalworks-ehr-integration-read-vs-write-apis-and-what-requires-contracted-access/
- Clearinghouse payer reach (Availity/Waystar/Office Ally) — https://intuitionlabs.ai/articles/availity-clearinghouse-alternatives
- Change Healthcare 2024 outage / 835 rerouting — https://partnershiphp.org/Providers/Documents/ChangeHealthcareWebinarFAQs_Final.pdf
- Ambulatory EHR market fragmentation (KLAS-derived) — https://www.ehrinpractice.com/largest-ehr-vendors.html

**Denial workflow**
- Billing Dynamix — denials triage / four-lane system — https://billingdynamix.com/denials-management-workflow/
- CMS — Medicare appeals (5 levels), MLN006562 — https://www.cms.gov/files/document/mln006562-medicare-parts-b-appeals-process.pdf
- MedCare MSO — timely-filing limits by payer — https://medcaremso.com/blog/timely-filing-limit-for-medicare-vs-medicaid-vs-commercial-payers/
- Rivet — corrected claim vs reconsideration vs appeal — https://www.rivethealth.com/blog/the-most-common-types-of-appeals-in-medical-billing
- Conifer / Combine Health — top CARC codes — https://coniferhealth.com/knowledge-center/top-10-claim-adjustment-reason-codes-and-strategies-to-avoid-them/ ; https://www.combinehealth.ai/blog/common-claim-denial-codes
