// GET /api/appeals/:id/status
//
// Returns the current status of an appeal for polling during the drafting workflow.

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

  const appeal = await prisma.appeal.findFirst({
    where: { id, denial: { claim: { practiceId: user.practiceId } } },
    select: { id: true, status: true, outcome: true },
  });

  if (!appeal) return new NextResponse("not found", { status: 404 });

  return NextResponse.json({
    appealId: appeal.id,
    status: appeal.status,
    outcome: appeal.outcome,
  });
}
