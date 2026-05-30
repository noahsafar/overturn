import Link from "next/link";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { decryptPatient } from "@/lib/patient";
import { fmtMoney, fmtDate } from "@/lib/format";
import { ArrowUpTrayIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

type AppealOutcome = "WON" | "PARTIAL" | "PENDING" | "LOST";

const outcomeStyles: Record<AppealOutcome, string> = {
  WON: "bg-success-50 text-success-700 ring-success-500/20",
  PARTIAL: "bg-warning-50 text-warning-700 ring-warning-500/20",
  PENDING: "bg-primary-50 text-primary-700 ring-primary-500/20",
  LOST: "bg-error-50 text-error-700 ring-error-500/20",
};

export default async function DenialsPage() {
  const user = await requireUser();
  const denials = await prisma.denial.findMany({
    where: { claim: { practiceId: user.practiceId } },
    orderBy: { receivedAt: "desc" },
    include: {
      claim: { include: { patient: true, payer: true } },
      appeals: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Denials</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every denied claim in your inbox. Click in to draft an appeal.
          </p>
        </div>
        <Link href="/upload" className="btn-secondary">
          <ArrowUpTrayIcon className="h-4 w-4" />
          Upload ERA
        </Link>
      </div>

      {denials.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <ArrowUpTrayIcon className="h-6 w-6 text-gray-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">No denials yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Upload an ERA file to get started.
          </p>
          <Link href="/upload" className="btn-primary mt-5">
            Upload ERA <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Patient</th>
                <th className="px-5 py-3 font-medium">Payer</th>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Service date</th>
                <th className="px-5 py-3 text-right font-medium">Denied</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {denials.map((d) => {
                const pt = decryptPatient(d.claim.patient);
                const appeal = d.appeals[0];
                const outcome = appeal?.outcome as AppealOutcome | undefined;
                return (
                  <tr key={d.id} className="group hover:bg-gray-50/70">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {pt.firstName} {pt.lastName}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{d.claim.payer.name}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-gray-600">{d.denialCode}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{fmtDate(d.claim.serviceDate)}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-gray-900">
                      {fmtMoney(d.deniedAmount as unknown as number)}
                    </td>
                    <td className="px-5 py-3">
                      {appeal && outcome ? (
                        <span className={`badge ${outcomeStyles[outcome]}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                          Appeal · {outcome.toLowerCase()}
                        </span>
                      ) : (
                        <span className="badge bg-gray-100 text-gray-700 ring-gray-300/40">
                          Unworked
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/denials/${d.id}`}
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
