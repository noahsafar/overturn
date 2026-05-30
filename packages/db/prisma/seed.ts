// Seed script — populates a synthetic practice with realistic-looking
// denial pipeline state so the dashboard, denials inbox, invoices page,
// and ops console all feel populated.
//
// Idempotent: safe to re-run. Uses fixed IDs (cm…) where uniqueness matters
// so re-running upserts cleanly. Wipes a small subset of derived rows
// (Appeal / Submission / Invoice / FollowUpCheck / AuditEvent / Denial /
// Claim / Patient for the seed practice) before regenerating, since these
// are time-sensitive and we want them to reflect "today".
//
//   pnpm db:seed

import { PrismaClient } from "@prisma/client";
import { encryptPhi } from "../src/crypto.js";

const prisma = new PrismaClient();

const DEFAULT_APPEAL_WINDOW_DAYS = 180;

// ── Synthetic BCBS policy library ──────────────────────────────────────
const BCBS_POLICIES = [
  {
    policyType: "denial_reason",
    denialCode: "CO-50",
    body: `Blue Cross Blue Shield Medical Policy MP-2024-50 (effective 2024-01-15).

Title: Medical Necessity for Outpatient Behavioral Health Services.

Section 3.1 — Medical Necessity Criteria. Outpatient psychotherapy (CPT 90834,
90837) is considered medically necessary when (a) the member has a documented
DSM-5 diagnosis, (b) symptoms produce significant functional impairment in
occupational, social, or self-care domains, and (c) a written treatment plan
with measurable goals is maintained and updated at least every 90 days.

Section 4.2 — Documentation Standards. Progress notes must document (i) the
specific intervention used, (ii) the member's response, and (iii) the
clinical reasoning supporting continued services. Notes that meet these
standards are sufficient evidence of medical necessity and a denial under
CARC CO-50 must be reversed upon submission of conforming documentation.`,
    sourceUrl: "https://example.bcbs.com/policy/MP-2024-50",
  },
  {
    policyType: "appeal_format",
    denialCode: null,
    body: `BCBS Provider Appeal Submission Guide (rev. 2024).

Appeals must be submitted within 180 days of the original remittance date.
The appeal letter shall contain, in order: (1) the original claim control
number, (2) member name and ID, (3) date(s) of service, (4) the specific
denial code and stated reason being appealed, (5) the provider's basis for
the appeal with reference to specific medical-policy sections, and (6) a
request for reprocessing stating the amount in dispute.`,
    sourceUrl: "https://example.bcbs.com/provider/appeals-guide",
  },
  {
    policyType: "denial_reason",
    denialCode: "CO-197",
    body: `Blue Cross Blue Shield Medical Policy MP-2024-197.

CARC CO-197 (precertification absent) shall not apply where (a) the service
was rendered as an emergency, (b) the precertification was obtained but not
recorded on the claim due to clearinghouse error, or (c) the service falls
under the plan's standing-authorization rules (see Appendix C). In any of
these cases the denial shall be reversed upon submission of evidence.`,
    sourceUrl: "https://example.bcbs.com/policy/MP-2024-197",
  },
  {
    policyType: "denial_reason",
    denialCode: "CO-29",
    body: `Timely Filing Policy TF-2024-01. Initial claims must be filed within 365
days of date of service. A claim denied as untimely under CARC CO-29 shall
be reversed where the provider can demonstrate (i) timely original
submission via clearinghouse acknowledgement, (ii) prior denial creating a
tolling event, or (iii) good cause as defined in the provider manual
Section 8.4.`,
    sourceUrl: "https://example.bcbs.com/policy/TF-2024-01",
  },
  {
    policyType: "pa_criteria",
    denialCode: null,
    body: `Behavioral health outpatient services (CPT 90834, 90837, 90847) do not
require prior authorization for the first 26 sessions per benefit year.
Beyond 26 sessions, concurrent review applies per Section 6.`,
    sourceUrl: "https://example.bcbs.com/policy/BH-PA-2024",
  },
];

// ── Realistic chart excerpts per service date / patient ────────────────
const CHART_EXCERPTS = {
  ptDepression: `Encounter note 2025-09-15: Patient is a 33-year-old female with established DSM-5 diagnosis of Major Depressive Disorder, recurrent, moderate (F33.1), confirmed via DSM-5 criteria checklist. PHQ-9 score 18 (moderately severe). Patient reports persistent depressed mood, anhedonia, fatigue, and difficulty concentrating over the past 6 weeks. Symptoms are producing significant functional impairment in occupational and social domains — patient is on partial leave from work, has withdrawn from regular social activities.

Treatment plan dated 2025-09-15: Continue weekly CBT-based individual psychotherapy (CPT 90837, 60 min). Measurable goals: reduce PHQ-9 score by ≥5 points within 12 weeks, return to full-time work within 90 days. Re-evaluation scheduled 2025-12-15. Last treatment plan updated 2025-07-01, within the 90-day window required by Section 4.2.

Progress note 2025-09-15: Used cognitive restructuring intervention to address catastrophic thinking patterns. Patient engaged actively, identified two cognitive distortions, completed in-session thought record. Clinical reasoning for continued services: PHQ-9 remains in moderate range, functional impairment persists, patient demonstrates capacity for therapeutic engagement and benefits from continued intervention.`,

  ptAnxiety: `Encounter note 2025-09-22: Patient is a 47-year-old male, established DSM-5 diagnosis Generalized Anxiety Disorder (F41.1). GAD-7 score 16 (severe). Reports daily worry, muscle tension, sleep disruption (4-5h/night), avoidance of work meetings. Functional impairment in occupational domain — has declined two project assignments in the past month.

Treatment plan dated 2025-09-22: Weekly individual psychotherapy (CPT 90837), CBT with exposure components targeting work-avoidance behaviors. Measurable goals: GAD-7 reduction to ≤10 within 12 weeks; resume regular meeting attendance. Plan updated 2025-08-01 (within 90 days).

Progress note 2025-09-22: Reviewed exposure hierarchy. Patient completed two graded exposures this week (responded to a routine work email within same business day, attended one optional meeting). Documented patient's anxiety rating before/during/after each exposure. Continued services indicated by persistent symptoms and active engagement with treatment.`,

  ptSubstance: `Encounter note 2025-08-30: Patient is a 28-year-old female with DSM-5 diagnosis Alcohol Use Disorder, moderate (F10.20). Reports continued drinking ~3x/week, last use 5 days ago. Co-occurring depressive symptoms; PHQ-9 = 11.

Treatment plan dated 2025-08-30: Weekly individual psychotherapy (CPT 90834, 45 min) combining motivational interviewing + CBT for relapse prevention. Measurable goals: 30 consecutive days of abstinence within 90 days; sustained reduction in drinking days. Plan last updated 2025-08-15.

Progress note 2025-08-30: Used MI to explore ambivalence about reducing alcohol use. Patient identified two values misalignments (parenting, work performance). Established commitment ladder for next two weeks. Clinical reasoning: ongoing AUD requires continued evidence-based intervention; patient demonstrating motivation but needs scaffolding for behavior change.`,

  ptPanic: `Encounter note 2025-09-05: Patient established DSM-5 diagnosis Panic Disorder (F41.0) with agoraphobic features. Reports 3 panic attacks this week, two while driving. Avoidance behaviors expanding — has not driven on highway in 6 weeks.

Treatment plan dated 2025-09-05: Weekly individual psychotherapy CPT 90837. Interoceptive exposure + situational exposure protocol per Barlow's panic-control treatment. Measurable goal: complete graded driving hierarchy within 12 weeks. Plan updated 2025-08-01.

Progress note 2025-09-05: In-session interoceptive exposure (hyperventilation 60s, spinning 30s). Patient tolerated, rated peak anxiety 6/10, anxiety returned to baseline within 10 minutes. Patient practiced driving in a parking lot between sessions per home assignment.`,

  ptCouples: `Encounter note 2025-09-12: Couples therapy session, both partners present. Established treatment for relational distress with co-occurring adjustment disorder (F43.20) for the identified patient.

Treatment plan dated 2025-09-12: Weekly couples psychotherapy (CPT 90847, 50 min). Emotion-focused therapy framework. Measurable goals: reduction in DAS-7 (Dyadic Adjustment Scale) distress score by 4 points within 90 days. Plan updated 2025-09-01.

Progress note 2025-09-12: Identified two reciprocal demand-withdraw cycles. Used softening intervention with one partner; the other partner reported new understanding of their own withdrawal pattern. Clinical reasoning: continued services indicated by persistent distress in relationship and demonstrable session-to-session progress.`,
};

// ── Realistic appeal letter (used for the "already submitted/won" rows) ─
function realisticAppealLetter(args: {
  practiceName: string;
  payerName: string;
  patientFirst: string;
  patientLast: string;
  memberId: string;
  serviceDate: string;
  deniedAmount: number;
  denialCode: string;
  denialReason: string;
  policyQuote: string;
  policyId: string;
}) {
  return `${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

Provider Appeals Department
${args.payerName}

Re: Appeal of denied claim
    Member: ${args.patientFirst} ${args.patientLast} (ID ${args.memberId})
    Date of service: ${args.serviceDate}
    Denied amount: $${args.deniedAmount.toFixed(2)}
    Denial code / reason: ${args.denialCode} — ${args.denialReason}

To whom it may concern,

On behalf of ${args.practiceName}, we respectfully appeal the denial of the
above-referenced claim. We believe the denial is in error on the grounds of
medical necessity.

Supporting evidence from the patient's chart:
- DSM-5 diagnosis is documented in the chart for the service date
- Treatment plan with measurable goals is on file, updated within the 90-day window
- Progress notes document the specific intervention, member response, and clinical reasoning

Per ${args.payerName}'s own published medical policy:

  "${args.policyQuote}"

The documentation maintained by ${args.practiceName} satisfies these criteria
for the date of service in question.

We request that this claim be reprocessed and paid in the amount of
$${args.deniedAmount.toFixed(2)}. Thank you for your prompt attention.

Respectfully,
${args.practiceName} Billing Office`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  console.log("→ seeding synthetic data");

  // ── Practice ──
  const practice = await prisma.practice.upsert({
    where: { npi: "1234567890" },
    update: {
      // Mark onboarding complete so the demo doesn't bounce to /onboarding.
      onboardingCompletedAt: new Date(),
      billingEmail: "billing@lakeside.demo",
    },
    create: {
      name: "Lakeside Behavioral Health",
      npi: "1234567890",
      taxId: "12-3456789",
      specialty: "Behavioral Health",
      billingEmail: "billing@lakeside.demo",
      onboardingCompletedAt: new Date(),
      recoveryFeeBps: 2500,
    },
  });

  // ── Dev user ──
  const devUser = await prisma.user.upsert({
    where: { clerkId: "dev_user" },
    update: { practiceId: practice.id, name: "Dev User", email: "dev@overturn.local" },
    create: {
      clerkId: "dev_user",
      email: "dev@overturn.local",
      name: "Dev User",
      practiceId: practice.id,
      role: "OWNER",
    },
  });

  // ── Payer ──
  const payer = await prisma.payer.upsert({
    where: { id: "seed_payer_bcbs" },
    update: {
      portalUrl: "http://localhost:4555/fake-portal",
      ivrPhone: "+1-800-555-0100",
      faxNumber: "+1-800-555-0199",
      appealAddress: "PO Box 9999, Anywhere ST 00000",
      appealWindowDays: DEFAULT_APPEAL_WINDOW_DAYS,
    },
    create: {
      id: "seed_payer_bcbs",
      name: "Blue Cross Blue Shield (synthetic)",
      payerIdNumbers: ["BCBS001", "84980"],
      portalUrl: "http://localhost:4555/fake-portal",
      ivrPhone: "+1-800-555-0100",
      faxNumber: "+1-800-555-0199",
      appealAddress: "PO Box 9999, Anywhere ST 00000",
      epaSupported: false,
      appealWindowDays: DEFAULT_APPEAL_WINDOW_DAYS,
    },
  });

  // ── Policies (rebuild) ──
  await prisma.payerPolicy.deleteMany({ where: { payerId: payer.id } });
  const policyRows = [];
  for (const p of BCBS_POLICIES) {
    const row = await prisma.payerPolicy.create({
      data: {
        payerId: payer.id,
        policyType: p.policyType,
        denialCode: p.denialCode,
        effectiveDate: new Date("2024-01-15"),
        body: p.body,
        sourceUrl: p.sourceUrl,
      },
    });
    policyRows.push(row);
  }
  const mp_50 = policyRows.find((p) => p.denialCode === "CO-50")!;

  // ── Wipe derived state so re-seeding gives a clean current picture ──
  console.log("  · clearing derived rows for re-seed");
  await prisma.auditEvent.deleteMany({ where: { practiceId: practice.id } });
  await prisma.notification.deleteMany({ where: { practiceId: practice.id } });
  await prisma.invoiceLineItem.deleteMany({
    where: { invoice: { practiceId: practice.id } },
  });
  await prisma.invoice.deleteMany({ where: { practiceId: practice.id } });
  await prisma.followUpCheck.deleteMany({ where: { practiceId: practice.id } });
  await prisma.humanReview.deleteMany({});
  await prisma.submission.deleteMany({
    where: { appeal: { denial: { claim: { practiceId: practice.id } } } },
  });
  await prisma.appeal.deleteMany({
    where: { denial: { claim: { practiceId: practice.id } } },
  });
  await prisma.denial.deleteMany({
    where: { claim: { practiceId: practice.id } },
  });
  await prisma.claim.deleteMany({ where: { practiceId: practice.id } });
  await prisma.patient.deleteMany({ where: { practiceId: practice.id } });
  await prisma.agentRun.deleteMany({});

  // ── Patients ──
  const patientSpec = [
    { ext: "PT-0001", first: "Jordan", last: "Rivera", dob: "1988-04-12", member: "XJM999888777" },
    { ext: "PT-0042", first: "Alex", last: "Kim", dob: "1992-03-04", member: "YJK111222333" },
    { ext: "PT-0107", first: "Sam", last: "Patel", dob: "1979-11-22", member: "XKP445566778" },
    { ext: "PT-0212", first: "Morgan", last: "Chen", dob: "1996-07-14", member: "BCM334455667" },
    { ext: "PT-0301", first: "Taylor", last: "Singh", dob: "1985-02-09", member: "YTS998877665" },
    { ext: "PT-0455", first: "Casey", last: "Nguyen", dob: "1991-09-30", member: "XCN112233442" },
  ];
  const patients: Record<string, { id: string }> = {};
  for (const p of patientSpec) {
    const patient = await prisma.patient.create({
      data: {
        practiceId: practice.id,
        externalId: p.ext,
        firstNameEnc: encryptPhi(p.first),
        lastNameEnc: encryptPhi(p.last),
        dobEnc: encryptPhi(p.dob),
        memberIdEnc: encryptPhi(p.member),
        insurancePayerId: payer.id,
      },
    });
    patients[p.ext] = patient;
  }

  // ── Claims + Denials (12 mixed-state rows) ──
  type ClaimSpec = {
    patient: string;
    cpts: string[];
    icds: string[];
    serviceDaysAgo: number;
    receivedDaysAgo: number;
    billed: number;
    denied: number;
    denialCode: string;
    denialReason: string;
    chart?: keyof typeof CHART_EXCERPTS;
    appealState: "unworked" | "drafting" | "ready" | "submitted" | "won" | "lost" | "skipped";
    controlNumber: string;
  };

  const claims: ClaimSpec[] = [
    {
      patient: "PT-0001",
      cpts: ["90837"],
      icds: ["F33.1"],
      serviceDaysAgo: 75,
      receivedDaysAgo: 60,
      billed: 180,
      denied: 180,
      denialCode: "CO-50",
      denialReason: "Not deemed a 'medical necessity' by the payer.",
      chart: "ptDepression",
      appealState: "won",
      controlNumber: "BCBS-CLM-9001",
    },
    {
      patient: "PT-0042",
      cpts: ["90837"],
      icds: ["F41.1"],
      serviceDaysAgo: 70,
      receivedDaysAgo: 55,
      billed: 195,
      denied: 195,
      denialCode: "CO-50",
      denialReason: "Documentation does not support medical necessity.",
      chart: "ptAnxiety",
      appealState: "won",
      controlNumber: "BCBS-CLM-9002",
    },
    {
      patient: "PT-0107",
      cpts: ["90834"],
      icds: ["F10.20"],
      serviceDaysAgo: 50,
      receivedDaysAgo: 38,
      billed: 145,
      denied: 145,
      denialCode: "CO-197",
      denialReason: "Precertification not obtained.",
      chart: "ptSubstance",
      appealState: "submitted",
      controlNumber: "BCBS-CLM-9003",
    },
    {
      patient: "PT-0212",
      cpts: ["90837"],
      icds: ["F41.0"],
      serviceDaysAgo: 40,
      receivedDaysAgo: 28,
      billed: 220,
      denied: 220,
      denialCode: "CO-50",
      denialReason: "Service not deemed medically necessary.",
      chart: "ptPanic",
      appealState: "ready",
      controlNumber: "BCBS-CLM-9004",
    },
    {
      patient: "PT-0301",
      cpts: ["90847"],
      icds: ["F43.20"],
      serviceDaysAgo: 35,
      receivedDaysAgo: 22,
      billed: 240,
      denied: 240,
      denialCode: "CO-50",
      denialReason: "Insufficient documentation.",
      chart: "ptCouples",
      appealState: "ready",
      controlNumber: "BCBS-CLM-9005",
    },
    {
      patient: "PT-0455",
      cpts: ["90837"],
      icds: ["F33.1"],
      serviceDaysAgo: 30,
      receivedDaysAgo: 18,
      billed: 200,
      denied: 200,
      denialCode: "CO-50",
      denialReason: "Not medically necessary.",
      chart: "ptDepression",
      appealState: "unworked",
      controlNumber: "BCBS-CLM-9006",
    },
    {
      patient: "PT-0042",
      cpts: ["90837"],
      icds: ["F41.1"],
      serviceDaysAgo: 25,
      receivedDaysAgo: 14,
      billed: 195,
      denied: 195,
      denialCode: "CO-50",
      denialReason: "Documentation does not support medical necessity.",
      chart: "ptAnxiety",
      appealState: "unworked",
      controlNumber: "BCBS-CLM-9007",
    },
    {
      patient: "PT-0107",
      cpts: ["90834"],
      icds: ["F10.20"],
      serviceDaysAgo: 22,
      receivedDaysAgo: 10,
      billed: 145,
      denied: 145,
      denialCode: "CO-197",
      denialReason: "Authorization not on file.",
      chart: "ptSubstance",
      appealState: "unworked",
      controlNumber: "BCBS-CLM-9008",
    },
    {
      patient: "PT-0212",
      cpts: ["90837"],
      icds: ["F41.0"],
      serviceDaysAgo: 18,
      receivedDaysAgo: 8,
      billed: 220,
      denied: 220,
      denialCode: "CO-29",
      denialReason: "Time limit for filing has expired.",
      appealState: "unworked",
      controlNumber: "BCBS-CLM-9009",
    },
    {
      patient: "PT-0301",
      cpts: ["90847"],
      icds: ["F43.20"],
      serviceDaysAgo: 90,
      receivedDaysAgo: 75,
      billed: 240,
      denied: 240,
      denialCode: "CO-50",
      denialReason: "Medical necessity not established.",
      // No chart on purpose — demonstrates the LLM correctly skipping.
      appealState: "skipped",
      controlNumber: "BCBS-CLM-9010",
    },
    {
      patient: "PT-0455",
      cpts: ["90837"],
      icds: ["F33.1"],
      serviceDaysAgo: 100,
      receivedDaysAgo: 85,
      billed: 200,
      denied: 200,
      denialCode: "CO-50",
      denialReason: "Insufficient evidence of medical necessity.",
      chart: "ptDepression",
      appealState: "lost",
      controlNumber: "BCBS-CLM-9011",
    },
    {
      patient: "PT-0001",
      cpts: ["90837"],
      icds: ["F33.1"],
      serviceDaysAgo: 12,
      receivedDaysAgo: 4,
      billed: 180,
      denied: 180,
      denialCode: "CO-50",
      denialReason: "Not deemed medically necessary.",
      chart: "ptDepression",
      appealState: "unworked",
      controlNumber: "BCBS-CLM-9012",
    },
  ];

  // ── Create rows + state for each claim ──
  // We'll keep a running list of WON appeals to roll into a DRAFT invoice.
  type WonForInvoice = { appealId: string; recoveredCents: number; description: string };
  const wonForInvoice: WonForInvoice[] = [];

  for (const c of claims) {
    const claim = await prisma.claim.create({
      data: {
        practiceId: practice.id,
        patientId: patients[c.patient]!.id,
        payerId: payer.id,
        serviceDate: daysAgo(c.serviceDaysAgo),
        cptCodes: c.cpts,
        icdCodes: c.icds,
        billedAmount: c.billed.toFixed(2),
        controlNumber: c.controlNumber,
        status: c.appealState === "won" ? "PAID" : "DENIED",
        submittedAt: daysAgo(c.serviceDaysAgo - 2),
      },
    });

    const receivedAt = daysAgo(c.receivedDaysAgo);
    const filingDeadline = new Date(receivedAt);
    filingDeadline.setDate(filingDeadline.getDate() + DEFAULT_APPEAL_WINDOW_DAYS);

    const denial = await prisma.denial.create({
      data: {
        claimId: claim.id,
        denialCode: c.denialCode,
        denialReason: c.denialReason,
        deniedAmount: c.denied.toFixed(2),
        eraRawText: `CLP*${c.controlNumber}*4*${c.billed.toFixed(2)}*0.00*${c.denied.toFixed(
          2,
        )}*MC*XYZ*11*1*CO~CAS*CO*${c.denialCode.replace("CO-", "")}*${c.denied.toFixed(2)}~`,
        receivedAt,
        filingDeadline,
        chartExcerptsText: c.chart ? CHART_EXCERPTS[c.chart] : null,
      },
    });

    if (c.appealState === "unworked") continue;

    // Create an AgentRun + Appeal for every other state.
    const runId = `cmrun${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;
    const isSkipped = c.appealState === "skipped";
    const startedAt = daysAgo(Math.max(c.receivedDaysAgo - 1, 0));
    const completedAt = new Date(startedAt.getTime() + 18_000); // ~18s

    await prisma.agentRun.create({
      data: {
        id: runId,
        workflowType: "appeal_draft",
        resourceId: denial.id,
        agentType: "llm",
        startedAt,
        completedAt,
        status: isSkipped ? "SUCCESS" : "REQUIRES_HUMAN",
        confidenceScore: isSkipped ? 0.18 : 0.78,
        costCents: isSkipped ? 4 : 12,
        errorMessage: null,
        auditTrail: {
          citation_valid_count: isSkipped ? 0 : 1,
          draft_template: "BCBS-appeal-letter-v1",
          strategy: isSkipped
            ? { reason: "Insufficient documentation in chart" }
            : { argumentCategory: "MEDICAL_NECESSITY" },
        },
      },
    });

    const ptSpec = patientSpec.find((p) => p.ext === c.patient)!;
    const policyQuote =
      "Outpatient psychotherapy (CPT 90834, 90837) is considered medically necessary when (a) the member has a documented DSM-5 diagnosis";
    const letter = isSkipped
      ? `(skipped — chart excerpts are insufficient to mount a medical-necessity defense against CARC ${c.denialCode}.)`
      : realisticAppealLetter({
          practiceName: practice.name,
          payerName: payer.name,
          patientFirst: ptSpec.first,
          patientLast: ptSpec.last,
          memberId: ptSpec.member,
          serviceDate: daysAgo(c.serviceDaysAgo).toISOString().slice(0, 10),
          deniedAmount: c.denied,
          denialCode: c.denialCode,
          denialReason: c.denialReason,
          policyQuote,
          policyId: mp_50.id,
        });

    let submittedAt: Date | null = null;
    let submittedVia: string | null = null;
    let outcome: string = "PENDING";
    let outcomeRecordedAt: Date | null = null;
    let recoveredAmount: number | null = null;
    let ourFee: number | null = null;
    let humanReviewId: string | null = null;
    let appealStatus = "READY";

    if (c.appealState === "skipped") {
      outcome = "SKIPPED";
      appealStatus = "SKIPPED";
    } else if (c.appealState === "ready") {
      outcome = "PENDING";
      appealStatus = "READY";
    } else {
      // submitted / won / lost → all share "reviewed + submitted" wiring
      const review = await prisma.humanReview.create({
        data: {
          reviewerId: devUser.id,
          decision: "APPROVED",
          notes: "Approved during seed.",
        },
      });
      humanReviewId = review.id;
      submittedAt = daysAgo(Math.max(c.receivedDaysAgo - 2, 1));
      submittedVia = c.denialCode === "CO-50" ? "FAX" : "PORTAL";
      appealStatus = "READY";

      if (c.appealState === "submitted") {
        outcome = "SUBMITTED";
      } else if (c.appealState === "won") {
        outcome = "WON";
        outcomeRecordedAt = daysAgo(Math.max(c.receivedDaysAgo - 25, 0));
        recoveredAmount = c.denied;
        ourFee = (c.denied * 2500) / 10000;
      } else if (c.appealState === "lost") {
        outcome = "LOST";
        outcomeRecordedAt = daysAgo(Math.max(c.receivedDaysAgo - 35, 0));
        recoveredAmount = 0;
        ourFee = 0;
      }
    }

    const appeal = await prisma.appeal.create({
      data: {
        denialId: denial.id,
        draftLetter: letter,
        templateUsed: isSkipped ? "skipped" : "BCBS-appeal-letter-v1",
        citations: isSkipped
          ? []
          : [{ policyId: mp_50.id, quote: policyQuote, sourceUrl: mp_50.sourceUrl, page: "" }],
        status: appealStatus,
        submittedVia,
        submittedAt,
        outcome,
        recoveredAmount: recoveredAmount?.toFixed(2),
        ourFee: ourFee?.toFixed(2),
        outcomeRecordedAt,
        agentRunId: runId,
        humanReviewId,
      },
    });

    if (submittedAt) {
      await prisma.submission.create({
        data: {
          appealId: appeal.id,
          channel: submittedVia ?? "FAX",
          attemptNumber: 1,
          status: "SUCCESS",
          confirmationNumber: `${submittedVia === "PORTAL" ? "PORTAL" : "FAX"}-${appeal.id.slice(-8).toUpperCase()}`,
          providerRef: `seed_${Math.random().toString(36).slice(2, 10)}`,
          screenshots: ["./artifacts/seed-screenshot.png"],
          idempotencyKey: `seed-${appeal.id}`,
          startedAt: submittedAt,
          completedAt: submittedAt,
        },
      });

      if (c.appealState === "won") {
        wonForInvoice.push({
          appealId: appeal.id,
          recoveredCents: Math.round(c.denied * 100),
          description: `Recovered appeal — claim ${c.controlNumber} (won, $${c.denied.toFixed(2)})`,
        });
      }
    }
  }

  // ── Roll WON appeals into a DRAFT invoice for the current month ──
  if (wonForInvoice.length > 0) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd =
      now.getMonth() === 11
        ? new Date(now.getFullYear() + 1, 0, 1)
        : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const feeTotalCents = wonForInvoice.reduce(
      (s, w) => s + Math.round((w.recoveredCents * 2500) / 10000),
      0,
    );
    const invoice = await prisma.invoice.create({
      data: {
        practiceId: practice.id,
        periodStart,
        periodEnd,
        status: "DRAFT",
        totalCents: feeTotalCents,
      },
    });
    for (const w of wonForInvoice) {
      await prisma.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          appealId: w.appealId,
          description: w.description,
          recoveredAmount: (w.recoveredCents / 100).toFixed(2),
          feeCents: Math.round((w.recoveredCents * 2500) / 10000),
        },
      });
    }
  }

  console.log(
    `✓ practice=${practice.id} payer=${payer.id}` +
      ` patients=${patientSpec.length} claims=${claims.length}` +
      ` wonInvoices=${wonForInvoice.length}`,
  );
  console.log("→ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
