// GET /api/denials — JSON list of denials needing work.
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";

export const GET = apiHandler(
  {
    audit: { action: "denial.list", resourceType: "denial" },
  },
  async ({ user }) => {
    const denials = await prisma.denial.findMany({
      where: { claim: { practiceId: user.practiceId } },
      orderBy: { receivedAt: "desc" },
      include: {
        claim: { include: { payer: { select: { name: true } } } },
        appeals: { take: 1 },
      },
      take: 200,
    });
    return denials.map((d) => ({
      id: d.id,
      denialCode: d.denialCode,
      deniedAmount: d.deniedAmount,
      receivedAt: d.receivedAt,
      payerName: d.claim.payer.name,
      hasAppeal: d.appeals.length > 0,
    }));
  },
);
