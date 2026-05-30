// POST /api/era/upload — accept an 835 ERA file and ingest denials.
//
// For the full pipeline (matching to existing claims + creating outcome
// records on follow-up payments), see the worker-side ingest service.
import { prisma, encryptPhi } from "@overturn/db";
import { apiHandler, badRequest } from "@/lib/api";
import { computeFilingDeadline } from "@/lib/deadlines";
import { worker } from "@/lib/worker";

interface EraClaim {
  control_number: string;
  billed: number;
  paid: number;
  denied: number;
  denials: Array<{ code: string; reason: string; amount: number }>;
}

interface EraParseResponse {
  claims: EraClaim[];
}

const DEMO_PAYER_ID = "seed_payer_bcbs";

function generatePatientData(controlNum: string) {
  return {
    externalId: `PT-${controlNum}`,
    firstName: "Demo",
    lastName: `Patient${controlNum.slice(-3)}`,
    dob: "1985-01-15",
    memberId: `MBR${controlNum}`,
  };
}

export const POST = apiHandler(
  {
    requiredRole: "STAFF",
    audit: { action: "claims.upload_era", resourceType: "claim" },
  },
  async ({ user, req }) => {
    const formData = await req.formData();
    const file = formData.get("era") as File | null;
    if (!file) throw badRequest("No file uploaded");

    const eraContent = await file.text();

    const response = await fetch(
      `${process.env.WORKER_INTERNAL_URL ?? "http://localhost:8001"}/internal/parse-era`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ era: eraContent }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      return new Response(`ERA parsing failed: ${error}`, { status: 502 });
    }

    const data = (await response.json()) as EraParseResponse;
    let created = 0;

    // First pass: record outcomes for any claims that match existing
    // controlNumbers. This handles the follow-up-payment case where a
    // previously-denied claim is now paid.
    let outcomesRecorded = 0;
    let totalFeeCents = 0;
    try {
      const outcome = await worker.ingestOutcomes(eraContent);
      outcomesRecorded = outcome.updates.length;
      totalFeeCents = outcome.updates.reduce((s, u) => s + u.feeCents, 0);
    } catch (e) {
      // Outcome ingest failures are non-fatal — we still want to create
      // new denial rows below.
      console.error("[era/upload] outcome ingest failed:", e);
    }

    let payer = await prisma.payer.findUnique({ where: { id: DEMO_PAYER_ID } });
    if (!payer) {
      payer = await prisma.payer.create({
        data: { id: DEMO_PAYER_ID, name: "Blue Cross Blue Shield" },
      });
    }

    for (const claimData of data.claims) {
      // If this controlNumber already corresponds to a known claim in this
      // practice, skip — the outcome ingest above already handled it.
      const existing = await prisma.claim.findFirst({
        where: {
          practiceId: user.practiceId,
          controlNumber: claimData.control_number,
        },
        select: { id: true },
      });
      if (existing) continue;

      // No denials means this ERA segment was a clean payment — nothing
      // to ingest as a new denial.
      if (claimData.denials.length === 0) continue;

      const patientData = generatePatientData(claimData.control_number);

      const patient = await prisma.patient.upsert({
        where: {
          practiceId_externalId: {
            practiceId: user.practiceId,
            externalId: patientData.externalId,
          },
        },
        update: { insurancePayerId: payer.id },
        create: {
          practiceId: user.practiceId,
          externalId: patientData.externalId,
          firstNameEnc: encryptPhi(patientData.firstName),
          lastNameEnc: encryptPhi(patientData.lastName),
          dobEnc: encryptPhi(patientData.dob),
          memberIdEnc: encryptPhi(patientData.memberId),
          insurancePayerId: payer.id,
        },
      });

      const claim = await prisma.claim.create({
        data: {
          practiceId: user.practiceId,
          patientId: patient.id,
          payerId: payer.id,
          serviceDate: new Date(),
          cptCodes: [],
          icdCodes: [],
          billedAmount: claimData.billed.toString(),
          controlNumber: claimData.control_number,
          status: "DENIED",
          submittedAt: new Date(),
        },
      });

      for (const denial of claimData.denials) {
        const receivedAt = new Date();
        await prisma.denial.create({
          data: {
            claimId: claim.id,
            denialCode: denial.code,
            denialReason: denial.reason || `Denial code ${denial.code}`,
            deniedAmount: denial.amount.toString(),
            eraRawText: `CLP*${claimData.control_number}*${claimData.billed}*${claimData.paid}~CAS*${denial.code}*${denial.amount}~`,
            receivedAt,
            filingDeadline: computeFilingDeadline(receivedAt, payer.appealWindowDays),
          },
        });
        created++;
      }
    }

    return { created, outcomesRecorded, totalFeeCents };
  },
);
