// POST /api/invoices/:id/issue — finalize a DRAFT invoice and send to Stripe.
import { z } from "zod";
import { apiHandler, badRequest, notFound } from "@/lib/api";
import { prisma } from "@overturn/db";
import { InvoiceError, issueInvoice } from "@/lib/invoices";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const POST = apiHandler(
  {
    paramsSchema: ParamsSchema,
    requiredRole: "ADMIN",
    audit: ({ params }) => ({
      action: "invoice.issue",
      resourceType: "invoice",
      resourceId: params.id,
    }),
  },
  async ({ user, params }) => {
    const inv = await prisma.invoice.findFirst({
      where: { id: params.id, practiceId: user.practiceId },
    });
    if (!inv) throw notFound();
    try {
      const res = await issueInvoice(params.id);
      return { ok: true, ...res };
    } catch (e) {
      if (e instanceof InvoiceError) throw badRequest(e.message);
      throw e;
    }
  },
);
