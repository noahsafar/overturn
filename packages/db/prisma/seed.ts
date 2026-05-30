// Seed script — populates a fully synthetic practice, payer, policies, and a
// denied claim so the appeal pipeline can be exercised end-to-end with zero
// real PHI. Idempotent: safe to run repeatedly.
//
//   pnpm db:seed

import { PrismaClient } from "@prisma/client";
import { encryptPhi } from "../src/crypto.js";

const prisma = new PrismaClient();

// ── Synthetic BCBS policy library (5 policies covering the denial codes we
// reference in the e2e flow). In production these are scraped from the
// payer's published medical policy library.
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

async function main() {
  console.log("→ seeding synthetic data");

  // ── Practice
  const practice = await prisma.practice.upsert({
    where: { npi: "1234567890" },
    update: {},
    create: {
      name: "Lakeside Behavioral Health",
      npi: "1234567890",
      taxId: "12-3456789",
      specialty: "Behavioral Health",
    },
  });

  // ── Dev user (Clerk stub in dev mode points here)
  await prisma.user.upsert({
    where: { clerkId: "dev_user" },
    update: {},
    create: {
      clerkId: "dev_user",
      email: "dev@overturn.local",
      practiceId: practice.id,
      role: "OWNER",
    },
  });

  // ── Payer
  const payer = await prisma.payer.upsert({
    where: { id: "seed_payer_bcbs" },
    update: {},
    create: {
      id: "seed_payer_bcbs",
      name: "Blue Cross Blue Shield (synthetic)",
      payerIdNumbers: ["BCBS001", "84980"],
      portalUrl: "http://localhost:4555/fake-portal",
      ivrPhone: "+1-800-555-0100",
      faxNumber: "+1-800-555-0199",
      appealAddress: "PO Box 9999, Anywhere ST 00000",
      epaSupported: false,
    },
  });

  // ── Policies (delete + recreate to keep them in sync with the seed file)
  await prisma.payerPolicy.deleteMany({ where: { payerId: payer.id } });
  for (const p of BCBS_POLICIES) {
    await prisma.payerPolicy.create({
      data: {
        payerId: payer.id,
        policyType: p.policyType,
        denialCode: p.denialCode,
        effectiveDate: new Date("2024-01-15"),
        body: p.body,
        sourceUrl: p.sourceUrl,
      },
    });
  }

  // ── Synthetic patient (PHI encrypted at the app layer)
  const patient = await prisma.patient.upsert({
    where: {
      practiceId_externalId: {
        practiceId: practice.id,
        externalId: "PT-0001",
      },
    },
    update: {},
    create: {
      practiceId: practice.id,
      externalId: "PT-0001",
      firstNameEnc: encryptPhi("Jordan"),
      lastNameEnc: encryptPhi("Rivera"),
      dobEnc: encryptPhi("1988-04-12"),
      memberIdEnc: encryptPhi("XJM999888777"),
      insurancePayerId: payer.id,
    },
  });

  // ── Denied claim
  let claim = await prisma.claim.findFirst({
    where: { practiceId: practice.id, patientId: patient.id, status: "DENIED" },
  });
  if (!claim) {
    claim = await prisma.claim.create({
      data: {
        practiceId: practice.id,
        patientId: patient.id,
        payerId: payer.id,
        serviceDate: new Date("2025-09-15"),
        cptCodes: ["90837"],
        icdCodes: ["F33.1"],
        billedAmount: "180.00",
        status: "DENIED",
        submittedAt: new Date("2025-09-18"),
      },
    });

    await prisma.denial.create({
      data: {
        claimId: claim.id,
        denialCode: "CO-50",
        denialReason:
          "These are non-covered services because this is not deemed a 'medical necessity' by the payer.",
        deniedAmount: "180.00",
        eraRawText:
          "835~ST*835*0001~BPR*I*0*C*ACH*CTX*01*123456789*DA*987654321*123456789*~CLP*CLM001*4*180.00*0.00*0.00*MC*XYZ*11*1*CO~CAS*CO*50*180.00~",
        receivedAt: new Date("2025-09-30"),
      },
    });
  }

  console.log(`✓ practice=${practice.id} payer=${payer.id} claim=${claim.id}`);
  console.log("→ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
