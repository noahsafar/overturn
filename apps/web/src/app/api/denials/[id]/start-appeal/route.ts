// POST /api/denials/:id/start-appeal
//
// Triggers AppealDraftWorkflow on the worker and returns the workflowId.
// The workflow creates the appeal record upfront so the UI can poll status.
import { z } from "zod";
import { prisma } from "@overturn/db";
import { apiHandler, notFound } from "@/lib/api";
import { worker } from "@/lib/worker";

const ParamsSchema = z.object({ id: z.string().min(1) });

export const POST = apiHandler(
  {
    paramsSchema: ParamsSchema,
    requiredRole: "STAFF",
    audit: ({ params }) => ({
      action: "appeal.start_draft",
      resourceType: "denial",
      resourceId: params.id,
    }),
  },
  async ({ user, params }) => {
    const denial = await prisma.denial.findFirst({
      where: { id: params.id, claim: { practiceId: user.practiceId } },
    });
    if (!denial) throw notFound();

    // If there's already an in-flight appeal, return it instead of starting a new one.
    const existingAppeal = await prisma.appeal.findFirst({
      where: { denialId: denial.id },
      orderBy: { createdAt: "desc" },
    });
    if (existingAppeal) {
      const isTerminal =
        ["FAILED", "SKIPPED", "WON", "LOST", "PARTIAL"].includes(existingAppeal.status) ||
        (existingAppeal.status === "READY" && existingAppeal.outcome !== "PENDING");
      if (!isTerminal) {
        return { appealId: existingAppeal.id, status: existingAppeal.status };
      }
    }

    let workflowId: string;
    try {
      const res = await worker.startDraft(denial.id);
      workflowId = res.workflowId;
    } catch (e) {
      return new Response(`worker unavailable: ${(e as Error).message}`, { status: 502 });
    }

    // Wait briefly for the appeal row to be created.
    const start = Date.now();
    while (Date.now() - start < 2000) {
      const a = await prisma.appeal.findFirst({
        where: { denialId: denial.id },
        orderBy: { createdAt: "desc" },
      });
      if (a) return { appealId: a.id, status: a.status, workflowId };
      await new Promise((r) => setTimeout(r, 100));
    }

    return { workflowId, denialId: denial.id };
  },
);
