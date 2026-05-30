import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import {
  BanknotesIcon,
  InboxStackIcon,
  PaperAirplaneIcon,
  TrophyIcon,
  ClockIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

async function loadMetrics(practiceId: string) {
  const [pendingDenials, totalDenials, appeals, recovered, recoveredAppeals] =
    await Promise.all([
      prisma.denial.count({
        where: { claim: { practiceId }, appeals: { none: {} } },
      }),
      prisma.denial.count({ where: { claim: { practiceId } } }),
      prisma.appeal.groupBy({
        by: ["outcome"],
        where: { denial: { claim: { practiceId } } },
        _count: { _all: true },
      }),
      prisma.appeal.aggregate({
        where: {
          denial: { claim: { practiceId } },
          outcome: { in: ["WON", "PARTIAL"] },
        },
        _sum: { recoveredAmount: true, ourFee: true },
      }),
      // For days-to-recovery we need (submittedAt, outcomeRecordedAt) pairs
      prisma.appeal.findMany({
        where: {
          denial: { claim: { practiceId } },
          outcome: { in: ["WON", "PARTIAL"] },
          submittedAt: { not: null },
          outcomeRecordedAt: { not: null },
        },
        select: { submittedAt: true, outcomeRecordedAt: true },
      }),
    ]);

  const byOutcome = Object.fromEntries(appeals.map((a) => [a.outcome, a._count._all]));
  const totalAppeals = appeals.reduce((s, a) => s + a._count._all, 0);
  const wonCount = (byOutcome.WON ?? 0) + (byOutcome.PARTIAL ?? 0);
  const settled =
    totalAppeals - (byOutcome.PENDING ?? 0) - (byOutcome.SUBMITTED ?? 0);
  const winRate = settled > 0 ? wonCount / settled : 0;

  // Avg days from submission to recovery confirmation
  let avgDaysToRecovery: number | null = null;
  if (recoveredAppeals.length > 0) {
    const totalMs = recoveredAppeals.reduce((sum, a) => {
      if (!a.submittedAt || !a.outcomeRecordedAt) return sum;
      return sum + (a.outcomeRecordedAt.getTime() - a.submittedAt.getTime());
    }, 0);
    avgDaysToRecovery = totalMs / recoveredAppeals.length / 86_400_000;
  }

  // % of denials with an appeal (worked at all)
  const workedDenials = totalDenials - pendingDenials;
  const pctWorked = totalDenials > 0 ? workedDenials / totalDenials : 0;

  return {
    pendingDenials,
    totalDenials,
    totalAppeals,
    winRate,
    pctWorked,
    avgDaysToRecovery,
    recovered: Number(recovered._sum.recoveredAmount ?? 0),
    ourFee: Number(recovered._sum.ourFee ?? 0),
    inFlight: (byOutcome.PENDING ?? 0) + (byOutcome.SUBMITTED ?? 0),
    won: wonCount,
    lost: byOutcome.LOST ?? 0,
    skipped: byOutcome.SKIPPED ?? 0,
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const m = await loadMetrics(user.practiceId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Recovery performance across your appeals pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Recovered"
          value={fmtMoney(m.recovered)}
          sub={`${m.won} won, ${m.lost} lost`}
          icon={BanknotesIcon}
          tone="hero"
        />
        <Stat
          label="Pending denials"
          value={String(m.pendingDenials)}
          sub={`of ${m.totalDenials} total`}
          icon={InboxStackIcon}
        />
        <Stat
          label="In flight"
          value={String(m.inFlight)}
          sub="submitted, awaiting outcome"
          icon={PaperAirplaneIcon}
        />
        <Stat
          label="Win rate"
          value={`${(m.winRate * 100).toFixed(0)}%`}
          sub={`of settled appeals`}
          icon={TrophyIcon}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat
          label="% denials worked"
          value={`${(m.pctWorked * 100).toFixed(0)}%`}
          sub="vs. left unworked"
          icon={CheckBadgeIcon}
        />
        <Stat
          label="Avg days to recovery"
          value={
            m.avgDaysToRecovery !== null
              ? `${m.avgDaysToRecovery.toFixed(0)}d`
              : "—"
          }
          sub="submission → payment"
          icon={ClockIcon}
        />
        <Stat
          label="Your fee"
          value={fmtMoney(m.ourFee)}
          sub="25% of recovered"
          icon={BanknotesIcon}
        />
      </div>
    </div>
  );
}

type IconType = React.ComponentType<{ className?: string }>;

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: IconType;
  tone?: "default" | "hero";
}) {
  if (tone === "hero") {
    return (
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 p-5 text-white shadow-elevated">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-gray-300">{label}</div>
          <Icon className="h-5 w-5 text-gray-300" />
        </div>
        <div className="mt-3 text-3xl font-semibold">{value}</div>
        {sub && <div className="mt-1 text-xs text-gray-300">{sub}</div>}
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
      </div>
    );
  }
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
        <Icon className="h-5 w-5 text-gray-400" />
      </div>
      <div className="mt-3 text-3xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}
