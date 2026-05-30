import Link from "next/link";
import { prisma } from "@overturn/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

async function loadPractices() {
  const practices = await prisma.practice.findMany({
    orderBy: { createdAt: "desc" },
  });

  // Aggregate per practice. Two queries beats N+1 per practice.
  const recovered = await prisma.appeal.groupBy({
    by: ["denialId"],
    where: { outcome: { in: ["WON", "PARTIAL"] } },
    _sum: { recoveredAmount: true, ourFee: true },
  });
  // Map denialId → claimId → practiceId for the aggregation. Cheaper to just
  // re-fetch with the join included:
  const wonAppeals = await prisma.appeal.findMany({
    where: { outcome: { in: ["WON", "PARTIAL"] } },
    select: {
      recoveredAmount: true,
      ourFee: true,
      denial: { select: { claim: { select: { practiceId: true } } } },
    },
  });
  const totalsByPractice = new Map<string, { recovered: number; fees: number; count: number }>();
  for (const a of wonAppeals) {
    const pid = a.denial.claim.practiceId;
    const t = totalsByPractice.get(pid) ?? { recovered: 0, fees: 0, count: 0 };
    t.recovered += Number(a.recoveredAmount ?? 0);
    t.fees += Number(a.ourFee ?? 0);
    t.count += 1;
    totalsByPractice.set(pid, t);
  }

  // Denial counts (unworked)
  const denialAgg = await prisma.denial.groupBy({
    by: ["claimId"],
    _count: { _all: true },
  });
  // Same pattern — fetch with join:
  const denialsByPractice = new Map<string, number>();
  const denials = await prisma.denial.findMany({
    select: { claim: { select: { practiceId: true } } },
  });
  for (const d of denials) {
    const pid = d.claim.practiceId;
    denialsByPractice.set(pid, (denialsByPractice.get(pid) ?? 0) + 1);
  }

  return practices.map((p) => {
    const t = totalsByPractice.get(p.id) ?? { recovered: 0, fees: 0, count: 0 };
    return {
      ...p,
      totalRecovered: t.recovered,
      totalFees: t.fees,
      wonAppeals: t.count,
      totalDenials: denialsByPractice.get(p.id) ?? 0,
    };
  });
}

export default async function PracticesPage() {
  const practices = await loadPractices();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Practices</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every tenant on the platform. Click a row to drill in.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-medium">Practice</th>
              <th className="px-5 py-3 font-medium">NPI</th>
              <th className="px-5 py-3 font-medium">Onboarded</th>
              <th className="px-5 py-3 text-right font-medium">Recovered</th>
              <th className="px-5 py-3 text-right font-medium">Fees</th>
              <th className="px-5 py-3 text-right font-medium">Wins</th>
              <th className="px-5 py-3 text-right font-medium">Denials</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {practices.map((p) => (
              <tr key={p.id} className="group hover:bg-gray-50/70">
                <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.npi}</td>
                <td className="px-5 py-3 text-gray-600 tabular-nums">
                  {p.onboardingCompletedAt ? fmtDate(p.onboardingCompletedAt) : (
                    <span className="text-warning-700">in progress</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-gray-900">
                  {fmtMoney(p.totalRecovered)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                  {fmtMoney(p.totalFees)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-gray-700">{p.wonAppeals}</td>
                <td className="px-5 py-3 text-right tabular-nums text-gray-700">{p.totalDenials}</td>
                <td className="px-5 py-3">
                  {p.stripeCustomerId ? (
                    <span className="badge bg-success-50 text-success-700 ring-success-500/20">
                      Stripe connected
                    </span>
                  ) : p.billingEmail ? (
                    <span className="badge bg-primary-50 text-primary-700 ring-primary-500/20">
                      Billing pending
                    </span>
                  ) : (
                    <span className="badge bg-gray-100 text-gray-700 ring-gray-300/40">
                      No billing
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/admin/practices/${p.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Inspect <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
