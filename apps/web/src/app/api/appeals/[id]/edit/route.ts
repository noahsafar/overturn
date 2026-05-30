// POST /api/appeals/:id/edit — save reviewer-edited letter, then submit.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { worker } from "@/lib/worker";

const Body = z.object({ letter: z.string().min(50) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new NextResponse("bad body", { status: 400 });

  const a = await prisma.appeal.findFirst({
    where: { id, denial: { claim: { practiceId: user.practiceId } } },
  });
  if (!a) return new NextResponse("not found", { status: 404 });
  if (a.submittedAt) return new NextResponse("already submitted", { status: 409 });

  const review = await prisma.humanReview.create({
    data: {
      reviewerId: user.id,
      decision: "EDITED_AND_APPROVED",
      editsMade: parsed.data.letter,
    },
  });
  await prisma.appeal.update({
    where: { id },
    data: { draftLetter: parsed.data.letter, humanReviewId: review.id },
  });

  try { await worker.submit(id); }
  catch (e) { return new NextResponse(`worker unavailable: ${(e as Error).message}`, { status: 502 }); }
  return NextResponse.json({ ok: true });
}
