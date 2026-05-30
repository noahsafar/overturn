import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { InviteForm } from "./InviteForm";
import { RevokeInviteButton } from "./RevokeInviteButton";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const user = await requireUser();
  if (user.role === "STAFF") notFound();

  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      where: { practiceId: user.practiceId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { practiceId: user.practiceId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Members</h1>
        <p className="mt-1 text-sm text-gray-500">
          Invite teammates and manage roles. OWNER and ADMIN can manage members; STAFF can review appeals.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Active members</h2>
        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/70">
                  <td className="px-5 py-3 font-medium text-gray-900">{u.email}</td>
                  <td className="px-5 py-3 text-gray-700">{u.name ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-600">{u.role}</td>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Pending invitations</h2>
        </div>
        <InviteForm />
        {invites.length === 0 ? (
          <div className="card mt-3 p-6 text-center text-sm text-gray-500">
            No pending invitations.
          </div>
        ) : (
          <div className="card mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invites.map((i) => (
                  <tr key={i.id} className="hover:bg-gray-50/70">
                    <td className="px-5 py-3 font-medium text-gray-900">{i.email}</td>
                    <td className="px-5 py-3 text-gray-600">{i.role}</td>
                    <td className="px-5 py-3 text-gray-600 tabular-nums">{fmtDate(i.expiresAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <RevokeInviteButton invitationId={i.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
