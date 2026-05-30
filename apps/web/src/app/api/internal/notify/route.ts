// POST /api/internal/notify — internal endpoint called by the worker to
// trigger notifications when async work reaches notable states (appeal
// ready for review, outcome recorded, etc.).
//
// Authn: shared-secret header (no Clerk session — the worker doesn't have one).
// Intended to be reachable only from the private network.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { notifyAppealReady, notifyOutcome } from "@/lib/notifications";

const Body = z.union([
  z.object({ event: z.literal("appeal.ready"), appealId: z.string().min(1) }),
  z.object({ event: z.literal("appeal.outcome"), appealId: z.string().min(1) }),
]);

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SHARED_SECRET;
  // In dev with no shared secret, allow internal calls. In prod a missing
  // secret means we refuse anonymous internal traffic.
  if (secret) {
    const got = req.headers.get("x-internal-secret");
    if (got !== secret) {
      return new NextResponse("forbidden", { status: 403 });
    }
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_body", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.event === "appeal.ready") {
      await notifyAppealReady(parsed.data.appealId);
    } else if (parsed.data.event === "appeal.outcome") {
      await notifyOutcome(parsed.data.appealId);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "notify_failed", message: (e as Error).message },
      { status: 500 },
    );
  }
}
