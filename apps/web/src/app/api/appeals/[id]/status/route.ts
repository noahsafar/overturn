// GET /api/appeals/:id/status — current status for polling during drafting.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const GET = apiHandler(
  {
    paramsSchema: ParamsSchema,
    // Status polling is hot — no audit (would flood the table) and a higher
    // rate-limit ceiling so UI polling doesn't trip 429s.
    rateLimit: { limit: 600, windowMs: 60_000 },
  },
  async ({ user, params }) => {
    const appeal = await prisma.appeal.findFirst({
      where: { id: params.id, denial: { claim: { practiceId: user.practiceId } } },
      select: { id: true, status: true, outcome: true },
    });
    if (!appeal) throw notFound();
    return {
      appealId: appeal.id,
      status: appeal.status,
      outcome: appeal.outcome,
    };
  },
);
