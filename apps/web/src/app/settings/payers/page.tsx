import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PayersSettingsPage() {
  await requireUser();
  const payers = await prisma.payer.findMany({
    include: { _count: { select: { policies: true, claims: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Payers</h1>
        <p className="mt-1 text-sm text-gray-500">
          Per-payer configuration (portal, fax, appeal address) and the size of
          the policy library used during retrieval.
        </p>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-medium">Payer</th>
              <th className="px-5 py-3 font-medium">Portal</th>
              <th className="px-5 py-3 font-medium">Fax</th>
              <th className="px-5 py-3 text-right font-medium">Policies</th>
              <th className="px-5 py-3 text-right font-medium">Claims</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payers.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50/70">
                <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="max-w-[24ch] truncate px-5 py-3 text-gray-600">
                  {p.portalUrl ?? "—"}
                </td>
                <td className="px-5 py-3 text-gray-600">{p.faxNumber ?? "—"}</td>
                <td className="px-5 py-3 text-right tabular-nums text-gray-900">
                  {p._count.policies}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-gray-900">
                  {p._count.claims}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
