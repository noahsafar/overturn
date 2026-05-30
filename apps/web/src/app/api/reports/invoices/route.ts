// GET /api/reports/invoices — CSV export of invoices (history + status).
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";
import { toCsv, csvResponse } from "@/lib/csv";

export const GET = apiHandler(
  {
    requiredRole: "ADMIN",
    audit: { action: "report.invoices", resourceType: "report" },
  },
  async ({ user }) => {
    const invs = await prisma.invoice.findMany({
      where: { practiceId: user.practiceId },
      orderBy: { periodStart: "desc" },
      include: { _count: { select: { lineItems: true } } },
    });
    const rows = invs.map((i) => ({
      id: i.id,
      period_start: i.periodStart,
      period_end: i.periodEnd,
      status: i.status,
      total_cents: i.totalCents,
      total_dollars: (i.totalCents / 100).toFixed(2),
      line_items: i._count.lineItems,
      issued_at: i.issuedAt,
      paid_at: i.paidAt,
      stripe_invoice_id: i.stripeInvoiceId,
      stripe_hosted_url: i.stripeHostedUrl,
    }));
    return csvResponse(toCsv(rows), "invoices.csv");
  },
);
