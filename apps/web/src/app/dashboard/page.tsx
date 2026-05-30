import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import {
  BanknotesIcon,
  InboxStackIcon,
  PaperAirplaneIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

async function loadMetrics(practiceId: string) {
  const [pendingDenials, appeals, recovered] = await Promise.all([
    prisma.denial.count({
      where: { claim: { practiceId }, appeals: { none: {} } },
    }),
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
  ]);

  const byOutcome = Object.fromEntries(appeals.map((a) => [a.outcome, a._count._all]));
  const totalAppeals = appeals.reduce((s, a) => s + a._count._all, 0);
  const wonCount = (byOutcome.WON ?? 0) + (byOutcome.PARTIAL ?? 0);
  const settled = totalAppeals - (byOutcome.PENDING ?? 0);
  const winRate = settled > 0 ? wonCount / settled : 0;

  return {
    pendingDenials,
    totalAppeals,
    winRate,
    recovered: Number(recovered._sum.recoveredAmount ?? 0),
    ourFee: Number(recovered._sum.ourFee ?? 0),
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
        <Stat label="Recovered" value={fmtMoney(m.recovered)} icon={BanknotesIcon} tone="hero" />
        <Stat label="Pending denials" value={String(m.pendingDenials)} icon={InboxStackIcon} />
        <Stat label="Appeals submitted" value={String(m.totalAppeals)} icon={PaperAirplaneIcon} />
        <Stat label="Win rate" value={`${(m.winRate * 100).toFixed(0)}%`} icon={TrophyIcon} />
      </div>

      <div className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-gray-700">Your fee</h2>
          <span className="text-xs text-gray-400">25% of recovered</span>
        </div>
        <div className="mt-2 text-2xl font-semibold text-gray-900">{fmtMoney(m.ourFee)}</div>
        <p className="mt-1 text-xs text-gray-500">
          You only pay when we recover. Fees are calculated on settled appeals.
        </p>
      </div>
    </div>
  );
}

type IconType = React.ComponentType<{ className?: string }>;

function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
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
    </div>
  );
}
