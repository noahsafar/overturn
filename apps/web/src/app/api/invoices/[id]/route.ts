// GET /api/invoices/:id — invoice detail including line items.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const GET = apiHandler(
  {
    paramsSchema: ParamsSchema,
    audit: ({ params }) => ({
      action: "invoice.view",
      resourceType: "invoice",
      resourceId: params.id,
    }),
  },
  async ({ user, params }) => {
    const inv = await prisma.invoice.findFirst({
      where: { id: params.id, practiceId: user.practiceId },
      include: {
        lineItems: {
          orderBy: { createdAt: "asc" },
          include: {
            appeal: {
              include: {
                denial: {
                  include: { claim: { include: { payer: true, patient: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!inv) throw notFound();
    return {
      id: inv.id,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      status: inv.status,
      totalCents: inv.totalCents,
      stripeHostedUrl: inv.stripeHostedUrl,
      issuedAt: inv.issuedAt,
      paidAt: inv.paidAt,
      lineItems: inv.lineItems.map((li) => ({
        id: li.id,
        description: li.description,
        recoveredAmount: li.recoveredAmount,
        feeCents: li.feeCents,
        appealId: li.appealId,
        payerName: li.appeal.denial.claim.payer.name,
      })),
    };
  },
);
