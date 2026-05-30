// GET /api/denials/:id/appeals — appeals for a denial (used for create-then-poll).
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const GET = apiHandler(
  {
    paramsSchema: ParamsSchema,
  },
  async ({ user, params }) => {
    const denial = await prisma.denial.findFirst({
      where: { id: params.id, claim: { practiceId: user.practiceId } },
    });
    if (!denial) throw notFound();

    const appeals = await prisma.appeal.findMany({
      where: { denialId: denial.id },
      select: { id: true, status: true, outcome: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return { appeals };
  },
);
