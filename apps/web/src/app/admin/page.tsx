import Link from "next/link";
import { prisma } from "@overturn/db";
import { fmtMoney } from "@/lib/format";
import {
  BanknotesIcon,
  BuildingOffice2Icon,
  PaperAirplaneIcon,
  ShieldExclamationIcon,
  CpuChipIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

async function loadFleet() {
  const [practiceCount, recovered, byOutcome, agentAgg, failedSubs, invoiceAgg] = await Promise.all([
    prisma.practice.count(),
    prisma.appeal.aggregate({
      where: { outcome: { in: ["WON", "PARTIAL"] } },
      _sum: { recoveredAmount: true, ourFee: true },
      _count: { _all: true },
    }),
    prisma.appeal.groupBy({
      by: ["outcome"],
      _count: { _all: true },
    }),
    prisma.agentRun.aggregate({
      _avg: { confidenceScore: true },
      _sum: { costCents: true },
      _count: { _all: true },
    }),
    prisma.submission.count({ where: { status: "FAILED" } }),
    prisma.invoice.aggregate({
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = Object.fromEntries(
    byOutcome.map((o) => [o.outcome, o._count._all]),
  );
  const totalAppeals = byOutcome.reduce((s, o) => s + o._count._all, 0);
  const settled = totalAppeals - (counts.PENDING ?? 0) - (counts.SUBMITTED ?? 0);
  const wonCount = (counts.WON ?? 0) + (counts.PARTIAL ?? 0);

  return {
    practiceCount,
    totalAppeals,
    settled,
    pendingCount: (counts.PENDING ?? 0) + (counts.SUBMITTED ?? 0),
    wonCount,
    skippedCount: counts.SKIPPED ?? 0,
    rejectedCount: counts.REJECTED_BY_HUMAN ?? 0,
    winRate: settled > 0 ? wonCount / settled : 0,
    recovered: Number(recovered._sum.recoveredAmount ?? 0),
    fees: Number(recovered._sum.ourFee ?? 0),
    invoicedTotal: (invoiceAgg._sum.totalCents ?? 0) / 100,
    invoiceCount: invoiceAgg._count._all,
    agentRuns: agentAgg._count._all,
    avgConfidence: agentAgg._avg.confidenceScore,
    llmSpendDollars: (agentAgg._sum.costCents ?? 0) / 100,
    failedSubmissions: failedSubs,
  };
}

export default async function FleetPage() {
  const f = await loadFleet();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Fleet overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cross-tenant rollups across every practice on the platform.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total recovered"
          value={fmtMoney(f.recovered)}
          sub={`${f.wonCount} winning appeals`}
          icon={BanknotesIcon}
          tone="hero"
        />
        <Stat
          label="Practices"
          value={String(f.practiceCount)}
          sub="active tenants"
          icon={BuildingOffice2Icon}
        />
        <Stat
          label="Appeals (all-time)"
          value={String(f.totalAppeals)}
          sub={`${f.pendingCount} in-flight`}
          icon={PaperAirplaneIcon}
        />
        <Stat
          label="Win rate"
          value={`${(f.winRate * 100).toFixed(0)}%`}
          sub={`of ${f.settled} settled`}
          icon={ShieldExclamationIcon}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat
          label="Our fees billed"
          value={fmtMoney(f.invoicedTotal)}
          sub={`${f.invoiceCount} invoice(s)`}
          icon={CurrencyDollarIcon}
        />
        <Stat
          label="LLM spend"
          value={fmtMoney(f.llmSpendDollars)}
          sub={`${f.agentRuns} agent runs`}
          icon={CpuChipIcon}
        />
        <Stat
          label="Failed submissions"
          value={String(f.failedSubmissions)}
          sub={
            f.failedSubmissions > 0 ? (
              <Link href="/admin/ops" className="text-error-700 hover:underline">
                Triage →
              </Link>
            ) : (
              "all clean"
            )
          }
          icon={ShieldExclamationIcon}
          tone={f.failedSubmissions > 0 ? "warn" : "default"}
        />
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-medium text-gray-700">Appeal outcome distribution</h2>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <Pill label="Pending" v={f.pendingCount} color="bg-primary-50 text-primary-700" />
          <Pill label="Won" v={f.wonCount} color="bg-success-50 text-success-700" />
          <Pill label="Skipped" v={f.skippedCount} color="bg-gray-100 text-gray-700" />
          <Pill label="Rejected" v={f.rejectedCount} color="bg-error-50 text-error-700" />
          <Pill
            label="Avg confidence"
            v={f.avgConfidence !== null ? f.avgConfidence.toFixed(2) : "—"}
            color="bg-gray-100 text-gray-700"
          />
        </div>
      </section>
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
  sub?: React.ReactNode;
  icon: IconType;
  tone?: "default" | "hero" | "warn";
}) {
  const tones = {
    default: "card",
    hero: "rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 p-5 text-white shadow-elevated",
    warn: "rounded-xl border border-warning-200 bg-warning-50/50 p-5",
  };
  const text = tone === "hero" ? "text-gray-300" : "text-gray-500";
  return (
    <div className={tone === "default" ? `${tones.default} p-5` : tones[tone]}>
      <div className="flex items-center justify-between">
        <div className={`text-xs uppercase tracking-wide ${text}`}>{label}</div>
        <Icon className={`h-5 w-5 ${tone === "hero" ? "text-gray-300" : "text-gray-400"}`} />
      </div>
      <div className={`mt-3 text-3xl font-semibold ${tone === "hero" ? "text-white" : "text-gray-900"}`}>
        {value}
      </div>
      {sub && (
        <div className={`mt-1 text-xs ${text}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Pill({ label, v, color }: { label: string; v: number | string; color: string }) {
  return (
    <div className={`rounded-md px-3 py-2 ${color}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{v}</div>
    </div>
  );
}
