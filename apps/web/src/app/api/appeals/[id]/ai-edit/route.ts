// POST /api/appeals/:id/ai-edit
//
// AI-powered appeal letter editing. Takes the current letter and a user prompt,
// then calls the worker to generate a revised version.

import { NextResponse } from "next/server";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { worker } from "@/lib/worker";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let user;
  try { user = await requireUser(); } catch { return new NextResponse("unauthenticated", { status: 401 }); }

  const appeal = await prisma.appeal.findFirst({
    where: { id, denial: { claim: { practiceId: user.practiceId } } },
    include: {
      denial: { include: { claim: { include: { payer: true } } } },
    },
  });
  if (!appeal) return new NextResponse("not found", { status: 404 });

  const body = await req.json();
  const { letter, prompt } = body as { letter: string; prompt: string };

  if (!letter || !prompt) {
    return new NextResponse("letter and prompt are required", { status: 400 });
  }

  try {
    const result = await worker.aiEditAppeal(appeal.id, letter, prompt);
    return NextResponse.json(result);
  } catch (e) {
    return new NextResponse(`AI edit failed: ${(e as Error).message}`, { status: 502 });
  }
}
