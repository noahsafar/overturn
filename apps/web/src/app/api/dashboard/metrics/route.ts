// GET /api/dashboard/metrics — JSON for the dashboard cards.
import { NextResponse } from "next/server";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const [pending, byOutcome, recovered] = await Promise.all([
    prisma.denial.count({
      where: { claim: { practiceId: user.practiceId }, appeals: { none: {} } },
    }),
    prisma.appeal.groupBy({
      by: ["outcome"],
      where: { denial: { claim: { practiceId: user.practiceId } } },
      _count: { _all: true },
    }),
    prisma.appeal.aggregate({
      where: {
        denial: { claim: { practiceId: user.practiceId } },
        outcome: { in: ["WON", "PARTIAL"] },
      },
      _sum: { recoveredAmount: true, ourFee: true },
    }),
  ]);

  const counts = Object.fromEntries(byOutcome.map((o) => [o.outcome, o._count._all]));
  const totalAppeals = byOutcome.reduce((s, o) => s + o._count._all, 0);
  const wonCount = (counts.WON ?? 0) + (counts.PARTIAL ?? 0);
  const settled = totalAppeals - (counts.PENDING ?? 0);

  return NextResponse.json({
    pendingDenials: pending,
    appealsByOutcome: counts,
    totalAppeals,
    winRate: settled > 0 ? wonCount / settled : 0,
    recoveredAmount: Number(recovered._sum.recoveredAmount ?? 0),
    ourFee: Number(recovered._sum.ourFee ?? 0),
  });
}
