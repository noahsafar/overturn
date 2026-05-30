import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const user = await requireUser();
  if (user.role === "STAFF") notFound();

  const events = await prisma.auditEvent.findMany({
    where: { practiceId: user.practiceId },
    orderBy: { createdAt: "desc" },
    take: 250,
    include: { user: { select: { email: true, name: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Audit log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every PHI-touching operation is recorded here. Append-only, retained for 7 years.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="card p-12 text-center text-sm text-gray-500">
          No events recorded yet.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Who</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Resource</th>
                <th className="px-5 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50/70">
                  <td className="px-5 py-3 text-gray-700 tabular-nums">
                    {fmtDateTime(e.createdAt)}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {e.user?.email ?? <span className="text-gray-400">system</span>}
                  </td>
                  <td className="px-5 py-3">
                    <code className="font-mono text-xs text-gray-700">{e.action}</code>
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    <span className="font-mono text-xs">
                      {e.resourceType}
                      {e.resourceId ? `/${e.resourceId.slice(-12)}` : ""}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{e.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
