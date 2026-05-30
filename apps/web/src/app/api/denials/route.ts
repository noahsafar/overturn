// GET /api/denials — JSON list of denials needing work.
import { NextResponse } from "next/server";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const denials = await prisma.denial.findMany({
    where: { claim: { practiceId: user.practiceId } },
    orderBy: { receivedAt: "desc" },
    include: { claim: { include: { payer: { select: { name: true } } } }, appeals: { take: 1 } },
    take: 200,
  });

  return NextResponse.json(
    denials.map((d) => ({
      id: d.id,
      denialCode: d.denialCode,
      deniedAmount: d.deniedAmount,
      receivedAt: d.receivedAt,
      payerName: d.claim.payer.name,
      hasAppeal: d.appeals.length > 0,
    })),
  );
}
