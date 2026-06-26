// POST /api/denials/[id]/resubmit-corrected
//
// Resubmit the underlying claim as a corrected 837 (frequency 7) instead of
// drafting an argued appeal. Used for billing-error denials (CARC 4, 11, 16,
// 18, etc.) where the right cure is to fix the claim and resend, not to
// dispute the denial.
//
// The worker generates the 837, anchors an Appeal row scoped to the denial,
// and writes a Submission row with channel=CLEARINGHOUSE_837 so the same
// follow-up / outcome plumbing applies.

import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, badRequest } from "@/lib/api";
import { worker } from "@/lib/worker";
import { isCorrectedClaimCandidate } from "@/lib/denial-priority";

const Params = z.object({ id: z.string().min(1) });
const Body = z.object({
  correctedCpt: z.string().trim().min(1).max(10).optional(),
  correctedModifier: z.string().trim().min(1).max(4).optional(),
  reason: z.string().trim().min(5).max(500),
});

export const POST = apiHandler(
  {
    paramsSchema: Params,
    bodySchema: Body,
    requiredRole: "STAFF",
    audit: (ctx) => ({
      action: "denial.resubmit_corrected",
      resourceType: "denial",
      resourceId: ctx.params.id,
    }),
  },
  async ({ user, params, body }) => {
    const denial = await prisma.denial.findFirst({
      where: { id: params.id, claim: { practiceId: user.practiceId } },
      select: { id: true, denialCode: true },
    });
    if (!denial) throw badRequest("denial not found");

    // Guard rail: only allow this path when the denial category actually
    // makes sense for a corrected claim. Stops users from accidentally
    // overriding a medical-necessity denial with an 837 resubmit.
    if (!isCorrectedClaimCandidate(denial.denialCode)) {
      throw badRequest(
        `denial code ${denial.denialCode} is not a corrected-claim candidate — file an appeal instead`,
      );
    }

    const result = await worker.submitCorrectedClaim({
      denialId: denial.id,
      correctedCpt: body.correctedCpt ?? null,
      correctedModifier: body.correctedModifier ?? null,
      reason: body.reason,
    });

    return {
      appealId: result.appeal_id,
      submissionId: result.submission_id,
      confirmationNumber: result.confirmation_number,
      success: result.success,
    };
  },
);
