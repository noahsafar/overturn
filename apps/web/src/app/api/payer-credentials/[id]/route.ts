// DELETE /api/payer-credentials/:id — revoke stored credentials.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const DELETE = apiHandler(
  {
    paramsSchema: ParamsSchema,
    requiredRole: "ADMIN",
    audit: ({ params }) => ({
      action: "payer_credential.revoke",
      resourceType: "payer_credential",
      resourceId: params.id,
    }),
  },
  async ({ user, params }) => {
    const row = await prisma.payerCredential.findFirst({
      where: { id: params.id, practiceId: user.practiceId },
    });
    if (!row) throw notFound();
    await prisma.payerCredential.delete({ where: { id: row.id } });
    return { ok: true };
  },
);
