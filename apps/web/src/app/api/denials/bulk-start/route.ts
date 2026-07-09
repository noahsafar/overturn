// POST /api/denials/bulk-start — kick off appeal drafts for every workable
// denial in one shot instead of clicking through them one by one.
//
// A denial is workable when it has no appeal yet and its filing deadline
// hasn't passed. We cap the batch (the worker drafts each one; a hospital
// uploading thousands shouldn't fan out unbounded from a single click) and
// report exactly what was started, skipped, and failed.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";
import { worker } from "@/lib/worker";

const BATCH_CAP = 25;

const Body = z.object({
  // Optional narrowing to specific denials (e.g. current filter selection).
  denialIds: z.array(z.string()).max(500).optional(),
});

export const POST = apiHandler(
  {
    requiredRole: "STAFF",
    bodySchema: Body,
    audit: { action: "appeal.bulk_start", resourceType: "denial" },
    rateLimit: { limit: 6, windowMs: 60_000 },
  },
  async ({ user, body }) => {
    const denials = await prisma.denial.findMany({
      where: {
        claim: { practiceId: user.practiceId },
        appeals: { none: {} },
        ...(body?.denialIds?.length ? { id: { in: body.denialIds } } : {}),
      },
      orderBy: [{ priorityScore: "desc" }, { receivedAt: "desc" }],
      select: { id: true, filingDeadline: true },
    });

    const now = new Date();
    const workable = denials.filter(
      (d) => !d.filingDeadline || d.filingDeadline > now,
    );
    const expired = denials.length - workable.length;
    const batch = workable.slice(0, BATCH_CAP);
    const deferred = workable.length - batch.length;

    let started = 0;
    const errors: string[] = [];
    for (const d of batch) {
      try {
        await worker.startDraft(d.id);
        started++;
      } catch (e) {
        errors.push(`${d.id}: ${(e as Error).message}`);
        // The worker being down fails every subsequent call the same way —
        // bail early instead of hammering it.
        if (errors.length >= 3 && started === 0) break;
      }
    }

    return {
      started,
      expired,
      deferred,
      failed: errors.length,
      errors: errors.slice(0, 5),
    };
  },
);
