import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { CredentialsForm } from "./CredentialsForm";
import { RevokeCredentialsButton } from "./RevokeCredentialsButton";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

export default async function PayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  if (user.role === "STAFF") notFound();

  const payer = await prisma.payer.findUnique({
    where: { id },
    include: {
      _count: { select: { policies: true, claims: true } },
      payerCredentials: {
        where: { practiceId: user.practiceId },
      },
    },
  });
  if (!payer) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings/payers"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to payers
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
          {payer.name}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Portal" v={payer.portalUrl ?? "—"} />
        <Card title="Fax" v={payer.faxNumber ?? "—"} />
        <Card title="Appeal address" v={payer.appealAddress ?? "—"} />
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Credentials</h2>
        <p className="mt-1 text-sm text-gray-500">
          Stored encrypted with envelope encryption (AES-256-GCM). Used by the
          portal submitter and SFTP poller. Never displayed after save.
        </p>

        {payer.payerCredentials.length === 0 ? (
          <p className="mt-4 text-sm text-gray-600">No credentials stored yet.</p>
        ) : (
          <div className="card mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Stored</th>
                  <th className="px-5 py-3 font-medium">Rotated</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payer.payerCredentials.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-medium text-gray-900">{c.credentialType}</td>
                    <td className="px-5 py-3 text-gray-700">{fmtDate(c.createdAt)}</td>
                    <td className="px-5 py-3 text-gray-700">
                      {c.rotatedAt ? fmtDate(c.rotatedAt) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <RevokeCredentialsButton credentialId={c.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <CredentialsForm payerId={payer.id} />
      </section>
    </div>
  );
}

function Card({ title, v }: { title: string; v: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-2 text-base text-gray-900 break-all">{v}</div>
    </div>
  );
}
