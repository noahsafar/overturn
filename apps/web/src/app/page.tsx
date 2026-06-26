import Link from "next/link";
import { prisma } from "@overturn/db";
import {
  SparklesIcon,
  DocumentMagnifyingGlassIcon,
  CheckBadgeIcon,
  PaperAirplaneIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const steps = [
  {
    title: "Upload denied claims",
    body: "Upload any denial document and we'll parse every claim automatically.",
    icon: DocumentMagnifyingGlassIcon,
  },
  {
    title: "Draft with citations",
    body: "Agents write a payer-specific appeal letter grounded in their published medical policies.",
    icon: SparklesIcon,
  },
  {
    title: "Human review",
    body: "A reviewer signs off in seconds before anything leaves the building.",
    icon: CheckBadgeIcon,
  },
  {
    title: "Submit & track",
    body: "We submit through the payer portal and follow up until the claim is paid.",
    icon: PaperAirplaneIcon,
  },
];

// Compute platform-wide proof metrics for the marketing band on the home
// page. Numbers stay honest — won + partial only, not "pending" — so a
// pending submission can't inflate the win-rate. Returns null fields when
// there aren't enough decisions to be meaningful.
async function loadProofMetrics() {
  const [recoveredAgg, appeals, durations] = await Promise.all([
    prisma.appeal.aggregate({
      _sum: { recoveredAmount: true },
      where: { outcome: { in: ["WON", "PARTIAL"] } },
    }),
    prisma.appeal.groupBy({
      by: ["outcome"],
      _count: { _all: true },
    }),
    prisma.appeal.findMany({
      where: {
        outcome: { in: ["WON", "PARTIAL"] },
        submittedAt: { not: null },
        outcomeRecordedAt: { not: null },
      },
      select: { submittedAt: true, outcomeRecordedAt: true },
      take: 500,
    }),
  ]);

  const recovered = Number(recoveredAgg._sum.recoveredAmount ?? 0);
  const won = appeals.find((a) => a.outcome === "WON")?._count._all ?? 0;
  const partial = appeals.find((a) => a.outcome === "PARTIAL")?._count._all ?? 0;
  const lost = appeals.find((a) => a.outcome === "LOST")?._count._all ?? 0;
  const pending = appeals.find((a) => a.outcome === "PENDING")?._count._all ?? 0;
  const decided = won + partial + lost;
  const winRate = decided >= 5 ? (won + partial * 0.5) / decided : null;

  const daysToOutcome =
    durations.length >= 5
      ? Math.round(
          durations.reduce((sum, d) => {
            const diff =
              (d.outcomeRecordedAt!.getTime() - d.submittedAt!.getTime()) /
              86_400_000;
            return sum + Math.max(diff, 0);
          }, 0) / durations.length,
        )
      : null;

  const totalAppeals = won + partial + lost + pending;

  return { recovered, winRate, daysToOutcome, totalAppeals };
}

export default async function HomePage() {
  const metrics = await loadProofMetrics().catch(() => null);

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-ai-500" />
          Early pilot · live with real practices
        </div>
        <h1 className="text-5xl font-semibold tracking-tight text-gray-900">
          Fire your billing company.
        </h1>
        <p className="max-w-2xl text-lg text-gray-600">
          Our agents draft payer-specific appeal letters with verified citations,
          run them past a human reviewer, and submit them via the payer's portal.
          You pay nothing unless we recover money.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/dashboard" className="btn-primary">
            Open dashboard <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <Link href="/denials" className="btn-secondary">
            See pending denials
          </Link>
        </div>
      </section>

      {metrics && metrics.totalAppeals > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Pilot results to date
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ProofStat
              label="Recovered for practices"
              value={fmtMoney(metrics.recovered)}
              tone="success"
            />
            <ProofStat
              label="Win rate"
              value={metrics.winRate != null ? `${Math.round(metrics.winRate * 100)}%` : "—"}
              tone="primary"
              hint={metrics.winRate == null ? "needs ≥ 5 decided appeals" : undefined}
            />
            <ProofStat
              label="Avg days to outcome"
              value={metrics.daysToOutcome != null ? `${metrics.daysToOutcome}d` : "—"}
              tone="gray"
              hint={metrics.daysToOutcome == null ? "needs ≥ 5 paid appeals" : undefined}
            />
            <ProofStat
              label="Appeals run"
              value={metrics.totalAppeals.toLocaleString()}
              tone="gray"
            />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Live from the platform. Numbers update with every new outcome.
          </p>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold text-gray-900">How it works</h2>
        <p className="mt-1 text-sm text-gray-500">
          Four steps. The agents do the boring parts; you sign off on the rest.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {steps.map((s, i) => (
            <div key={s.title} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-mono text-gray-400">0{i + 1}</span>
                    <h3 className="text-base font-semibold text-gray-900">{s.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600">{s.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProofStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "success" | "primary" | "gray";
  hint?: string;
}) {
  const tones: Record<typeof tone, string> = {
    success: "text-success-700",
    primary: "text-primary-700",
    gray: "text-gray-900",
  };
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}
