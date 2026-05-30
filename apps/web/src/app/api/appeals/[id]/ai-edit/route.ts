// POST /api/appeals/:id/ai-edit
//
// AI-powered appeal letter editing. Takes the current letter and a user
// prompt, then calls the worker to generate a revised version.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";
import { worker } from "@/lib/worker";

const ParamsSchema = z.object({ id: z.string().min(1) });
const BodySchema = z.object({
  letter: z.string().min(50).max(50_000),
  prompt: z.string().min(1).max(2_000),
});

export const POST = apiHandler(
  {
    paramsSchema: ParamsSchema,
    bodySchema: BodySchema,
    audit: ({ params }) => ({
      action: "appeal.ai_edit",
      resourceType: "appeal",
      resourceId: params.id,
    }),
  },
  async ({ user, params, body }) => {
    const appeal = await prisma.appeal.findFirst({
      where: { id: params.id, denial: { claim: { practiceId: user.practiceId } } },
    });
    if (!appeal) throw notFound();
    try {
      return await worker.aiEditAppeal(appeal.id, body.letter, body.prompt);
    } catch (e) {
      return new Response(`AI edit failed: ${(e as Error).message}`, { status: 502 });
    }
  },
);
