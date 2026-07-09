// GET /api/practice — current practice info.
// PATCH /api/practice — update billing + onboarding + autopilot fields (OWNER/ADMIN).
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandlerV2 } from "@/lib/api-v2";

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  billingEmail: z.string().email().optional().nullable(),
  recoveryFeeBps: z.number().int().min(0).max(10000).optional(),
  completeOnboarding: z.boolean().optional(),
  // Autopilot policy — floor of 0.5 so a typo can't auto-submit garbage.
  autoPilotEnabled: z.boolean().optional(),
  autoPilotMinConfidence: z.number().min(0.5).max(1).optional(),
  autoPilotMaxAmountCents: z.number().int().min(0).nullable().optional(),
});

export const GET = apiHandlerV2(
  {
    errorContext: "practice",
  },
  async ({ user }) => {
    const p = await prisma.practice.findUnique({
      where: { id: user.practiceId },
      select: {
        id: true,
        name: true,
        npi: true,
        specialty: true,
        billingEmail: true,
        recoveryFeeBps: true,
        onboardingCompletedAt: true,
        stripeCustomerId: true,
        autoPilotEnabled: true,
        autoPilotMinConfidence: true,
        autoPilotMaxAmountCents: true,
      },
    });
    return p;
  },
);

export const PATCH = apiHandlerV2(
  {
    bodySchema: PatchBody,
    requiredRole: "ADMIN",
    audit: { action: "practice.update", resourceType: "practice" },
    errorContext: "practice",
  },
  async ({ user, body }) => {
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.billingEmail !== undefined) data.billingEmail = body.billingEmail;
    if (body.recoveryFeeBps !== undefined) data.recoveryFeeBps = body.recoveryFeeBps;
    if (body.completeOnboarding) data.onboardingCompletedAt = new Date();
    if (body.autoPilotEnabled !== undefined) data.autoPilotEnabled = body.autoPilotEnabled;
    if (body.autoPilotMinConfidence !== undefined)
      data.autoPilotMinConfidence = body.autoPilotMinConfidence;
    if (body.autoPilotMaxAmountCents !== undefined)
      data.autoPilotMaxAmountCents = body.autoPilotMaxAmountCents;

    const updated = await prisma.practice.update({
      where: { id: user.practiceId },
      data,
    });
    return {
      id: updated.id,
      name: updated.name,
      billingEmail: updated.billingEmail,
      recoveryFeeBps: updated.recoveryFeeBps,
      onboardingCompletedAt: updated.onboardingCompletedAt,
      autoPilotEnabled: updated.autoPilotEnabled,
      autoPilotMinConfidence: updated.autoPilotMinConfidence,
      autoPilotMaxAmountCents: updated.autoPilotMaxAmountCents,
    };
  },
);
