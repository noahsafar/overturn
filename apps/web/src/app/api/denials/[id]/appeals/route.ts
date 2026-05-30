// GET /api/denials/:id/appeals
//
// Returns the appeals for a denial, ordered by creation date (newest first).
// Used for polling during appeal workflow creation.

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

  const denial = await prisma.denial.findFirst({
    where: { id, claim: { practiceId: user.practiceId } },
  });
  if (!denial) return new NextResponse("not found", { status: 404 });

  const appeals = await prisma.appeal.findMany({
    where: { denialId: denial.id },
    select: { id: true, status: true, outcome: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ appeals });
}
