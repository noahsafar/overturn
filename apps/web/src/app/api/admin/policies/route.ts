// POST /api/admin/policies — bulk import payer policies (superuser only).
//
// Accepts a JSON array. Each item is one policy. Existing rows with the
// same (payerId, denialCode, policyType, body) are skipped — idempotent so
// you can re-run the same scrape without duplicating.
//
// After insert we call the worker's /internal/backfill-embeddings so the
// new rows get their pgvector embedding generated for retrieval.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, badRequest } from "@/lib/api";

const PolicySchema = z.object({
  payerId: z.string().min(1),
  policyType: z.enum(["denial_reason", "appeal_format", "pa_criteria"]),
  denialCode: z.string().nullable().optional(),
  effectiveDate: z.coerce.date(),
  body: z.string().min(20).max(50_000),
  sourceUrl: z.string().url().nullable().optional(),
});

const BodySchema = z.object({
  policies: z.array(PolicySchema).min(1).max(500),
});

export const POST = apiHandler(
  {
    bodySchema: BodySchema,
    superuserOnly: true,
    audit: { action: "admin.import_policies", resourceType: "payer_policy" },
  },
  async ({ body }) => {
    // Validate payerIds exist before inserting anything.
    const payerIds = Array.from(new Set(body.policies.map((p) => p.payerId)));
    const known = await prisma.payer.findMany({
      where: { id: { in: payerIds } },
      select: { id: true },
    });
    const knownIds = new Set(known.map((p) => p.id));
    const unknown = payerIds.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw badRequest(`unknown payerId(s): ${unknown.join(", ")}`);
    }

    let inserted = 0;
    let skipped = 0;
    const insertedIds: string[] = [];
    for (const p of body.policies) {
      // Idempotency: same (payerId, denialCode, policyType, first-100-chars-of-body)
      // is treated as a dupe.
      const existing = await prisma.payerPolicy.findFirst({
        where: {
          payerId: p.payerId,
          denialCode: p.denialCode ?? null,
          policyType: p.policyType,
          body: { startsWith: p.body.slice(0, 100) },
        },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      const row = await prisma.payerPolicy.create({
        data: {
          payerId: p.payerId,
          policyType: p.policyType,
          denialCode: p.denialCode ?? null,
          effectiveDate: p.effectiveDate,
          body: p.body,
          sourceUrl: p.sourceUrl ?? null,
        },
      });
      inserted += 1;
      insertedIds.push(row.id);
    }

    // Trigger embedding backfill on the worker side.
    let embedded = 0;
    try {
      const res = await fetch(
        `${process.env.WORKER_INTERNAL_URL ?? "http://localhost:8001"}/internal/backfill-embeddings`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        const j = (await res.json()) as { updated: number };
        embedded = j.updated ?? 0;
      }
    } catch (e) {
      console.warn("[admin/policies] embedding backfill failed:", e);
    }

    return { inserted, skipped, embedded, insertedIds };
  },
);
