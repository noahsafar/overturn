// PUT /api/denials/:id/chart — set the chart excerpts text for a denial.
// Pasted by the reviewer from the EHR (Phase-1 manual path) or filled by
// an EHR connector (Phase 2).
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, conflict, notFound } from "@/lib/api";

const ParamsSchema = z.object({ id: z.string().min(1) });
const BodySchema = z.object({
  chartExcerptsText: z.string().max(50_000),
});

export const PUT = apiHandler(
  {
    paramsSchema: ParamsSchema,
    bodySchema: BodySchema,
    requiredRole: "STAFF",
    audit: ({ params }) => ({
      action: "denial.update_chart_excerpts",
      resourceType: "denial",
      resourceId: params.id,
      metadata: { phi_write: true },
    }),
  },
  async ({ user, params, body }) => {
    const d = await prisma.denial.findFirst({
      where: { id: params.id, claim: { practiceId: user.practiceId } },
      include: { appeals: { select: { id: true, submittedAt: true } } },
    });
    if (!d) throw notFound();
    // Don't allow edits once an appeal has been submitted — the chart
    // context at submission time is what the LLM saw, and rewriting it
    // would break audit reproducibility.
    if (d.appeals.some((a) => a.submittedAt)) {
      throw conflict("appeal already submitted — chart excerpts frozen");
    }
    await prisma.denial.update({
      where: { id: params.id },
      data: { chartExcerptsText: body.chartExcerptsText || null },
    });
    return { ok: true };
  },
);
