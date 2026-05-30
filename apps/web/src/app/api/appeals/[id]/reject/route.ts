// POST /api/appeals/:id/reject — reviewer rejects the draft (no submission).
import { NextResponse } from "next/server";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const a = await prisma.appeal.findFirst({
    where: { id, denial: { claim: { practiceId: user.practiceId } } },
  });
  if (!a) return new NextResponse("not found", { status: 404 });
  if (a.submittedAt) return new NextResponse("already submitted", { status: 409 });

  const review = await prisma.humanReview.create({
    data: { reviewerId: user.id, decision: "REJECTED" },
  });
  await prisma.appeal.update({
    where: { id },
    data: { outcome: "REJECTED_BY_HUMAN", humanReviewId: review.id },
  });

  return NextResponse.json({ ok: true });
}
