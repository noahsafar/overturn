// POST /api/invitations/:token/accept
//
// Public endpoint — accepts an invitation. In dev mode (no Clerk) the request
// body must include the user's email; in prod Clerk session is required and
// the email is sourced from there.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { acceptInvitation } from "@/lib/invitations";

const Body = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = (await req.json().catch(() => ({}))) as unknown;
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return new NextResponse("bad body", { status: 400 });

  let clerkId: string;
  let email: string;
  let name: string | undefined = parsed.data.name;

  if (process.env.CLERK_SECRET_KEY) {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const { userId } = auth();
    if (!userId) return new NextResponse("unauthenticated", { status: 401 });
    const u = await currentUser();
    clerkId = userId;
    email = u?.emailAddresses[0]?.emailAddress ?? parsed.data.email ?? "";
    name = u?.fullName ?? name;
  } else {
    // Dev mode — accept the email from the body. This branch never runs in prod.
    if (!parsed.data.email) return new NextResponse("email required in dev", { status: 400 });
    email = parsed.data.email;
    clerkId = `dev_${email}`;
  }

  try {
    const user = await acceptInvitation(token, clerkId, email, name);
    return NextResponse.json({ ok: true, userId: user.id, practiceId: user.practiceId });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg.includes("not_found") ? 404 : msg.includes("expired") ? 410 : 400;
    return new NextResponse(msg, { status });
  }
}
