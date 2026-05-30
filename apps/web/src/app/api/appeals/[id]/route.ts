// GET /api/appeals/:id — JSON detail.
import { NextResponse } from "next/server";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const a = await prisma.appeal.findFirst({
    where: { id, denial: { claim: { practiceId: user.practiceId } } },
    include: { agentRun: true, humanReview: true },
  });
  if (!a) return new NextResponse("not found", { status: 404 });

  return NextResponse.json({
    id: a.id,
    outcome: a.outcome,
    submittedAt: a.submittedAt,
    submittedVia: a.submittedVia,
    draftLetter: a.draftLetter,
    citations: a.citations,
    templateUsed: a.templateUsed,
    agentRun: a.agentRun,
    humanReview: a.humanReview,
  });
}
