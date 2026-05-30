// POST /api/denials/:id/start-appeal
//
// Triggers the AppealDraftWorkflow on the worker and returns the workflowId.
// The workflow creates the appeal record upfront with PENDING status so the
// UI can show progress as it moves through the drafting stages.

import { NextResponse } from "next/server";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { worker } from "@/lib/worker";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const denial = await prisma.denial.findFirst({
    where: { id, claim: { practiceId: user.practiceId } },
  });
  if (!denial) return new NextResponse("not found", { status: 404 });

  // Check if there's already an appeal in progress for this denial
  const existingAppeal = await prisma.appeal.findFirst({
    where: { denialId: denial.id },
    orderBy: { createdAt: "desc" },
  });

  // If an appeal exists and is not in a terminal state, return it
  // Terminal states: READY+SUBMITTED, FAILED, SKIPPED, WON, LOST, PARTIAL
  if (existingAppeal) {
    const isTerminal = ["FAILED", "SKIPPED", "WON", "LOST", "PARTIAL"].includes(existingAppeal.status) ||
                       (existingAppeal.status === "READY" && existingAppeal.outcome !== "PENDING");
    if (!isTerminal) {
      return NextResponse.json({ appealId: existingAppeal.id, status: existingAppeal.status });
    }
  }

  // Trigger workflow. The worker returns a workflowId.
  let workflowId: string;
  try {
    const res = await worker.startDraft(denial.id);
    workflowId = res.workflowId;
  } catch (e) {
    return new NextResponse(`worker unavailable: ${(e as Error).message}`, { status: 502 });
  }

  // Wait briefly for the appeal to be created (create_appeal runs first)
  // If it's not created within 2 seconds, return workflowId and let frontend poll
  const start = Date.now();
  while (Date.now() - start < 2000) {
    const a = await prisma.appeal.findFirst({
      where: { denialId: denial.id },
      orderBy: { createdAt: "desc" },
    });
    if (a) return NextResponse.json({ appealId: a.id, status: a.status, workflowId });
    await new Promise((r) => setTimeout(r, 100));
  }

  // Return workflowId so frontend can poll for status
  return NextResponse.json({ workflowId, denialId: denial.id });
}
