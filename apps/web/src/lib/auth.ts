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
