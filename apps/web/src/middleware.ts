// Next.js middleware — runs on every request at the edge.
//
// We can't hit Prisma from the edge runtime, so this middleware does just one
// thing: stash the request's pathname into a header that downstream server
// components can read via `headers()`. The onboarding redirect logic lives in
// the root layout (full Node runtime, DB access) — it reads `x-pathname` and
// decides what to do.

import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname);
  return res;
}

export const config = {
  // Skip on static assets, API routes that should never redirect, and the
  // Next internals. Everything else runs.
  matcher: ["/((?!_next/static|_next/image|favicon|overturn-|api/webhooks/|api/internal/).*)"],
};
