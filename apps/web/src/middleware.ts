// Next.js middleware — runs on every request at the edge.
//
// Two responsibilities:
//   1. Stash the pathname into a header (`x-pathname`) so server components
//      can read it — the onboarding redirect in the root layout uses this.
//      (We can't hit Prisma from the edge runtime, so the redirect decision
//      itself lives in the root layout.)
//   2. When Clerk is configured, install clerkMiddleware so `auth()` works
//      in server code. In dev (no Clerk keys) we skip it entirely and the
//      dev-auth stub in lib/auth.ts takes over.

import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const clerkEnabled =
  process.env.DEV_AUTH !== "true" && !!process.env.CLERK_SECRET_KEY;

function withPathname(req: NextRequest): NextResponse {
  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname);
  return res;
}

export default clerkEnabled
  ? clerkMiddleware((_auth, req) => withPathname(req))
  : withPathname;

export const config = {
  // Skip on static assets, API routes that should never redirect, and the
  // Next internals. Everything else runs.
  matcher: ["/((?!_next/static|_next/image|favicon|overturn-|api/webhooks/|api/internal/).*)"],
};
