// POST /api/appeals/:id/reject — reviewer rejects the draft (no submission).
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, conflict, notFound } from "@/lib/api";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const POST = apiHandler(
  {
    paramsSchema: ParamsSchema,
    audit: ({ params }) => ({
      action: "appeal.reject",
      resourceType: "appeal",
      resourceId: params.id,
    }),
  },
  async ({ user, params }) => {
    const a = await prisma.appeal.findFirst({
      where: { id: params.id, denial: { claim: { practiceId: user.practiceId } } },
    });
    if (!a) throw notFound();
    if (a.submittedAt) throw conflict("already submitted");

    const review = await prisma.humanReview.create({
      data: { reviewerId: user.id, decision: "REJECTED" },
    });
    await prisma.appeal.update({
      where: { id: params.id },
      data: { outcome: "REJECTED_BY_HUMAN", humanReviewId: review.id },
    });
    return { ok: true };
  },
);
