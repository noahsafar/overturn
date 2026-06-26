import Link from "next/link";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { decryptPatient } from "@/lib/patient";
import { fmtMoney, fmtDate, fmtName } from "@/lib/format";
import { groupDenials } from "@/lib/denial-grouping";
import { scoreDenial } from "@/lib/denial-priority";
import { ArrowUpTrayIcon, ArrowRightIcon, ClockIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

type AppealOutcome = "WON" | "PARTIAL" | "PENDING" | "LOST";

const outcomeStyles: Record<AppealOutcome, string> = {
  WON: "bg-success-50 text-success-700 ring-success-500/20",
  PARTIAL: "bg-warning-50 text-warning-700 ring-warning-500/20",
  PENDING: "bg-primary-50 text-primary-700 ring-primary-500/20",
  LOST: "bg-error-50 text-error-700 ring-error-500/20",
};

const tierStyles: Record<"P1" | "P2" | "P3", string> = {
  P1: "bg-error-50 text-error-700 ring-error-500/30",
  P2: "bg-warning-50 text-warning-700 ring-warning-500/30",
  P3: "bg-gray-50 text-gray-600 ring-gray-300/40",
};

function daysUntil(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
}

function deadlineLabel(days: number | null): { text: string; tone: string } {
  if (days == null) return { text: "—", tone: "text-gray-400" };
  if (days < 0) return { text: "Expired", tone: "text-error-600 font-medium" };
  if (days <= 7) return { text: `${days}d left`, tone: "text-error-600 font-medium" };
  if (days <= 30) return { text: `${days}d left`, tone: "text-warning-700" };
  return { text: `${days}d left`, tone: "text-gray-500" };
}

export default async function DenialsPage() {
  const user = await requireUser();
  const denials = await prisma.denial.findMany({
    where: { claim: { practiceId: user.practiceId } },
    orderBy: { receivedAt: "desc" },
    include: {
      claim: { include: { patient: true, payer: true } },
      appeals: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 500,
  });

  // Lazy backfill: any denial created before priority scoring was wired
  // (seeded data, legacy uploads) will have NULL priority fields. Score
  // them now and persist in one batch so the column is populated for
  // future loads and the analytics page can rely on it.
  const unscored = denials.filter((d) => d.priorityScore == null);
  if (unscored.length > 0) {
    await Promise.all(
      unscored.map(async (d) => {
        const r = scoreDenial({
          denialCode: d.denialCode,
          deniedAmount: Number(d.deniedAmount),
          filingDeadline: d.filingDeadline,
        });
        // Patch the in-memory object so the current render sees the score.
        d.predictedWinProb = r.predictedWinProb;
        d.priorityScore = r.priorityScore;
        d.priorityTier = r.priorityTier;
        await prisma.denial.update({
          where: { id: d.id },
          data: {
            predictedWinProb: r.predictedWinProb,
            priorityScore: r.priorityScore,
            priorityTier: r.priorityTier,
            scoreExplain: r.scoreExplain as unknown as object,
          },
        });
      }),
    );
  }

  const groups = groupDenials(denials);

  const counts = {
    P1: groups.filter((g) => g.priorityTier === "P1").length,
    P2: groups.filter((g) => g.priorityTier === "P2").length,
    P3: groups.filter((g) => g.priorityTier === "P3").length,
  };
  const unworkedExpected = groups
    .filter((g) => !g.lead.appeals?.[0])
    .reduce((sum, g) => sum + g.totalDenied * (g.predictedWinProb ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Denials</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sorted by expected recovery × urgency. Work P1 first.
          </p>
        </div>
        <Link href="/upload" className="btn-secondary">
          <ArrowUpTrayIcon className="h-4 w-4" />
          Upload Denied Claims
        </Link>
      </div>

      {groups.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">P1 · Work first</div>
            <div className="mt-1 text-2xl font-semibold text-error-700">{counts.P1}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">P2</div>
            <div className="mt-1 text-2xl font-semibold text-warning-700">{counts.P2}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">P3</div>
            <div className="mt-1 text-2xl font-semibold text-gray-700">{counts.P3}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Expected recovery</div>
            <div className="mt-1 text-2xl font-semibold text-success-700">{fmtMoney(unworkedExpected)}</div>
            <div className="mt-0.5 text-xs text-gray-500">if you work all unappealed</div>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">No denials yet</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Payer</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 text-right font-medium">Denied</th>
                <th className="px-4 py-3 text-right font-medium">Win prob</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groups.map((g) => {
                const pt = decryptPatient(g.lead.claim.patient);
                const appeal = g.lead.appeals?.[0];
                const outcome = appeal?.outcome as AppealOutcome | undefined;
                const tier = g.priorityTier;
                const winPct =
                  g.predictedWinProb != null ? Math.round(g.predictedWinProb * 100) : null;
                const days = daysUntil(g.lead.filingDeadline);
                const dl = deadlineLabel(days);
                return (
                  <tr key={g.lead.id} className="group hover:bg-gray-50/70">
                    <td className="px-4 py-3">
                      {tier ? (
                        <span className={`badge ${tierStyles[tier]}`}>{tier}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {fmtName(`${pt.firstName} ${pt.lastName}`).trim() || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{g.lead.claim.payer.name}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-600">{g.lead.denialCode}</span>
                    </td>
                    <td className="px-4 py-3">
                      {g.affectedCpts.length > 0 ? (
                        <span className="font-mono text-xs text-gray-700">
                          {g.affectedCpts.join(", ")}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                      {g.count > 1 && (
                        <span className="ml-2 text-xs text-gray-500">
                          ({g.count} services)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                      {fmtMoney(g.totalDenied)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {winPct != null ? `${winPct}%` : "—"}
                    </td>
                    <td className={`px-4 py-3 text-xs tabular-nums ${dl.tone}`}>
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="h-3.5 w-3.5" />
                        {dl.text}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {appeal && outcome ? (
                        <div className="flex flex-col items-start gap-0.5">
                          <span className={`badge ${outcomeStyles[outcome]}`}>
                            {outcome.charAt(0) + outcome.slice(1).toLowerCase()}
                          </span>
                          {appeal.confidenceScore != null && (
                            <span className="text-xs text-gray-500 tabular-nums">
                              {Math.round(appeal.confidenceScore * 100)}% conf
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="badge bg-gray-100 text-gray-700 ring-gray-300/40">
                          Unworked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/denials/${g.lead.id}`}
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
