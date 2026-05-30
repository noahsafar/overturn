import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const dynamic = "force-dynamic";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inv = await prisma.invitation.findUnique({
    where: { token },
    include: { practice: true, createdBy: { select: { email: true, name: true } } },
  });
  if (!inv) notFound();

  if (inv.acceptedAt) {
    return (
      <div className="max-w-md mx-auto card p-8 text-center">
        <p className="text-sm text-gray-600">
          This invitation has already been accepted.
        </p>
      </div>
    );
  }
  if (inv.expiresAt < new Date()) {
    return (
      <div className="max-w-md mx-auto card p-8 text-center">
        <p className="text-sm text-error-700">This invitation has expired.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto card p-8 space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Join {inv.practice.name}</h1>
      <p className="text-sm text-gray-600">
        Invited by {inv.createdBy.name ?? inv.createdBy.email} as <strong>{inv.role}</strong>.
      </p>
      <AcceptInviteForm token={token} prefilledEmail={inv.email} />
    </div>
  );
}
