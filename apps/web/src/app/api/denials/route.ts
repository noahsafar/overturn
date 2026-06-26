// GET /api/denials — JSON list of denials needing work.
//
// Default-sorts by priorityScore desc so reviewers see the highest-EV /
// most-urgent items first. Returns priorityTier + predictedWinProb +
// confidenceScore-on-draft so the UI can render badges without N+1
// lookups.
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";

export const GET = apiHandler(
  {
    audit: { action: "denial.list", resourceType: "denial" },
  },
  async ({ user }) => {
    const denials = await prisma.denial.findMany({
      where: { claim: { practiceId: user.practiceId } },
      orderBy: [
        // Nulls last via two-pass: score first, fall back to receivedAt.
        { priorityScore: { sort: "desc", nulls: "last" } },
        { receivedAt: "desc" },
      ],
      include: {
        claim: { include: { payer: { select: { name: true } } } },
        appeals: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            outcome: true,
            confidenceScore: true,
          },
        },
      },
      take: 200,
    });
    return denials.map((d) => ({
      id: d.id,
      denialCode: d.denialCode,
      denialReason: d.denialReason,
      deniedAmount: d.deniedAmount,
      receivedAt: d.receivedAt,
      filingDeadline: d.filingDeadline,
      payerName: d.claim.payer.name,
      hasAppeal: d.appeals.length > 0,
      latestAppeal: d.appeals[0] ?? null,
      priorityScore: d.priorityScore,
      priorityTier: d.priorityTier,
      predictedWinProb: d.predictedWinProb,
      scoreExplain: d.scoreExplain,
    }));
  },
);
