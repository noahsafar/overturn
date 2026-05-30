// GET /api/denials/:id — detail JSON (PHI decrypted server-side).
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";
import { decryptPatient } from "@/lib/patient";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const GET = apiHandler(
  {
    paramsSchema: ParamsSchema,
    audit: ({ params }) => ({
      action: "denial.view",
      resourceType: "denial",
      resourceId: params.id,
      metadata: { phi_decrypted: true },
    }),
  },
  async ({ user, params }) => {
    const d = await prisma.denial.findFirst({
      where: { id: params.id, claim: { practiceId: user.practiceId } },
      include: {
        claim: { include: { patient: true, payer: true } },
        appeals: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!d) throw notFound();

    const pt = decryptPatient(d.claim.patient);
    return {
      id: d.id,
      denialCode: d.denialCode,
      denialReason: d.denialReason,
      deniedAmount: d.deniedAmount,
      receivedAt: d.receivedAt,
      claim: {
        id: d.claim.id,
        payer: { id: d.claim.payer.id, name: d.claim.payer.name },
        serviceDate: d.claim.serviceDate,
        cptCodes: d.claim.cptCodes,
        icdCodes: d.claim.icdCodes,
        billedAmount: d.claim.billedAmount,
      },
      patient: pt,
      appeals: d.appeals.map((a) => ({
        id: a.id,
        outcome: a.outcome,
        submittedAt: a.submittedAt,
      })),
    };
  },
);
