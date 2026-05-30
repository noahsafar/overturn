import Link from "next/link";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 ring-gray-300/40",
  OPEN: "bg-warning-50 text-warning-700 ring-warning-500/20",
  PAID: "bg-success-50 text-success-700 ring-success-500/20",
  VOID: "bg-error-50 text-error-700 ring-error-500/20",
  UNCOLLECTIBLE: "bg-error-50 text-error-700 ring-error-500/20",
};

export default async function InvoicesPage() {
  const user = await requireUser();
  const invoices = await prisma.invoice.findMany({
    where: { practiceId: user.practiceId },
    orderBy: { periodStart: "desc" },
    include: { _count: { select: { lineItems: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Invoices</h1>
        <p className="mt-1 text-sm text-gray-500">
          One invoice per month for recovered claim fees. You only pay on recoveries.
        </p>
      </div>

      {invoices.length === 0 ? (
        <div className="card p-12 text-center text-sm text-gray-500">
          No invoices yet — we'll generate one when your first appeal is recovered.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Period</th>
                <th className="px-5 py-3 font-medium">Lines</th>
                <th className="px-5 py-3 text-right font-medium">Total fee</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Issued</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => {
                const style =
                  statusStyles[inv.status] ?? "bg-gray-100 text-gray-700 ring-gray-300/40";
                return (
                  <tr key={inv.id} className="group hover:bg-gray-50/70">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{inv._count.lineItems}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-900">
                      {fmtMoney(inv.totalCents / 100)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`badge ${style}`}>{inv.status}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {inv.issuedAt ? fmtDate(inv.issuedAt) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        View <ArrowRightIcon className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
