// Auth helper. In production this delegates to Clerk; in dev (when no Clerk
// keys are present) it returns a stub user matching the seeded dev_user
// record, so the app is usable without signing the Clerk BAA.

import "server-only";
import { prisma } from "@overturn/db";

export interface SessionUser {
  id: string;
  clerkId: string;
  email: string;
  practiceId: string;
  role: "OWNER" | "ADMIN" | "STAFF";
}

const devModeEnabled = () =>
  process.env.DEV_AUTH === "true" || !process.env.CLERK_SECRET_KEY;

export async function currentUser(): Promise<SessionUser | null> {
  if (devModeEnabled()) {
    const u = await prisma.user.findUnique({ where: { clerkId: "dev_user" } });
    if (!u) return null;
    return {
      id: u.id,
      clerkId: u.clerkId,
      email: u.email,
      practiceId: u.practiceId,
      role: u.role,
    };
  }

  // Real Clerk path — dynamic import so the dep isn't required in pure dev.
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = auth();
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!u) return null;
  return {
    id: u.id,
    clerkId: u.clerkId,
    email: u.email,
    practiceId: u.practiceId,
    role: u.role,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

// ── Superuser (Overturn ops) ──────────────────────────────────────────────
//
// A separate axis from the practice-scoped OWNER/ADMIN/STAFF roles. Superusers
// see ALL practices and have unscoped DB access. Membership is controlled by
// an env allowlist (`OVERTURN_ADMIN_EMAILS=a@b.com,c@d.com`) rather than a DB
// column — that way you don't need a migration to grant or revoke, and you
// can revoke fast by editing env + redeploying.
//
// In dev with no Clerk + no allowlist, the seeded dev_user is treated as a
// superuser so you can exercise the admin surface locally.

function parseAllowlist(): Set<string> {
  const raw = process.env.OVERTURN_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSuperuser(user: { email: string } | null | undefined): boolean {
  if (!user?.email) return false;
  const allow = parseAllowlist();
  // Dev fallback: if no allowlist configured AND we're in dev_auth mode, treat
  // the seeded dev_user as superuser so the admin UI is reachable locally.
  if (allow.size === 0 && devModeEnabled()) {
    return user.email === "dev@overturn.local";
  }
  return allow.has(user.email.toLowerCase());
}

export async function requireSuperuser(): Promise<SessionUser> {
  const u = await requireUser();
  if (!isSuperuser(u)) {
    throw new Error("FORBIDDEN");
  }
  return u;
}
