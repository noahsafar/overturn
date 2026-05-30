// POST /api/appeals/:id/approve — record human approval and trigger submission.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, conflict, notFound } from "@/lib/api";
import { worker } from "@/lib/worker";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const POST = apiHandler(
  {
    paramsSchema: ParamsSchema,
    audit: ({ params }) => ({
      action: "appeal.approve",
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
      data: { reviewerId: user.id, decision: "APPROVED" },
    });
    await prisma.appeal.update({
      where: { id: params.id },
      data: {
        humanReviewId: review.id,
        submittedAt: new Date(),
        outcome: "SUBMITTED",
      },
    });

    try {
      await worker.submit(params.id);
    } catch (e) {
      return new Response(`worker unavailable: ${(e as Error).message}`, { status: 502 });
    }
    return { ok: true };
  },
);
