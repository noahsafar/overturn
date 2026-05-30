// POST /api/appeals/:id/approve — record human approval and trigger submission.
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

  const a = await prisma.appeal.findFirst({
    where: { id, denial: { claim: { practiceId: user.practiceId } } },
  });
  if (!a) return new NextResponse("not found", { status: 404 });
  if (a.submittedAt) return new NextResponse("already submitted", { status: 409 });

  const review = await prisma.humanReview.create({
    data: { reviewerId: user.id, decision: "APPROVED" },
  });
  await prisma.appeal.update({
    where: { id },
    data: {
      humanReviewId: review.id,
      submittedAt: new Date(),
      outcome: "SUBMITTED",
    },
  });

  try {
    await worker.submit(id);
  } catch (e) {
    return new NextResponse(`worker unavailable: ${(e as Error).message}`, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
