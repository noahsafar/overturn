// GET /api/invoices — list of invoices for the practice.
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";

export const GET = apiHandler(
  {
    audit: { action: "invoice.list", resourceType: "invoice" },
  },
  async ({ user }) => {
    const invoices = await prisma.invoice.findMany({
      where: { practiceId: user.practiceId },
      orderBy: { periodStart: "desc" },
      include: { _count: { select: { lineItems: true } } },
    });
    return invoices.map((i) => ({
      id: i.id,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      status: i.status,
      totalCents: i.totalCents,
      stripeHostedUrl: i.stripeHostedUrl,
      issuedAt: i.issuedAt,
      paidAt: i.paidAt,
      lineItemCount: i._count.lineItems,
    }));
  },
);
