import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser, isSuperuser } from "@/lib/auth";
import { AdminSidebar } from "./AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // We 404 (not 403) when a non-superuser navigates to /admin/* — we don't
  // want to confirm the existence of the admin surface to a probing user.
  if (!isSuperuser(user)) notFound();

  // Record an audit event for every admin page view. Stored under the
  // superuser's own practiceId so each admin has a personal trail of which
  // tenants they inspected.
  try {
    const h = await headers();
    await prisma.auditEvent.create({
      data: {
        practiceId: user.practiceId,
        userId: user.id,
        action: "admin.view",
        resourceType: "admin",
        resourceId: h.get("x-pathname") ?? null,
        ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: h.get("user-agent"),
        metadata: { mode: "superuser" },
      },
    });
  } catch {
    // best-effort — never block the page render on audit
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar email={user.email} />
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <header className="border-b border-gray-200 bg-gray-900 px-8 py-3 text-sm text-gray-300 sticky top-0 z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="font-medium uppercase tracking-wide text-gray-100">
                Overturn ops console
              </span>
              <span className="text-gray-500">— cross-tenant access</span>
            </span>
            <span className="font-mono text-xs text-gray-400">{user.email}</span>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-8 py-10">{children}</div>
      </div>
    </div>
  );
}
