// POST /api/era/upload
//
// Accepts an ERA/835 file and creates denials by calling the worker parser.

import { NextResponse, type NextRequest } from "next/server";
import { prisma, encryptPhi } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { worker } from "@/lib/worker";

interface EraClaim {
  control_number: string;
  billed: number;
  paid: number;
  denied: number;
  denials: Array<{
    code: string;
    reason: string;
    amount: number;
  }>;
}

interface EraParseResponse {
  claims: EraClaim[];
}

// Default payer for demo - in production this would come from ERA segments
const DEMO_PAYER_ID = "seed_payer_bcbs";

// Generate demo patient data for testing
function generatePatientData(controlNum: string) {
  return {
    externalId: `PT-${controlNum}`,
    firstName: "Demo",
    lastName: `Patient${controlNum.slice(-3)}`,
    dob: "1985-01-15",
    memberId: `MBR${controlNum}`,
  };
}

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const formData = await req.formData();
  const file = formData.get("era") as File | null;

  if (!file) {
    return new NextResponse("No file uploaded", { status: 400 });
  }

  const eraContent = await file.text();

  try {
    // Call worker to parse ERA
    const response = await fetch(`${process.env.WORKER_INTERNAL_URL ?? "http://localhost:8001"}/internal/parse-era`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ era: eraContent }),
    });

    if (!response.ok) {
      const error = await response.text();
      return new NextResponse(`ERA parsing failed: ${error}`, { status: 500 });
    }

    const data = await response.json() as EraParseResponse;
    let created = 0;

    for (const claimData of data.claims) {
      // Get or create payer (demo uses seed payer)
      let payer = await prisma.payer.findUnique({
        where: { id: DEMO_PAYER_ID },
      });

      if (!payer) {
        // Create demo payer if it doesn't exist
        payer = await prisma.payer.create({
          data: {
            id: DEMO_PAYER_ID,
            name: "Blue Cross Blue Shield",
          },
        });
      }

      // Generate demo patient data
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

      // Create claim and denials
      const claim = await prisma.claim.create({
        data: {
          practiceId: user.practiceId,
          patientId: patient.id,
          payerId: payer.id,
          serviceDate: new Date(), // Demo uses today
          cptCodes: [],
          icdCodes: [],
          billedAmount: claimData.billed.toString(),
          status: "DENIED",
          submittedAt: new Date(),
        },
      });

      for (const denial of claimData.denials) {
        await prisma.denial.create({
          data: {
            claimId: claim.id,
            denialCode: denial.code,
            denialReason: denial.reason || `Denial code ${denial.code}`,
            deniedAmount: denial.amount.toString(),
            eraRawText: `CLP*${claimData.control_number}*${claimData.billed}*${claimData.paid}~CAS*${denial.code}*${denial.amount}~`,
            receivedAt: new Date(),
          },
        });
        created++;
      }
    }

    return NextResponse.json({ created });
  } catch (error) {
    console.error("ERA upload error:", error);
    return new NextResponse(`Upload failed: ${error}`, { status: 500 });
  }
}
