// GET /api/denials/:id — detail JSON (PHI decrypted server-side).
import { NextResponse } from "next/server";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { decryptPatient } from "@/lib/patient";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const d = await prisma.denial.findFirst({
    where: { id, claim: { practiceId: user.practiceId } },
    include: {
      claim: { include: { patient: true, payer: true } },
      appeals: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!d) return new NextResponse("not found", { status: 404 });

  const pt = decryptPatient(d.claim.patient);
  return NextResponse.json({
    id: d.id,
    denialCode: d.denialCode,
    denialReason: d.denialReason,
    deniedAmount: d.deniedAmount,
    receivedAt: d.receivedAt,
    claim: {
      id: d.claim.id,
      payer: { id: d.claim.payer.id, name: d.claim.payer.name },
      serviceDate: d.claim.serviceDate,
      cptCodes: d.claim.cptCodes,
      icdCodes: d.claim.icdCodes,
      billedAmount: d.claim.billedAmount,
    },
    patient: pt,
    appeals: d.appeals.map((a) => ({ id: a.id, outcome: a.outcome, submittedAt: a.submittedAt })),
  });
}
