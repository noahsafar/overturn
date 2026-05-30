import { notFound } from "next/navigation";
import { prisma } from "@overturn/db";
import { requireUser } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireUser();
  if (user.role === "STAFF") notFound();

  const [recoveries, outstanding, invoices] = await Promise.all([
    prisma.appeal.aggregate({
      where: {
        denial: { claim: { practiceId: user.practiceId } },
        outcome: { in: ["WON", "PARTIAL"] },
      },
      _sum: { recoveredAmount: true, ourFee: true },
      _count: { _all: true },
    }),
    prisma.appeal.count({
      where: {
        denial: { claim: { practiceId: user.practiceId } },
        outcome: { in: ["PENDING", "SUBMITTED"] },
        submittedAt: { not: null },
      },
    }),
    prisma.invoice.aggregate({
      where: { practiceId: user.practiceId },
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
  ]);

  const totalRecovered = Number(recoveries._sum.recoveredAmount ?? 0);
  const totalFees = Number(recoveries._sum.ourFee ?? 0);
  const totalInvoicedDollars = (invoices._sum.totalCents ?? 0) / 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Download CSV exports for your CFO, or eyeball the rollups below.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Total recovered" value={fmtMoney(totalRecovered)} sub={`${recoveries._count._all} appeals`} />
        <Stat label="Total fees" value={fmtMoney(totalFees)} sub={`${invoices._count._all} invoice(s)`} />
        <Stat label="Outstanding appeals" value={String(outstanding)} sub="Submitted, awaiting outcome" />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Downloads</h2>
        <Download label="Recoveries (all outcomes recorded)" href="/api/reports/recoveries" />
        <Download label="Outstanding appeals" href="/api/reports/outstanding" />
        <Download label="Invoices" href="/api/reports/invoices" />
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Download({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="card flex items-center justify-between p-4 hover:bg-gray-50/70 transition-colors"
    >
      <span className="text-sm text-gray-900">{label}</span>
      <span className="text-xs text-brand-700 inline-flex items-center gap-1">
        <ArrowDownTrayIcon className="h-4 w-4" />
        Download CSV
      </span>
    </a>
  );
}
