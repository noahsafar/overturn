// GET /api/appeals/:id — JSON detail.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const GET = apiHandler(
  {
    paramsSchema: ParamsSchema,
    audit: ({ params }) => ({
      action: "appeal.view",
      resourceType: "appeal",
      resourceId: params.id,
    }),
  },
  async ({ user, params }) => {
    const a = await prisma.appeal.findFirst({
      where: { id: params.id, denial: { claim: { practiceId: user.practiceId } } },
      include: { agentRun: true, humanReview: true },
    });
    if (!a) throw notFound();
    return {
      id: a.id,
      outcome: a.outcome,
      submittedAt: a.submittedAt,
      submittedVia: a.submittedVia,
      draftLetter: a.draftLetter,
      citations: a.citations,
      templateUsed: a.templateUsed,
      agentRun: a.agentRun,
      humanReview: a.humanReview,
    };
  },
);
