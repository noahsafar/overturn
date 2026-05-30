// POST /api/appeals/:id/edit — save reviewer-edited letter, then submit.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, conflict, notFound } from "@/lib/api";
import { worker } from "@/lib/worker";

const ParamsSchema = z.object({ id: z.string().min(1) });
const BodySchema = z.object({ letter: z.string().min(50).max(50_000) });

export const POST = apiHandler(
  {
    paramsSchema: ParamsSchema,
    bodySchema: BodySchema,
    audit: ({ params }) => ({
      action: "appeal.edit_and_approve",
      resourceType: "appeal",
      resourceId: params.id,
    }),
  },
  async ({ user, params, body }) => {
    const a = await prisma.appeal.findFirst({
      where: { id: params.id, denial: { claim: { practiceId: user.practiceId } } },
      include: { denial: { select: { filingDeadline: true } } },
    });
    if (!a) throw notFound();
    if (a.submittedAt) throw conflict("already submitted");
    if (a.denial.filingDeadline && a.denial.filingDeadline < new Date()) {
      throw conflict("filing deadline passed — appeal cannot be submitted");
    }

    const review = await prisma.humanReview.create({
      data: {
        reviewerId: user.id,
        decision: "EDITED_AND_APPROVED",
        editsMade: body.letter,
      },
    });
    await prisma.appeal.update({
      where: { id: params.id },
      data: { draftLetter: body.letter, humanReviewId: review.id },
    });

    try {
      await worker.submit(params.id);
    } catch (e) {
      return new Response(`worker unavailable: ${(e as Error).message}`, { status: 502 });
    }
    return { ok: true };
  },
);
